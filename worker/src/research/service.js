import { getRedisClient } from "../redis/index.js";
import { fetchArxivPapers } from "./searchArxiv.js";
import { scoreAndRankPapers } from "./scorer.js";

/**
 * Resolves the Blob storage path for an article's research papers.
 *
 * @param {string} articleId
 * @param {any} env
 * @returns {string}
 */
export function getResearchObjectPath(articleId, env) {
  const root = env?.ROOT_BUCKET || env?.ROOT_FOLDER || "kalidass";
  const prefix = String(root).replace(/^\/+|\/+$/g, "");
  return `${prefix}/research/${articleId}.json`;
}

/**
 * In-flight promise lock map preventing parallel requests from triggering duplicate arXiv fetches.
 * @type {Map<string, Promise<any>>}
 */
const _researchInflightLocks = new Map();

/**
 * Validates that the research payload contains meaningful content.
 *
 * @param {any} data
 * @returns {boolean}
 */
export function isValidResearchPayload(data) {
  if (!data || typeof data !== "object") return false;
  if (!data.query || typeof data.query !== "string") return false;
  return Array.isArray(data.papers) && data.papers.length > 0;
}

/**
 * Read-only research lookup for public reader responses: Redis -> Blob.
 *
 * @param {string} articleId
 * @param {any} env
 * @param {{ bucket: any, readJson: (bucket: any, path: string, fallback?: any) => Promise<any> }} storage
 * @returns {Promise<any>}
 */
export async function peekArticleResearch(articleId, env, storage) {
  const redis = getRedisClient(env);
  const cacheKey = `research_suggestion:${articleId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    }
    const inBlob = await storage.readJson(storage.bucket, getResearchObjectPath(articleId, env), null);
    if (inBlob && isValidResearchPayload(inBlob)) {
      await redis.set(cacheKey, JSON.stringify(inBlob), { ex: 86400 });
      return inBlob;
    }
  } catch (err) {
    console.warn("[Research Peek Error]:", err?.message);
  }
  return null;
}

/**
 * Orchestrates Redis -> Blob -> arXiv -> Scorer retrieval and caching.
 *
 * @param {{ id: string, title: string, subtitle?: string, excerpt?: string }} article
 * @param {any} env
 * @param {{
 *   bucket: any,
 *   readJson: (bucket: any, path: string, fallback?: any) => Promise<any>,
 *   putJson: (bucket: any, path: string, value: any) => Promise<any>,
 *   fetchArxivFn?: typeof fetchArxivPapers,
 *   scoreAndRankFn?: typeof scoreAndRankPapers
 * }} storage
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function getOrGenerateArticleResearch(article, env, storage, options = {}) {
  const redis = getRedisClient(env);
  const cacheKey = `research_suggestion:${article.id}`;
  const shouldRefresh = options?.refresh === true;

  if (!shouldRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    }
    const blobPath = getResearchObjectPath(article.id, env);
    const inBlob = await storage.readJson(storage.bucket, blobPath, null);
    if (inBlob && isValidResearchPayload(inBlob)) {
      await redis.set(cacheKey, JSON.stringify(inBlob), { ex: 86400 });
      return inBlob;
    }
  }

  if (_researchInflightLocks.has(article.id)) {
    return await _researchInflightLocks.get(article.id);
  }

  const generationPromise = (async () => {
    const topic = (article.title || "").trim() || `${article.subtitle || article.excerpt || ""}`.trim();
    const fetcher = storage.fetchArxivFn || fetchArxivPapers;
    const scorer = storage.scoreAndRankFn || scoreAndRankPapers;

    const arxivResult = await fetcher(topic, env);
    const scoredResult = await scorer(arxivResult.rawItems, arxivResult.topic, env);

    const payload = {
      query: arxivResult.query,
      topic: arxivResult.topic,
      fetchedAt: new Date().toISOString(),
      scoredBy: scoredResult.scoredBy,
      papers: scoredResult.papers,
    };

    if (!isValidResearchPayload(payload)) {
      throw new Error("No relevant research papers found for this topic.");
    }

    const blobPath = getResearchObjectPath(article.id, env);
    await storage.putJson(storage.bucket, blobPath, payload);
    await redis.set(cacheKey, JSON.stringify(payload), { ex: 86400 });

    return payload;
  })();

  _researchInflightLocks.set(article.id, generationPromise);

  try {
    return await generationPromise;
  } finally {
    _researchInflightLocks.delete(article.id);
  }
}
