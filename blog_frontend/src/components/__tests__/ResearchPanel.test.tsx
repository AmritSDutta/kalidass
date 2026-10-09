import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {ResearchPanel} from "../ResearchPanel/ResearchPanel";
import {truncateWords, formatAuthorNames} from "../../client-modules/researchWebMcp";
import type {ResearchSuggestionData} from "../../lib/types";

const mockResearchData: ResearchSuggestionData = {
  query: "all:attention mechanism transformer",
  topic: "Attention Mechanisms",
  fetchedAt: "2026-10-09T12:00:00Z",
  scoredBy: "jev",
  papers: [
    {
      id: "1706.03762v7",
      title: "Attention Is All You Need",
      authors: [
        {name: "Ashish Vaswani", affiliation: "Google Brain"},
        {name: "Noam Shazeer", affiliation: "Google Brain"},
        {name: "Niki Parmar", affiliation: "Google Research"},
      ],
      summary:
        "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
      links: {
        abstract: "https://arxiv.org/abs/1706.03762",
        pdf: "https://arxiv.org/pdf/1706.03762.pdf",
      },
      published: "2017-06-12T17:57:34Z",
      primaryCategory: "cs.CL",
      score: 0.95,
    },
    {
      id: "2005.14165v4",
      title: "Language Models are Few-Shot Learners",
      authors: [
        {name: "Tom B. Brown"},
        {name: "Benjamin Mann"},
      ],
      summary:
        "Recent work has demonstrated substantial gains on many NLP tasks and benchmarks by pre-training on a large corpus of text followed by fine-tuning on a specific task.",
      links: {
        abstract: "https://arxiv.org/abs/2005.14165",
        pdf: "https://arxiv.org/pdf/2005.14165.pdf",
      },
      published: "2020-05-28T00:00:00Z",
      primaryCategory: "cs.CL",
      score: 0.88,
    },
  ],
};

describe("ResearchPanel component (Hermetic)", () => {
  it("truncates words correctly to 25 words", () => {
    const text = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven";
    const truncated = truncateWords(text, 25);
    const words = truncated.replace(/\.\.\.$/, "").split(" ");
    expect(words).toHaveLength(25);
    expect(truncated.endsWith("...")).toBe(true);

    const short = "Just four short words";
    expect(truncateWords(short, 25)).toBe("Just four short words");
  });

  it("formats author names correctly", () => {
    const authors = [
      {name: "Alice", affiliation: "MIT"},
      {name: "Bob"},
      {name: ""},
    ];
    expect(formatAuthorNames(authors)).toBe("Alice, Bob");
    expect(formatAuthorNames([])).toBe("Unknown authors");
    expect(formatAuthorNames(undefined)).toBe("Unknown authors");
  });

  it("renders unfetched state when researchData is null", () => {
    const handleFetch = vi.fn();
    render(<ResearchPanel researchData={null} onFetch={handleFetch} loading={false} />);

    expect(screen.getByText(/arXiv Research/i)).toBeTruthy();
    expect(screen.getByText(/Unfetched/i)).toBeTruthy();
    expect(screen.getByText(/No research papers compiled yet/i)).toBeTruthy();

    const fetchBtns = screen.getAllByRole("button", {name: /Find Research Papers/i});
    expect(fetchBtns.length).toBeGreaterThan(0);
    fireEvent.click(fetchBtns[0]);
    expect(handleFetch).toHaveBeenCalledTimes(1);
  });

  it("renders readOnly mode without fetch button", () => {
    render(<ResearchPanel researchData={null} readOnly={true} loading={false} />);

    expect(screen.getByText(/arXiv Research/i)).toBeTruthy();
    expect(screen.getByText(/No research papers compiled yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", {name: /Find Research Papers/i})).toBeNull();
  });

  it("renders loaded paper cards with titles, authors, truncated summaries, and links", () => {
    render(<ResearchPanel researchData={mockResearchData} loading={false} />);

    expect(screen.getByText(/Active/i)).toBeTruthy();
    expect(screen.getByText(/Ranked by jev/i)).toBeTruthy();

    // Check titles
    expect(screen.getByText("Attention Is All You Need")).toBeTruthy();
    expect(screen.getByText("Language Models are Few-Shot Learners")).toBeTruthy();

    // Check authors
    expect(screen.getByText(/by Ashish Vaswani, Noam Shazeer, Niki Parmar/i)).toBeTruthy();
    expect(screen.getByText(/by Tom B\. Brown, Benjamin Mann/i)).toBeTruthy();

    // Check category badges
    const categoryBadges = screen.getAllByText("cs.CL");
    expect(categoryBadges.length).toBe(2);

    // Check arXiv and PDF links
    const arxivLinks = screen.getAllByRole("link", {name: /arXiv ↗/i});
    expect(arxivLinks).toHaveLength(2);
    expect(arxivLinks[0].getAttribute("href")).toBe("https://arxiv.org/abs/1706.03762");

    const pdfLinks = screen.getAllByRole("link", {name: /PDF ↗/i});
    expect(pdfLinks).toHaveLength(2);
    expect(pdfLinks[0].getAttribute("href")).toBe("https://arxiv.org/pdf/1706.03762.pdf");
  });

  it("renders loading state", () => {
    render(<ResearchPanel researchData={null} loading={true} />);
    expect(screen.getByText(/Harvesting arXiv & evaluating relevance/i)).toBeTruthy();
  });

  it("renders error banner when error prop is provided", () => {
    render(<ResearchPanel researchData={null} error="ArXiv rate limit exceeded" />);
    expect(screen.getByText("ArXiv rate limit exceeded")).toBeTruthy();
  });
});
