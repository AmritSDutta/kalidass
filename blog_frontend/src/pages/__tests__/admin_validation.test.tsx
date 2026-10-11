import {describe, it, expect} from "vitest";
import {
  validateImageUploadFile,
  getTitleValidationErrors,
  getParagraphCapErrors,
  getDraftValidationErrors,
  getPublishValidationErrors,
  MAX_IMAGE_BYTES,
  MAX_PARAGRAPH_CHARS,
  MAX_TITLE_WORDS,
} from "../../lib/validation";
import type {ArticleDraft, Block} from "../../lib/types";

function createMockFile(name: string, type: string, sizeBytes: number): File {
  const buffer = new Uint8Array(sizeBytes);
  return new File([buffer], name, {type});
}

function createMinimalDraft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    title: "Valid Title",
    subtitle: "Valid Subtitle",
    excerpt: "Valid Excerpt",
    slug: "valid-slug",
    coverImage: "",
    videoUrl: "",
    author: {name: "Author", role: "Editor", avatar: ""},
    authorEmail: "test@example.com",
    tags: ["Systems"],
    accent: "#6366f1",
    featured: false,
    blocks: [
      {type: "heading", text: "Introduction"},
      {type: "paragraph", text: "Here is the first paragraph."},
    ],
    ...overrides,
  };
}

