import {describe, it, expect, beforeEach, vi} from "vitest";

// Mock the API layer — zero network, fully hermetic
const apiMocks = vi.hoisted(() => ({
  listArticles: vi.fn(),
  getArticle: vi.fn(),
  getArticleIntelligence: vi.fn(),
}));
vi.mock("../../lib/api", () => apiMocks);

import "../webmcp"; // auto-registers tools on import (window exists in jsdom)

const sampleArticle = {
  id: "art-1",
  slug: "attention-as-routing",
  title: "Attention as Routing",
  subtitle: "Sparse MoE Plumbing",
  excerpt: "Mechanics of mixture of experts.",
  coverImage: "https://kalidass.dev/cover.png",
  videoUrl: "https://youtube.com/watch?v=hero-vid",
  author: {name: "Test Author", role: "Researcher", avatar: ""},
  tags: ["Systems"],
  accent: "#6366f1",
  featured: false,
  published: true,
  private: false,
  aiGenerated: true,
  authorEmail: "a@b.c",
  publishedAt: "2026-10-01T00:00:00Z",
  readTime: 4,
  blocks: [
    {type: "paragraph", text: "Introduction to routing networks."},
    {type: "heading", text: "Empirical Benchmarks"},
    {type: "video", url: "https://vimeo.com/in-body-vid", caption: "Benchmark demo"},
    {type: "heading", text: "References & Attributions"},
    {
      type: "quote",
      text: "Switch Transformers: Scaling to Trillion Parameter Models",
      cite: "Fedus et al., 2021",
    },
  ],
  ai_intelligence: {
    query: "attention as routing",
    ai_overview: {
      text: "Attention mechanisms route activations dynamically through sparse sub-networks.",
      references: [
        {
          title: "Outrageously Large Neural Networks",
          link: "https://arxiv.org/abs/1701.06538",
          snippet: "Sparse gating introduces 1000x parameter scale.",
          source: "arXiv",
        },
      ],
    },
    people_also_ask: [
      {
        question: "How does sparse routing differ from dense attention?",
        snippet: "Sparse routing gates inputs to expert subsets.",
        link: "https://example.com/sparse-routing",
      },
    ],
  },
};

