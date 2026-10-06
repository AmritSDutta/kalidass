import {describe, it, expect, beforeEach, vi} from "vitest";

// Mock the API layer — zero network, fully hermetic
const apiMocks = vi.hoisted(() => ({
  listArticles: vi.fn(),
  getArticle: vi.fn(),
}));
vi.mock("../../lib/api", () => apiMocks);

import "../webmcp"; // auto-registers tools on import (window exists in jsdom)

const summaries = [
  {
    id: "art-1",
    slug: "attention-as-routing",
    title: "Attention as Routing",
    subtitle: "Sparse MoE Plumbing",
    excerpt: "Mechanics of mixture of experts.",
    coverImage: "",
    videoUrl: "",
    author: {name: "Test Author", role: "Researcher", avatar: ""},
    tags: ["Systems"],
    accent: "#6366f1",
    featured: false,
    published: true,
    private: false,
    aiGenerated: false,
    authorEmail: "a@b.c",
    publishedAt: "2026-10-01T00:00:00Z",
    readTime: 4,
  },
];

describe("WebMCP in-browser registry (Hermetic)", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
    apiMocks.listArticles.mockReset();
    apiMocks.getArticle.mockReset();
  });

  it("auto-registers searchArticles and readArticle on the model context registry", async () => {
    const registry = window.modelContext;
    expect(registry).toBeTruthy();
    const tools = await registry!.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["readArticle", "searchArticles"]);
    expect(document.modelContext).toBe(registry);
  });

  it("searchArticles.execute isolates the current story on /story/:slug", async () => {
    window.history.pushState(null, "", "/story/attention-as-routing");
    apiMocks.listArticles.mockResolvedValue(summaries);

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
    apiMocks.getArticle.mockResolvedValue({
      ...summaries[0],
      blocks: [{type: "paragraph", text: "hidden body"}],
    });

    const result = (await window.modelContext!.tools.readArticle.execute({})) as any;
    expect(apiMocks.getArticle).toHaveBeenCalledWith("attention-as-routing");
    expect(result.slug).toBe("attention-as-routing");
    expect(result.url).toBe(`${window.location.origin}/story/attention-as-routing`);
    expect(result).not.toHaveProperty("blocks");
  });
});
