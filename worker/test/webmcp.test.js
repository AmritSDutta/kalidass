import {describe, it, expect} from "vitest";
import {
  getBrowserStorySlug,
  executeSearchArticles,
  executeReadArticle,
} from "../../blog_frontend/src/client-modules/webmcp.ts";

describe("WebMCP Path & Slug Extraction (Hermetic)", () => {
  it("extracts slug correctly from /story/:slug paths", () => {
    expect(getBrowserStorySlug("/story/attention-as-routing")).toBe("attention-as-routing");
    expect(getBrowserStorySlug("/story/field-notes-evals/")).toBe("field-notes-evals");
    expect(getBrowserStorySlug("/story/kv-cache?query=test#heading-1")).toBe("kv-cache");
    expect(getBrowserStorySlug("/story/multi_token_prediction")).toBe("multi_token_prediction");
  });

  it("returns null for non-story paths (e.g. issues page, home, admin, history)", () => {
    expect(getBrowserStorySlug("/magazine")).toBe(null);
    expect(getBrowserStorySlug("/")).toBe(null);
    expect(getBrowserStorySlug("/admin")).toBe(null);
    expect(getBrowserStorySlug("/generate_article")).toBe(null);
    expect(getBrowserStorySlug("/history/architecture")).toBe(null);
    expect(getBrowserStorySlug("")).toBe(null);
  });
});

describe("WebMCP searchArticles Route Gating (Hermetic)", () => {
  const mockArticles = [
    {
      id: "art-1",
      slug: "attention-as-routing",
      title: "Attention as Routing",
      subtitle: "Sparse MoE Plumbing",
      excerpt: "Mechanics of mixture of experts.",
      tags: ["Systems", "Architectures"],
      readTime: 4,
      publishedAt: "2026-10-01T12:00:00Z",
      author: {name: "Test Author", role: "Researcher"},
    },
    {
      id: "art-2",
      slug: "eval-trench-notes",
      title: "Field notes from the eval trench",
      subtitle: "Benchmarking agents",
      excerpt: "Empirical harness testing.",
      tags: ["Evals", "Agents"],
      readTime: 6,
      publishedAt: "2026-10-02T12:00:00Z",
      author: {name: "Test Author", role: "Researcher"},
    },
    {
      id: "art-3",
      slug: "state-space-models",
      title: "State Space Models",
      subtitle: "Linear time recurrence",
      excerpt: "Mamba deep dive.",
      tags: ["Systems", "Mamba"],
      readTime: 5,
      publishedAt: "2026-10-03T12:00:00Z",
      author: {name: "Test Author", role: "Researcher"},
    },
  ];

  it("on /magazine (issues page), behaves as-is searching globally up to 5 items", async () => {
    const results = await executeSearchArticles(
      {query: "systems"},
      {
        listArticlesFn: async () => mockArticles,
        currentPathname: "/magazine",
        origin: "https://kalidass.amrit.fyi",
      }
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.slug)).toEqual(["attention-as-routing", "state-space-models"]);
  });

  it("on /magazine, a query containing 'story/' does not trigger story isolation", async () => {
    const results = await executeSearchArticles(
      {query: "story/eval"},
      {
        listArticlesFn: async () => mockArticles,
        currentPathname: "/magazine",
        origin: "https://kalidass.amrit.fyi",
      }
    );

    // Should perform normal search across articles, not isolating a single story
    expect(Array.isArray(results)).toBe(true);
  });

  it("on /story/:slug, returns ONLY this article (1-item array)", async () => {
    const results = await executeSearchArticles(
      {},
      {
        listArticlesFn: async () => mockArticles,
        currentPathname: "/story/attention-as-routing",
        origin: "https://kalidass.amrit.fyi",
      }
    );

    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("attention-as-routing");
    expect(results[0].title).toBe("Attention as Routing");
    expect(results[0].url).toBe("https://kalidass.amrit.fyi/story/attention-as-routing");
  });
});

describe("WebMCP readArticle Route Gating (Hermetic)", () => {
  const mockSingleArticle = {
    id: "art-1",
    slug: "attention-as-routing",
    title: "Attention as Routing",
    subtitle: "Sparse MoE Plumbing",
    excerpt: "Mechanics of mixture of experts.",
    tags: ["Systems", "Architectures"],
    readTime: 4,
    publishedAt: "2026-10-01T12:00:00Z",
    author: {name: "Test Author", role: "Researcher"},
    blocks: [
      {type: "heading", text: "Introduction"},
      {type: "paragraph", text: "Deep routing mechanics."},
    ],
  };

  it("on /magazine without slug argument, throws 'Argument slug is required' (as-is)", async () => {
    await expect(
      executeReadArticle(
        {},
        {
          getArticleFn: async () => mockSingleArticle,
          currentPathname: "/magazine",
          origin: "https://kalidass.amrit.fyi",
        }
      )
    ).rejects.toThrow("Argument 'slug' is required.");
  });

  it("on /magazine with explicit slug argument, returns default article metadata payload", async () => {
    const result = await executeReadArticle(
      {slug: "attention-as-routing"},
      {
        getArticleFn: async () => mockSingleArticle,
        currentPathname: "/magazine",
        origin: "https://kalidass.amrit.fyi",
      }
    );

    expect(result.slug).toBe("attention-as-routing");
    expect(result.title).toBe("Attention as Routing");
    expect(result.excerpt).toBe("Mechanics of mixture of experts.");
    expect(result.url).toBe("https://kalidass.amrit.fyi/story/attention-as-routing");
    expect(result.path).toBe("/story/attention-as-routing");
    // Verify default payload structure preserved (no full blocks required)
    expect(result).not.toHaveProperty("blocks");
    expect(result).not.toHaveProperty("content");
  });

  it("on /story/:slug with empty args, auto-resolves slug from path and returns default payload", async () => {
    const result = await executeReadArticle(
      {},
      {
        getArticleFn: async (slug) => ({...mockSingleArticle, slug}),
        currentPathname: "/story/attention-as-routing",
        origin: "https://kalidass.amrit.fyi",
      }
    );

    expect(result.slug).toBe("attention-as-routing");
    expect(result.title).toBe("Attention as Routing");
    expect(result.url).toBe("https://kalidass.amrit.fyi/story/attention-as-routing");
    expect(result).not.toHaveProperty("blocks");
    expect(result).not.toHaveProperty("content");
  });

  it("on /story/:slug with explicit different slug, explicit slug wins", async () => {
    const result = await executeReadArticle(
      {slug: "eval-trench-notes"},
      {
        getArticleFn: async (slug) => ({...mockSingleArticle, slug, title: "Field Notes"}),
        currentPathname: "/story/attention-as-routing",
        origin: "https://kalidass.amrit.fyi",
      }
    );

    expect(result.slug).toBe("eval-trench-notes");
  });
});
