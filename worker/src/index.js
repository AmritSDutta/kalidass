import {uniquePath} from "@upstash/blob";
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
import {ResponseHelper} from "./helper/response.js";
import {AuthHelper} from "./helper/auth.js";
import {StorageHelper} from "./helper/storage.js";
import {getMemoryObject} from "./memory.js";

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

/**
 * Serializes asynchronous index mutations within the isolate.
 * Guarantees that only one read-modify-write cycle executes at a time.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export const withIndexLock = (task) => StorageHelper.withIndexLock(task);
export const reconstructIndex = (bucket, env) => StorageHelper.reconstructIndex(bucket, env);

export default {
  async fetch(request, env) {
    const origin = ResponseHelper.resolveOrigin(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return ResponseHelper.options(origin);

    try {
      if (url.pathname.startsWith("/api/blob/")) {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        const path = decodeURIComponent(url.pathname.replace(/^\/api\/blob\//, ""));
        const item = getMemoryObject(path);
        if (!item) return ResponseHelper.json({error: "Object not found"}, 404, origin);
        return new Response(item.bytes, {
          headers: ResponseHelper.corsHeaders(origin, {"content-type": item.contentType}),
        });
      }

      if (url.pathname === "/api/upload") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        if (!env.UPSTASH_BLOB_TOKEN) {
          return ResponseHelper.json(
            {error: "Set UPSTASH_BLOB_TOKEN for direct browser uploads to Upstash Blob."},
            503,
            origin
          );
        }
        const uploads = StorageHelper.uploadsFor(env);
        if (request.method === "GET") return ResponseHelper.withCors(await uploads.GET(request), origin);
        if (request.method === "POST") return ResponseHelper.withCors(await uploads.POST(request), origin);
        return ResponseHelper.json({error: "Method not allowed"}, 405, origin);
      }

      const {mode, bucket} = StorageHelper.blobClient(env);

      if (url.pathname === "/api/health" && request.method === "GET") {
        return ResponseHelper.json({ok: true}, 200, origin);
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        return ResponseHelper.json({ok: true, user}, 200, origin);
      }

      if (url.pathname === "/api/auth/elevate" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        if (!user.isSuperuserEligible) {
          return ResponseHelper.json({error: "Forbidden: Account is not authorized for superuser elevation"}, 403, origin);
        }
        let body = {};
        try {
          body = await request.json();
        } catch {
          return ResponseHelper.json({error: "Invalid JSON payload"}, 400, origin);
        }
        const candidateToken = String(body.adminToken || "").trim();
        if (!AuthHelper.matchesAdminToken(candidateToken, env)) {
          return ResponseHelper.json({error: "Invalid superuser credentials"}, 401, origin);
        }
        return ResponseHelper.json({ok: true, elevated: true}, 200, origin);
      }

      if (url.pathname === "/api/objects" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return ResponseHelper.json({error: "file field required"}, 400, origin);
        const prefix = StorageHelper.getRootPrefix(env);
        const path = uniquePath`${prefix}/media/${file.name}`;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const blob = await bucket.put(path, buffer, {
          contentType: file.type || "application/octet-stream",
          contentTypes: ["image/*", "video/*"],
          maxSize: "20mb",
        });
        return ResponseHelper.json(
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
                headers: ResponseHelper.corsHeaders(origin, {
                  etag: cached.etag,
                  "cache-control": "public, max-age=60, stale-while-revalidate=300",
                }),
              });
            }
            return ResponseHelper.json(cached.feed, 200, origin, {
              etag: cached.etag || "",
              "cache-control": "public, max-age=60, stale-while-revalidate=300",
            });
          }

          const index = await StorageHelper.ensureSeed(bucket, env);
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

          return ResponseHelper.json(finalFeed, 200, origin, {
            etag: finalEtag,
            "cache-control": "public, max-age=60, stale-while-revalidate=300",
          });
        }

        const index = await StorageHelper.ensureSeed(bucket, env);

        // Privileged status queries require authentication
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) {
          return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
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
        return ResponseHelper.json(items, 200, origin);
      }

      if (url.pathname === "/api/eval/quality" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);

        let body = {};
        try {
          body = await request.json();
        } catch {
          return ResponseHelper.json({error: "Invalid JSON payload"}, 400, origin);
        }

        let text = "";
        if (body.slug) {
          const index = await StorageHelper.ensureSeed(bucket, env);
          const meta = index.find((item) => item.slug === body.slug || item.id === body.slug);
          if (meta) {
            let article = await StorageHelper.readJson(bucket, StorageHelper.getArticleObject(meta.id, env), null);
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
          return ResponseHelper.json({error: "No text content provided for quality evaluation"}, 400, origin);
        }

        const jevApiKey =
          body.jevApiKey ||
          request.headers.get("x-typesafe-key") ||
          request.headers.get("x-jev-key") ||
          body.apiKey;

        const clefApiKey =
          body.clefApiKey ||
          request.headers.get("x-clef-key");

        const clefModel = body.clefModel || request.headers.get("x-cf-model") || undefined;

        const rawProvider = (body.provider || request.headers.get("x-eval-provider") || "").toLowerCase().trim();
        const provider = ["jev", "clef", "heuristic"].includes(rawProvider) ? rawProvider : undefined;

        const options = {
          jevApiKey,
          clefApiKey,
          clefModel,
          provider,
        };

        const evalResult = await runQualityEvaluation(text, options, env);
        return ResponseHelper.json(evalResult, 200, origin);
      }

      if (url.pathname === "/api/admin/reset" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user || user.role !== "admin") return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        await StorageHelper.putJson(bucket, StorageHelper.getIndexPath(env), []);
        const redis = getRedisClient(env);
        await invalidateAllArticleCaches(redis);
        return ResponseHelper.json({ok: true, message: "Article repository reset to empty"}, 200, origin);
      }

      if (url.pathname === "/api/admin/reindex" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user || user.role !== "admin") {
          return ResponseHelper.json({error: "Unauthorized: Admin privileges required to reindex articles"}, 401, origin);
        }
        const articles = await StorageHelper.withIndexLock(async () => {
          return await StorageHelper.reconstructIndex(bucket, env);
        });
        const redis = getRedisClient(env);
        await invalidateAllArticleCaches(redis);
        return ResponseHelper.json(
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
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);

        let query = "";
        if (request.method === "GET") {
          query = url.searchParams.get("q") || url.searchParams.get("query") || "";
        } else if (request.method === "POST") {
          try {
            const body = await request.json();
            query = body.q || body.query || "";
          } catch {
            return ResponseHelper.json({error: "Invalid JSON payload"}, 400, origin);
          }
        } else {
          return ResponseHelper.json({error: "Method not allowed"}, 405, origin);
        }

        if (!query.trim()) {
          return ResponseHelper.json({error: "Query parameter 'q' is required"}, 400, origin);
        }

        const serpApiKey = env.SERPAPI_API_KEY || env.SERP_API_KEY;
        if (!serpApiKey) {
          return ResponseHelper.json({error: "SERPAPI_API_KEY is not configured in worker environment"}, 503, origin);
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
            return ResponseHelper.json({error: `SerpApi error: ${serpRes.status}`, details: errText}, 502, origin);
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

          return ResponseHelper.json(
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
          return ResponseHelper.json({error: "Failed to fetch AI search insight"}, 500, origin);
        }
      }

      if (url.pathname === "/api/generate" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) {
          return ResponseHelper.json({error: "Unauthorized: Authentication required to generate articles"}, 401, origin);
        }

        let body = {};
        try {
          body = await request.json();
        } catch {
          return ResponseHelper.json({error: "Invalid JSON payload"}, 400, origin);
        }

        if (!body.topic || !String(body.topic).trim()) {
          return ResponseHelper.json({error: "Field 'topic' is required"}, 400, origin);
        }

        const storageHelpers = {
          bucket,
          readJson: (...args) => StorageHelper.readJson(...args),
          putJson: (...args) => StorageHelper.putJson(...args),
          ensureSeed: (...args) => StorageHelper.ensureSeed(...args),
          slugify: (...args) => StorageHelper.slugify(...args),
          uniqueSlug: (...args) => StorageHelper.uniqueSlug(...args),
          estimateReadTime: (...args) => StorageHelper.estimateReadTime(...args),
          summarize: (...args) => StorageHelper.summarize(...args),
          getIndexPath: (...args) => StorageHelper.getIndexPath(...args),
          getArticleObject: (...args) => StorageHelper.getArticleObject(...args),
          withIndexLock: (...args) => StorageHelper.withIndexLock(...args),
        };

        const result = await generateArticle(body, env, user, storageHelpers);
        const redis = getRedisClient(env);
        await invalidateArticleCaches(redis, { id: result?.article?.id, slug: result?.article?.slug });
        return ResponseHelper.json(result, 201, origin);
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        const user = await AuthHelper.getAuthUser(request, env);
        if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);
        const body = await request.json();

        // Safety verification guardrail & evaluation
        let evalResult = null;
        const payloadText = extractArticleText(body);
        if (payloadText) {
          evalResult = await runQualityEvaluation(payloadText, {}, env);
          if (evalResult?.safety?.verdict && evalResult.safety.verdict !== "safe") {
            return ResponseHelper.json(
              {
                error: "Safety Guardrail Blocked: Article failed safety screening.",
                violations: evalResult.safety.violations,
              },
              422,
              origin
            );
          }
        }

        const article = await StorageHelper.withIndexLock(async () => {
          const index = await StorageHelper.ensureSeed(bucket, env);
          const newArticle = StorageHelper.buildArticle(body, null, user);
          newArticle.evaluation = evalResult || body.evaluation || null;
          newArticle.slug = StorageHelper.uniqueSlug(index, StorageHelper.slugify(body.slug || body.title));
          newArticle.readTime = StorageHelper.estimateReadTime(newArticle.blocks);
          await StorageHelper.putJson(bucket, StorageHelper.getArticleObject(newArticle.id, env), newArticle);
          index.unshift(StorageHelper.summarize(newArticle));
          await StorageHelper.putJson(bucket, StorageHelper.getIndexPath(env), index);
          return newArticle;
        });
        const redis = getRedisClient(env);
        await invalidateArticleCaches(redis, { id: article.id, slug: article.slug });
        return ResponseHelper.json(article, 201, origin);
      }

      // Public read-only intelligence sub-resource (lazy-fetched by the AI Intel tab).
      // Never spawns a Box; mirrors the article GET draft/private gating.
      const intelMatch = url.pathname.match(/^\/api\/articles\/([^/]+)\/intel$/);
      if (intelMatch && request.method === "GET") {
        const key = decodeURIComponent(intelMatch[1]);
        const index = await StorageHelper.ensureSeed(bucket, env);
        const meta = index.find((item) => item.id === key || item.slug === key);
        if (!meta) return ResponseHelper.json({error: "Article not found"}, 404, origin);

        if (meta.published === false || meta.private === true) {
          const user = await AuthHelper.getAuthUser(request, env);
          if (!user) return ResponseHelper.json({error: "Article not found"}, 404, origin);
          const isOwner =
            Boolean(meta.authorEmail) &&
            meta.authorEmail.toLowerCase() === user.email.toLowerCase();
          if (user.role !== "admin" && !isOwner) {
            return ResponseHelper.json({error: "Article not found"}, 404, origin);
          }
        }

        const intel = await peekArticleIntelligence(meta.id, env, {
          bucket,
          readJson: (...args) => StorageHelper.readJson(...args),
        });
        if (!intel) return ResponseHelper.json({error: "No intelligence compiled for this article"}, 404, origin);
        return ResponseHelper.json(intel, 200, origin);
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
              const user = await AuthHelper.getAuthUser(request, env);
              if (!user) return ResponseHelper.json({error: "Article not found"}, 404, origin);
              const isOwner =
                Boolean(cachedArticle.authorEmail) &&
                cachedArticle.authorEmail.toLowerCase() === user.email.toLowerCase();
              if (user.role !== "admin" && !isOwner) {
                return ResponseHelper.json({error: "Article not found"}, 404, origin);
              }
            }
            return ResponseHelper.json(cachedArticle, 200, origin);
          }
        }

        const index = await StorageHelper.ensureSeed(bucket, env);
        const meta = index.find((item) => item.id === key || item.slug === key);
        if (!meta) return ResponseHelper.json({error: "Article not found"}, 404, origin);

        if (request.method === "GET") {
          if (meta.published === false || meta.private === true) {
            const user = await AuthHelper.getAuthUser(request, env);
            if (!user) return ResponseHelper.json({error: "Article not found"}, 404, origin);
            const isOwner =
              Boolean(meta.authorEmail) &&
              meta.authorEmail.toLowerCase() === user.email.toLowerCase();
            if (user.role !== "admin" && !isOwner) {
              return ResponseHelper.json({error: "Article not found"}, 404, origin);
            }
          }
          let article = await StorageHelper.readJson(bucket, StorageHelper.getArticleObject(meta.id, env), null);
          if (!article) {
            article = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }
          if (!article) return ResponseHelper.json({error: "Article not found"}, 404, origin);

          // Dedicated intelligence block retrieval (omitted from normal reader responses)
          if (url.searchParams.get("intelligence") === "true") {
            const user = await AuthHelper.getAuthUser(request, env);
            if (!user) return ResponseHelper.json({error: "Unauthorized: Authentication required to view SERP intelligence"}, 401, origin);
            const isOwner =
              Boolean(meta.authorEmail) &&
              meta.authorEmail.toLowerCase() === user.email.toLowerCase();
            if (user.role !== "admin" && !isOwner) {
              return ResponseHelper.json({error: "Forbidden: You can only view intelligence for your own articles"}, 403, origin);
            }

            const refresh = url.searchParams.get("refresh") === "true";

            try {
              const intelligence = await getOrGenerateArticleIntelligence(
                article,
                env,
                {
                  bucket,
                  readJson: (...args) => StorageHelper.readJson(...args),
                  putJson: (...args) => StorageHelper.putJson(...args),
                },
                {refresh}
              );
              await invalidateArticleCaches(redis, { id: meta.id, slug: meta.slug });
              return ResponseHelper.json({...article, ai_intelligence: intelligence}, 200, origin);
            } catch (intelErr) {
              console.error("[Intelligence Error]:", intelErr);
              return ResponseHelper.json({
                error: "Failed to fetch article intelligence. Please try again later.",
              }, 500, origin);
            }
          }

          // Public readers lazy-fetch the dossier via /intel; expose only a
          // lightweight existence flag so the tab badge renders without the payload.
          const cachedIntel = article.ai_intelligence ||
            (await peekArticleIntelligence(meta.id, env, {
              bucket,
              readJson: (...args) => StorageHelper.readJson(...args),
            }));

          const responseArticle = {
            ...article,
            has_intelligence: Boolean(cachedIntel),
          };
          if (responseArticle.published !== false && responseArticle.private !== true) {
            await setCachedArticle(redis, responseArticle);
          }

          return ResponseHelper.json(
            responseArticle,
            200,
            origin
          );
        }

        if (request.method === "PUT") {
          const user = await AuthHelper.getAuthUser(request, env);
          if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);

          let existing = await StorageHelper.readJson(bucket, StorageHelper.getArticleObject(meta.id, env), null);
          if (!existing) {
            existing = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }
          if (!existing) return ResponseHelper.json({error: "Article not found"}, 404, origin);

          // Enforce ownership check for non-admin authors
          if (user.role !== "admin") {
            const existingEmail = (existing.authorEmail || "").toLowerCase();
            if (!existingEmail || existingEmail !== user.email.toLowerCase()) {
              return ResponseHelper.json({error: "Forbidden: You can only edit your own articles"}, 403, origin);
            }
          }

          const body = await request.json();

          // Safety verification guardrail & evaluation
          let evalResult = null;
          const payloadText = extractArticleText(body);
          if (payloadText) {
            evalResult = await runQualityEvaluation(payloadText, {}, env);
            if (evalResult?.safety?.verdict && evalResult.safety.verdict !== "safe") {
              return ResponseHelper.json(
                {
                  error: "Safety Guardrail Blocked: Article failed safety screening.",
                  violations: evalResult.safety.violations,
                },
                422,
                origin
              );
            }
          }

          const updatedArticle = await StorageHelper.withIndexLock(async () => {
            const index = await StorageHelper.ensureSeed(bucket, env);
            const article = StorageHelper.buildArticle(body, existing, user);
            article.evaluation = evalResult || body.evaluation || existing.evaluation || null;
            article.authorEmail = existing.authorEmail || user.email; // Preserved immutably
            article.slug = StorageHelper.uniqueSlug(
              index,
              StorageHelper.slugify(body.slug || body.title || existing.slug),
              existing.id
            );
            article.readTime = StorageHelper.estimateReadTime(article.blocks);
            await StorageHelper.putJson(bucket, StorageHelper.getArticleObject(existing.id, env), article);
            await StorageHelper.putJson(
              bucket,
              StorageHelper.getIndexPath(env),
              index.map((item) => (item.id === existing.id ? StorageHelper.summarize(article) : item))
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
          return ResponseHelper.json(updatedArticle, 200, origin);
        }

        if (request.method === "DELETE") {
          const user = await AuthHelper.getAuthUser(request, env);
          if (!user) return ResponseHelper.json({error: "Unauthorized"}, 401, origin);

          let existing = await StorageHelper.readJson(bucket, StorageHelper.getArticleObject(meta.id, env), null);
          if (!existing) {
            existing = seedArticles.find((item) => item.id === meta.id || item.slug === meta.slug) || null;
          }

          // Enforce ownership check for non-admin authors
          if (user.role !== "admin") {
            const existingEmail = (existing?.authorEmail || meta.authorEmail || "").toLowerCase();
            if (!existingEmail || existingEmail !== user.email.toLowerCase()) {
              return ResponseHelper.json({error: "Forbidden: You can only delete your own articles"}, 403, origin);
            }
          }

          await StorageHelper.withIndexLock(async () => {
            try {
              await bucket.del(StorageHelper.getArticleObject(meta.id, env));
            } catch {
              // already gone
            }
            const index = await StorageHelper.ensureSeed(bucket, env);
            await StorageHelper.putJson(
              bucket,
              StorageHelper.getIndexPath(env),
              index.filter((item) => item.id !== meta.id)
            );
          });
          await invalidateArticleCaches(redis, { id: meta.id, slug: meta.slug });
          return ResponseHelper.json({ok: true}, 200, origin);
        }
      }

      return ResponseHelper.json({error: "Not found"}, 404, origin);
    } catch (error) {
      console.error("Worker error:", error);
      return ResponseHelper.json({error: "Internal server error"}, 500, origin);
    }
  },
};
