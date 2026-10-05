import {createEvalResult} from "./types.js";

/**
 * Evaluates text using the Cloudflare Clef content screening and classification provider.
 * Placeholder implementation ready for Cloudflare Clef / Workers AI activation.
 *
 * @param {string} text
 * @param {Object} options
 * @param {string} [options.apiKey]
 * @param {number} [options.threshold]
 * @param {any} env
 * @returns {Promise<import("./types.js").QualityEvalResult>}
 */
export async function evaluateClef(text, options = {}, env = {}) {
  const effectiveKey = options.clefApiKey || env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY;

  if (!effectiveKey && !env?.AI) {
    throw new Error("Missing CLEF_API_KEY or env.AI binding for Cloudflare Clef provider");
  }

  // Placeholder stub: until live Clef endpoint / model is activated, cascade to heuristic
  throw new Error("Cloudflare Clef provider is in placeholder mode and not yet active");
}
