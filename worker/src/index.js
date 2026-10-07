import {Bucket, uniquePath, uploadHandler} from "@upstash/blob";
import {createRemoteJWKSet, jwtVerify} from "jose";
import {getMemoryObject, memoryBucket} from "./memory.js";
import {seedArticles} from "./seed.js";
import {runQualityEvaluation, extractArticleText} from "./eval/index.js";
import {generateArticle} from "./generator/index.js";
import {getOrGenerateArticleIntelligence, peekArticleIntelligence} from "./intelligence/service.js";
import {
  getRedisClient,
  getCachedPublicFeed,
  setCachedPublicFeed,
  getCachedArticle,
  setCachedArticle,
  invalidateArticleCaches,
  invalidateOnlyArticleCache,
  invalidateAllArticleCaches,
  matchesEtag,
  ensureFeaturedDecided,
  computeFeedEtag,
} from "./redis/index.js";

// Cloudflare Workers fetch guard: ensures @upstash/blob requests carry Content-Length
const nativeFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  if (init?.body && typeof init.body.getReader === "function") {
    const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
    const {duplex, ...rest} = init;
    return nativeFetch(input, {...rest, body: bytes});
  }
  return nativeFetch(input, init);
};

let _jwks = null;
let _jwksDomain = "";
function getJWKS(domain) {
  if (!_jwks || _jwksDomain !== domain) {
    _jwksDomain = domain;
    _jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  }
  return _jwks;
}

const _userinfoCache = new Map();

async function getUserInfo(domain, accessToken) {
  if (!domain || !accessToken) return null;
  const cached = _userinfoCache.get(accessToken);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://${domain}/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      _userinfoCache.set(accessToken, {data, expires: Date.now() + 5 * 60 * 1000});
      if (_userinfoCache.size > 200) {
        const firstKey = _userinfoCache.keys().next().value;
        _userinfoCache.delete(firstKey);
      }
      return data;
    }
  } catch (err) {
    console.warn("Auth0 UserInfo fetch error:", err.message);
  }

  return null;
}

