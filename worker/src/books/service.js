import {getRedisClient} from "../redis/index.js";
import {fetchAmazonBooks} from "./serpapi.js";
import {scoreAndRankBooks} from "./scorer.js";

/**
 * Resolves the Blob storage path for an article's books suggestion document.
 *
 * @param {string} articleId
 * @param {any} env
 * @returns {string}
 */
export function getBooksObjectPath(articleId, env) {
  const root = env?.ROOT_BUCKET || env?.ROOT_FOLDER || "kalidass";
  const prefix = String(root).replace(/^\/+|\/+$/g, "");
  return `${prefix}/books/${articleId}.json`;
}

/**
 * In-flight promise locks preventing parallel requests from triggering duplicate external fetches.
 * Maps article.id -> Promise<any>
 * @type {Map<string, Promise<any>>}
 */
const _booksInflightLocks = new Map();

/**
 * Validates that the books payload contains meaningful content.
 *
 * @param {any} data
 * @returns {boolean}
 */
export function isValidBooksPayload(data) {
  if (!data || typeof data !== "object") return false;
  if (!data.query || typeof data.query !== "string") return false;
  return Array.isArray(data.books) && data.books.length > 0;
}

/**
 * Read-only books lookup for public reader responses: Redis -> Blob.
 *
 * @param {string} articleId
 * @param {any} env
 * @param {{bucket: any, readJson: (bucket: any, path: string, fallback?: any) => Promise<any>}} storage
 * @returns {Promise<any>}
 */
export async function peekArticleBooks(articleId, env, storage) {
  const redis = getRedisClient(env);
  const cacheKey = `books_suggestion:${articleId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    }
    const inBlob = await storage.readJson(storage.bucket, getBooksObjectPath(articleId, env), null);
    if (inBlob && isValidBooksPayload(inBlob)) {
      await redis.set(cacheKey, JSON.stringify(inBlob), {ex: 86400});
      return inBlob;
    }
  } catch (err) {
    console.warn("[Books Peek Error]:", err?.message);
  }
  return null;
}

/**
 * Orchestrates Redis -> Blob -> SerpApi -> Scorer retrieval and caching.
 *
 * @param {{ id: string, title: string, subtitle?: string, excerpt?: string }} article
 * @param {any} env
 * @param {{
 *   bucket: any,
 *   readJson: (bucket: any, path: string, fallback?: any) => Promise<any>,
 *   putJson: (bucket: any, path: string, value: any) => Promise<any>,
 *   fetchAmazonBooksFn?: typeof fetchAmazonBooks,
 *   scoreAndRankBooksFn?: typeof scoreAndRankBooks
 * }} storage
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function getOrGenerateArticleBooks(article, env, storage, options = {}) {
  const redis = getRedisClient(env);
  const cacheKey = `books_suggestion:${article.id}`;
  const shouldRefresh = options?.refresh === true;

  if (!shouldRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    }
    const blobPath = getBooksObjectPath(article.id, env);
    const inBlob = await storage.readJson(storage.bucket, blobPath, null);
    if (inBlob && isValidBooksPayload(inBlob)) {
      await redis.set(cacheKey, JSON.stringify(inBlob), {ex: 86400});
      return inBlob;
    }
  }

  if (_booksInflightLocks.has(article.id)) {
    return await _booksInflightLocks.get(article.id);
  }

  const generationPromise = (async () => {
    const topic = (article.title || "").trim() || `${article.subtitle || article.excerpt || ""}`.trim();
    const fetcher = storage.fetchAmazonBooksFn || fetchAmazonBooks;
    const scorer = storage.scoreAndRankBooksFn || scoreAndRankBooks;

    const serpResult = await fetcher(topic, env);
    const scoredResult = await scorer(serpResult.rawItems, serpResult.topic, env);

    const payload = {
      query: serpResult.query,
      topic: serpResult.topic,
      amazon_domain: serpResult.amazon_domain,
      fetchedAt: new Date().toISOString(),
      scoredBy: scoredResult.scoredBy,
      books: scoredResult.books,
    };

    if (!isValidBooksPayload(payload)) {
      throw new Error("No valid book recommendations found for this topic.");
    }

    const blobPath = getBooksObjectPath(article.id, env);
    await storage.putJson(storage.bucket, blobPath, payload);
    await redis.set(cacheKey, JSON.stringify(payload), {ex: 86400});

    return payload;
  })();

  _booksInflightLocks.set(article.id, generationPromise);

  try {
    return await generationPromise;
  } finally {
    _booksInflightLocks.delete(article.id);
  }
}
