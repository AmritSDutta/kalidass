import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor, fireEvent} from "@testing-library/react";
import React from "react";
import Magazine from "../magazine";
import {listArticles} from "@site/src/lib/api";
import type {ArticleSummary} from "@site/src/lib/types";

vi.mock("@site/src/lib/api", () => ({
  listArticles: vi.fn(),
}));

function generateMockArticles(count: number): ArticleSummary[] {
  return Array.from({length: count}, (_, i) => {
    const num = i + 1;
    const pad = num.toString().padStart(2, "0");
    const hour = num.toString().padStart(2, "0");
    return {
      id: `art-${pad}`,
      slug: `article-${pad}`,
      title: `Article ${pad}`,
      subtitle: `Subtitle ${pad}`,
      excerpt: `Excerpt for brief ${pad}`,
      coverImage: "",
      videoUrl: "",
      author: {name: "Author", role: "Researcher", avatar: ""},
      tags: num % 2 === 0 ? ["Systems"] : ["Evals"],
      accent: "#6366f1",
      featured: false,
      published: true,
      private: false,
      aiGenerated: false,
      authorEmail: "author@kalidass.fyi",
      publishedAt: `2026-10-01T${hour}:00:00Z`,
      readTime: 3,
    };
  });
}

describe("Magazine Page Pagination & Recency (Hermetic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it("sorts by recency descending and displays exactly 9 briefs on page 1", async () => {
    const mockArticles = generateMockArticles(20);
    vi.mocked(listArticles).mockResolvedValue(mockArticles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Showing 1–9 of 20 briefs")).toBeTruthy();
    });

    // Newest is Article 20 (20:00:00Z)
    expect(screen.getByText("Article 20")).toBeTruthy();
    expect(screen.getByText("Article 19")).toBeTruthy();
    expect(screen.getByText("Article 12")).toBeTruthy();

    // Older articles should not be on Page 1
    expect(screen.queryByText("Article 01")).toBeNull();
    expect(screen.queryByText("Article 11")).toBeNull();
  });

  it("navigates to page 2 and renders the next 9 briefs in recency order", async () => {
    const mockArticles = generateMockArticles(20);
    vi.mocked(listArticles).mockResolvedValue(mockArticles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Showing 1–9 of 20 briefs")).toBeTruthy();
    });

    const nextBtn = screen.getByRole("button", {name: "Next page"});
    fireEvent.click(nextBtn);

    expect(screen.getByText("Showing 10–18 of 20 briefs")).toBeTruthy();
    expect(screen.getByText("Article 11")).toBeTruthy();
    expect(screen.getByText("Article 03")).toBeTruthy();
    expect(screen.queryByText("Article 20")).toBeNull();
  });

  it("resets to page 1 when searching or applying a tag filter", async () => {
    const mockArticles = generateMockArticles(20);
    vi.mocked(listArticles).mockResolvedValue(mockArticles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Showing 1–9 of 20 briefs")).toBeTruthy();
    });

    // Go to page 2
    const nextBtn = screen.getByRole("button", {name: "Next page"});
    fireEvent.click(nextBtn);
    expect(screen.getByText("Showing 10–18 of 20 briefs")).toBeTruthy();

    // Select tag "Systems" (10 matching articles)
    const systemsTagBtn = screen.getByRole("button", {name: "Systems"});
    fireEvent.click(systemsTagBtn);

    // Should immediately reset to page 1
    expect(screen.getByText("Showing 1–9 of 10 briefs")).toBeTruthy();
    expect(screen.getByText("Article 20")).toBeTruthy();
  });

  it("hides pagination controls when total articles are 9 or fewer", async () => {
    const mockArticles = generateMockArticles(7);
    vi.mocked(listArticles).mockResolvedValue(mockArticles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Article 07")).toBeTruthy();
    });

    expect(screen.queryByRole("navigation", {name: "Magazine pagination"})).toBeNull();
  });
});
