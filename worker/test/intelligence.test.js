import {describe, it, expect, beforeEach} from "vitest";
import {generateKeyPair, exportJWK, SignJWT} from "jose";
import worker from "../src/index.js";
import {
  getOrGenerateArticleIntelligence,
  getIntelligenceObjectPath,
  isValidIntelligencePayload,
} from "../src/intelligence/service.js";
import {formatRedisKey, getRedisClient} from "../src/redis/index.js";
import {memoryBucket} from "../src/memory.js";

describe("Redis Package Contract & Key Prefixes (Hermetic)", () => {
  it("enforces permanent kalidass: root prefix idempotently", () => {
    expect(formatRedisKey("ai_intel:123")).toBe("kalidass:ai_intel:123");
    expect(formatRedisKey("kalidass:ai_intel:123")).toBe("kalidass:ai_intel:123");
    expect(formatRedisKey(":foo:bar")).toBe("kalidass:foo:bar");
  });

  it("MemoryAdapter adheres to kalidass: prefix and key-value store operations", async () => {
    const redis = getRedisClient({});
    await redis.set("test_key", {sample: "data"}, {ex: 10});

    const retrieved = await redis.get("test_key");
    expect(retrieved).toEqual({sample: "data"});

    // Check underlying map store has kalidass: prefix
    expect(globalThis.__kalidass_redis_memory.has("kalidass:test_key")).toBe(true);

    await redis.del("test_key");
    const afterDel = await redis.get("test_key");
    expect(afterDel).toBeNull();
  });
});