describe("UI Validation Module - Image Upload", () => {
  it("allows WebP images under 512 KB", () => {
    const file = createMockFile("hero.webp", "image/webp", 200 * 1024);
    const result = validateImageUploadFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("allows JPEG images under 512 KB", () => {
    const file = createMockFile("hero.jpg", "image/jpeg", 511 * 1024);
    const result = validateImageUploadFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects PNG images", () => {
    const file = createMockFile("hero.png", "image/png", 100 * 1024);
    const result = validateImageUploadFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Only WebP (.webp) and JPEG (.jpg, .jpeg) images are allowed");
  });

  it("rejects GIF images", () => {
    const file = createMockFile("hero.gif", "image/gif", 50 * 1024);
    const result = validateImageUploadFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Only WebP (.webp) and JPEG (.jpg, .jpeg) images are allowed");
  });

  it("rejects images equal to or exceeding 512 KB", () => {
    const exactLimit = createMockFile("huge.webp", "image/webp", MAX_IMAGE_BYTES);
    const resultExact = validateImageUploadFile(exactLimit);
    expect(resultExact.valid).toBe(false);
    expect(resultExact.error).toContain("exceeds the 512 KB limit");

    const overLimit = createMockFile("huge.jpeg", "image/jpeg", 600 * 1024);
    const resultOver = validateImageUploadFile(overLimit);
    expect(resultOver.valid).toBe(false);
    expect(resultOver.error).toContain("exceeds the 512 KB limit");
  });
});

describe("UI Validation Module - Title Validation", () => {
  it("rejects empty titles or whitespace-only titles", () => {
    expect(getTitleValidationErrors("")).toContain("Title is required.");
    expect(getTitleValidationErrors("   \t  ")).toContain("Title is required.");
  });

  it("accepts titles with 1 to 5 words", () => {
    expect(getTitleValidationErrors("One")).toHaveLength(0);
    expect(getTitleValidationErrors("One Two")).toHaveLength(0);
    expect(getTitleValidationErrors("One Two Three")).toHaveLength(0);
    expect(getTitleValidationErrors("One Two Three Four")).toHaveLength(0);
    expect(getTitleValidationErrors("One Two Three Four Five")).toHaveLength(0);
  });

  it("rejects titles with strictly more than 5 words", () => {
    const errors = getTitleValidationErrors("One Two Three Four Five Six");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`Title must be ${MAX_TITLE_WORDS} words or fewer`);
  });
});

describe("UI Validation Module - Paragraph Cap", () => {
  it("accepts paragraphs up to 10,000 characters", () => {
    const blocks: Block[] = [
      {type: "paragraph", text: "a".repeat(MAX_PARAGRAPH_CHARS)},
    ];
    expect(getParagraphCapErrors(blocks)).toHaveLength(0);
  });

  it("rejects paragraphs exceeding 10,000 characters", () => {
    const blocks: Block[] = [
      {type: "paragraph", text: "a".repeat(MAX_PARAGRAPH_CHARS + 1)},
    ];
    const errors = getParagraphCapErrors(blocks);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("exceeds the 10,000 character limit");
  });

  it("ignores non-paragraph blocks exceeding 10,000 characters", () => {
    const blocks: Block[] = [
      {type: "code", text: "console.log('long');".repeat(600), language: "typescript"},
    ];
    expect(getParagraphCapErrors(blocks)).toHaveLength(0);
  });
});

describe("UI Validation Module - Save Draft Validation", () => {
  it("accepts a minimal draft with valid title and paragraph length", () => {
    const draft = createMinimalDraft({
      title: "Short Title",
      slug: "",
      excerpt: "",
      subtitle: "",
      blocks: [{type: "paragraph", text: "Draft text"}],
    });
    expect(getDraftValidationErrors(draft)).toEqual([]);
  });

  it("blocks saving draft if title is empty", () => {
    const draft = createMinimalDraft({title: ""});
    const errors = getDraftValidationErrors(draft);
    expect(errors).toContain("Title is required.");
  });

  it("blocks saving draft if title exceeds 5 words", () => {
    const draft = createMinimalDraft({title: "This title has way too many words"});
    const errors = getDraftValidationErrors(draft);
    expect(errors.some((e) => e.includes("Title must be 5 words or fewer"))).toBe(true);
  });

  it("blocks saving draft if any paragraph exceeds 10,000 chars", () => {
    const draft = createMinimalDraft({
      blocks: [{type: "paragraph", text: "x".repeat(10001)}],
    });
    const errors = getDraftValidationErrors(draft);
    expect(errors.some((e) => e.includes("exceeds the 10,000 character limit"))).toBe(true);
  });
});

describe("UI Validation Module - Publish Validation", () => {
  it("accepts fully qualified publish draft", () => {
    const draft = createMinimalDraft();
    expect(getPublishValidationErrors(draft)).toEqual([]);
  });

  it("blocks publish if slug is missing", () => {
    const draft = createMinimalDraft({slug: ""});
    const errors = getPublishValidationErrors(draft);
    expect(errors).toContain("Slug is required to publish.");
  });

  it("blocks publish if both excerpt and subtitle are missing", () => {
    const draft = createMinimalDraft({excerpt: "", subtitle: ""});
    const errors = getPublishValidationErrors(draft);
    expect(errors).toContain("Summary (excerpt or subtitle) is required to publish.");
  });

  it("allows publish if subtitle is present even without excerpt", () => {
    const draft = createMinimalDraft({excerpt: "", subtitle: "A clear subtitle"});
    expect(getPublishValidationErrors(draft)).toEqual([]);
  });

  it("allows publish if excerpt is present even without subtitle", () => {
    const draft = createMinimalDraft({excerpt: "A rich summary", subtitle: ""});
    expect(getPublishValidationErrors(draft)).toEqual([]);
  });

  it("blocks publish if no heading block is present", () => {
    const draft = createMinimalDraft({
      blocks: [{type: "paragraph", text: "Only paragraph"}],
    });
    const errors = getPublishValidationErrors(draft);
    expect(errors).toContain("At least 1 heading block with content is required to publish.");
  });

  it("blocks publish if heading block has only whitespace", () => {
    const draft = createMinimalDraft({
      blocks: [
        {type: "heading", text: "   "},
        {type: "paragraph", text: "Some text"},
      ],
    });
    const errors = getPublishValidationErrors(draft);
    expect(errors).toContain("At least 1 heading block with content is required to publish.");
  });

  it("blocks publish if no paragraph block is present", () => {
    const draft = createMinimalDraft({
      blocks: [{type: "heading", text: "Only heading"}],
    });
    const errors = getPublishValidationErrors(draft);
    expect(errors).toContain("At least 1 paragraph block with content is required to publish.");
  });

  it("blocks publish if paragraph block has only whitespace", () => {
    const draft = createMinimalDraft({
      blocks: [
        {type: "heading", text: "Heading"},
        {type: "paragraph", text: "   "},
      ],
    });
    const errors = getPublishValidationErrors(draft);
    expect(errors).toContain("At least 1 paragraph block with content is required to publish.");
  });

  it("blocks publish if title has more than 5 words", () => {
    const draft = createMinimalDraft({
      title: "One two three four five six",
    });
    const errors = getPublishValidationErrors(draft);
    expect(errors.some((e) => e.includes("Title must be 5 words or fewer"))).toBe(true);
  });
});
