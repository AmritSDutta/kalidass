import {describe, it, expect, beforeEach} from "vitest";
import worker from "../src/index.js";
import {
  getRedisClient,
  HOME_FEED_TTL,
  STORY_TTL,
  computeFeedEtag,
  getCachedPublicFeed,
  setCachedPublicFeed,
  getCachedArticle,
  setCachedArticle,
  invalidateArticleCaches,
  invalidateAllArticleCaches,
  matchesEtag,
  ensureFeaturedDecided,
} from "../src/redis/index.js";

describe("Redis Multi-User Delivery & Cache Layer", () => {
  const env = {
    ADMIN_TOKEN: "test-secret-token",
    UPSTASH_BLOB_TOKEN: undefined, // activates memoryBucket
    ROOT_BUCKET: "kalidass",
    CORS_ORIGIN: "*",
    EVAL_PROVIDER: "heuristic",
  };

  const createRequest = (path, options = {}) => {
    const url = `https://kalidass.amrit.fyi${path}`;
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === "object") {
      headers.set("Content-Type", "application/json");
      options.body = JSON.stringify(options.body);
    }
    return new Request(url, {...options, headers});
  };

  beforeEach(async () => {
    const redis = getRedisClient(env);
    await invalidateAllArticleCaches(redis);
  });

  describe("Unit: cache.js helpers & prefix invariant", () => {
    it("enforces kalidass: master prefix and 3-hour TTL on feed cache", async () => {
      const redis = getRedisClient(env);
      const mockArticles = [
        {id: "art-1", title: "Article 1", slug: "article-1", publishedAt: "2026-10-01T00:00:00Z"},
        {id: "art-2", title: "Article 2", slug: "article-2", publishedAt: "2026-09-30T00:00:00Z"},
      ];

      const res = await setCachedPublicFeed(redis, mockArticles);
      expect(res).toBeDefined();
      expect(res.etag).toBeDefined();
      expect(res.feed[0].featured).toBe(true); // Decided featured story

      // Verify that underlying keys in memory have kalidass: master prefix
      const memoryStore = globalThis.__kalidass_redis_memory;
      expect(memoryStore.has("kalidass:feed:public")).toBe(true);
      expect(memoryStore.has("kalidass:feed:etag")).toBe(true);

      const cachedEntry = memoryStore.get("kalidass:feed:public");
      // Check expiration is roughly Date.now() + 10800 * 1000
      expect(cachedEntry.expires).toBeGreaterThan(Date.now() + (HOME_FEED_TTL - 10) * 1000);

      const cached = await getCachedPublicFeed(redis);
      expect(cached.feed.length).toBe(2);
      expect(cached.feed[0].featured).toBe(true);
      expect(cached.etag).toBe(res.etag);
    });

    it("preserves explicitly assigned featured story when one exists", async () => {
      const redis = getRedisClient(env);
      const mockArticles = [
        {id: "art-1", title: "Article 1", slug: "article-1", featured: false},
        {id: "art-2", title: "Article 2", slug: "article-2", featured: true},
      ];

      const res = await setCachedPublicFeed(redis, mockArticles);
      expect(res.feed[0].featured).toBe(false);
      expect(res.feed[1].featured).toBe(true);
    });

    it("enforces 24-hour TTL and kalidass: prefix on article and slug cache", async () => {
      const redis = getRedisClient(env);
      const article = {
        id: "test-story-id",
        slug: "test-story-slug",
        title: "Test Story",
        blocks: [{type: "paragraph", text: "Hello"}],
      };

      await setCachedArticle(redis, article);

      const memoryStore = globalThis.__kalidass_redis_memory;
      expect(memoryStore.has("kalidass:article:test-story-id")).toBe(true);
      expect(memoryStore.has("kalidass:slug:test-story-slug")).toBe(true);

      const articleEntry = memoryStore.get("kalidass:article:test-story-id");
      expect(articleEntry.expires).toBeGreaterThan(Date.now() + (STORY_TTL - 10) * 1000);

      const byId = await getCachedArticle(redis, "test-story-id");
      expect(byId.id).toBe("test-story-id");

      const bySlug = await getCachedArticle(redis, "test-story-slug");
      expect(bySlug.id).toBe("test-story-id");
    });

    it("invalidates article caches properly", async () => {
      const redis = getRedisClient(env);
      await redis.set("feed:public", [{id: "1"}]);
      await redis.set("feed:etag", '"test"');
      await redis.set("article:art-1", {id: "art-1"});
      await redis.set("slug:slug-1", "art-1");
      await redis.set("slug:old-slug", "art-1");

      await invalidateArticleCaches(redis, {id: "art-1", slug: "slug-1", oldSlug: "old-slug"});

      expect(await redis.get("feed:public")).toBeNull();
      expect(await redis.get("feed:etag")).toBeNull();
      expect(await redis.get("article:art-1")).toBeNull();
      expect(await redis.get("slug:slug-1")).toBeNull();
      expect(await redis.get("slug:old-slug")).toBeNull();
    });

    it("computeFeedEtag changes when any non-lead article is edited", () => {
      const feed1 = [
        {id: "lead", title: "Lead", updatedAt: "2026-10-01T00:00:00Z"},
        {id: "second", title: "Second", updatedAt: "2026-10-01T00:00:00Z"},
      ];
      const feed2 = [
        {id: "lead", title: "Lead", updatedAt: "2026-10-01T00:00:00Z"},
        {id: "second", title: "Second", updatedAt: "2026-10-02T00:00:00Z"},
      ];

      const etag1 = computeFeedEtag(feed1);
      const etag2 = computeFeedEtag(feed2);
      expect(etag1).not.toBe(etag2);
    });

    it("matchesEtag supports exact, weak (W/), and comma-separated lists", () => {
      expect(matchesEtag('"abc-1"', '"abc-1"')).toBe(true);
      expect(matchesEtag('W/"abc-1"', '"abc-1"')).toBe(true);
      expect(matchesEtag('"xyz", W/"abc-1", "123"', '"abc-1"')).toBe(true);
      expect(matchesEtag('*', '"abc-1"')).toBe(true);
      expect(matchesEtag('"other"', '"abc-1"')).toBe(false);
    });

    it("ensureFeaturedDecided stamps featured: true even when Redis write is skipped", () => {
      const unfeatured = [
        {id: "1", title: "One"},
        {id: "2", title: "Two"},
      ];
      const decided = ensureFeaturedDecided(unfeatured);
      expect(decided[0].featured).toBe(true);
      expect(decided[1].featured).toBeUndefined();
    });
  });

  describe("Integration: Worker API delivery with Redis caching", () => {
    it("GET /api/articles sets ETag, caches public feed for 3h, and returns 304 on If-None-Match", async () => {
      // 1. Initial request (cache miss)
      const req1 = createRequest("/api/articles");
      const res1 = await worker.fetch(req1, env);
      expect(res1.status).toBe(200);

      const etag = res1.headers.get("etag");
      expect(etag).toBeTruthy();
      const articles = await res1.json();
      expect(Array.isArray(articles)).toBe(true);

      // Verify that Redis was populated
      const redis = getRedisClient(env);
      const cached = await getCachedPublicFeed(redis);
      expect(cached).not.toBeNull();
      expect(cached.etag).toBe(etag);

      // 2. Subsequent request with If-None-Match matching etag -> 304 Not Modified
      const req2 = createRequest("/api/articles", {
        headers: {"if-none-match": etag},
      });
      const res2 = await worker.fetch(req2, env);
      expect(res2.status).toBe(304);
      expect(res2.headers.get("etag")).toBe(etag);

      // 3. Subsequent request without If-None-Match -> served from cache
      const req3 = createRequest("/api/articles");
      const res3 = await worker.fetch(req3, env);
      expect(res3.status).toBe(200);
      expect(res3.headers.get("etag")).toBe(etag);
      const data3 = await res3.json();
      expect(data3).toEqual(articles);
    });

    it("POST /api/articles invalidates public feed cache", async () => {
      // Prime cache
      const primeReq = createRequest("/api/articles");
      await worker.fetch(primeReq, env);

      const redis = getRedisClient(env);
      expect(await redis.get("feed:public")).not.toBeNull();

      // Create new article
      const postReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Brand New Article for Cache Test",
          blocks: [{type: "paragraph", text: "Cached feed should be invalidated."}],
        },
      });
      const postRes = await worker.fetch(postReq, env);
      expect(postRes.status).toBe(201);

      // Verify feed:public was purged from Redis
      expect(await redis.get("feed:public")).toBeNull();
      expect(await redis.get("feed:etag")).toBeNull();
    });

    it("GET /api/articles/:slug serves from Redis cache after initial load", async () => {
      // 1. Create an article (published: true, private: false)
      const postReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Speedy Story",
          slug: "speedy-story",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "Fast edge delivery content."}],
        },
      });
      const postRes = await worker.fetch(postReq, env);
      expect(postRes.status).toBe(201);
      const created = await postRes.json();

      // 2. Fetch by slug (populates story cache in Redis)
      const getReq1 = createRequest(`/api/articles/${created.slug}`);
      const getRes1 = await worker.fetch(getReq1, env);
      expect(getRes1.status).toBe(200);
      const body1 = await getRes1.json();
      expect(body1.id).toBe(created.id);

      // Verify article is now cached in Redis
      const redis = getRedisClient(env);
      const cached = await getCachedArticle(redis, created.slug);
      expect(cached).not.toBeNull();
      expect(cached.id).toBe(created.id);

      // 3. Fetch again (served directly from Redis cache)
      const getReq2 = createRequest(`/api/articles/${created.slug}`);
      const getRes2 = await worker.fetch(getReq2, env);
      expect(getRes2.status).toBe(200);
      const body2 = await getRes2.json();
      expect(body2.id).toBe(created.id);
    });

    it("PUT /api/articles/:id invalidates story cache and feed cache", async () => {
      // 1. Create article
      const postReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Original Story",
          slug: "original-story",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "Version 1"}],
        },
      });
      const postRes = await worker.fetch(postReq, env);
      const created = await postRes.json();

      // 2. Prime story cache and feed cache
      await worker.fetch(createRequest(`/api/articles/${created.slug}`), env);
      await worker.fetch(createRequest("/api/articles"), env);

      const redis = getRedisClient(env);
      expect(await getCachedArticle(redis, created.slug)).not.toBeNull();
      expect(await getCachedPublicFeed(redis)).not.toBeNull();

      // 3. Update article with new title and slug
      const putReq = createRequest(`/api/articles/${created.id}`, {
        method: "PUT",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Updated Story",
          slug: "updated-story",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "Version 2"}],
        },
      });
      const putRes = await worker.fetch(putReq, env);
      expect(putRes.status).toBe(200);

      // Verify old slug, id, and feed caches were purged
      expect(await redis.get("feed:public")).toBeNull();
      expect(await redis.get(`article:${created.id}`)).toBeNull();
      expect(await redis.get("slug:original-story")).toBeNull();
    });

    it("DELETE /api/articles/:id invalidates story cache and feed cache", async () => {
      // 1. Create article
      const postReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Story to Delete",
          slug: "story-to-delete",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "Will be deleted."}],
        },
      });
      const postRes = await worker.fetch(postReq, env);
      const created = await postRes.json();

      // 2. Prime cache
      await worker.fetch(createRequest(`/api/articles/${created.slug}`), env);
      await worker.fetch(createRequest("/api/articles"), env);

      const redis = getRedisClient(env);
      expect(await getCachedArticle(redis, created.slug)).not.toBeNull();
      expect(await getCachedPublicFeed(redis)).not.toBeNull();

      // 3. Delete article
      const delReq = createRequest(`/api/articles/${created.id}`, {
        method: "DELETE",
        headers: {Authorization: "Bearer test-secret-token"},
      });
      const delRes = await worker.fetch(delReq, env);
      expect(delRes.status).toBe(200);

      // Verify caches purged
      expect(await redis.get("feed:public")).toBeNull();
      expect(await redis.get(`article:${created.id}`)).toBeNull();
      expect(await redis.get("slug:story-to-delete")).toBeNull();
    });

    it("GET /api/articles returns 304 on weak (W/) or comma-separated If-None-Match", async () => {
      const res = await worker.fetch(createRequest("/api/articles"), env);
      const etag = res.headers.get("etag");
      expect(etag).toBeTruthy();

      // Weak ETag
      const weakRes = await worker.fetch(
        createRequest("/api/articles", {headers: {"if-none-match": `W/${etag}`}}),
        env
      );
      expect(weakRes.status).toBe(304);

      // Comma-separated list with weak tag
      const listRes = await worker.fetch(
        createRequest("/api/articles", {headers: {"if-none-match": `"unrelated", W/${etag}`}}),
        env
      );
      expect(listRes.status).toBe(304);
    });

    it("GET /api/articles/:slug?intelligence=true invalidates cached story", async () => {
      // 1. Create public article
      const postReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Intelligence Invalidation Test",
          slug: "intel-invalidation-test",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "Article for intel invalidation."}],
        },
      });
      const postRes = await worker.fetch(postReq, env);
      const created = await postRes.json();

      // 2. Prime story cache
      await worker.fetch(createRequest(`/api/articles/${created.slug}`), env);
      const redis = getRedisClient(env);
      expect(await getCachedArticle(redis, created.slug)).not.toBeNull();

      // Seed valid intelligence in Redis so getOrGenerateArticleIntelligence succeeds hermetically
      const validIntel = {
        query: "Intelligence Invalidation Test",
        ai_overview: {text: "Stored overview"},
        organic_results: [{title: "Grounding link", link: "https://example.com"}],
        fetchedAt: new Date().toISOString(),
      };
      await redis.set(`ai_intel:${created.id}`, JSON.stringify(validIntel), {ex: 86400});

      // 3. Request intelligence
      const intelReq = createRequest(`/api/articles/${created.slug}?intelligence=true`, {
        headers: {Authorization: "Bearer test-secret-token"},
      });
      const intelRes = await worker.fetch(intelReq, env);
      expect(intelRes.status).toBe(200);

      // 4. Verify story cache was purged
      expect(await redis.get(`article:${created.id}`)).toBeNull();
      expect(await redis.get(`slug:${created.slug}`)).toBeNull();
    });

    it("draft and private articles are never cached in Redis story cache", async () => {
      // Create a private draft article
      const postReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Private Draft Article",
          slug: "private-draft-article",
          published: false,
          private: true,
          blocks: [{type: "paragraph", text: "Secret draft content."}],
        },
      });
      const postRes = await worker.fetch(postReq, env);
      const created = await postRes.json();

      // Read as authorized author
      const getReq = createRequest(`/api/articles/${created.slug}`, {
        headers: {Authorization: "Bearer test-secret-token"},
      });
      const getRes = await worker.fetch(getReq, env);
      expect(getRes.status).toBe(200);

      // Verify it was NOT written to Redis story cache
      const redis = getRedisClient(env);
      expect(await redis.get(`article:${created.id}`)).toBeNull();
      expect(await redis.get(`slug:${created.slug}`)).toBeNull();
    });
  });
});
