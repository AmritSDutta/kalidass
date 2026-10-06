import {getArticle, listArticles} from "../lib/api";
import type {Article, ArticleSummary} from "../lib/types";
import {StoryWebMcp} from "./storyWebMcp";
import {getBrowserStorySlug} from "./webmcpShared";
import type {ModelContextRegistry, WebMcpTool} from "./webmcpShared";

export type {ModelContextRegistry, WebMcpTool} from "./webmcpShared";
export {getBrowserStorySlug} from "./webmcpShared";

function ensureModelContext(): ModelContextRegistry {
  const existing =
    (typeof document !== "undefined" && document.modelContext) ||
    navigator.modelContext ||
    window.modelContext;

  if (existing && typeof existing.registerTool === "function") {
    // If an existing registry was provided by the extension, synchronize globals
    if (typeof document !== "undefined" && !document.modelContext) {
      try { (document as any).modelContext = existing; } catch {}
    }
    if (!window.modelContext) {
      window.modelContext = existing;
    }
    return existing;
  }

  const toolsMap: Record<string, WebMcpTool> = {};

  const registry: ModelContextRegistry = {
    tools: toolsMap,
    registerTool(tool: WebMcpTool) {
      if (!tool.inputSchema && tool.parameters) {
        tool.inputSchema = tool.parameters;
      }
      if (!tool.parameters && tool.inputSchema) {
        tool.parameters = tool.inputSchema;
      }
      toolsMap[tool.name] = tool;
    },
    unregisterTool(name: string) {
      delete toolsMap[name];
    },
    async listTools() {
      return Object.values(toolsMap);
    },
    getTools() {
      return Object.values(toolsMap);
    },
  };

  // Attach to document, navigator, and window for full WebMCP Inspector & agent compatibility
  if (typeof document !== "undefined") {
    try {
      (document as any).modelContext = registry;
    } catch {}
  }
  try {
    Object.defineProperty(navigator, "modelContext", {
      value: registry,
      writable: true,
      configurable: true,
    });
  } catch {}
  window.modelContext = registry;

  return registry;
}

export async function executeSearchArticles(
  args?: {query?: string; tag?: string},
  deps: {
    listArticlesFn?: typeof listArticles;
    getArticleFn?: typeof getArticle;
    currentPathname?: string;
    origin?: string;
  } = {}
) {
  const listFn = deps.listArticlesFn || listArticles;
  const getFn = deps.getArticleFn || getArticle;
  const origin =
    deps.origin !== undefined
      ? deps.origin
      : typeof window !== "undefined"
      ? window.location.origin
      : "";
  const currentStorySlug = getBrowserStorySlug(deps.currentPathname);

  // If path starts with /story/ and slug is present, return ONLY this article
  if (currentStorySlug) {
    try {
      const articles = await listFn();
      const matched = articles.find((a) => a.slug === currentStorySlug);
      if (matched) {
        return [
          {
            id: matched.id,
            slug: matched.slug,
            title: matched.title,
            subtitle: matched.subtitle,
            excerpt: matched.excerpt,
            tags: matched.tags,
            readTimeMinutes: matched.readTime,
            publishedAt: matched.publishedAt,
            authorName: matched.author?.name || "Author",
            url: `${origin}/story/${matched.slug}`,
            path: `/story/${matched.slug}`,
          },
        ];
      }
    } catch {
      // Fallback to getArticle if not present in summaries
    }

    try {
      const single = await getFn(currentStorySlug);
      return [
        {
          id: single.id,
          slug: single.slug,
          title: single.title,
          subtitle: single.subtitle,
          excerpt: single.excerpt,
          tags: single.tags,
          readTimeMinutes: single.readTime,
          publishedAt: single.publishedAt,
          authorName: single.author?.name || "Author",
          url: `${origin}/story/${single.slug}`,
          path: `/story/${single.slug}`,
        },
      ];
    } catch {
      return [];
    }
  }

  // Non-story routes (e.g. /magazine, /, /admin) behave strictly AS IS:
  const q = (args?.query || "").toLowerCase().trim();
  const targetTag = (args?.tag || "").toLowerCase().trim();
  const articles: ArticleSummary[] = await listFn();

  return articles
    .filter((item) => {
      const haystack = `${item.title} ${item.subtitle} ${item.excerpt} ${(item.tags || []).join(" ")}`.toLowerCase();
      const matchesQuery = !q || haystack.includes(q);
      const matchesTag =
        !targetTag ||
        (item.tags || []).some((t) => t.toLowerCase() === targetTag);
      return matchesQuery && matchesTag;
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      subtitle: item.subtitle,
      excerpt: item.excerpt,
      tags: item.tags,
      readTimeMinutes: item.readTime,
      publishedAt: item.publishedAt,
      authorName: item.author?.name || "Author",
      url: `${origin}/story/${item.slug}`,
      path: `/story/${item.slug}`,
    }));
}

