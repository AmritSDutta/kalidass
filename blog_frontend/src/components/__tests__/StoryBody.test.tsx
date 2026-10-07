import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import StoryBody from "../StoryBody";
import type {Article} from "../../lib/types";

function articleWithBlocks(blocks: Article["blocks"]): Article {
  return {
    id: "a1",
    slug: "test-article",
    title: "Test Article",
    subtitle: "",
    excerpt: "",
    coverImage: "",
    videoUrl: "",
    author: {name: "A", role: "R", avatar: ""},
    tags: [],
    accent: "#6366f1",
    featured: false,
    published: true,
    private: false,
    aiGenerated: false,
    authorEmail: "a@b.c",
    publishedAt: "2026-10-01T00:00:00Z",
    readTime: 3,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    blocks,
  };
}

describe("StoryBody block rendering (Hermetic)", () => {
  it("renders heading blocks as h2 with slugified ids", () => {
    render(<StoryBody article={articleWithBlocks([{type: "heading", text: "Latent Cache Mechanics!"}])} />);
    const h2 = screen.getByRole("heading", {name: "Latent Cache Mechanics!"});
    expect(h2.tagName).toBe("H2");
    expect(h2.id).toBe("latent-cache-mechanics");
  });

  it("falls back to a section-N id for heading blocks without usable text", () => {
    render(<StoryBody article={articleWithBlocks([{type: "heading", text: "!!!"}])} />);
    expect(screen.getByRole("heading").id).toBe("section-1");
  });

  it("renders paragraph blocks as text paragraphs", () => {
    render(<StoryBody article={articleWithBlocks([{type: "paragraph", text: "Dense analytical body text."}])} />);
    expect(screen.getByText("Dense analytical body text.")).toBeTruthy();
  });

  it("renders quote blocks with citation", () => {
    render(
      <StoryBody
        article={articleWithBlocks([
          {type: "quote", text: "Consensus is a latency budget.", cite: "Field Notes"},
        ])}
      />
    );
    expect(screen.getByText("Consensus is a latency budget.")).toBeTruthy();
    expect(screen.getByText("Field Notes").tagName).toBe("CITE");
  });

  it("renders reference quotes as split per-line entries after a References heading", () => {
    render(
      <StoryBody
        article={articleWithBlocks([
          {type: "heading", text: "References & Empirical Attributions"},
          {type: "quote", text: "• [Source A](https://a.dev)\n• [Source B](https://b.dev)", cite: "Search"},
        ])}
      />
    );
    expect(screen.getByText("• [Source A](https://a.dev)")).toBeTruthy();
    expect(screen.getByText("• [Source B](https://b.dev)")).toBeTruthy();
  });

  it("renders image blocks with caption, falling back alt text to article title", () => {
    render(
      <StoryBody
        article={articleWithBlocks([
          {type: "image", url: "https://img.dev/cover.webp", caption: "Figure 1"},
        ])}
      />
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://img.dev/cover.webp");
    expect(img.getAttribute("alt")).toBe("Figure 1");
    expect(screen.getByText("Figure 1").tagName).toBe("FIGCAPTION");
  });

  it("renders video blocks as YouTube iframe or native video element", () => {
    const {unmount, container} = render(
      <StoryBody
        article={articleWithBlocks([{type: "video", url: "https://www.youtube.com/watch?v=abc12345"}])}
      />
    );
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube.com/embed/abc12345");
    expect(iframe?.getAttribute("title")).toBe("Test Article");
    unmount();

    const {container: fileContainer} = render(
      <StoryBody
        article={articleWithBlocks([{type: "video", url: "https://cdn.dev/clip.mp4"}])}
      />
    );
    expect(fileContainer.querySelector("video")?.getAttribute("src")).toBe("https://cdn.dev/clip.mp4");
  });

  it("renders code blocks with language, title, and interactive formatting controls", () => {
    const {container} = render(
      <StoryBody
        article={articleWithBlocks([
          {
            type: "code",
            text: "const meaning = 42;",
            language: "typescript",
            title: "src/meaning.ts",
            showLineNumbers: true,
            wrapLines: true,
            highlightLines: "1",
          },
        ])}
      />
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.getAttribute("data-language")).toBe("typescript");
    expect(pre?.getAttribute("data-metastring")).toBe("{1}");
    expect(screen.getByText("const meaning = 42;")).toBeTruthy();
    expect(screen.getAllByText("src/meaning.ts").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", {name: /toggle line numbers/i})).toBeTruthy();
    expect(screen.getByRole("button", {name: /toggle line wrapping/i})).toBeTruthy();
    expect(screen.getByRole("button", {name: /copy code/i})).toBeTruthy();
  });

  it("applies canonical indentation tab-size (4 for Python/Rust, 2 for TS/JS)", () => {
    const {container: pyContainer} = render(
      <StoryBody
        article={articleWithBlocks([
          {
            type: "code",
            text: "def hello():\n    print('world')",
            language: "python",
          },
        ])}
      />
    );
    const pyBlock = pyContainer.querySelector("[style*='--code-tab-size']");
    expect(pyBlock?.getAttribute("style")).toContain("--code-tab-size: 4");

    const {container: tsContainer} = render(
      <StoryBody
        article={articleWithBlocks([
          {
            type: "code",
            text: "const hello = 'world';",
            language: "typescript",
          },
        ])}
      />
    );
    const tsBlock = tsContainer.querySelector("[style*='--code-tab-size']");
    expect(tsBlock?.getAttribute("style")).toContain("--code-tab-size: 2");
  });
});
