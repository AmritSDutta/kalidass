import {Bucket, uniquePath, uploadHandler} from "@upstash/blob";
import {memoryBucket} from "../memory.js";
import {seedArticles} from "../seed.js";

let _indexLock = Promise.resolve();

export class StorageHelper {
  static getRootPrefix(env) {
    const root = env?.ROOT_BUCKET || env?.ROOT_FOLDER || "kalidass";
    return String(root).replace(/^\/+|\/+$/g, "");
  }

  static getIndexPath(env) {
    return `${StorageHelper.getRootPrefix(env)}/index.json`;
  }

  static getArticleObject(id, env) {
    return `${StorageHelper.getRootPrefix(env)}/articles/${id}.json`;
  }

  static blobClient(env) {
    if (env?.UPSTASH_BLOB_TOKEN) {
      return {
        mode: "upstash",
        bucket: new Bucket({token: env.UPSTASH_BLOB_TOKEN, enableTelemetry: false}),
      };
    }
    return {mode: "memory", bucket: memoryBucket()};
  }

  static async readJson(bucket, path, fallback = null) {
    try {
      const res = await bucket.get(path);
      return await new Response(res.body).json();
    } catch {
      return fallback;
    }
  }

  static putJson(bucket, path, value) {
    return bucket.put(path, JSON.stringify(value, null, 2), {
      contentType: "application/json",
      cache: "no-store",
    });
  }

  /**
   * Serializes asynchronous index mutations within the isolate.
   * Guarantees that only one read-modify-write cycle executes at a time.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  static withIndexLock(task) {
    const result = _indexLock.then(() => task(), () => task());
    _indexLock = result.then(() => {}, () => {});
    return result;
  }

  static summarize(article) {
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

  static slugify(value) {
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

  static uniqueSlug(index, slug, ignoreId) {
    let next = slug;
    let i = 2;
    while (index.some((item) => item.slug === next && item.id !== ignoreId)) {
      next = `${slug}-${i}`;
      i += 1;
    }
    return next;
  }

  static estimateReadTime(blocks) {
    const text = (blocks || [])
      .map((block) => block.text || block.caption || "")
      .join(" ");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return Math.max(3, Math.round(words / 180) || 3);
  }

  static async reconstructIndex(bucket, env) {
    const canonicalPath = StorageHelper.getIndexPath(env);
    const rootPrefix = StorageHelper.getRootPrefix(env);

    // 1. Try legacy index paths first if canonical index is empty
    const fallbackPaths = ["journal/index.json", "index.json"];
    for (const fbPath of fallbackPaths) {
      if (fbPath !== canonicalPath) {
        const fbIndex = await StorageHelper.readJson(bucket, fbPath, null);
        if (Array.isArray(fbIndex) && fbIndex.length > 0) {
          await StorageHelper.putJson(bucket, canonicalPath, fbIndex);
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
                const article = await StorageHelper.readJson(bucket, path, null);
                if (article && article.id && !foundArticles.has(article.id)) {
                  foundArticles.set(article.id, StorageHelper.summarize(article));
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
        await StorageHelper.putJson(bucket, canonicalPath, reconstructed);
        return reconstructed;
      }
    }

    return [];
  }

  static async ensureSeed(bucket, env) {
    const indexPath = StorageHelper.getIndexPath(env);
    try {
      const index = await StorageHelper.readJson(bucket, indexPath, null);
      if (Array.isArray(index) && index.length > 0) return index;

      // Self-healing: if index is missing or empty [], check fallback paths or reconstruct from stored files
      const recovered = await StorageHelper.reconstructIndex(bucket, env);
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
          await StorageHelper.putJson(bucket, StorageHelper.getArticleObject(article.id, env), record);
          summaries.push(StorageHelper.summarize(record));
        }
        await StorageHelper.putJson(bucket, indexPath, summaries);
        return summaries;
      }

      // Never overwrite index.json with [] on failed/empty reads
      return Array.isArray(index) ? index : [];
    } catch (err) {
      console.error("Upstash Blob ensureSeed error:", err);
      return [];
    }
  }

  static buildArticle(body, existing, user) {
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

  static uploadsFor(env) {
    const prefix = StorageHelper.getRootPrefix(env);
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
}
