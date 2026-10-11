import type {ArticleDraft, Block} from "./types";

export const ALLOWED_IMAGE_TYPES = ["image/webp", "image/jpeg"] as const;
export const ALLOWED_IMAGE_ACCEPT = "image/webp, image/jpeg, .webp, .jpg, .jpeg";
export const MAX_IMAGE_BYTES = 512 * 1024; // 512 KB
export const MAX_PARAGRAPH_CHARS = 10000;
export const MAX_TITLE_WORDS = 5;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an image file before upload: WebP or JPEG only, strictly < 512 KB.
 */
export function validateImageUploadFile(file: File): ImageValidationResult {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return {
      valid: false,
      error: `Invalid image format (${file.type || "unknown"}). Only WebP (.webp) and JPEG (.jpg, .jpeg) images are allowed.`,
    };
  }
  if (file.size >= MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: `Image upload failed: ${(file.size / 1024).toFixed(1)} KB exceeds the 512 KB limit.`,
    };
  }
  return {valid: true};
}

/**
 * Validates article title: non-empty and <= 5 words.
 */
export function getTitleValidationErrors(title: string): string[] {
  const errors: string[] = [];
  const words = (title || "").trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    errors.push("Title is required.");
  } else if (words > MAX_TITLE_WORDS) {
    errors.push(`Title must be 5 words or fewer (currently ${words} words).`);
  }
  return errors;
}

/**
 * Validates paragraph character limit: <= 10,000 characters per paragraph block.
 */
export function getParagraphCapErrors(blocks: Block[]): string[] {
  const errors: string[] = [];
  blocks.forEach((b, index) => {
    if (b.type === "paragraph" && (b.text || "").length > MAX_PARAGRAPH_CHARS) {
      errors.push(
        `Paragraph ${index + 1} exceeds the 10,000 character limit (${b.text.length.toLocaleString()} / 10,000 chars).`
      );
    }
  });
  return errors;
}

/**
 * Validates draft saving on button click: non-empty title <= 5 words, and paragraphs <= 10,000 chars.
 */
export function getDraftValidationErrors(draft: ArticleDraft): string[] {
  return [
    ...getTitleValidationErrors(draft.title),
    ...getParagraphCapErrors(draft.blocks),
  ];
}

/**
 * Validates article publishing on button click: full structural requirements.
 */
export function getPublishValidationErrors(draft: ArticleDraft): string[] {
  const errors: string[] = [...getTitleValidationErrors(draft.title)];

  if (!(draft.slug || "").trim()) {
    errors.push("Slug is required to publish.");
  }

  const hasSummary = Boolean(
    (draft.excerpt || "").trim() || (draft.subtitle || "").trim()
  );
  if (!hasSummary) {
    errors.push("Summary (excerpt or subtitle) is required to publish.");
  }

  const hasHeading = draft.blocks.some(
    (b) => b.type === "heading" && (b.text || "").trim().length > 0
  );
  if (!hasHeading) {
    errors.push("At least 1 heading block with content is required to publish.");
  }

  const hasParagraph = draft.blocks.some(
    (b) => b.type === "paragraph" && (b.text || "").trim().length > 0
  );
  if (!hasParagraph) {
    errors.push("At least 1 paragraph block with content is required to publish.");
  }

  errors.push(...getParagraphCapErrors(draft.blocks));

  return errors;
}
