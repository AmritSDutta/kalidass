import {describe, it, expect, beforeEach} from "vitest";
import {generateArticle, registerGeneratorProvider} from "../src/generator/index.js";
import {memoryBucket, clearMemoryStore, getMemoryObject} from "../src/memory.js";

describe("Article Generation & Image Persistence (Hermetic)", () => {
  let bucket;
  let indexStore;
  let articleStore;

  const validWebpBase64 =
    "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA";

  beforeEach(() => {
    clearMemoryStore();
    bucket = memoryBucket();
    indexStore = [];
    articleStore = new Map();
  });

  const mockStorageHelpers = (b) => ({
    bucket: b,
    readJson: async (_b, path) => {
      if (path.endsWith("index.json")) return indexStore;
      return articleStore.get(path) || null;
    },
    putJson: async (_b, path, value) => {
      if (path.endsWith("index.json")) {
        indexStore = value;
      } else {
        articleStore.set(path, value);
      }
      return {ok: true};
    },
    ensureSeed: async () => indexStore,
    slugify: (str) =>
      String(str || "brief")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    uniqueSlug: (_idx, slug) => slug,
    estimateReadTime: () => 5,
    summarize: (art) => ({
      id: art.id,
      slug: art.slug,
      title: art.title,
      coverImage: art.coverImage,
    }),
    getIndexPath: () => "kalidass/index.json",
    getArticleObject: (id) => `kalidass/articles/${id}.json`,
    withIndexLock: (fn) => fn(),
  });

  it("extracts base64 cover image, writes file to bucket, and updates coverImage URL", async () => {
    const mockProvider = {
      name: "mock-provider-base64",
      generate: async () => ({
        title: "Autonomous Edge Systems",
        coverImage: validWebpBase64,
        blocks: [{type: "paragraph", text: "Testing edge architectures."}],
      }),
    };
    registerGeneratorProvider(mockProvider);

    const env = {ROOT_BUCKET: "kalidass"};
    const user = {email: "admin@kalidass.dev", sub: "admin-1"};
    const request = {
      provider: "mock-provider-base64",
      topic: "Edge Systems",
    };

    const result = await generateArticle(request, env, user, mockStorageHelpers(bucket));

    expect(result.ok).toBe(true);
    const {article} = result;

    // 1. Assert coverImage is transformed from base64 to hosted URL
    expect(article.coverImage).not.toContain("data:image/");
    expect(article.coverImage).toMatch(/\/api\/blob\/kalidass\/media\/.*-cover\.webp/);

    // 2. Assert image object actually exists in bucket memory storage
    const mediaKey = decodeURIComponent(article.coverImage.replace("/api/blob/", ""));
    const storedMedia = getMemoryObject(mediaKey);
    expect(storedMedia).not.toBeNull();
    expect(storedMedia.contentType).toBe("image/webp");
    expect(storedMedia.bytes.length).toBeGreaterThan(0);

    // 3. Assert saved article JSON contains hosted URL
    const savedArticle = articleStore.get(`kalidass/articles/${article.id}.json`);
    expect(savedArticle.coverImage).toBe(article.coverImage);

    // 4. Assert index.json contains only hosted URL (no base64)
    expect(indexStore[0].coverImage).toBe(article.coverImage);
    expect(indexStore[0].coverImage).not.toContain("data:image/");
  });

  it("retains existing HTTPS cover image without redundant upload", async () => {
    const existingUrl = "https://cdn.example.com/hosted-cover.webp";
    const mockProvider = {
      name: "mock-provider-url",
      generate: async () => ({
        title: "Pre-hosted Cover Article",
        coverImage: existingUrl,
        blocks: [{type: "paragraph", text: "Testing pre-hosted covers."}],
      }),
    };
    registerGeneratorProvider(mockProvider);

    const env = {ROOT_BUCKET: "kalidass"};
    const user = {email: "admin@kalidass.dev", sub: "admin-1"};
    const request = {
      provider: "mock-provider-url",
      topic: "Pre-hosted Covers",
    };

    const result = await generateArticle(request, env, user, mockStorageHelpers(bucket));

    expect(result.ok).toBe(true);
    expect(result.article.coverImage).toBe(existingUrl);
    expect(indexStore[0].coverImage).toBe(existingUrl);
  });
});
