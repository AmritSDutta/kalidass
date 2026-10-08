export const HOME_FEED_TTL = 10800; // 3 hours in seconds
export const STORY_TTL = 86400;     // 24 hours in seconds

/**
 * Computes a deterministic ETag hash folding every article's ID, timestamp, and featured state.
 *
 * @param {any[]} articles
 * @returns {string}
 */
export function computeFeedEtag(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return '"empty-feed"';
  let hash = 0;
  const str = articles
    .map((a) => `${a.id}:${a.updatedAt || a.publishedAt || ""}:${Boolean(a.featured)}`)
    .join("|");
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(16)}-${articles.length}"`;
}

/**
 * Evaluates an incoming If-None-Match header value against target ETag per RFC 7232.
 * Handles weak validators (W/), whitespace trimming, and comma-separated lists.
 *
 * @param {string | null | undefined} headerVal
 * @param {string | null | undefined} targetEtag
 * @returns {boolean}
 */
export function matchesEtag(headerVal, targetEtag) {
  if (!headerVal || !targetEtag) return false;
  const clean = (tag) => tag.trim().replace(/^W\//, "");
  const cleanTarget = clean(targetEtag);
  if (clean(headerVal) === "*") return true;
  return headerVal
    .split(",")
    .map(clean)
    .some((val) => val === cleanTarget);
}

/**
 * Ensures a featured story is deterministically decided.
 * If no article has featured: true, stamps the lead article with featured: true.
 *
 * @param {any[]} articles
 * @returns {any[]}
 */
export function ensureFeaturedDecided(articles) {
  if (!Array.isArray(articles)) return [];
  const hasFeatured = articles.some((a) => Boolean(a.featured));
  return articles.map((item, idx) => {
    if (idx === 0 && !hasFeatured) {
      return { ...item, featured: true };
    }
    return item;
  });
}

/**
 * Retrieves cached public feed and ETag from Redis if available.
 *
 * @param {import("./types").KeyValueStore} redis
 * @returns {Promise<{ feed: any[], etag: string | null } | null>}
 */
export async function getCachedPublicFeed(redis) {
  try {
    const cached = await redis.get("feed:public");
    const etag = await redis.get("feed:etag");
    if (cached && Array.isArray(cached)) {
      return { feed: cached, etag: etag || null };
    }
  } catch (err) {
    console.warn("[Cache] Feed get failed:", err?.message);
  }
  return null;
}

/**
 * Caches the public article feed for 3 hours, deterministically assigning a featured story if none exists.
 *
 * @param {import("./types").KeyValueStore} redis
 * @param {any[]} articles
 * @returns {Promise<{ feed: any[], etag: string } | null>}
 */
export async function setCachedPublicFeed(redis, articles) {
  try {
    if (!Array.isArray(articles)) return null;
    const feed = ensureFeaturedDecided(articles);
    const etag = computeFeedEtag(feed);
    await redis.set("feed:public", feed, { ex: HOME_FEED_TTL });
    await redis.set("feed:etag", etag, { ex: HOME_FEED_TTL });
    return { feed, etag };
  } catch (err) {
    console.warn("[Cache] Feed set failed:", err?.message);
    return null;
  }
}

/**
 * Retrieves a cached article by ID or slug.
 *
 * @param {import("./types").KeyValueStore} redis
 * @param {string} idOrSlug
 * @returns {Promise<any>}
 */
export async function getCachedArticle(redis, idOrSlug) {
  try {
    if (!idOrSlug) return null;
    let article = await redis.get(`article:${idOrSlug}`);
    if (article) return typeof article === "string" ? JSON.parse(article) : article;

    const mappedId = await redis.get(`slug:${idOrSlug}`);
    if (mappedId) {
      article = await redis.get(`article:${mappedId}`);
      if (article) return typeof article === "string" ? JSON.parse(article) : article;
    }
  } catch (err) {
    console.warn("[Cache] Article get failed:", err?.message);
  }
  return null;
}

/**
 * Caches an article payload and its slug mapping for 24 hours.
 *
 * @param {import("./types").KeyValueStore} redis
 * @param {any} article
 * @returns {Promise<void>}
 */
export async function setCachedArticle(redis, article) {
  try {
    if (!article?.id) return;
    if (article.slug) {
      await redis.set(`slug:${article.slug}`, article.id, { ex: STORY_TTL });
    }
    await redis.set(`article:${article.id}`, article, { ex: STORY_TTL });
  } catch (err) {
    console.warn("[Cache] Article set failed:", err?.message);
  }
}

/**
 * Invalidates cached public feed and specific article keys.
 *
 * @param {import("./types").KeyValueStore} redis
 * @param {{ id?: string, slug?: string, oldSlug?: string }} [opts]
 * @returns {Promise<void>}
 */
export async function invalidateArticleCaches(redis, { id, slug, oldSlug } = {}) {
  try {
    const tasks = [
      redis.del("feed:public"),
      redis.del("feed:etag"),
    ];
    if (id) {
      tasks.push(redis.del(`article:${id}`));
      tasks.push(redis.del(`ai_intel:${id}`));
      tasks.push(redis.del(`books_suggestion:${id}`));
    }
    if (slug) tasks.push(redis.del(`slug:${slug}`));
    if (oldSlug && oldSlug !== slug) tasks.push(redis.del(`slug:${oldSlug}`));
    await Promise.all(tasks);
  } catch (err) {
    console.warn("[Cache] Invalidation failed:", err?.message);
  }
}

/**
 * Invalidates only the article keys in Redis, preserving the public home feed cache.
 *
 * @param {import("./types").KeyValueStore} redis
 * @param {{ id?: string, slug?: string, oldSlug?: string }} [opts]
 * @returns {Promise<void>}
 */
export async function invalidateOnlyArticleCache(redis, { id, slug, oldSlug } = {}) {
  try {
    const tasks = [];
    if (id) tasks.push(redis.del(`article:${id}`));
    if (slug) tasks.push(redis.del(`slug:${slug}`));
    if (oldSlug && oldSlug !== slug) tasks.push(redis.del(`slug:${oldSlug}`));
    await Promise.all(tasks);
  } catch (err) {
    console.warn("[Cache] Article-only invalidation failed:", err?.message);
  }
}

/**
 * Invalidates all cached feed keys.
 *
 * @param {import("./types").KeyValueStore} redis
 * @returns {Promise<void>}
 */
export async function invalidateAllArticleCaches(redis) {
  try {
    await Promise.all([
      redis.del("feed:public"),
      redis.del("feed:etag"),
    ]);
  } catch (err) {
    console.warn("[Cache] Invalidate all failed:", err?.message);
  }
}
