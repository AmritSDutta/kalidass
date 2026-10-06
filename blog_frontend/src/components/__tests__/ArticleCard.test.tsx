import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import ArticleCard from "../ArticleCard";
import type {ArticleSummary} from "../../lib/types";

const base: ArticleSummary = {
  id: "a1",
  slug: "attention-as-routing",
  title: "Attention as Routing",
  subtitle: "Sparse MoE Plumbing",
  excerpt: "Mechanics of mixture of experts.",
  coverImage: "",
  videoUrl: "",
  author: {name: "Test Author", role: "Researcher", avatar: ""},
  tags: ["Systems", "Architectures"],
  accent: "#6366f1",
  featured: false,
  published: true,
  private: false,
  aiGenerated: false,
  authorEmail: "a@b.c",
  publishedAt: "2026-10-01T00:00:00Z",
  readTime: 4,
};

describe("ArticleCard rendering (Hermetic)", () => {
  it("links to /story/:slug and shows title, subtitle, read time, and first tag", () => {
    render(<ArticleCard article={base} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/story/attention-as-routing");
    expect(screen.getByText("Attention as Routing")).toBeTruthy();
    expect(screen.getByText("Sparse MoE Plumbing")).toBeTruthy();
    expect(screen.getByText("Systems")).toBeTruthy();
    expect(screen.getByText("4 min")).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("shows the AI-generated warning tag only when aiGenerated is true", () => {
    const {unmount} = render(<ArticleCard article={{...base, aiGenerated: true}} />);
    expect(screen.getByText("AI")).toBeTruthy();
    unmount();

    render(<ArticleCard article={base} />);
    expect(screen.queryByText("AI")).toBeNull();
  });

  it("falls back to a letter avatar and default role when author fields are missing", () => {
    render(
      <ArticleCard
        article={{...base, author: {name: "", role: "", avatar: ""} as ArticleSummary["author"]}}
      />
    );
    expect(screen.getByText("K")).toBeTruthy();
    expect(screen.getByText("Kalidass Author")).toBeTruthy();
    expect(screen.getByText("Research Note")).toBeTruthy();
  });

  it("renders the cover image when present and a fallback block when absent", () => {
    const {container, unmount} = render(<ArticleCard article={base} />);
    expect(container.querySelector(`img[src="https://img.dev/cover.webp"]`)).toBeNull();
    unmount();

    const {container: withCover} = render(
      <ArticleCard article={{...base, coverImage: "https://img.dev/cover.webp"}} />
    );
    expect(withCover.querySelector(`img[src="https://img.dev/cover.webp"]`)).toBeTruthy();
  });
});
