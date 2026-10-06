import {getRedisClient} from "../redis/index.js";
import {runBoxIntelligence} from "./box_runner.js";

/**
 * Resolves the Blob storage path for an article's intelligence document.
 *
 * @param {string} articleId
 * @param {any} env
 * @returns {string}
 */
export function getIntelligenceObjectPath(articleId, env) {
  const root = env?.ROOT_BUCKET || env?.ROOT_FOLDER || "kalidass";
  const prefix = String(root).replace(/^\/+|\/+$/g, "");
  return `${prefix}/intelligence/${articleId}.json`;
}

/**
 * In-flight promise locks preventing parallel requests from triggering duplicate Boxes.
 * Maps article.id -> Promise<any>
 * @type {Map<string, Promise<any>>}
 */
const _intelInflightLocks = new Map();

/**
 * Validates that the generated intelligence payload contains meaningful content
 * before allowing it to be saved to Blob or Redis.
 *
 * @param {any} intel
 * @returns {boolean}
 */
export function isValidIntelligencePayload(intel) {
  if (!intel || typeof intel !== "object") return false;
  if (!intel.query || typeof intel.query !== "string") return false;

  const hasOverview = Boolean(
    intel.ai_overview && (
      intel.ai_overview.text ||
      intel.ai_overview.snippet ||
      (intel.ai_overview.expanded && Array.isArray(intel.ai_overview.expanded.text_blocks) && intel.ai_overview.expanded.text_blocks.length > 0)
    )
  );
  const hasOrganic = Array.isArray(intel.organic_results) && intel.organic_results.length > 0;
  const hasKG = Boolean(intel.knowledge_graph && intel.knowledge_graph.title);
  const hasVideos = Array.isArray(intel.inline_videos) && intel.inline_videos.length > 0;
  const hasPAA = Array.isArray(intel.people_also_ask) && intel.people_also_ask.length > 0;

  return hasOverview || hasOrganic || hasKG || hasVideos || hasPAA;
}

/**
 * Read-only intelligence lookup for public reader responses: Redis -> Blob.
 * Never spawns a Box; re-populates Redis on Blob hits so views after the
 * Redis TTL expiry don't pay a Blob read forever.
 *
 * @param {string} articleId
 * @param {any} env
 * @param {{bucket: any, readJson: (bucket: any, path: string, fallback?: any) => Promise<any>}} storage
 * @returns {Promise<any>}
 */
export async function peekArticleIntelligence(articleId, env, storage) {
  const redis = getRedisClient(env);
  const cacheKey = `ai_intel:${articleId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    }
    const inBlob = await storage.readJson(storage.bucket, getIntelligenceObjectPath(articleId, env), null);
    if (inBlob && isValidIntelligencePayload(inBlob)) {
      await redis.set(cacheKey, JSON.stringify(inBlob), {ex: 86400});
      return inBlob;
    }
  } catch (err) {
    console.warn("[Intel Peek Error]:", err?.message);
  }
  return null;
}

/**
 * Orchestrates the Redis -> Blob -> Ephemeral Box intelligence retrieval.
 *
 * @param {{ id: string, title: string, subtitle?: string, excerpt?: string }} article
 * @param {any} env Cloudflare Worker environment bindings
 * @param {{
 *   bucket: any,
 *   readJson: (bucket: any, path: string, fallback?: any) => Promise<any>,
 *   putJson: (bucket: any, path: string, value: any) => Promise<any>,
 *   runBoxFn?: typeof runBoxIntelligence
 * }} storage
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function getOrGenerateArticleIntelligence(article, env, storage, options = {}) {
  const redis = getRedisClient(env);
  const cacheKey = `ai_intel:${article.id}`;
  const shouldRefresh = options?.refresh === true;

  // 1. Check Upstash Redis (unless refresh requested)
  if (!shouldRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    }

    // 2. Check Upstash Blob (unless refresh requested)
    const blobPath = getIntelligenceObjectPath(article.id, env);
    const inBlob = await storage.readJson(storage.bucket, blobPath, null);
    if (inBlob && isValidIntelligencePayload(inBlob)) {
      await redis.set(cacheKey, JSON.stringify(inBlob), {ex: 86400});
      return inBlob;
    }
  }

  // 3. Ephemeral Upstash Box generation (Protected against stampedes via in-flight deduplication)
  if (!shouldRefresh && _intelInflightLocks.has(article.id)) {
    return await _intelInflightLocks.get(article.id);
  }

  const generationPromise = (async () => {
    const query = (article.title || "").trim() || `${article.subtitle || article.excerpt || ""}`.trim();
    const runner = storage.runBoxFn || runBoxIntelligence;
    const generated = await runner(
      {
        query,
        title: article.title,
        summary: article.excerpt || article.subtitle || "",
      },
      env
    );

    // Finding 1 Validation: Do NOT cache empty husks or failed responses
    if (!isValidIntelligencePayload(generated)) {
      throw new Error("Generated intelligence payload was empty or invalid. Refusing to cache.");
    }

    // 4. Persist valid output to Blob and Redis
    const blobPath = getIntelligenceObjectPath(article.id, env);
    await storage.putJson(storage.bucket, blobPath, generated);
    await redis.set(cacheKey, JSON.stringify(generated), {ex: 86400});

    return generated;
  })();

  _intelInflightLocks.set(article.id, generationPromise);

  try {
    return await generationPromise;
  } finally {
    _intelInflightLocks.delete(article.id);
  }
}