function matchesAdminToken(candidate, env) {
  if (!candidate || !env?.ADMIN_TOKEN) return false;
  const target = String(env.ADMIN_TOKEN).trim().replace(/^["']|["']$/g, "").trim();
  const input = String(candidate).trim().replace(/^["']|["']$/g, "").trim();
  return Boolean(target && input && input === target);
}

async function getAuthUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  let token = "";
  if (auth.startsWith("Bearer ")) {
    token = auth.slice(7).trim();
  }

  const elevationToken = (request.headers.get("x-admin-token") || "").trim();
  if (!token && elevationToken && matchesAdminToken(elevationToken, env)) {
    token = elevationToken;
  }

  if (!token) return null;

  const adminEmails = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const primaryAdminEmail = adminEmails[0] || "admin";

  // 1. Super-Admin secret token match (M2M scripts and standalone admin token mode)
  if (matchesAdminToken(token, env)) {
    return {
      sub: "admin",
      email: primaryAdminEmail,
      name: "Super Admin",
      avatar: "",
      role: "admin",
      isSuperuserEligible: true,
    };
  }

  // 2. Auth0 JWT verification
  if (env.AUTH0_DOMAIN) {
    try {
      const jwks = getJWKS(env.AUTH0_DOMAIN);
      const options = {
        issuer: `https://${env.AUTH0_DOMAIN}/`,
      };
      if (env.AUTH0_AUDIENCE) {
        options.audience = env.AUTH0_AUDIENCE;
      }
      const {payload} = await jwtVerify(token, jwks, options);
      let rawEmail = typeof payload.email === "string" ? payload.email : "";
      if (!rawEmail) {
        const emailClaimKey = Object.keys(payload).find((k) => k.endsWith("/email"));
        if (emailClaimKey && typeof payload[emailClaimKey] === "string") {
          rawEmail = payload[emailClaimKey];
        }
      }

      let rawName = typeof payload.name === "string" ? payload.name : "";
      let rawPicture = typeof payload.picture === "string" ? payload.picture : "";

      // If email or profile is missing from JWT access token claims, query Auth0 UserInfo
      if ((!rawEmail || !rawName || !rawPicture) && env.AUTH0_DOMAIN) {
        const userinfo = await getUserInfo(env.AUTH0_DOMAIN, token);
        if (userinfo) {
          if (!rawEmail && typeof userinfo.email === "string") {
            rawEmail = userinfo.email;
          }
          if (!rawName && (userinfo.name || userinfo.nickname)) {
            rawName = userinfo.name || userinfo.nickname;
          }
          if (!rawPicture && typeof userinfo.picture === "string") {
            rawPicture = userinfo.picture;
          }
        }
      }

      const email = rawEmail.trim().toLowerCase();

      let customRoles = [];
      if (Array.isArray(payload.roles)) {
        customRoles = payload.roles;
      } else {
        const rolesClaimKey = Object.keys(payload).find((k) => k.endsWith("/roles"));
        if (rolesClaimKey && Array.isArray(payload[rolesClaimKey])) {
          customRoles = payload[rolesClaimKey];
        }
      }

      const isSuperuserEligible =
        Boolean(email && adminEmails.includes(email)) ||
        customRoles.includes("admin") ||
        payload.role === "admin";

      // Step-up elevation check via x-admin-token header
      const elevationToken = (request.headers.get("x-admin-token") || "").trim();
      const isElevated = matchesAdminToken(elevationToken, env);

      return {
        sub: payload.sub,
        email,
        name: rawName || payload.nickname || email || "Author",
        avatar: rawPicture || "",
        role: isElevated ? "admin" : "author",
        isSuperuserEligible,
      };
    } catch (err) {
      console.warn("Auth0 JWT verification error:", err.message);
      return null;
    }
  }

  return null;
}

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

function json(data, status = 200, origin = "*", extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin, {"content-type": "application/json; charset=utf-8", ...extraHeaders}),
  });
}

function corsHeaders(origin, extra = {}) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-token,x-typesafe-key,x-jev-key,x-clef-key,x-eval-provider",
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

let _indexLock = Promise.resolve();

