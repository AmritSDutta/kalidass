import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import IntelligencePanel from "../IntelligencePanel/IntelligencePanel";
import type {AiIntelligence} from "../../lib/types";

const mockIntel: AiIntelligence = {
  query: "Attention as Routing Systems",
  ai_overview: {
    text: "Attention mechanisms route tokens through dynamic expert subnetworks.",
    references: [
      {title: "Attention Paper", link: "https://arxiv.org/abs/test", source: "arXiv"},
    ],
  },
  knowledge_graph: {
    title: "Mixture of Experts",
    type: "Machine Learning Architecture",
    description: "An ensemble learning technique where multiple expert networks handle subsets of inputs.",
    website: "https://example.com/moe",
    attributes: {
      "Paradigm": "Conditional Computation",
      "Inventors": "Jacobs et al.",
    },
  },
  inline_videos: [
    {title: "Explaining MoE Systems", link: "https://youtube.com/watch?v=123", channel: "DeepTech", duration: "12:30"},
  ],
  books_shopping: [
    {title: "Deep Learning Foundations", link: "https://books.dev/1", price: "$49.99", source: "MIT Press"},
  ],
  jobs_results: [
    {title: "Senior AI Systems Engineer", company_name: "Compute Labs", location: "San Francisco", via: "LinkedIn"},
  ],
  people_also_ask: [
    {question: "How does routing work in MoE?", snippet: "Routing uses gating logits to select top-k experts.", link: "https://wiki.dev/routing"},
  ],
  discussions_and_forums: [
    {title: "MoE memory footprint discussions", link: "https://forum.dev/t/123", forum: "Hacker News"},
  ],
  fetchedAt: "2026-10-06T20:00:00Z",
};

describe("IntelligencePanel component (Hermetic)", () => {
  it("renders unfetched state when intelligence is null", () => {
    const handleFetch = vi.fn();
    render(<IntelligencePanel intelligence={null} onFetch={handleFetch} loading={false} />);

    expect(screen.getByText(/SERP Intelligence/i)).toBeTruthy();
    expect(screen.getByText(/Unfetched/i)).toBeTruthy();
    expect(screen.getByText(/No intelligence block loaded yet/i)).toBeTruthy();

    const fetchBtn = screen.getByRole("button", {name: /Fetch Intelligence/i});
    fireEvent.click(fetchBtn);
    expect(handleFetch).toHaveBeenCalledWith(false);
  });

  it("renders loaded intelligence block with all sections", () => {
    const handleFetch = vi.fn();
    render(<IntelligencePanel intelligence={mockIntel} onFetch={handleFetch} loading={false} />);

    expect(screen.getByText(/Active/i)).toBeTruthy();
    expect(screen.getByText(/Google AI Overview/i)).toBeTruthy();
    expect(screen.getByText(/Attention mechanisms route tokens/i)).toBeTruthy();
    expect(screen.getByText(/Cited Sources:/i)).toBeTruthy();
    expect(screen.getByText(/Attention Paper/i)).toBeTruthy();

    // Knowledge Graph header renders collapsed (sections are lazy on expand)
    const kgBtn = screen.getByRole("button", {name: /Knowledge Graph: Mixture of Experts/i});
    expect(kgBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Conditional Computation/i)).toBeNull();

    // Expanding mounts the section content
    fireEvent.click(kgBtn);
    expect(screen.getByText(/Conditional Computation/i)).toBeTruthy();

    // Accordion items with count
    expect(screen.getByText(/Inline Video References \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/Curated Books & Literature \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/Industry Opportunities \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/People Also Ask \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/Community Discussions & Forums \(1\)/i)).toBeTruthy();
  });

  it("toggles section accordion expansion and updates aria-expanded (Finding R1)", () => {
    const handleFetch = vi.fn();
    render(<IntelligencePanel intelligence={mockIntel} onFetch={handleFetch} loading={false} />);

    // Overview is open by default
    const overviewBtn = screen.getByRole("button", {name: /Google AI Overview/i});
    expect(overviewBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Attention mechanisms route tokens/i)).toBeTruthy();

    // Click to collapse
    fireEvent.click(overviewBtn);
    expect(overviewBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Attention mechanisms route tokens/i)).toBeNull();

    // Click to re-open
    fireEvent.click(overviewBtn);
    expect(overviewBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Attention mechanisms route tokens/i)).toBeTruthy();
  });

  it("handles Force Refresh button click (Finding R4)", () => {
    const handleFetch = vi.fn();
    render(<IntelligencePanel intelligence={mockIntel} onFetch={handleFetch} loading={false} />);

    const refreshBtn = screen.getByRole("button", {name: /Force Refresh/i});
    fireEvent.click(refreshBtn);
    expect(handleFetch).toHaveBeenCalledWith(true);
  });
});
