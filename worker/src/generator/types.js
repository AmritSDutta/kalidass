/**
 * @typedef {Object} AttachHeadersMap
 * @property {Record<string, Record<string, string>>} [attachHeaders] Map of hostname pattern -> header dictionary
 */

/**
 * @typedef {Object} GenerateArticleRequest
 * @property {string} topic The core research subject or article topic
 * @property {string} [angle] Specific thesis angle, hypothesis, or research stance
 * @property {"research" | "field-notes" | "explainer" | "speculative"} [tone] Editorial tone
 * @property {number} [blockCount] Target content block count (e.g., 6, 10, 15)
 * @property {string} [accent] Hex pigment accent color (e.g. #6366f1)
 * @property {string} [provider] Generator provider identifier (defaults to 'upstash-box')
 * @property {string} [harness] Agent harness type (e.g. 'custom', 'claude-code', 'codex')
 * @property {string} [model] Target LLM model name
 * @property {"node" | "python"} [runtime] Container runtime environment (defaults to 'node')
 * @property {Record<string, Record<string, string>>} [attachHeaders] Custom outbound headers for Upstash Box
 * @property {boolean} [publishImmediately] Whether to publish immediately instead of draft
 * @property {boolean} [private] Whether the article should be unlisted (defaults to true)
 */

/**
 * Interface contract for all article generator providers (Upstash Box, E2B, Modal, etc.)
 * @typedef {Object} ArticleGeneratorProvider
 * @property {string} name Unique provider identifier
 * @property {(request: GenerateArticleRequest, env: any) => Promise<import("../../../blog_frontend/src/lib/types").ArticleDraft>} generate
 */

export const GENERATOR_PROVIDERS = {
  UPSTASH_BOX: "upstash-box",
};