describe("WebMCP in-browser registry & storyWebMcp (Hermetic)", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
    apiMocks.listArticles.mockReset();
    apiMocks.getArticle.mockReset();
    apiMocks.getArticleIntelligence.mockReset();
  });

  it("auto-registers all 6 tools on the model context registry", async () => {
    const registry = window.modelContext;
    expect(registry).toBeTruthy();
    const tools = await registry!.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "getPeopleAlsoAsk",
      "getStoryAiOverview",
      "getStoryCitations",
      "getStoryVideoLinks",
      "readArticle",
      "searchArticles",
    ]);
    expect(document.modelContext).toBe(registry);
  });

  it("searchArticles.execute isolates the current story on /story/:slug", async () => {
    window.history.pushState(null, "", "/story/attention-as-routing");
    apiMocks.listArticles.mockResolvedValue([sampleArticle]);

    const results = (await window.modelContext!.tools.searchArticles.execute({})) as any[];
    expect(apiMocks.listArticles).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("attention-as-routing");
    expect(results[0].path).toBe("/story/attention-as-routing");
  });

  it("readArticle.execute throws when no slug is given on a non-story page", async () => {
    window.history.pushState(null, "", "/magazine");
    await expect(
      window.modelContext!.tools.readArticle.execute({})
    ).rejects.toThrow("Argument 'slug' is required.");
    expect(apiMocks.getArticle).not.toHaveBeenCalled();
  });

  it("readArticle.execute auto-resolves the slug from /story/:slug and returns metadata only", async () => {
    window.history.pushState(null, "", "/story/attention-as-routing");
    apiMocks.getArticle.mockResolvedValue(sampleArticle);

    const result = (await window.modelContext!.tools.readArticle.execute({})) as any;
    expect(apiMocks.getArticle).toHaveBeenCalledWith("attention-as-routing");
    expect(result.slug).toBe("attention-as-routing");
    expect(result.url).toBe(`${window.location.origin}/story/attention-as-routing`);
    expect(result).not.toHaveProperty("blocks");
  });

  describe("Story-specific WebMCP tools", () => {
    it("returns available: false when invoked on a non-story page without slug", async () => {
      window.history.pushState(null, "", "/magazine");

      const overviewRes = (await window.modelContext!.tools.getStoryAiOverview.execute({})) as any;
      expect(overviewRes.available).toBe(false);
      expect(overviewRes.error).toMatch(/only available on a story page/i);

      const citationsRes = (await window.modelContext!.tools.getStoryCitations.execute({})) as any;
      expect(citationsRes.available).toBe(false);

      const videosRes = (await window.modelContext!.tools.getStoryVideoLinks.execute({})) as any;
      expect(videosRes.available).toBe(false);

      const paaRes = (await window.modelContext!.tools.getPeopleAlsoAsk.execute({})) as any;
      expect(paaRes.available).toBe(false);
    });

    it("getStoryAiOverview extracts text and references on /story/:slug", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      apiMocks.getArticle.mockResolvedValue(sampleArticle);

      const res = (await window.modelContext!.tools.getStoryAiOverview.execute({})) as any;
      expect(res.available).toBe(true);
      expect(res.text).toContain("Attention mechanisms route activations");
      expect(res.references).toHaveLength(1);
      expect(res.references[0].title).toBe("Outrageously Large Neural Networks");
    });

    it("getStoryCitations extracts citation and quote reference blocks", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      apiMocks.getArticle.mockResolvedValue(sampleArticle);

      const res = (await window.modelContext!.tools.getStoryCitations.execute({})) as any;
      expect(res.available).toBe(true);
      expect(res.count).toBe(1);
      expect(res.citations[0].cite).toBe("Fedus et al., 2021");
      expect(res.citations[0].text).toContain("Switch Transformers");
    });

    it("getStoryVideoLinks extracts hero video and body video blocks", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      apiMocks.getArticle.mockResolvedValue(sampleArticle);

      const res = (await window.modelContext!.tools.getStoryVideoLinks.execute({})) as any;
      expect(res.available).toBe(true);
      expect(res.count).toBe(2);
      expect(res.videos).toEqual([
        {
          url: "https://youtube.com/watch?v=hero-vid",
          title: "Attention as Routing",
          source: "hero",
        },
        {
          url: "https://vimeo.com/in-body-vid",
          caption: "Benchmark demo",
          source: "body",
        },
      ]);
    });

    it("getPeopleAlsoAsk extracts questions and snippets", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      apiMocks.getArticle.mockResolvedValue(sampleArticle);

      const res = (await window.modelContext!.tools.getPeopleAlsoAsk.execute({})) as any;
      expect(res.available).toBe(true);
      expect(res.count).toBe(1);
      expect(res.questions[0].question).toBe(
        "How does sparse routing differ from dense attention?"
      );
    });

    it("reports available: false with reason when section is absent", async () => {
      window.history.pushState(null, "", "/story/minimal-story");
      apiMocks.getArticle.mockResolvedValue({
        ...sampleArticle,
        slug: "minimal-story",
        videoUrl: "",
        blocks: [{type: "paragraph", text: "Plain text"}],
        ai_intelligence: null,
      });

      const videoRes = (await window.modelContext!.tools.getStoryVideoLinks.execute({})) as any;
      expect(videoRes.available).toBe(false);
      expect(videoRes.reason).toMatch(/no video/i);

      const citationRes = (await window.modelContext!.tools.getStoryCitations.execute({})) as any;
      expect(citationRes.available).toBe(false);
      expect(citationRes.reason).toMatch(/no citation/i);

      const paaRes = (await window.modelContext!.tools.getPeopleAlsoAsk.execute({})) as any;
      expect(paaRes.available).toBe(false);
      expect(paaRes.reason).toMatch(/no 'people also ask'/i);
    });

    it("lazy-fetches the dossier when the article carries only has_intelligence", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      const {ai_intelligence: embedded, ...flagOnly} = sampleArticle as any;
      apiMocks.getArticle.mockResolvedValue({...flagOnly, has_intelligence: true});
      apiMocks.getArticleIntelligence.mockResolvedValue(embedded);

      const overviewRes = (await window.modelContext!.tools.getStoryAiOverview.execute({})) as any;
      expect(apiMocks.getArticleIntelligence).toHaveBeenCalledWith("attention-as-routing");
      expect(overviewRes.available).toBe(true);
      expect(overviewRes.text).toContain("Attention mechanisms route activations");

      const paaRes = (await window.modelContext!.tools.getPeopleAlsoAsk.execute({})) as any;
      expect(paaRes.available).toBe(true);
      expect(paaRes.count).toBe(1);
    });

    it("degrades gracefully when the lazy dossier fetch rejects", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      const {ai_intelligence: _embedded, ...flagOnly} = sampleArticle as any;
      apiMocks.getArticle.mockResolvedValue({...flagOnly, has_intelligence: true});
      apiMocks.getArticleIntelligence.mockRejectedValue(new Error("Network down"));

      const overviewRes = (await window.modelContext!.tools.getStoryAiOverview.execute({})) as any;
      expect(overviewRes.available).toBe(false);
      expect(overviewRes.reason).toMatch(/no ai overview/i);

      const paaRes = (await window.modelContext!.tools.getPeopleAlsoAsk.execute({})) as any;
      expect(paaRes.available).toBe(false);
      expect(paaRes.reason).toMatch(/no 'people also ask'/i);
    });

    it("resolves an explicit slug argument on a non-story page", async () => {
      window.history.pushState(null, "", "/magazine");
      apiMocks.getArticle.mockResolvedValue(sampleArticle);

      const res = (await window.modelContext!.tools.getStoryVideoLinks.execute({
        slug: "attention-as-routing",
      })) as any;
      expect(apiMocks.getArticle).toHaveBeenCalledWith("attention-as-routing");
      expect(res.available).toBe(true);
      expect(res.count).toBe(2);
    });

    it("reports a lookup failure distinctly from missing story context", async () => {
      window.history.pushState(null, "", "/story/attention-as-routing");
      apiMocks.getArticle.mockRejectedValue(new Error("Request failed"));

      const res = (await window.modelContext!.tools.getStoryAiOverview.execute({})) as any;
      expect(res.available).toBe(false);
      expect(res.error).toMatch(/story lookup failed/i);
      expect(res.error).toMatch(/attention-as-routing/);
    });
  });
});
