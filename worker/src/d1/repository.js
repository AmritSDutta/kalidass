/**
 * Cloudflare D1 Repository for Kalidass Journal
 * Handles edge SQLite operations for articles, tags, and catalog synchronization.
 */

let isSynced = false;
const TAGS_CACHE_KEY = "tags:top10";
const TAGS_CACHE_TTL = 3 * 60 * 60; // 3 hours

export function resetSyncStateForTesting() {
  isSynced = false;
}

export async function clearAllD1Articles(db) {
  if (!db) return;
  await db.batch([
    db.prepare("DELETE FROM article_tags"),
    db.prepare("DELETE FROM articles"),
  ]);
  isSynced = false;
}

export async function ensureD1Synced(db, storage, env, seedArticlesFallback = []) {
  if (!db || isSynced) return;

  const countRow = await db.prepare("SELECT COUNT(*) as count FROM articles").first();
  if (countRow && Number(countRow.count) > 0) {
    isSynced = true;
    return;
  }

  const bucket = storage.blobClient
    ? storage.blobClient(env).bucket
    : (storage.getBucket ? storage.getBucket(env) : null);

  let articlesToSeed = [];
  try {
    if (storage.reconstructIndex && bucket) {
      const reconstructed = await storage.reconstructIndex(bucket, env);
      if (Array.isArray(reconstructed) && reconstructed.length > 0) {
        articlesToSeed = reconstructed;
      }
    }
  } catch {
    // Non-fatal, fallback to seed articles
  }

  if (articlesToSeed.length === 0 && Array.isArray(seedArticlesFallback) && seedArticlesFallback.length > 0) {
    articlesToSeed = seedArticlesFallback;
  }

  if (articlesToSeed.length === 0) {
    // Do not set isSynced = true if no records were seeded, allowing subsequent retry
    return;
  }

  const chunkSize = 20;
  for (let i = 0; i < articlesToSeed.length; i += chunkSize) {
    const chunk = articlesToSeed.slice(i, i + chunkSize);
    const statements = [];

    for (const item of chunk) {
      statements.push(
        db.prepare(`
          INSERT INTO articles (
            id, slug, title, author_email, published, private,
            featured, read_time, published_at, updated_at, summary
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            author_email = excluded.author_email,
            published = excluded.published,
            private = excluded.private,
            featured = excluded.featured,
            read_time = excluded.read_time,
            published_at = excluded.published_at,
            updated_at = excluded.updated_at,
            summary = excluded.summary
        `).bind(
          item.id,
          item.slug,
          item.title,
          item.authorEmail || "",
          item.published === false ? 0 : 1,
          item.private === false ? 0 : 1,
          item.featured ? 1 : 0,
          item.readTime || 5,
          item.publishedAt || item.updatedAt || new Date().toISOString(),
          item.updatedAt || new Date().toISOString(),
          JSON.stringify(item)
        )
      );

      statements.push(
        db.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(item.id)
      );

      for (const tag of item.tags || []) {
        if (typeof tag === "string" && tag.trim()) {
          statements.push(
            db.prepare(
              "INSERT OR IGNORE INTO article_tags (article_id, tag) VALUES (?, ?)"
            ).bind(item.id, tag.trim())
          );
        }
      }
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }
  }

  isSynced = true;
}