describe("SerpApi AI Intelligence Pipeline (Hermetic)", () => {
  const env = {
    ADMIN_TOKEN: "test-secret-token",
    UPSTASH_BLOB_TOKEN: undefined, // in-memory bucket
    ROOT_BUCKET: "kalidass",
    CORS_ORIGIN: "*",
    EVAL_PROVIDER: "heuristic",
    SERPAPI_API_KEY: "test-serp-key",
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

  beforeEach(() => {
    // Clear in-memory redis fallback
    if (globalThis.__kalidass_redis_memory) {
      globalThis.__kalidass_redis_memory.clear();
    }
  });

  it("getIntelligenceObjectPath constructs canonical path", () => {
    const path = getIntelligenceObjectPath("art-123", env);
    expect(path).toBe("kalidass/intelligence/art-123.json");
  });

  it("isValidIntelligencePayload correctly identifies valid vs empty husks", () => {
    expect(isValidIntelligencePayload(null)).toBe(false);
    expect(isValidIntelligencePayload({})).toBe(false);
    expect(isValidIntelligencePayload({query: "test"})).toBe(false);

    expect(isValidIntelligencePayload({
      query: "test",
      ai_overview: {text: "Summary"},
    })).toBe(true);

    expect(isValidIntelligencePayload({
      query: "test",
      organic_results: [{title: "Result 1", link: "https://example.com"}],
    })).toBe(true);
  });

  it("orchestration: calls Box runner on double cache miss and populates Redis and Blob", async () => {
    const article = {
      id: "art-test-1",
      title: "Sparse Mixture of Experts",
      subtitle: "Routing dynamics",
      excerpt: "Technical breakdown",
    };

    const mockBlob = new Map();
    const storage = {
      bucket: {},
      readJson: async (_b, path) => mockBlob.get(path) || null,
      putJson: async (_b, path, val) => mockBlob.set(path, val),
      runBoxFn: async (params) => ({
        query: params.query,
        ai_overview: {text: "MoE overview synthetic"},
        knowledge_graph: {title: "Mixture of Experts"},
        inline_videos: [{title: "MoE in PyTorch", link: "https://youtube.com/watch?v=123"}],
        books_shopping: [{title: "Deep Learning Architectures", price: "$49.99"}],
        jobs_results: [{title: "AI Research Scientist", company_name: "DeepMind"}],
        twitter_results: [],
        discussions_and_forums: [],
        people_also_ask: [{question: "What is MoE routing?"}],
        trends: {interest_over_time: [50, 75, 100]},
        fetchedAt: new Date().toISOString(),
      }),
    };

    // First call: calls Box runner
    const result1 = await getOrGenerateArticleIntelligence(article, env, storage);
    expect(result1.query).toContain("Sparse Mixture of Experts");
    expect(result1.ai_overview.text).toBe("MoE overview synthetic");
    expect(result1.inline_videos).toHaveLength(1);
    expect(result1.books_shopping).toHaveLength(1);
    expect(result1.jobs_results).toHaveLength(1);

    // Verify Blob was written
    const blobPath = getIntelligenceObjectPath(article.id, env);
    expect(mockBlob.has(blobPath)).toBe(true);

    // Second call: reads from Redis cache without calling Box runner or touching Blob
    let runnerCalled = false;
    storage.runBoxFn = async () => {
      runnerCalled = true;
      throw new Error("Should not call runner");
    };
    const result2 = await getOrGenerateArticleIntelligence(article, env, storage);
    expect(runnerCalled).toBe(false);
    expect(result2.ai_overview.text).toBe("MoE overview synthetic");

    // Third call: refresh=true bypasses Redis and Blob, calling Box runner
    let refreshRunnerCalled = false;
    storage.runBoxFn = async (params) => {
      refreshRunnerCalled = true;
      return {
        query: params.query,
        ai_overview: {text: "Refreshed MoE overview"},
        organic_results: [{title: "New link"}],
      };
    };
    const refreshed = await getOrGenerateArticleIntelligence(article, env, storage, {refresh: true});
    expect(refreshRunnerCalled).toBe(true);
    expect(refreshed.ai_overview.text).toBe("Refreshed MoE overview");
  });

  it("orchestration: rejects and refuses to cache empty husks or failed payloads", async () => {
    const article = {
      id: "art-failed-1",
      title: "Broken Search",
    };

    const mockBlob = new Map();
    const storage = {
      bucket: {},
      readJson: async () => null,
      putJson: async (_b, path, val) => mockBlob.set(path, val),
      runBoxFn: async () => ({
        query: "Broken Search",
        error: "Quota exceeded",
        organic_results: [],
      }),
    };

    await expect(
      getOrGenerateArticleIntelligence(article, env, storage)
    ).rejects.toThrow("Generated intelligence payload was empty or invalid");

    // Assert empty husk was NEVER cached in Blob or Redis
    expect(mockBlob.size).toBe(0);
    expect(globalThis.__kalidass_redis_memory.has("kalidass:ai_intel:art-failed-1")).toBe(false);
  });

  it("GET /api/articles/:slug omits ai_intelligence by default when none is stored", async () => {
    const uniqueSlug = `intel-privacy-test-${Date.now()}`;
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: "Bearer test-secret-token"},
      body: {
        title: "Intelligence Privacy Test",
        slug: uniqueSlug,
        excerpt: "Ensuring intelligence blocks are omitted by default.",
        tags: ["Systems"],
        published: true,
        private: false,
        blocks: [{type: "paragraph", text: "Article content."}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    expect(createRes.status).toBe(201);

    const getReq = createRequest(`/api/articles/${uniqueSlug}`);
    const getRes = await worker.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.title).toBe("Intelligence Privacy Test");
    expect(getData).not.toHaveProperty("ai_intelligence");
    expect(getData.has_intelligence).toBe(false);
  });

  it("GET /api/articles/:slug?intelligence=true rejects unauthenticated requests with 401", async () => {
    const uniqueSlug = `intel-auth-test-${Date.now()}`;
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: "Bearer test-secret-token"},
      body: {
        title: "Intelligence Auth Test",
        slug: uniqueSlug,
        excerpt: "Auth gate test.",
        published: true,
        private: false,
        blocks: [{type: "paragraph", text: "Content"}],
      },
    });
    await worker.fetch(createReq, env);

    const unauthReq = createRequest(`/api/articles/${uniqueSlug}?intelligence=true`);
    const unauthRes = await worker.fetch(unauthReq, env);
    expect(unauthRes.status).toBe(401);
  });

  it("GET /api/articles/:slug?intelligence=true returns 403 Forbidden for non-owner author", async () => {
    const {privateKey, publicKey} = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key-id";
    jwk.alg = "RS256";
    jwk.use = "sig";

    const auth0Domain = `auth-test-${Date.now()}.example.com`;
    const testEnv = {
      ...env,
      AUTH0_DOMAIN: auth0Domain,
      ADMIN_EMAILS: "admin@example.com",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const urlStr = String(input?.url || input);
      if (urlStr.includes("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({keys: [jwk]}), {
          status: 200,
          headers: {"Content-Type": "application/json"},
        });
      }
      return originalFetch(input, init);
    };

    try {
      const nonOwnerToken = await new SignJWT({
        sub: "auth0|stranger-123",
        email: "stranger@example.com",
        name: "Stranger Author",
        picture: "https://avatar.dev/stranger.png",
      })
        .setProtectedHeader({alg: "RS256", kid: "test-key-id"})
        .setIssuer(`https://${auth0Domain}/`)
        .setIssuedAt()
        .setExpirationTime("2h")
        .sign(privateKey);

      // Create article with authorEmail: owner@example.com
      const uniqueSlug = `intel-forbidden-test-${Date.now()}`;
      const createReq = createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-secret-token"},
        body: {
          title: "Owned Article",
          slug: uniqueSlug,
          authorEmail: "owner@example.com",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "Owner content."}],
        },
      });
      const createRes = await worker.fetch(createReq, testEnv);
      expect(createRes.status).toBe(201);

      // Stranger author attempts to access intelligence on owner's article
      const forbiddenReq = createRequest(`/api/articles/${uniqueSlug}?intelligence=true`, {
        headers: {Authorization: `Bearer ${nonOwnerToken}`},
      });
      const forbiddenRes = await worker.fetch(forbiddenReq, testEnv);
      expect(forbiddenRes.status).toBe(403);
      const errData = await forbiddenRes.json();
      expect(errData.error).toContain("Forbidden");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("article GET exposes only has_intelligence flag; /intel serves the dossier lazily and re-caches Redis", async () => {
    const uniqueSlug = `intel-attach-test-${Date.now()}`;
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: "Bearer test-secret-token"},
      body: {
        title: "Intelligence Attach Test",
        slug: uniqueSlug,
        excerpt: "Dossier fetches lazily via /intel.",
        tags: ["Systems"],
        published: true,
        private: false,
        blocks: [{type: "paragraph", text: "Article content."}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    // Seed a valid dossier into the in-memory Blob store (Redis intentionally empty)
    const validIntel = {
      query: "Intelligence Attach Test",
      ai_overview: {text: "Stored overview"},
      organic_results: [{title: "Grounding link", link: "https://example.com"}],
      fetchedAt: "2026-10-07T00:00:00.000000+00:00",
    };
    const blobPath = getIntelligenceObjectPath(created.id, env);
    await memoryBucket().put(blobPath, JSON.stringify(validIntel), {contentType: "application/json"});

    // Anonymous article GET: flag only, never the payload
    const getRes = await worker.fetch(createRequest(`/api/articles/${uniqueSlug}`), env);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.has_intelligence).toBe(true);
    expect(getData).not.toHaveProperty("ai_intelligence");

    // Lazy public dossier fetch
    const intelRes = await worker.fetch(createRequest(`/api/articles/${uniqueSlug}/intel`), env);
    expect(intelRes.status).toBe(200);
    expect(await intelRes.json()).toEqual(validIntel);

    // Blob hit must re-populate Redis so post-TTL views skip the Blob read
    const redis = getRedisClient(env);
    const reCached = await redis.get(`ai_intel:${created.id}`);
    expect(typeof reCached === "string" ? JSON.parse(reCached) : reCached).toEqual(validIntel);
  });

  it("GET /api/articles/:slug/intel returns 404 for an invalid stored husk and never caches it", async () => {
    const uniqueSlug = `intel-husk-test-${Date.now()}`;
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: "Bearer test-secret-token"},
      body: {
        title: "Intelligence Husk Test",
        slug: uniqueSlug,
        excerpt: "Empty husks must not serve.",
        tags: ["Systems"],
        published: true,
        private: false,
        blocks: [{type: "paragraph", text: "Article content."}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const husk = {query: "Intelligence Husk Test", organic_results: []};
    const blobPath = getIntelligenceObjectPath(created.id, env);
    await memoryBucket().put(blobPath, JSON.stringify(husk), {contentType: "application/json"});

    const intelRes = await worker.fetch(createRequest(`/api/articles/${uniqueSlug}/intel`), env);
    expect(intelRes.status).toBe(404);

    const getRes = await worker.fetch(createRequest(`/api/articles/${uniqueSlug}`), env);
    const getData = await getRes.json();
    expect(getData.has_intelligence).toBe(false);

    // Invalid husk must not leak into Redis either
    const redis = getRedisClient(env);
    expect(await redis.get(`ai_intel:${created.id}`)).toBeNull();
  });

  it("GET /api/articles/:slug/intel hides private articles from anonymous readers", async () => {
    const uniqueSlug = `intel-private-test-${Date.now()}`;
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: "Bearer test-secret-token"},
      body: {
        title: "Intelligence Private Test",
        slug: uniqueSlug,
        excerpt: "Private intel gating.",
        tags: ["Systems"],
        published: true,
        private: true,
        blocks: [{type: "paragraph", text: "Article content."}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const validIntel = {
      query: "Intelligence Private Test",
      ai_overview: {text: "Private overview"},
    };
    const blobPath = getIntelligenceObjectPath(created.id, env);
    await memoryBucket().put(blobPath, JSON.stringify(validIntel), {contentType: "application/json"});

    const anonRes = await worker.fetch(createRequest(`/api/articles/${uniqueSlug}/intel`), env);
    expect(anonRes.status).toBe(404);

    // Admin still reads the dossier through the private gate
    const adminRes = await worker.fetch(
      createRequest(`/api/articles/${uniqueSlug}/intel`, {
        headers: {Authorization: "Bearer test-secret-token"},
      }),
      env
    );
    expect(adminRes.status).toBe(200);
    expect(await adminRes.json()).toEqual(validIntel);
  });
});

