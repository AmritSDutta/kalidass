import {describe, it, expect} from "vitest";
import {formatResearchPaper, formatResearchSuggestionPayload} from "../researchWebMcp";
import type {ResearchPaperItem, ResearchSuggestionData} from "../../lib/types";

describe("researchWebMcp helpers (Hermetic)", () => {
  const paper: ResearchPaperItem = {
    id: "2303.08774",
    title: "GPT-4 Technical Report",
    summary:
      "We report the development of GPT-4, a large-scale, multimodal model which can accept image and text inputs and produce text outputs. While less capable than humans in many real-world scenarios, GPT-4 exhibits human-level performance on various professional and academic benchmarks, including passing a simulated bar exam with a score around the top 10% of test takers.",
    authors: [
      {name: "OpenAI", affiliation: "OpenAI"},
      {name: "Josh Achiam"},
    ],
    links: {
      abstract: "https://arxiv.org/abs/2303.08774",
      pdf: "https://arxiv.org/pdf/2303.08774.pdf",
    },
    published: "2023-03-15T17:00:00Z",
    primaryCategory: "cs.CL",
    score: 0.98,
  };

  it("formats paper with author list and 25-word summary", () => {
    const formatted = formatResearchPaper(paper);
    expect(formatted.id).toBe("2303.08774");
    expect(formatted.title).toBe("GPT-4 Technical Report");
    expect(formatted.authors).toBe("OpenAI, Josh Achiam");
    expect(formatted.links.abstract).toBe("https://arxiv.org/abs/2303.08774");
    expect(formatted.links.pdf).toBe("https://arxiv.org/pdf/2303.08774.pdf");

    const words = formatted.summary.replace(/\.\.\.$/, "").split(" ");
    expect(words).toHaveLength(25);
    expect(formatted.summary.endsWith("...")).toBe(true);
    expect(formatted.score).toBe(0.98);
  });

  it("handles missing abstract link by falling back to arxiv.org/abs/:id", () => {
    const formatted = formatResearchPaper({
      ...paper,
      links: {abstract: ""},
    });
    expect(formatted.links.abstract).toBe("https://arxiv.org/abs/2303.08774");
  });

  it("formats payload structure accurately", () => {
    const payload: ResearchSuggestionData = {
      query: "all:GPT-4",
      topic: "Multimodal Models",
      fetchedAt: "2026-10-09T00:00:00Z",
      scoredBy: "jev",
      papers: [paper],
    };

    const formattedPayload = formatResearchSuggestionPayload(payload);
    expect(formattedPayload.query).toBe("all:GPT-4");
    expect(formattedPayload.topic).toBe("Multimodal Models");
    expect(formattedPayload.total).toBe(1);
    expect(formattedPayload.scoredBy).toBe("jev");
    expect(formattedPayload.papers[0].title).toBe("GPT-4 Technical Report");
  });
});
