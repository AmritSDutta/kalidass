import {Bucket, uniquePath, uploadHandler} from "@upstash/blob";
import {createRemoteJWKSet, jwtVerify} from "jose";
import {getMemoryObject, memoryBucket} from "./memory.js";
import {seedArticles} from "./seed.js";

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

async function getAuthUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  let token = "";
  if (auth.startsWith("Bearer ")) {
    token = auth.slice(7).trim();
  }
  if (!token) return null;

  const adminEmails = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const primaryAdminEmail = adminEmails[0] || "admin";

  // 1. Super-Admin secret token match (M2M scripts and standalone admin token mode)
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
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
      const isElevated = Boolean(
        env.ADMIN_TOKEN && elevationToken && elevationToken === env.ADMIN_TOKEN
      );

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
    "access-control-allow-headers": "content-type,authorization,x-admin-token",
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

async function ensureSeed(bucket, env) {
  const indexPath = getIndexPath(env);
  try {
    const index = await readJson(bucket, indexPath, null);
    if (Array.isArray(index)) return index;
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
  } catch (err) {
    console.error("Upstash Blob ensureSeed error:", err);
    return seedArticles.map(summarize);
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
        let body = {};
        try {
          body = await request.json();
        } catch {
          return json({error: "Invalid JSON payload"}, 400, origin);
        }
        const candidateToken = String(body.adminToken || "").trim();
        if (!env.ADMIN_TOKEN || candidateToken !== env.ADMIN_TOKEN) {
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
        const index = await ensureSeed(bucket, env);
        const rawStatus = url.searchParams.get("status");

        // Public feed: only public published articles
        if (!rawStatus) {
          const items = index
            .filter((item) => item.published !== false && item.private !== true)
            .sort(
              (a, b) =>
                new Date(b.publishedAt || b.updatedAt) - new Date(a.publishedAt || a.updatedAt)
            );
          return json(items, 200, origin);
        }

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

      if (url.pathname === "/api/admin/reset" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user || user.role !== "admin") return json({error: "Unauthorized"}, 401, origin);
        await putJson(bucket, getIndexPath(env), []);
        return json({ok: true, message: "Article repository reset to empty"}, 200, origin);
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        const user = await getAuthUser(request, env);
        if (!user) return json({error: "Unauthorized"}, 401, origin);
        const body = await request.json();
        const index = await ensureSeed(bucket, env);
        const article = buildArticle(body, null, user);
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
          if (meta.published === false) {
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
          return json(article, 200, origin);
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
          const article = buildArticle(body, existing, user);
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
          return json(article, 200, origin);
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
      console.error("Worker error:", error);
      const message = error instanceof Error ? error.message : "Worker error";
      return json({error: message}, 500, origin);
    }
  },
};