export async function executeReadArticle(
  args?: {slug?: string},
  deps: {
    getArticleFn?: typeof getArticle;
    currentPathname?: string;
    origin?: string;
  } = {}
) {
  const getFn = deps.getArticleFn || getArticle;
  const origin =
    deps.origin !== undefined
      ? deps.origin
      : typeof window !== "undefined"
      ? window.location.origin
      : "";
  const currentStorySlug = getBrowserStorySlug(deps.currentPathname);
  const slug = (args?.slug || "").trim() || currentStorySlug;

  if (!slug) {
    throw new Error("Argument 'slug' is required.");
  }

  const article: Article = await getFn(slug);

  // Return payload remains identical to default metadata fields
  return {
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle,
    excerpt: article.excerpt,
    url: `${origin}/story/${article.slug}`,
    path: `/story/${article.slug}`,
    publishedAt: article.publishedAt,
    readTimeMinutes: article.readTime,
    tags: article.tags,
    authorName: article.author?.name || "Author",
    authorRole: article.author?.role || "Writer",
  };
}

export function initWebMcp(): void {
  if (typeof window === "undefined") return;

  try {
    const context = ensureModelContext();

    const searchSchema = {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search keyword to find in title, subtitle, excerpt, or tags (returns only current story when on /story/:slug)",
        },
        tag: {
          type: "string",
          description: "Optional tag filter (e.g. 'Agents', 'Evals', 'Systems')",
        },
      },
    };

    // Tool 1: searchArticles (Bounded to fixed 5 articles or isolated story)
    try {
      context.registerTool({
        name: "searchArticles",
        description: "Search Kalidass Journal research articles by text query or tag (returns up to 5 articles, or only the current story on /story/:slug).",
        inputSchema: searchSchema,
        parameters: searchSchema,
        execute: async (args: {query?: string; tag?: string}) => {
          return executeSearchArticles(args);
        },
      });
    } catch (err) {
      console.warn("[WebMCP] Could not register 'searchArticles':", err);
    }

    const readSchema = {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The bare URL slug of the article (e.g. 'attention-as-routing' — not a path or URL; optional if currently viewing /story/:slug)",
        },
      },
    };

    // Tool 2: readArticle (Returns Direct URL & Summary Metadata)
    try {
      context.registerTool({
        name: "readArticle",
        description: "Get the direct reading URL and summary metadata for a specific article by slug (or automatically for the current story on /story/:slug).",
        inputSchema: readSchema,
        parameters: readSchema,
        execute: async (args: {slug?: string}) => {
          return executeReadArticle(args);
        },
      });
    } catch (err) {
      console.warn("[WebMCP] Could not register 'readArticle':", err);
    }

    // Tools 3-6: Story-specific tools via StoryWebMcp
    try {
      const storyWebMcp = new StoryWebMcp();
      for (const tool of storyWebMcp.getToolDefinitions()) {
        try {
          context.registerTool(tool);
        } catch (err) {
          console.warn(`[WebMCP] Could not register '${tool.name}':`, err);
        }
      }
    } catch (err) {
      console.warn("[WebMCP] Could not register story tools:", err);
    }

    console.log(
      "[WebMCP] Registered in-page tools: searchArticles, readArticle, getStoryAiOverview, getStoryCitations, getStoryVideoLinks, getPeopleAlsoAsk"
    );
  } catch (err) {
    console.warn("[WebMCP] Initialization error:", err);
  }
}

export {StoryWebMcp};

// Auto-run on client bundle load
if (typeof window !== "undefined") {
  try {
    initWebMcp();
  } catch (err) {
    console.warn("[WebMCP] Auto-init failed:", err);
  }
}