/**
 * Serializes asynchronous index mutations within the isolate.
 * Guarantees that only one read-modify-write cycle executes at a time.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function withIndexLock(task) {
  const result = _indexLock.then(() => task(), () => task());
  _indexLock = result.then(() => {}, () => {});
  return result;
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
    authorEmail: article.authorEmail || "",
    tags: article.tags || [],
    accent: article.accent || "#6366f1",
    publishedAt: article.publishedAt,
    readTime: article.readTime || 5,
    featured: Boolean(article.featured),
    published: article.published ?? true,
    private: article.private ?? true,
    aiGenerated: article.aiGenerated ?? false,
    userId: article.userId || "system",
    updatedAt: article.updatedAt || article.publishedAt,
    evaluation: article.evaluation || null,
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

export async function reconstructIndex(bucket, env) {
  const canonicalPath = getIndexPath(env);
  const rootPrefix = getRootPrefix(env);

  // 1. Try legacy index paths first if canonical index is empty
  const fallbackPaths = ["journal/index.json", "index.json"];
  for (const fbPath of fallbackPaths) {
    if (fbPath !== canonicalPath) {
      const fbIndex = await readJson(bucket, fbPath, null);
      if (Array.isArray(fbIndex) && fbIndex.length > 0) {
        await putJson(bucket, canonicalPath, fbIndex);
        return fbIndex;
      }
    }
  }

  // 2. Scan bucket for all individual article files
  if (typeof bucket.list === "function") {
    const candidatePrefixes = [
      `${rootPrefix}/articles/`,
      "journal/articles/",
      "articles/",
    ];
    const foundArticles = new Map();

    for (const prefix of candidatePrefixes) {
      try {
        let cursor;
        do {
          const res = await bucket.list({prefix, limit: 100, cursor});
          const items = res.blobs || res.objects || res.files || [];
          for (const item of items) {
            const path = item.path || item.pathname || item.name || item.key;
            if (path && path.endsWith(".json")) {
              const article = await readJson(bucket, path, null);
              if (article && article.id && !foundArticles.has(article.id)) {
                foundArticles.set(article.id, summarize(article));
              }
            }
          }
          cursor = res.cursor;
        } while (cursor);
      } catch (listErr) {
        console.warn(`[Reindex] Bucket list under '${prefix}' failed:`, listErr?.message);
      }
    }

    if (foundArticles.size > 0) {
      const reconstructed = Array.from(foundArticles.values()).sort(
        (a, b) =>
          new Date(b.publishedAt || b.updatedAt) - new Date(a.publishedAt || a.updatedAt)
      );
      await putJson(bucket, canonicalPath, reconstructed);
      return reconstructed;
    }
  }

  return [];
}

async function ensureSeed(bucket, env) {
  const indexPath = getIndexPath(env);
  try {
    const index = await readJson(bucket, indexPath, null);
    if (Array.isArray(index) && index.length > 0) return index;

    // Self-healing: if index is missing or empty [], check fallback paths or reconstruct from stored files
    const recovered = await reconstructIndex(bucket, env);
    if (recovered.length > 0) return recovered;

    // Seed mock articles ONLY if seedArticles array is non-empty
    if (seedArticles.length > 0) {
      const summaries = [];
      for (const article of seedArticles) {
        const record = {
          ...article,
          authorEmail: article.authorEmail || "",
          userId: article.userId || "system",
          createdAt: article.publishedAt,
          updatedAt: article.publishedAt,
        };
        await putJson(bucket, getArticleObject(article.id, env), record);
        summaries.push(summarize(record));
      }
      await putJson(bucket, indexPath, summaries);
      return summaries;
    }

    // Never overwrite index.json with [] on failed/empty reads
    return Array.isArray(index) ? index : [];
  } catch (err) {
    console.error("Upstash Blob ensureSeed error:", err);
    return [];
  }
}

function buildArticle(body, existing, user) {
  const now = new Date().toISOString();
  const published = body.published ?? existing?.published ?? true;

  // Enforce server-stamped immutable authorEmail
  let authorEmail = existing?.authorEmail;
  if (!authorEmail) {
    if (user?.role === "admin" && body.authorEmail) {
      authorEmail = String(body.authorEmail).trim().toLowerCase();
    } else {
      authorEmail = user?.email || "";
    }
  }

  const userId = existing?.userId || user?.sub || "system";

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
      name: (body.author?.name ?? existing?.author?.name ?? user?.name ?? "Guest editor") || "Guest editor",
      role: (body.author?.role ?? existing?.author?.role ?? "Writer") || "Writer",
      avatar: body.author?.avatar ?? existing?.author?.avatar ?? user?.avatar ?? "",
    },
    authorEmail,
    userId,
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : existing?.tags || [],
    accent: body.accent || existing?.accent || "#6366f1",
    published,
    private: body.private ?? existing?.private ?? true,
    aiGenerated: body.aiGenerated ?? existing?.aiGenerated ?? false,
    publishedAt: body.publishedAt || existing?.publishedAt || (published ? now : ""),
    featured: body.featured ?? existing?.featured ?? false,
    blocks: Array.isArray(body.blocks) ? body.blocks : existing?.blocks || [],
    evaluation: body.evaluation !== undefined ? body.evaluation : (existing?.evaluation || null),
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

function resolveOrigin(request, env) {
  const reqOrigin = request.headers.get("origin") || "";
  const allowed = [
    env.CORS_ORIGIN,
    "https://kalidass.amrit.fyi",
    "https://kalidass.pages.dev",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean);
  if (allowed.includes(reqOrigin)) return reqOrigin;
  return env.CORS_ORIGIN || "*";
}

export default {
  async fetch(request, env) {
    const origin = resolveOrigin(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return options(origin);

    try {
      if (url.pathname.startsWith("/api/blob/")) {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
        const path = decodeURIComponent(url.pathname.replace(/^\/api\/blob\//, ""));
        const item = getMemoryObject(path);
        if (!item) return json({error: "Object not found"}, 404, origin);
        return new Response(item.bytes, {
          headers: corsHeaders(origin, {"content-type": item.contentType}),
        });
      }

      if (url.pathname === "/api/upload") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
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

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
        return json({ok: true, user}, 200, origin);
      }

      if (url.pathname === "/api/auth/elevate" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
        if (!user.isSuperuserEligible) {
          return json({error: "Forbidden: Account is not authorized for superuser elevation"}, 403, origin);
        }
        let body = {};
        try {
          body = await request.json();
        } catch {
          return json({error: "Invalid JSON payload"}, 400, origin);
        }
        const candidateToken = String(body.adminToken || "").trim();
        if (!matchesAdminToken(candidateToken, env)) {
          return json({error: "Invalid superuser credentials"}, 401, origin);
        }
        return json({ok: true, elevated: true}, 200, origin);
      }

      if (url.pathname === "/api/objects" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({error: "file field required"}, 400, origin);
        const prefix = getRootPrefix(env);
        const path = uniquePath`${prefix}/media/${file.name}`;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const blob = await bucket.put(path, buffer, {
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
        const rawStatus = url.searchParams.get("status");

        // Public feed: only public published articles (Redis accelerated with 3h TTL & deterministic featured story)
        if (!rawStatus) {
          const redis = getRedisClient(env);
          const ifNoneMatch = request.headers.get("if-none-match");

          const cached = await getCachedPublicFeed(redis);
          if (cached) {
            if (ifNoneMatch && cached.etag && matchesEtag(ifNoneMatch, cached.etag)) {
              return new Response(null, {
                status: 304,
                headers: corsHeaders(origin, {
                  etag: cached.etag,
                  "cache-control": "public, max-age=60, stale-while-revalidate=300",
                }),
              });
            }
            return json(cached.feed, 200, origin, {
              etag: cached.etag || "",
              "cache-control": "public, max-age=60, stale-while-revalidate=300",
            });
          }

          const index = await ensureSeed(bucket, env);
          const items = index
            .filter((item) => item.published !== false && item.private !== true)
            .sort(
              (a, b) =>
                new Date(b.publishedAt || b.updatedAt) - new Date(a.publishedAt || a.updatedAt)
            );

          const decidedItems = ensureFeaturedDecided(items);
          const saved = await setCachedPublicFeed(redis, decidedItems);
          const finalFeed = saved?.feed || decidedItems;
          const finalEtag = saved?.etag || computeFeedEtag(decidedItems);

          return json(finalFeed, 200, origin, {
            etag: finalEtag,
            "cache-control": "public, max-age=60, stale-while-revalidate=300",
          });
        }

        const index = await ensureSeed(bucket, env);

        // Privileged status queries require authentication
        const user = await getAuthUser(request, env);
        if (!user) {
          return json({error: "Unauthorized"}, 401, origin);
        }

        const items = index
          .filter((item) => {
            // Super-Admin sees everything according to requested status
            if (user.role === "admin") {
              if (rawStatus === "all") return true;
              if (rawStatus === "draft") return item.published === false;
              return item.published !== false;
            }

            // Regular author: email-isolated visibility
            const isOwner =
              Boolean(item.authorEmail) &&
              item.authorEmail.toLowerCase() === user.email.toLowerCase();

            if (rawStatus === "draft") {
              return item.published === false && isOwner;
            }
            if (rawStatus === "published") {
              return item.published !== false && (item.private !== true || isOwner);
            }
            if (rawStatus === "all") {
              return (item.published !== false && item.private !== true) || isOwner;
            }
            return false;
          })
          .sort(
            (a, b) =>
              new Date(b.publishedAt || b.updatedAt) - new Date(a.publishedAt || a.updatedAt)
          );
        return json(items, 200, origin);
      }

      if (url.pathname === "/api/eval/quality" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);

        let body = {};
        try {
          body = await request.json();
        } catch {
          return json({error: "Invalid JSON payload"}, 400, origin);
        }

        let text = "";
        if (body.slug) {
          const index = await ensureSeed(bucket, env);
          const meta = index.find((item) => item.slug === body.slug || item.id === body.slug);
          if (meta) {
            let article = await readJson(bucket, getArticleObject(meta.id, env), null);
            if (!article) {
              article = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
            }
            if (article) {
              text = extractArticleText(article);
            }
          }
        }

        if (!text) {
          text = extractArticleText(body);
        }

        if (!text) {
          return json({error: "No text content provided for quality evaluation"}, 400, origin);
        }

        const jevApiKey =
          body.jevApiKey ||
          request.headers.get("x-typesafe-key") ||
          request.headers.get("x-jev-key") ||
          body.apiKey;

        const clefApiKey =
          body.clefApiKey ||
          request.headers.get("x-clef-key");

        const rawProvider = (body.provider || request.headers.get("x-eval-provider") || "").toLowerCase().trim();
        const provider = ["jev", "clef", "heuristic"].includes(rawProvider) ? rawProvider : undefined;

        const options = {
          jevApiKey,
          clefApiKey,
          provider,
        };

        const evalResult = await runQualityEvaluation(text, options, env);
        return json(evalResult, 200, origin);
      }

      if (url.pathname === "/api/admin/reset" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user || user.role !== "admin") return json({error: "Unauthorized"}, 401, origin);
        await putJson(bucket, getIndexPath(env), []);
        const redis = getRedisClient(env);
        await invalidateAllArticleCaches(redis);
        return json({ok: true, message: "Article repository reset to empty"}, 200, origin);
      }

      if (url.pathname === "/api/admin/reindex" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user || user.role !== "admin") {
          return json({error: "Unauthorized: Admin privileges required to reindex articles"}, 401, origin);
        }
        const articles = await withIndexLock(async () => {
          return await reconstructIndex(bucket, env);
        });
        const redis = getRedisClient(env);
        await invalidateAllArticleCaches(redis);
        return json(
          {
            ok: true,
            message: `Successfully rebuilt index with ${articles.length} article(s)`,
            count: articles.length,
            articles: articles.map((a) => ({id: a.id, slug: a.slug, title: a.title})),
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/ai_search_insight") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);

        let query = "";
        if (request.method === "GET") {
          query = url.searchParams.get("q") || url.searchParams.get("query") || "";
        } else if (request.method === "POST") {
          try {
            const body = await request.json();
            query = body.q || body.query || "";
          } catch {
            return json({error: "Invalid JSON payload"}, 400, origin);
          }
        } else {
          return json({error: "Method not allowed"}, 405, origin);
        }

        if (!query.trim()) {
          return json({error: "Query parameter 'q' is required"}, 400, origin);
        }

        const serpApiKey = env.SERPAPI_API_KEY || env.SERP_API_KEY;
        if (!serpApiKey) {
          return json({error: "SERPAPI_API_KEY is not configured in worker environment"}, 503, origin);
        }

        try {
          const serpUrl = new URL("https://serpapi.com/search.json");
          serpUrl.searchParams.set("engine", "google");
          const currentDate = new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          serpUrl.searchParams.set("q", `${query.trim()}, as of ${currentDate}`);
          serpUrl.searchParams.set("api_key", serpApiKey);

          const serpRes = await fetch(serpUrl.toString());
          if (!serpRes.ok) {
            const errText = await serpRes.text();
            return json({error: `SerpApi error: ${serpRes.status}`, details: errText}, 502, origin);
          }

          const data = await serpRes.json();
          let aiOverview = null;
          if (typeof data.ai_overview === "string") {
            aiOverview = data.ai_overview;
          } else if (data.ai_overview && typeof data.ai_overview === "object") {
            if (typeof data.ai_overview.text === "string" && data.ai_overview.text.trim()) {
              aiOverview = data.ai_overview.text.trim();
            } else if (Array.isArray(data.ai_overview.text_blocks)) {
              aiOverview = data.ai_overview.text_blocks
                .map((b) => (typeof b === "string" ? b : b?.text || ""))
                .filter(Boolean)
                .join("\n\n");
            } else if (typeof data.ai_overview.snippet === "string") {
              aiOverview = data.ai_overview.snippet;
            } else {
              aiOverview = JSON.stringify(data.ai_overview);
            }
          }

          const organicResults = (data.organic_results || []).slice(0, 5).map((r) => ({
            title: r.title || "",
            link: r.link || "",
            snippet: r.snippet || "",
          }));

          return json(
            {
              ok: true,
              query: query.trim(),
              ai_overview: aiOverview,
              organic_results: organicResults,
              search_metadata: data.search_metadata || null,
            },
            200,
            origin
          );
        } catch (err) {
          console.error("AI Search Insight error:", err);
          return json({error: "Failed to fetch AI search insight"}, 500, origin);
        }
      }

      if (url.pathname === "/api/generate" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user) {
          return json({error: "Unauthorized: Authentication required to generate articles"}, 401, origin);
        }

        let body = {};
        try {
          body = await request.json();
        } catch {
          return json({error: "Invalid JSON payload"}, 400, origin);
        }

        if (!body.topic || !String(body.topic).trim()) {
          return json({error: "Field 'topic' is required"}, 400, origin);
        }

        const storageHelpers = {
          bucket,
          readJson,
          putJson,
          ensureSeed,
          slugify,
          uniqueSlug,
          estimateReadTime,
          summarize,
          getIndexPath,
          getArticleObject,
          withIndexLock,
        };

        const result = await generateArticle(body, env, user, storageHelpers);
        const redis = getRedisClient(env);
        await invalidateArticleCaches(redis, { id: result?.article?.id, slug: result?.article?.slug });
        return json(result, 201, origin);
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
        const body = await request.json();

        // Safety verification guardrail & evaluation
        let evalResult = null;
        const payloadText = extractArticleText(body);
        if (payloadText) {
          evalResult = await runQualityEvaluation(payloadText, {}, env);
          if (evalResult?.safety?.verdict && evalResult.safety.verdict !== "safe") {
            return json(
              {
                error: "Safety Guardrail Blocked: Article failed safety screening.",
                violations: evalResult.safety.violations,
              },
              422,
              origin
            );
          }
        }

        const article = await withIndexLock(async () => {
          const index = await ensureSeed(bucket, env);
          const newArticle = buildArticle(body, null, user);
          newArticle.evaluation = evalResult || body.evaluation || null;
          newArticle.slug = uniqueSlug(index, slugify(body.slug || body.title));
          newArticle.readTime = estimateReadTime(newArticle.blocks);
          await putJson(bucket, getArticleObject(newArticle.id, env), newArticle);
          index.unshift(summarize(newArticle));
          await putJson(bucket, getIndexPath(env), index);
          return newArticle;
        });
        const redis = getRedisClient(env);
        await invalidateArticleCaches(redis, { id: article.id, slug: article.slug });
        return json(article, 201, origin);
      }

      // Public read-only intelligence sub-resource (lazy-fetched by the AI Intel tab).
      // Never spawns a Box; mirrors the article GET draft/private gating.
      const intelMatch = url.pathname.match(/^\/api\/articles\/([^/]+)\/intel$/);
      if (intelMatch && request.method === "GET") {
        const key = decodeURIComponent(intelMatch[1]);
        const index = await ensureSeed(bucket, env);
        const meta = index.find((item) => item.id === key || item.slug === key);
        if (!meta) return json({error: "Article not found"}, 404, origin);

        if (meta.published === false || meta.private === true) {
          const user = await getAuthUser(request, env);
          if (!user) return json({error: "Article not found"}, 404, origin);
          const isOwner =
            Boolean(meta.authorEmail) &&
            meta.authorEmail.toLowerCase() === user.email.toLowerCase();
          if (user.role !== "admin" && !isOwner) {
            return json({error: "Article not found"}, 404, origin);
          }
        }

        const intel = await peekArticleIntelligence(meta.id, env, {bucket, readJson});
        if (!intel) return json({error: "No intelligence compiled for this article"}, 404, origin);
        return json(intel, 200, origin);
      }

      const articleMatch = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
      if (articleMatch) {
        const key = decodeURIComponent(articleMatch[1]);
        const redis = getRedisClient(env);
        const isIntelRequest = url.searchParams.get("intelligence") === "true";

        if (request.method === "GET" && !isIntelRequest) {
          const cachedArticle = await getCachedArticle(redis, key);
          if (cachedArticle) {
            if (cachedArticle.published === false || cachedArticle.private === true) {
              const user = await getAuthUser(request, env);
              if (!user) return json({error: "Article not found"}, 404, origin);
              const isOwner =
                Boolean(cachedArticle.authorEmail) &&
                cachedArticle.authorEmail.toLowerCase() === user.email.toLowerCase();
              if (user.role !== "admin" && !isOwner) {
                return json({error: "Article not found"}, 404, origin);
              }
            }
            return json(cachedArticle, 200, origin);
          }
        }

        const index = await ensureSeed(bucket, env);
        const meta = index.find((item) => item.id === key || item.slug === key);
        if (!meta) return json({error: "Article not found"}, 404, origin);

        if (request.method === "GET") {
          if (meta.published === false || meta.private === true) {
            const user = await getAuthUser(request, env);
            if (!user) return json({error: "Article not found"}, 404, origin);
            const isOwner =
              Boolean(meta.authorEmail) &&
              meta.authorEmail.toLowerCase() === user.email.toLowerCase();
            if (user.role !== "admin" && !isOwner) {
              return json({error: "Article not found"}, 404, origin);
            }
          }
          let article = await readJson(bucket, getArticleObject(meta.id, env), null);
          if (!article) {
            article = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }
          if (!article) return json({error: "Article not found"}, 404, origin);

          // Dedicated intelligence block retrieval (omitted from normal reader responses)
          if (url.searchParams.get("intelligence") === "true") {
            const user = await getAuthUser(request, env);
            if (!user) return json({error: "Unauthorized: Authentication required to view SERP intelligence"}, 401, origin);
            const isOwner =
              Boolean(meta.authorEmail) &&
              meta.authorEmail.toLowerCase() === user.email.toLowerCase();
            if (user.role !== "admin" && !isOwner) {
              return json({error: "Forbidden: You can only view intelligence for your own articles"}, 403, origin);
            }

            const refresh = url.searchParams.get("refresh") === "true";

            try {
              const intelligence = await getOrGenerateArticleIntelligence(
                article,
                env,
                {
                  bucket,
                  readJson,
                  putJson,
                },
                {refresh}
              );
              await invalidateArticleCaches(redis, { id: meta.id, slug: meta.slug });
              return json({...article, ai_intelligence: intelligence}, 200, origin);
            } catch (intelErr) {
              console.error("[Intelligence Error]:", intelErr);
              return json({
                error: "Failed to fetch article intelligence. Please try again later.",
              }, 500, origin);
            }
          }

          // Public readers lazy-fetch the dossier via /intel; expose only a
          // lightweight existence flag so the tab badge renders without the payload.
          const cachedIntel = article.ai_intelligence ||
            (await peekArticleIntelligence(meta.id, env, {bucket, readJson}));

          const responseArticle = {
            ...article,
            has_intelligence: Boolean(cachedIntel),
          };
          if (responseArticle.published !== false && responseArticle.private !== true) {
            await setCachedArticle(redis, responseArticle);
          }

          return json(
            responseArticle,
            200,
            origin
          );
        }

        if (request.method === "PUT") {
          const user = await getAuthUser(request, env);
          if (!user) return json({error: "Unauthorized"}, 401, origin);

          let existing = await readJson(bucket, getArticleObject(meta.id, env), null);
          if (!existing) {
            existing = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }
          if (!existing) return json({error: "Article not found"}, 404, origin);

          // Enforce ownership check for non-admin authors
          if (user.role !== "admin") {
            const existingEmail = (existing.authorEmail || "").toLowerCase();
            if (!existingEmail || existingEmail !== user.email.toLowerCase()) {
              return json({error: "Forbidden: You can only edit your own articles"}, 403, origin);
            }
          }

          const body = await request.json();

          // Safety verification guardrail & evaluation
          let evalResult = null;
          const payloadText = extractArticleText(body);
          if (payloadText) {
            evalResult = await runQualityEvaluation(payloadText, {}, env);
            if (evalResult?.safety?.verdict && evalResult.safety.verdict !== "safe") {
              return json(
                {
                  error: "Safety Guardrail Blocked: Article failed safety screening.",
                  violations: evalResult.safety.violations,
                },
                422,
                origin
              );
            }
          }

          const updatedArticle = await withIndexLock(async () => {
            const index = await ensureSeed(bucket, env);
            const article = buildArticle(body, existing, user);
            article.evaluation = evalResult || body.evaluation || existing.evaluation || null;
            article.authorEmail = existing.authorEmail || user.email; // Preserved immutably
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
            return article;
          });
          const shouldInvalidateFeed =
            url.searchParams.get("invalidate_feed") !== "false" &&
            request.headers.get("x-invalidate-feed") !== "false";

          if (shouldInvalidateFeed) {
            await invalidateArticleCaches(redis, {
              id: updatedArticle.id,
              slug: updatedArticle.slug,
              oldSlug: existing.slug,
            });
          } else {
            await invalidateOnlyArticleCache(redis, {
              id: updatedArticle.id,
              slug: updatedArticle.slug,
              oldSlug: existing.slug,
            });
          }
          return json(updatedArticle, 200, origin);
        }

        if (request.method === "DELETE") {
          const user = await getAuthUser(request, env);
          if (!user) return json({error: "Unauthorized"}, 401, origin);

          let existing = await readJson(bucket, getArticleObject(meta.id, env), null);
          if (!existing) {
            existing = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }

          // Enforce ownership check for non-admin authors
          if (user.role !== "admin") {
            const existingEmail = (existing?.authorEmail || meta.authorEmail || "").toLowerCase();
            if (!existingEmail || existingEmail !== user.email.toLowerCase()) {
              return json({error: "Forbidden: You can only delete your own articles"}, 403, origin);
            }
          }

          await withIndexLock(async () => {
            try {
              await bucket.del(getArticleObject(meta.id, env));
            } catch {
              // already gone
            }
            const index = await ensureSeed(bucket, env);
            await putJson(
              bucket,
              getIndexPath(env),
              index.filter((item) => item.id !== meta.id)
            );
          });
          await invalidateArticleCaches(redis, { id: meta.id, slug: meta.slug });
          return json({ok: true}, 200, origin);
        }
      }

      return json({error: "Not found"}, 404, origin);
    } catch (error) {
      console.error("Worker error:", error);
      return json({error: "Internal server error"}, 500, origin);
    }
  },
};

