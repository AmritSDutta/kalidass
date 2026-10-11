import {describe, it, expect, beforeEach} from "vitest";
import {createTestD1} from "./helpers/d1.js";
import {
  ensureD1Synced,
  getTopTags,
  getPublicArticles,
  getAuthorArticles,
  isSlugTaken,
  getArticleByIdOrSlug,
  upsertArticleWithTags,
  deleteArticle,
  clearAllD1Articles,
  resetSyncStateForTesting,
} from "../src/d1/repository.js";
import {StorageHelper} from "../src/helper/storage.js";

describe("Cloudflare D1 Repository (Hermetic Tests)", () => {
  let db;

  const sampleArticles = [
    {
      id: "art-1",
      slug: "systems-in-depth",
      title: "Systems in Depth",
      authorEmail: "author1@test.com",
      published: true,
      private: false,
      featured: true,
      tags: ["Systems", "Architecture"],
      publishedAt: "2026-09-01T12:00:00Z",
      updatedAt: "2026-09-01T12:00:00Z",
      excerpt: "Deep dive into serverless systems.",
    },
    {
      id: "art-2",
      slug: "edge-intelligence",
      title: "Edge Intelligence",
      authorEmail: "author1@test.com",
      published: true,
      private: false,
      featured: false,
      tags: ["Edge", "Systems"],
      publishedAt: "2026-09-02T12:00:00Z",
      updatedAt: "2026-09-02T12:00:00Z",
      excerpt: "Running models on edge runtimes.",
    },
    {
      id: "art-3",
      slug: "draft-notes",
      title: "Draft Notes",
      authorEmail: "author2@test.com",
      published: false,
      private: true,
      featured: false,
      tags: ["Internal"],
      publishedAt: "2026-09-03T12:00:00Z",
      updatedAt: "2026-09-03T12:00:00Z",
      excerpt: "Unpublished thoughts.",
    },
  ];

  beforeEach(() => {
    resetSyncStateForTesting();
    db = createTestD1();
  });

  it("ensureD1Synced seeds articles and tags directly via reconstructIndex when D1 is empty", async () => {
    const mockStorage = {
      getBucket: () => ({}),
      reconstructIndex: async () => sampleArticles,
    };

    await ensureD1Synced(db, mockStorage, {});

    const countRow = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
    expect(countRow.count).toBe(3);

    const tagRows = await db.prepare("SELECT * FROM article_tags").all();
    expect(tagRows.results.length).toBeGreaterThan(0);

    // Calling ensureD1Synced again should be a no-op
    await ensureD1Synced(db, mockStorage, {});
    const countRow2 = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
    expect(countRow2.count).toBe(3);
  });

  it("ensureD1Synced does not set isSynced = true when scan returns empty, enabling subsequent retry", async () => {
    let callCount = 0;
    const mockStorage = {
      getBucket: () => ({}),
      reconstructIndex: async () => {
        callCount++;
        return callCount === 1 ? [] : sampleArticles;
      },
    };

    // First call: empty, should not freeze isSynced
    await ensureD1Synced(db, mockStorage, {});
    const countRow1 = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
    expect(countRow1.count).toBe(0);

    // Second call: now returns data and successfully seeds
    await ensureD1Synced(db, mockStorage, {});
    const countRow2 = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
    expect(countRow2.count).toBe(3);
  });

  it("clearAllD1Articles empties both articles and article_tags tables", async () => {
    for (const art of sampleArticles) {
      await upsertArticleWithTags(db, art, art);
    }

    const countBefore = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
    expect(countBefore.count).toBe(3);

    await clearAllD1Articles(db);

    const countAfter = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
    expect(countAfter.count).toBe(0);

    const tagsAfter = await db.prepare("SELECT COUNT(*) as count FROM article_tags").first();
    expect(tagsAfter.count).toBe(0);
  });

  it("reconstructIndex skips legacy index.json files when env.DB is active", async () => {
    const accessedPaths = [];
    const testArticle = {
      id: "art-from-blob",
      slug: "article-from-blob",
      title: "Article From Blob",
      published: true,
      publishedAt: "2026-09-01T12:00:00Z",
    };

    const mockBucket = {
      list: async ({prefix}) => {
        if (prefix.includes("articles")) {
          return {blobs: [{path: "kalidass/articles/art-from-blob.json"}]};
        }
        return {blobs: []};
      },
    };

    const originalReadJson = StorageHelper.readJson;
    StorageHelper.readJson = async (_b, path) => {
      accessedPaths.push(path);
      if (path === "journal/index.json" || path === "index.json") {
        return [{id: "stale-index-article"}];
      }
      if (path === "kalidass/articles/art-from-blob.json") {
        return testArticle;
      }
      return null;
    };

    try {
      const envWithDb = {DB: db, ROOT_BUCKET: "kalidass"};
      const reconstructed = await StorageHelper.reconstructIndex(mockBucket, envWithDb);

      expect(reconstructed.length).toBe(1);
      expect(reconstructed[0].id).toBe("art-from-blob");

      // Verify that neither journal/index.json nor index.json were ever read
      expect(accessedPaths).not.toContain("journal/index.json");
      expect(accessedPaths).not.toContain("index.json");
    } finally {
      StorageHelper.readJson = originalReadJson;
    }
  });

  it("getTopTags computes tag frequencies, limits to 10, and caches in Redis for 3 hours", async () => {
    for (const art of sampleArticles) {
      await upsertArticleWithTags(db, art, art);
    }

    const redisStore = new Map();
    const mockRedis = {
      get: async (key) => redisStore.get(key) || null,
      set: async (key, val, options) => {
        expect(options?.ex).toBe(10800); // 3 hours in seconds
        redisStore.set(key, val);
      },
    };

    // First call: cache miss, queries D1
    const tags = await getTopTags(db, mockRedis);
    expect(tags).toContain("Systems");
    expect(tags).toContain("Edge");
    expect(tags).toContain("Architecture");
    // "Internal" was in art-3 which is draft/private, so it should NOT be in public tags
    expect(tags).not.toContain("Internal");

    // Second call: serves from Redis cache
    const cachedTags = await getTopTags(null, mockRedis);
    expect(cachedTags).toEqual(tags);
  });

  it("getPublicArticles supports tag filtering, search keywords, and pagination", async () => {
    for (const art of sampleArticles) {
      await upsertArticleWithTags(db, art, art);
    }

    // 1. All public articles
    const all = await getPublicArticles(db, { tag: "All", page: 1, limit: 10 });
    expect(all.length).toBe(2);
    expect(all[0].slug).toBe("edge-intelligence"); // Newest first

    // 2. Tag filter (case-insensitive)
    const edge = await getPublicArticles(db, { tag: "edge", page: 1, limit: 10 });
    expect(edge.length).toBe(1);
    expect(edge[0].slug).toBe("edge-intelligence");

    // 3. Search filter
    const searchResult = await getPublicArticles(db, { search: "Depth", page: 1, limit: 10 });
    expect(searchResult.length).toBe(1);
    expect(searchResult[0].slug).toBe("systems-in-depth");

    // 4. Combined tag and search
    const combined = await getPublicArticles(db, { tag: "Systems", search: "Depth", page: 1, limit: 10 });
    expect(combined.length).toBe(1);
    expect(combined[0].slug).toBe("systems-in-depth");

    // 5. Pagination
    const page1 = await getPublicArticles(db, { page: 1, limit: 1 });
    expect(page1.length).toBe(1);
    expect(page1[0].slug).toBe("edge-intelligence");

    const page2 = await getPublicArticles(db, { page: 2, limit: 1 });
    expect(page2.length).toBe(1);
    expect(page2[0].slug).toBe("systems-in-depth");

    // 6. JSON key isolation (searching "published" does not match summary metadata keys)
    const jsonLeakSearch = await getPublicArticles(db, { search: "published", page: 1, limit: 10 });
    expect(jsonLeakSearch.length).toBe(0);

    // 7. Wildcard escaping (% and _ match literally)
    const wildcardArticle = {
      id: "art-wildcard",
      slug: "100-percent-speed",
      title: "100% Speed_Boost",
      authorEmail: "author1@test.com",
      published: true,
      private: false,
      featured: false,
      tags: ["Performance"],
      publishedAt: "2026-09-04T12:00:00Z",
      updatedAt: "2026-09-04T12:00:00Z",
      excerpt: "Testing wildcard escaping.",
    };
    await upsertArticleWithTags(db, wildcardArticle, wildcardArticle);

    const percentSearch = await getPublicArticles(db, { search: "100%", page: 1, limit: 10 });
    expect(percentSearch.length).toBe(1);
    expect(percentSearch[0].slug).toBe("100-percent-speed");

    const underscoreSearch = await getPublicArticles(db, { search: "Speed_Boost", page: 1, limit: 10 });
    expect(underscoreSearch.length).toBe(1);
    expect(underscoreSearch[0].slug).toBe("100-percent-speed");
  });

  it("getAuthorArticles isolates visibility between admin and authors", async () => {
    for (const art of sampleArticles) {
      await upsertArticleWithTags(db, art, art);
    }

    // Regular author1
    const author1User = { email: "author1@test.com", role: "author" };
    const author1Published = await getAuthorArticles(db, author1User, "published");
    expect(author1Published.length).toBe(2);

    const author1Drafts = await getAuthorArticles(db, author1User, "draft");
    expect(author1Drafts.length).toBe(0);

    // Regular author2 (owns art-3 draft)
    const author2User = { email: "author2@test.com", role: "author" };
    const author2Drafts = await getAuthorArticles(db, author2User, "draft");
    expect(author2Drafts.length).toBe(1);
    expect(author2Drafts[0].id).toBe("art-3");

    // Admin sees all drafts
    const adminUser = { email: "admin@test.com", role: "admin" };
    const adminDrafts = await getAuthorArticles(db, adminUser, "draft");
    expect(adminDrafts.length).toBe(1);
    expect(adminDrafts[0].id).toBe("art-3");
  });

  it("isSlugTaken detects slug collisions and respects excludeId", async () => {
    await upsertArticleWithTags(db, sampleArticles[0], sampleArticles[0]);

    expect(await isSlugTaken(db, "systems-in-depth")).toBe(true);
    expect(await isSlugTaken(db, "unique-new-slug")).toBe(false);
    // Exclude own id during updates
    expect(await isSlugTaken(db, "systems-in-depth", "art-1")).toBe(false);
  });

  it("getArticleByIdOrSlug retrieves metadata by either ID or slug", async () => {
    await upsertArticleWithTags(db, sampleArticles[0], sampleArticles[0]);

    const byId = await getArticleByIdOrSlug(db, "art-1");
    expect(byId).not.toBeNull();
    expect(byId.summary.title).toBe("Systems in Depth");

    const bySlug = await getArticleByIdOrSlug(db, "systems-in-depth");
    expect(bySlug).not.toBeNull();
    expect(bySlug.id).toBe("art-1");

    const missing = await getArticleByIdOrSlug(db, "nonexistent");
    expect(missing).toBeNull();
  });

  it("deleteArticle removes article and cascades tag cleanup", async () => {
    await upsertArticleWithTags(db, sampleArticles[0], sampleArticles[0]);

    const tagBefore = await db.prepare("SELECT * FROM article_tags WHERE article_id = ?").bind("art-1").all();
    expect(tagBefore.results.length).toBe(2);

    await deleteArticle(db, "art-1");

    const artAfter = await db.prepare("SELECT * FROM articles WHERE id = ?").bind("art-1").first();
    expect(artAfter).toBeNull();

    const tagAfter = await db.prepare("SELECT * FROM article_tags WHERE article_id = ?").bind("art-1").all();
    expect(tagAfter.results.length).toBe(0);
  });
});
