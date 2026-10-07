import {describe, it, expect, beforeEach, vi} from "vitest";

// Mock the API layer — zero network, fully hermetic
const apiMocks = vi.hoisted(() => ({
  listArticles: vi.fn(),
  getArticle: vi.fn(),
  getArticleIntelligence: vi.fn(),
  getAuthMe: vi.fn(),
}));
vi.mock("../../lib/api", () => apiMocks);

import "../webmcp"; // auto-registers tools on import (window exists in jsdom)
import {clearPendingStaged} from "../storyWebMcp";

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
    {
      type: "code",
      text: "def route():\n    pass",
      language: "python",
      title: "router.py",
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

  it("auto-registers all 7 tools on the model context registry", async () => {
    const registry = window.modelContext;
    expect(registry).toBeTruthy();
    const tools = await registry!.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "enhanceStoryContent",
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

    describe("enhanceStoryContent tool", () => {
      beforeEach(() => {
        localStorage.clear();
        clearPendingStaged();
        apiMocks.getAuthMe.mockReset();
      });

      it("does not expose slug parameter in schema or parameters", () => {
        const tool = window.modelContext!.tools.enhanceStoryContent;
        expect(tool.inputSchema?.properties?.slug).toBeUndefined();
        expect(tool.parameters?.properties?.slug).toBeUndefined();
      });

      it("rejects when not on a story page", async () => {
        window.history.pushState(null, "", "/magazine");
        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedText: "New paragraph",
        })) as any;
        expect(res.available).toBe(false);
        expect(res.error).toBe("Tool only available on a story page (/story/:slug).");
      });

      it("rejects unauthorized caller with exact error message", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "stranger@other.com", role: "author"},
        });

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedText: "New unauthorized text",
        })) as any;

        expect(res.available).toBe(false);
        expect(res.error).toBe(
          "Not privileged to change: you must be the author or an admin to enhance this story."
        );
      });

      it("returns actionable error when sectionHeading does not match any heading", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          sectionHeading: "Nonexistent Heading",
          enhancedText: "Some text",
        })) as any;

        expect(res.available).toBe(false);
        expect(res.error).toContain("No heading matching 'Nonexistent Heading'");
        expect(res.error).toContain("Available headings: Empirical Benchmarks | References & Attributions");
      });

      it("rejects malformed enhancedBlocks with runtime validation error", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        // 1. Unknown type
        const resUnknown = (await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedBlocks: [{type: "invalid_type", text: "Hello"}],
        })) as any;
        expect(resUnknown.available).toBe(false);
        expect(resUnknown.error).toContain("invalid block type 'invalid_type'");

        // 2. Image missing url
        const resNoUrl = (await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedBlocks: [{type: "image", caption: "Photo"}],
        })) as any;
        expect(resNoUrl.available).toBe(false);
        expect(resNoUrl.error).toContain("image block requires a non-empty url string");
      });

      it("permits author, updates targeted section heading, and returns full harmonized result shape", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"}, // Matches sampleArticle.authorEmail
        });

        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          sectionHeading: "Empirical Benchmarks",
          enhancedText: "Empirical Benchmarks & Validation Suite",
          instruction: "Refined section heading title",
        })) as any;

        window.removeEventListener("kalidass:stage-enhancement", listener);

        expect(res.available).toBe(true);
        expect(res.ok).toBe(true);
        expect(res.staged).toBe(true);
        expect(res.slug).toBe("attention-as-routing");
        expect(res.dirtyIndices).toEqual([1]);
        expect(res.updatedIndices).toEqual([1]); // Block index 1 is "Empirical Benchmarks"
        expect(dispatchedEvents).toHaveLength(1);
        expect(dispatchedEvents[0].dirtyIndices).toEqual([1]);
        expect(dispatchedEvents[0].stagedArticle.blocks[1].text).toBe(
          "Empirical Benchmarks & Validation Suite"
        );
      });

      it("composes consecutive enhancements without dropping prior staged edits", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        // 1. First edit: update section heading at block 1
        await window.modelContext!.tools.enhanceStoryContent.execute({
          sectionHeading: "Empirical Benchmarks",
          enhancedText: "Empirical Benchmarks (Updated)",
        });

        // 2. Second edit: update block 0 (introductory paragraph)
        const res2 = (await window.modelContext!.tools.enhanceStoryContent.execute({
          blockIndex: 0,
          enhancedText: "Composed introductory paragraph edit.",
        })) as any;

        expect(res2.available).toBe(true);
        expect(res2.staged).toBe(true);

        // Verify with a third query or inspect the last staged dispatch
        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        // 3. Third edit: append a note
        await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedText: "Appended conclusion note.",
        });

        window.removeEventListener("kalidass:stage-enhancement", listener);

        const lastStaged = dispatchedEvents[0].stagedArticle;
        // Block 0 was changed in edit 2
        expect(lastStaged.blocks[0].text).toBe("Composed introductory paragraph edit.");
        // Block 1 was changed in edit 1 and preserved
        expect(lastStaged.blocks[1].text).toBe("Empirical Benchmarks (Updated)");
        // Last block was newly appended
        expect(lastStaged.blocks[lastStaged.blocks.length - 1].text).toBe("Appended conclusion note.");
      });

      it("resets pendingStaged when kalidass:stage-clear event is dispatched", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        // First edit
        await window.modelContext!.tools.enhanceStoryContent.execute({
          blockIndex: 0,
          enhancedText: "Staged edit before clear",
        });

        // Dispatch stage-clear (simulating user discard or route navigation)
        window.dispatchEvent(new Event("kalidass:stage-clear"));

        // Second edit: should start fresh from sampleArticle again
        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        await window.modelContext!.tools.enhanceStoryContent.execute({
          blockIndex: 1,
          enhancedText: "Fresh edit after clear",
        });

        window.removeEventListener("kalidass:stage-enhancement", listener);

        const currentStaged = dispatchedEvents[0].stagedArticle;
        // Block 0 should have reverted to original sampleArticle text
        expect(currentStaged.blocks[0].text).toBe("Introduction to routing networks.");
        // Block 1 has the new edit
        expect(currentStaged.blocks[1].text).toBe("Fresh edit after clear");
      });

      it("permits elevated admin via admin token and stages block replacement", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        localStorage.setItem("kalidass-admin-token", "valid-admin-secret");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "admin@kalidass.dev", role: "admin"},
        });

        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          blockIndex: 0,
          enhancedBlocks: [
            {type: "paragraph", text: "Brand new replacement introductory paragraph."},
          ],
          instruction: "Replaced lead paragraph with clearer introduction",
        })) as any;

        window.removeEventListener("kalidass:stage-enhancement", listener);

        expect(res.available).toBe(true);
        expect(res.staged).toBe(true);
        expect(res.updatedIndices).toEqual([0]);
        expect(dispatchedEvents[0].stagedArticle.blocks[0].text).toBe(
          "Brand new replacement introductory paragraph."
        );
      });

      it("stages a code block with language and title via enhancedBlocks", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedBlocks: [
            {
              type: "code",
              text: "console.log('Neural Attention Layer');",
              language: "typescript",
              title: "attention.ts",
            },
          ],
          instruction: "Appended implementation code snippet",
        })) as any;

        window.removeEventListener("kalidass:stage-enhancement", listener);

        expect(res.available).toBe(true);
        expect(res.staged).toBe(true);
        const stagedBlocks = dispatchedEvents[0].stagedArticle.blocks;
        const lastBlock = stagedBlocks[stagedBlocks.length - 1];
        expect(lastBlock.type).toBe("code");
        expect(lastBlock.text).toBe("console.log('Neural Attention Layer');");
        expect(lastBlock.language).toBe("typescript");
        expect(lastBlock.title).toBe("attention.ts");
      });

      it("keeps raw text when enhancedText targets a code block (no markdown stripping)", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        const rawCode = "# Config loader\n- item\nprint('hello')";
        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          blockIndex: 5,
          enhancedText: rawCode,
          instruction: "Updated routing snippet",
        })) as any;

        window.removeEventListener("kalidass:stage-enhancement", listener);

        expect(res.available).toBe(true);
        expect(res.staged).toBe(true);
        const stagedBlocks = dispatchedEvents[0].stagedArticle.blocks;
        expect(stagedBlocks[5].type).toBe("code");
        expect(stagedBlocks[5].text).toBe(rawCode);
      });

      it("rejects malformed code block highlightLines ranges", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          enhancedBlocks: [
            {type: "code", text: "print('x')", language: "python", highlightLines: "all"},
          ],
          instruction: "Bad highlight range",
        })) as any;

        expect(res.available).toBe(false);
        expect(res.error).toContain("highlightLines");
      });

      it("adds a new section with non-markdown humanized text via addNewSection: true", async () => {
        window.history.pushState(null, "", "/story/attention-as-routing");
        apiMocks.getArticle.mockResolvedValue(sampleArticle);
        apiMocks.getAuthMe.mockResolvedValue({
          ok: true,
          user: {email: "a@b.c", role: "author"},
        });

        const dispatchedEvents: any[] = [];
        const listener = (e: Event) => dispatchedEvents.push((e as CustomEvent).detail);
        window.addEventListener("kalidass:stage-enhancement", listener);

        const res = (await window.modelContext!.tools.enhanceStoryContent.execute({
          addNewSection: true,
          sectionHeading: "### Modern Routing Paradigms",
          enhancedText: "**Sparse routing** provides substantial throughput gains without raw markdown tokens.",
          instruction: "Added new section on routing paradigms",
        })) as any;

        window.removeEventListener("kalidass:stage-enhancement", listener);

        expect(res.available).toBe(true);
        expect(res.staged).toBe(true);
        const stagedBlocks = dispatchedEvents[0].stagedArticle.blocks;
        const newHeading = stagedBlocks[stagedBlocks.length - 2];
        const newParagraph = stagedBlocks[stagedBlocks.length - 1];
        expect(newHeading.type).toBe("heading");
        expect(newHeading.text).toBe("Modern Routing Paradigms");
        expect(newParagraph.type).toBe("paragraph");
        expect(newParagraph.text).toBe("Sparse routing provides substantial throughput gains without raw markdown tokens.");
      });
    });
  });
});