export async function getTopTags(db, redis) {
  if (redis) {
    try {
      const cached = await redis.get(TAGS_CACHE_KEY);
      if (Array.isArray(cached) && cached.length > 0) return cached;
      if (typeof cached === "string") {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Non-fatal cache failure, continue to D1
    }
  }

  if (!db) return [];

  const { results } = await db
    .prepare(`
      SELECT t.tag, COUNT(*) as count 
      FROM article_tags t
      JOIN articles a ON t.article_id = a.id
      WHERE a.published = 1 AND a.private = 0
      GROUP BY t.tag
      ORDER BY count DESC
      LIMIT 10
    `)
    .all();

  const tagList = (results || []).map((row) => row.tag);

  if (redis && tagList.length > 0) {
    try {
      await redis.set(TAGS_CACHE_KEY, JSON.stringify(tagList), { ex: TAGS_CACHE_TTL });
    } catch {
      // Non-fatal cache write
    }
  }

  return tagList;
}

export async function getPublicArticles(db, { tag = "", page = 1, limit = 9, search = "" } = {}) {
  if (!db) return [];
  const validLimit = Math.max(1, Number(limit) || 9);
  const validPage = Math.max(1, Number(page) || 1);
  const offset = (validPage - 1) * validLimit;
  const cleanTag = (tag || "").trim();
  const cleanSearch = (search || "").trim();

  let query = "SELECT a.summary FROM articles a";
  const params = [];
  const whereClauses = ["a.published = 1", "a.private = 0"];

  if (cleanTag && cleanTag.toLowerCase() !== "all") {
    query += " JOIN article_tags t ON a.id = t.article_id";
    whereClauses.push("t.tag = ? COLLATE NOCASE");
    params.push(cleanTag);
  }

  if (cleanSearch) {
    const escaped = cleanSearch.replace(/[%_\\]/g, "\\$&");
    const term = `%${escaped}%`;
    whereClauses.push(
      "(a.title LIKE ? ESCAPE '\\' OR json_extract(a.summary, '$.excerpt') LIKE ? ESCAPE '\\' OR json_extract(a.summary, '$.subtitle') LIKE ? ESCAPE '\\')"
    );
    params.push(term, term, term);
  }

  query += ` WHERE ${whereClauses.join(" AND ")} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`;
  params.push(validLimit, offset);

  const { results } = await db.prepare(query).bind(...params).all();
  return (results || []).map((row) => JSON.parse(row.summary));
}

export async function getAuthorArticles(db, user, status = "all") {
  if (!db) return [];
  let query = "SELECT summary FROM articles";
  const params = [];
  const whereClauses = [];

  if (user?.role === "admin") {
    if (status === "draft") whereClauses.push("published = 0");
    else if (status === "published") whereClauses.push("published = 1");
  } else {
    const userEmail = (user?.email || "").toLowerCase();
    params.push(userEmail);
    if (status === "draft") {
      whereClauses.push("(LOWER(author_email) = ? AND published = 0)");
    } else if (status === "published") {
      whereClauses.push("((LOWER(author_email) = ? AND published = 1) OR (published = 1 AND private = 0))");
    } else {
      whereClauses.push("(LOWER(author_email) = ? OR (published = 1 AND private = 0))");
    }
  }

  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(" AND ")}`;
  }
  query += " ORDER BY updated_at DESC";

  const { results } = await db.prepare(query).bind(...params).all();
  return (results || []).map((row) => JSON.parse(row.summary));
}

export async function isSlugTaken(db, slug, excludeId = null) {
  if (!db) return false;
  let query = "SELECT id FROM articles WHERE slug = ?";
  const params = [slug];
  if (excludeId) {
    query += " AND id != ?";
    params.push(excludeId);
  }
  const row = await db.prepare(query).bind(...params).first();
  return Boolean(row);
}

export async function getArticleByIdOrSlug(db, key) {
  if (!db) return null;
  const row = await db
    .prepare("SELECT id, summary FROM articles WHERE id = ? OR slug = ? LIMIT 1")
    .bind(key, key)
    .first();
  if (!row) return null;
  return { id: row.id, summary: JSON.parse(row.summary) };
}

export async function upsertArticleWithTags(db, record, summary) {
  if (!db) return;
  const summaryJson = JSON.stringify(summary);
  const statements = [
    db.prepare(`
      INSERT INTO articles (
        id, slug, title, author_email, published, private, 
        featured, read_time, published_at, updated_at, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        author_email = excluded.author_email,
        published = excluded.published,
        private = excluded.private,
        featured = excluded.featured,
        read_time = excluded.read_time,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at,
        summary = excluded.summary
    `).bind(
      record.id,
      record.slug,
      record.title,
      record.authorEmail || "",
      record.published === false ? 0 : 1,
      record.private === false ? 0 : 1,
      record.featured ? 1 : 0,
      record.readTime || 5,
      record.publishedAt || record.updatedAt || new Date().toISOString(),
      record.updatedAt || new Date().toISOString(),
      summaryJson
    ),
    db.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(record.id),
  ];

  for (const tag of record.tags || []) {
    if (typeof tag === "string" && tag.trim()) {
      statements.push(
        db.prepare(
          "INSERT OR IGNORE INTO article_tags (article_id, tag) VALUES (?, ?)"
        ).bind(record.id, tag.trim())
      );
    }
  }

  await db.batch(statements);
}

export async function deleteArticle(db, id) {
  if (!db) return;
  await db.batch([
    db.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(id),
    db.prepare("DELETE FROM articles WHERE id = ?").bind(id),
  ]);
}
