import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import {getArticle, listArticles} from "../lib/api";
import type {Article, ArticleSummary} from "../lib/types";

// Types for the W3C WebMCP Specification
export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema?: {
    type: "object";
    properties: Record<string, {type: string; description: string}>;
    required?: string[];
  };
  parameters?: {
    type: "object";
    properties: Record<string, {type: string; description: string}>;
    required?: string[];
  };
  execute: (args: any) => Promise<unknown> | unknown;
}

export interface ModelContextRegistry {
  tools: Record<string, WebMcpTool>;
  registerTool: (tool: WebMcpTool) => void;
  unregisterTool: (name: string) => void;
  listTools: () => Promise<WebMcpTool[]>;
  getTools: () => WebMcpTool[];
}

declare global {
  interface Document {
    modelContext?: ModelContextRegistry;
  }
  interface Navigator {
    modelContext?: ModelContextRegistry;
  }
  interface Window {
    modelContext?: ModelContextRegistry;
  }
}

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

export function initWebMcp(): void {
  if (!ExecutionEnvironment.canUseDOM) return;

  try {
    const context = ensureModelContext();

    const searchSchema = {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search keyword to find in title, subtitle, excerpt, or tags",
        },
        tag: {
          type: "string",
          description: "Optional tag filter (e.g. 'Agents', 'Evals', 'Systems')",
        },
      },
    };

    // Tool 1: searchArticles (Bounded to fixed 5 articles)
    try {
      context.registerTool({
        name: "searchArticles",
        description: "Search Kalidass Journal research articles by text query or tag (returns up to 5 articles).",
        inputSchema: searchSchema,
        parameters: searchSchema,
        execute: async (args: {query?: string; tag?: string}) => {
          const q = (args?.query || "").toLowerCase().trim();
          const targetTag = (args?.tag || "").toLowerCase().trim();
          const articles: ArticleSummary[] = await listArticles();
          const origin = typeof window !== "undefined" ? window.location.origin : "";

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
          description: "The unique URL slug of the article (e.g. 'attention-as-routing')",
        },
      },
      required: ["slug"],
    };

    // Tool 2: readArticle (Returns Direct URL & Summary Metadata)
    try {
      context.registerTool({
        name: "readArticle",
        description: "Get the direct reading URL and summary metadata for a specific article by slug.",
        inputSchema: readSchema,
        parameters: readSchema,
        execute: async (args: {slug: string}) => {
          const slug = (args?.slug || "").trim().replace(/^\/story\//, "").replace(/\/$/, "");
          if (!slug) throw new Error("Argument 'slug' is required.");

          const article: Article = await getArticle(slug);
          const origin = typeof window !== "undefined" ? window.location.origin : "";

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
        },
      });
    } catch (err) {
      console.warn("[WebMCP] Could not register 'readArticle':", err);
    }

    console.log("[WebMCP] Registered in-page tools: searchArticles, readArticle");
  } catch (err) {
    console.warn("[WebMCP] Initialization error:", err);
  }
}

// Auto-run on client bundle load
if (ExecutionEnvironment.canUseDOM) {
  try {
    initWebMcp();
  } catch (err) {
    console.warn("[WebMCP] Auto-init failed:", err);
  }
}