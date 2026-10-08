import {evaluateJev} from "./jev.js";
import {evaluateClef} from "./clef.js";
import {evaluateHeuristic} from "./heuristic.js";
import {extractArticleText} from "./types.js";

export {extractArticleText};

/**
 * Unified entrypoint to run quality & safety evaluation on article text or payload.
 * Supports provider selection ('jev' | 'clef' | 'heuristic') via options or env.EVAL_PROVIDER,
 * with seamless cascading fallback to heuristic if the designated provider fails.
 *
 * @param {string | any} input - Plaintext or article/draft object
 * @param {Object} [options]
 * @param {string} [options.provider] - Optional override: 'jev' | 'clef' | 'heuristic'
 * @param {string} [options.apiKey] - Generic API key (defaults to Jev)
 * @param {string} [options.jevApiKey] - Scoped TypeSafe Jev API key
 * @param {string} [options.clefApiKey] - Scoped Cloudflare Clef API key
 * @param {string} [options.clefModel] - Clef model selector ('clef' | 'clef-flash')
 * @param {number} [options.threshold]
 * @param {any} [env]
 * @returns {Promise<import("./types.js").QualityEvalResult>}
 */
export async function runQualityEvaluation(input, options = {}, env = {}) {
  const text = typeof input === "string" ? input : extractArticleText(input);
  if (!text || text.trim().length === 0) {
    return evaluateHeuristic("", options);
  }

  const rawProvider = (
    options.provider ||
    env?.EVAL_PROVIDER ||
    (options.jevApiKey || options.apiKey || env?.TYPESAFE_API_KEY ? "jev" : options.clefApiKey || env?.CLEF_API_KEY ? "clef" : "jev")
  ).toLowerCase().trim();

  const requestedProvider = ["jev", "clef", "heuristic"].includes(rawProvider) ? rawProvider : "jev";

  // 1. If Jev is requested or defaulted
  if (requestedProvider === "jev") {
    const effectiveKey = options.jevApiKey || options.apiKey || env?.TYPESAFE_API_KEY || env?.JEV_API_KEY;
    if (!effectiveKey) {
      console.warn("[Quality Eval] Provider 'jev' requested, but TYPESAFE_API_KEY is missing in environment variables. Falling back to alternative provider.");
    } else {
      try {
        const jevOptions = {
          ...options,
          apiKey: effectiveKey,
        };
        const result = await evaluateJev(text, jevOptions, env);
        console.log(`[Quality Eval] TypeSafe Jev evaluation completed successfully (verdict: ${result?.safety?.verdict})`);
        return result;
      } catch (err) {
        console.warn("[Quality Eval] Jev evaluation failed, cascading to fallback:", err.message);
      }
    }
  }

  // 2. If Clef is requested (or cascaded to from Jev)
  if (
    requestedProvider === "clef" ||
    (requestedProvider === "jev" && (options.clefApiKey || env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY || env?.AI))
  ) {
    try {
      const clefOptions = {
        ...options,
        clefApiKey: options.clefApiKey || env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY,
        clefModel: options.clefModel || env?.CLEF_MODEL,
      };
      return await evaluateClef(text, clefOptions, env);
    } catch (err) {
      console.warn("Clef evaluation failed, cascading to fallback:", err.message);
    }
  }

  // 3. Fallback to local heuristic evaluator
  return evaluateHeuristic(text, options);
}
