import {BoxBasedGenerator} from "./box_based_generator.js";
import {GENERATOR_PROVIDERS} from "./types.js";
import {runQualityEvaluation, extractArticleText} from "../eval/index.js";

/** @type {Map<string, import("./types").ArticleGeneratorProvider>} */
const registry = new Map();

// Register default providers
registry.set(GENERATOR_PROVIDERS.UPSTASH_BOX, BoxBasedGenerator);

/**
 * Registers an article generator provider.
 *
 * @param {import("./types").ArticleGeneratorProvider} provider
 */
export function registerGeneratorProvider(provider) {
  if (!provider?.name || typeof provider.generate !== "function") {
    throw new Error("Invalid ArticleGeneratorProvider implementation");
  }
  registry.set(provider.name, provider);
}

/**
 * Retrieves a registered provider by name.
 *
 * @param {string} [name]
 * @returns {import("./types").ArticleGeneratorProvider}
 */
export function getGeneratorProvider(name) {
  const key = (name || GENERATOR_PROVIDERS.UPSTASH_BOX).toLowerCase().trim();
  const provider = registry.get(key);
  if (!provider) {
    throw new Error(`Generator provider '${key}' is not registered`);
  }
  return provider;
}

/**
 * Master orchestrator for generating an article, evaluating it, and saving it as an unlisted draft.
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @param {any} env Cloudflare Worker environment bindings
 * @param {any} user Authenticated admin user
 * @param {Object} storageHelpers
 * @param {any} storageHelpers.bucket
 * @param {(bucket: any, path: string, fallback?: any) => Promise<any>} storageHelpers.readJson
 * @param {(bucket: any, path: string, value: any) => Promise<any>} storageHelpers.putJson
 * @param {(bucket: any, env: any) => Promise<any[]>} storageHelpers.ensureSeed
 * @param {(val: string) => string} storageHelpers.slugify
 * @param {(index: any[], slug: string, ignoreId?: string) => string} storageHelpers.uniqueSlug
 * @param {(blocks: any[]) => number} storageHelpers.estimateReadTime
 * @param {(article: any) => any} storageHelpers.summarize
 * @param {(env: any) => string} storageHelpers.getIndexPath
 * @param {(id: string, env: any) => string} storageHelpers.getArticleObject
 * @returns {Promise<{ok: boolean, article: any, evaluation: any}>}
 */
export async function generateArticle(request, env, user, storageHelpers) {
  const {
    bucket,
    putJson,
    ensureSeed,
    slugify,
    uniqueSlug,
    estimateReadTime,
    summarize,
    getIndexPath,
    getArticleObject,
    withIndexLock,
  } = storageHelpers;

  const providerName = request.provider || GENERATOR_PROVIDERS.UPSTASH_BOX;
  const provider = getGeneratorProvider(providerName);

  // 1. Generate article draft via provider
  const draft = await provider.generate(request, env);

  // 2. Run quality & safety screening (soft-pass: unlisted drafts are reviewed by editors in Studio prior to public publishing)
  const text = extractArticleText(draft);
  const evaluation = await runQualityEvaluation(text, {}, env);

  // 3. Assemble full article object with server-stamped invariants under lock
  const now = new Date().toISOString();
  const articleId = crypto.randomUUID();
  const runner = typeof withIndexLock === "function" ? withIndexLock : (fn) => fn();

  const article = await runner(async () => {
    const index = await ensureSeed(bucket, env);
    const baseSlug = slugify(draft.slug || draft.title || request.topic || "ai-article");
    const slug = uniqueSlug(index, baseSlug);
    const readTime = estimateReadTime(draft.blocks);

    const isSafe = evaluation?.safety?.verdict === "safe";
    const shouldPublish = Boolean(request.publishImmediately) && isSafe;

    const record = {
      ...draft,
      id: articleId,
      slug,
      authorEmail: user?.email || "admin",
      userId: user?.sub || "admin",
      accent: draft.accent || request.accent || "#6366f1",
      readTime,
      published: shouldPublish,
      private: shouldPublish ? false : (request.private ?? true),
      aiGenerated: true,
      publishedAt: shouldPublish ? now : "",
      createdAt: now,
      updatedAt: now,
      evaluation,
      isFallback: Boolean(draft.isFallback),
      fallbackNotice: draft.fallbackNotice || undefined,
    };

    // 4. Automatically persist unlisted draft in Upstash Blob
    await putJson(bucket, getArticleObject(record.id, env), record);
    index.unshift(summarize(record));
    await putJson(bucket, getIndexPath(env), index);
    return record;
  });

  return {
    ok: true,
    article,
    evaluation,
  };
}
