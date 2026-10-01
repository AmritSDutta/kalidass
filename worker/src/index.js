import {Bucket, uniquePath, uploadHandler} from "@upstash/blob";
import {getMemoryObject, memoryBucket} from "./memory.js";
import {seedArticles} from "./seed.js";

function getRootPrefix(env) {
  const root = env?.ROOT_BUCKET || env?.ROOT_FOLDER || "kalidass";
  return String(root).replace(/^\/+|\/+$/g, "");
}

function getIndexPath(env) {
  return `${getRootPrefix(env)}/index.json`;
}

function getArticleObject(id, env) {
  return `${getRootPrefix(env)}/articles/${id}.json`;
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin, {"content-type": "application/json; charset=utf-8"}),
  });
}

function corsHeaders(origin, extra = {}) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    ...extra,
  };
}

function options(origin) {
  return new Response(null, {status: 204, headers: corsHeaders(origin)});
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, {status: response.status, headers});
}

function blobClient(env) {
  if (env.UPSTASH_BLOB_TOKEN) {
    return {
      mode: "upstash",
      bucket: new Bucket({token: env.UPSTASH_BLOB_TOKEN, enableTelemetry: false}),
    };
  }
  return {mode: "memory", bucket: memoryBucket()};
}

async function readJson(bucket, path, fallback = null) {
  try {
    const res = await bucket.get(path);
    return await new Response(res.body).json();
  } catch {
    return fallback;
  }
}

function putJson(bucket, path, value) {
  return bucket.put(path, JSON.stringify(value, null, 2), {
    contentType: "application/json",
    cache: "no-store",
  });
}

function summarize(article) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle,
    excerpt: article.excerpt,
    coverImage: article.coverImage,
    videoUrl: article.videoUrl || "",
    author: article.author,
    tags: article.tags || [],
    accent: article.accent || "#22d3ee",
    publishedAt: article.publishedAt,
    readTime: article.readTime || 5,
    featured: Boolean(article.featured),
    published: article.published ?? true,
    private: article.private ?? true,
    aiGenerated: article.aiGenerated ?? false,
    updatedAt: article.updatedAt || article.publishedAt,
  };
}

function slugify(value) {
  const base = String(value || "brief")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || `brief-${Date.now()}`;
}

function uniqueSlug(index, slug, ignoreId) {
  let next = slug;
  let i = 2;
  while (index.some((item) => item.slug === next && item.id !== ignoreId)) {
    next = `${slug}-${i}`;
    i += 1;
  }
  return next;
}

function estimateReadTime(blocks) {
  const text = (blocks || [])
    .map((block) => block.text || block.caption || "")
    .join(" ");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.max(3, Math.round(words / 180) || 3);
}

