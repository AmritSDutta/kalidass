import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor, fireEvent} from "@testing-library/react";
import React from "react";
import Magazine from "../magazine";
import {listArticles, getTopTags} from "@site/src/lib/api";
import type {ArticleSummary} from "@site/src/lib/types";

vi.mock("@site/src/lib/api", () => ({
  listArticles: vi.fn(),
  getTopTags: vi.fn(),
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

describe("Magazine Page Server Pagination & D1 Tags (Hermetic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    vi.mocked(getTopTags).mockResolvedValue(["Systems", "Evals", "Edge"]);
  });

  it("renders top tags from API and displays page 1 briefs", async () => {
    const page1Articles = generateMockArticles(9);
    vi.mocked(listArticles).mockResolvedValue(page1Articles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 · 9 briefs shown")).toBeTruthy();
    });

    expect(screen.getByRole("button", {name: "Systems"})).toBeTruthy();
    expect(screen.getByRole("button", {name: "Evals"})).toBeTruthy();
    expect(screen.getByRole("button", {name: "Edge"})).toBeTruthy();
    expect(screen.getByText("Article 01")).toBeTruthy();
    expect(screen.getByText("Article 09")).toBeTruthy();

    const prevBtn = screen.getByRole("button", {name: "Previous page"});
    expect(prevBtn).toHaveProperty("disabled", true);

    const nextBtn = screen.getByRole("button", {name: "Next page"});
    expect(nextBtn).toHaveProperty("disabled", false);
  });

  it("navigates to page 2 and queries listArticles with page 2", async () => {
    const page1Articles = generateMockArticles(9);
    const page2Articles = generateMockArticles(4);
    vi.mocked(listArticles)
      .mockResolvedValueOnce(page1Articles)
      .mockResolvedValueOnce(page2Articles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 · 9 briefs shown")).toBeTruthy();
    });

    const nextBtn = screen.getByRole("button", {name: "Next page"});
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText("Page 2 · 4 briefs shown")).toBeTruthy();
    });

    expect(listArticles).toHaveBeenCalledWith(
      expect.objectContaining({page: 2, limit: 9})
    );

    const prevBtn = screen.getByRole("button", {name: "Previous page"});
    expect(prevBtn).toHaveProperty("disabled", false);

    // Next button should be disabled because page 2 has fewer than 9 articles
    expect(screen.getByRole("button", {name: "Next page"})).toHaveProperty("disabled", true);
  });

  it("filters by tag and resets to page 1", async () => {
    const page1Articles = generateMockArticles(9);
    const systemsArticles = generateMockArticles(5);
    vi.mocked(listArticles)
      .mockResolvedValueOnce(page1Articles)
      .mockResolvedValueOnce(systemsArticles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 · 9 briefs shown")).toBeTruthy();
    });

    const systemsBtn = screen.getByRole("button", {name: "Systems"});
    fireEvent.click(systemsBtn);

    await waitFor(() => {
      expect(listArticles).toHaveBeenCalledWith(
        expect.objectContaining({tag: "Systems", page: 1})
      );
    });
  });

  it("hides pagination controls when on page 1 and fewer than 9 articles return", async () => {
    const fewArticles = generateMockArticles(5);
    vi.mocked(listArticles).mockResolvedValue(fewArticles);

    render(<Magazine />);

    await waitFor(() => {
      expect(screen.getByText("Article 05")).toBeTruthy();
    });

    expect(screen.queryByRole("navigation", {name: "Magazine pagination"})).toBeNull();
  });
});