function adminOk(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

async function ensureSeed(bucket, env) {
  const indexPath = getIndexPath(env);
  try {
    const index = await readJson(bucket, indexPath, null);
    if (Array.isArray(index) && index.length > 0) return index;
    const summaries = [];
    for (const article of seedArticles) {
      const record = {
        ...article,
        createdAt: article.publishedAt,
        updatedAt: article.publishedAt,
      };
      await putJson(bucket, getArticleObject(article.id, env), record);
      summaries.push(summarize(record));
    }
    await putJson(bucket, indexPath, summaries);
    return summaries;
  } catch (err) {
    console.error("Upstash Blob ensureSeed error:", err);
    return seedArticles.map(summarize);
  }
}

function buildArticle(body, existing) {
  const now = new Date().toISOString();
  const published = body.published ?? existing?.published ?? true;
  return {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    slug: body.slug || existing?.slug,
    title: String(body.title ?? existing?.title ?? "").trim() || "Untitled brief",
    subtitle: String(body.subtitle ?? existing?.subtitle ?? "").trim(),
    excerpt: String(body.excerpt ?? existing?.excerpt ?? "").trim(),
    coverImage: String(body.coverImage ?? existing?.coverImage ?? "").trim(),
    videoUrl: String(body.videoUrl ?? existing?.videoUrl ?? "").trim(),
    author: {
      name: body.author?.name ?? existing?.author?.name ?? "Guest editor",
      role: body.author?.role ?? existing?.author?.role ?? "Writer",
      avatar: body.author?.avatar ?? existing?.author?.avatar ?? "",
    },
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : existing?.tags || [],
    accent: body.accent || existing?.accent || "#22d3ee",
    published,
    private: body.private ?? existing?.private ?? true,
    aiGenerated: body.aiGenerated ?? existing?.aiGenerated ?? false,
    publishedAt: body.publishedAt || existing?.publishedAt || (published ? now : ""),
    featured: body.featured ?? existing?.featured ?? false,
    blocks: Array.isArray(body.blocks) ? body.blocks : existing?.blocks || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function uploadsFor(env) {
  const prefix = getRootPrefix(env);
  return uploadHandler({
    bucket: new Bucket({token: env.UPSTASH_BLOB_TOKEN, enableTelemetry: false}),
    constraints: {maxSize: "20mb", contentTypes: ["image/*", "video/*"]},
    onBeforeUpload: ({file}) => ({
      path: uniquePath`${prefix}/media/${file.name}`,
      metadata: {kind: "journal-media"},
    }),
    onUploadComplete: ({path, url, size, contentType}) => ({path, url, size, contentType}),
  });
}

export default {
  async fetch(request, env) {
    const origin = env.CORS_ORIGIN || "*";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return options(origin);

    try {
      if (url.pathname.startsWith("/api/blob/")) {
        const path = decodeURIComponent(url.pathname.replace(/^\/api\/blob\//, ""));
        const item = getMemoryObject(path);
        if (!item) return json({error: "Object not found"}, 404, origin);
        return new Response(item.bytes, {
          headers: corsHeaders(origin, {"content-type": item.contentType}),
        });
      }

      if (url.pathname === "/api/upload") {
        if (!env.UPSTASH_BLOB_TOKEN) {
          return json(
            {error: "Set UPSTASH_BLOB_TOKEN for direct browser uploads to Upstash Blob."},
            503,
            origin
          );
        }
        const uploads = uploadsFor(env);
        if (request.method === "GET") return withCors(await uploads.GET(request), origin);
        if (request.method === "POST") return withCors(await uploads.POST(request), origin);
        return json({error: "Method not allowed"}, 405, origin);
      }

      const {mode, bucket} = blobClient(env);

      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ok: true}, 200, origin);
      }

      if (url.pathname === "/api/objects" && request.method === "POST") {
        if (!adminOk(request, env)) return json({error: "Unauthorized"}, 401, origin);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({error: "file field required"}, 400, origin);
        const prefix = getRootPrefix(env);
        const path = uniquePath`${prefix}/media/${file.name}`;
        const blob = await bucket.put(path, file, {
          contentType: file.type || "application/octet-stream",
          contentTypes: ["image/*", "video/*"],
          maxSize: "20mb",
        });
        return json(
          {id: blob.path, url: blob.url, name: file.name, size: blob.size, contentType: blob.contentType},
          201,
          origin
        );
      }

      if (url.pathname === "/api/articles" && request.method === "GET") {
        const index = await ensureSeed(bucket, env);
        const rawStatus = url.searchParams.get("status");
        if (rawStatus && !adminOk(request, env)) {
          return json({error: "Unauthorized"}, 401, origin);
        }
        const items = index
          .filter((item) => {
            if (!rawStatus) return item.published !== false && item.private !== true;
            if (rawStatus === "all") return true;
            if (rawStatus === "draft") return item.published === false;
            return item.published !== false;
          })
          .sort(
            (a, b) =>
              new Date(b.publishedAt || b.updatedAt) - new Date(a.publishedAt || a.updatedAt)
          );
        return json(items, 200, origin);
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        if (!adminOk(request, env)) return json({error: "Unauthorized"}, 401, origin);
        const body = await request.json();
        const index = await ensureSeed(bucket, env);
        const article = buildArticle(body);
        article.slug = uniqueSlug(index, slugify(body.slug || body.title));
        article.readTime = estimateReadTime(article.blocks);
        await putJson(bucket, getArticleObject(article.id, env), article);
        index.unshift(summarize(article));
        await putJson(bucket, getIndexPath(env), index);
        return json(article, 201, origin);
      }

      const articleMatch = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
      if (articleMatch) {
        const key = decodeURIComponent(articleMatch[1]);
        const index = await ensureSeed(bucket, env);
        const meta = index.find((item) => item.id === key || item.slug === key);
        if (!meta) return json({error: "Article not found"}, 404, origin);

        if (request.method === "GET") {
          if (meta.published === false && !adminOk(request, env)) {
            return json({error: "Article not found"}, 404, origin);
          }
          let article = await readJson(bucket, getArticleObject(meta.id, env), null);
          if (!article) {
            article = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }
          if (!article) return json({error: "Article not found"}, 404, origin);
          return json(article, 200, origin);
        }

        if (request.method === "PUT") {
          if (!adminOk(request, env)) return json({error: "Unauthorized"}, 401, origin);
          let existing = await readJson(bucket, getArticleObject(meta.id, env), null);
          if (!existing) {
            existing = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }
          if (!existing) return json({error: "Article not found"}, 404, origin);
          const body = await request.json();
          const article = buildArticle(body, existing);
          article.slug = uniqueSlug(
            index,
            slugify(body.slug || body.title || existing.slug),
            existing.id
          );
          article.readTime = estimateReadTime(article.blocks);
          await putJson(bucket, getArticleObject(existing.id, env), article);
          await putJson(
            bucket,
            getIndexPath(env),
            index.map((item) => (item.id === existing.id ? summarize(article) : item))
          );
          return json(article, 200, origin);
        }

        if (request.method === "DELETE") {
          if (!adminOk(request, env)) return json({error: "Unauthorized"}, 401, origin);
          try {
            await bucket.del(getArticleObject(meta.id, env));
          } catch {
            // already gone
          }
          await putJson(
            bucket,
            getIndexPath(env),
            index.filter((item) => item.id !== meta.id)
          );
          return json({ok: true}, 200, origin);
        }
      }

      return json({error: "Not found"}, 404, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker error";
      return json({error: message}, 500, origin);
    }
  },
};
