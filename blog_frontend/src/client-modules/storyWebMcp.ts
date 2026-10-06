import {getArticle, getArticleIntelligence} from "../lib/api";
import type {Article, AiIntelligence, Block} from "../lib/types";
import type {WebMcpTool} from "./webmcpShared";
import {getBrowserStorySlug} from "./webmcpShared";

export interface StoryWebMcpDeps {
  getArticleFn?: typeof getArticle;
  getIntelligenceFn?: typeof getArticleIntelligence;
  currentPathname?: string;
}

export interface StoryResolution {
  article: Article;
  intel: AiIntelligence | null;
}

export type StoryToolResult<T> =
  | ({available: true} & T)
  | {available: false; error?: string; reason?: string};

export interface AiOverviewData {
  query: string;
  text?: string;
  snippet?: string;
  references?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    source?: string;
  }>;
}

export interface CitationItem {
  index: number;
  text: string;
  cite?: string;
}

export interface VideoItem {
  url: string;
  title?: string;
  caption?: string;
  source: "hero" | "body";
}

export interface PeopleAlsoAskItem {
  question: string;
  snippet?: string;
  link?: string;
}

export class StoryWebMcp {
  private deps: StoryWebMcpDeps;

  constructor(deps: StoryWebMcpDeps = {}) {
    this.deps = deps;
  }

  /**
   * Resolves the active article and associated intelligence dossier.
   * Prioritizes explicit argument slug, falling back to current window /story/:slug route.
   * Returns null when no story context exists; throws when a known slug fails to load.
   */
  async resolveStory(slugArg?: string): Promise<StoryResolution | null> {
    const getFn = this.deps.getArticleFn || getArticle;
    const getIntelFn = this.deps.getIntelligenceFn || getArticleIntelligence;
    const routeSlug = getBrowserStorySlug(this.deps.currentPathname);
    const targetSlug = (slugArg || "").trim() || routeSlug;

    if (!targetSlug) {
      return null;
    }

    let article: Article;
    try {
      article = await getFn(targetSlug);
    } catch (err) {
      throw new Error(
        `Story lookup failed for '${targetSlug}': ${err instanceof Error ? err.message : "unknown error"}`
      );
    }

    let intel: AiIntelligence | null = article.ai_intelligence || null;

    // Lazy-fetch stored dossier if not embedded in article payload
    if (!intel && article.has_intelligence) {
      try {
        intel = await getIntelFn(targetSlug);
      } catch {
        intel = null;
      }
    }

    return {article, intel};
  }

  /**
   * Shared tool-side resolution wrapper: distinguishes "no story context"
   * from "story lookup failed" so agents get an accurate diagnosis.
   */
  private async resolveForTool(
    slugArg?: string
  ): Promise<{ok: true; data: StoryResolution} | {ok: false; error: string}> {
    try {
      const data = await this.resolveStory(slugArg);
      if (!data) {
        return {ok: false, error: "Tool only available on a story page (/story/:slug)."};
      }
      return {ok: true, data};
    } catch (err) {
      return {ok: false, error: err instanceof Error ? err.message : "Story lookup failed."};
    }
  }

  /**
   * Tool 1: getStoryAiOverview
   * Extracts AI Overview from the story's intelligence dossier.
   */
  async getStoryAiOverview(args?: {slug?: string}): Promise<StoryToolResult<AiOverviewData>> {
    const resolved = await this.resolveForTool(args?.slug);
    if (!resolved.ok) {
      return {available: false, error: resolved.error};
    }
    const {article, intel} = resolved.data;

    const overview = intel?.ai_overview;
    const text = overview?.text || overview?.snippet;
    const expandedBlocks = overview?.expanded?.text_blocks || [];
    const expandedText = expandedBlocks.map((b) => b.snippet || b.text).filter(Boolean).join("\n\n");
    const combinedText = (text || expandedText || "").trim();
    const references = overview?.expanded?.references || overview?.references || [];

    if (!combinedText && references.length === 0) {
      return {
        available: false,
        reason: "No AI overview available for this story.",
      };
    }

    return {
      available: true,
      query: intel?.query || article.title,
      text: combinedText,
      snippet: overview?.snippet,
      references: references.map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        source: r.source,
      })),
    };
  }

  /**
   * Tool 2: getStoryCitations
   * Extracts paper citations and empirical reference blocks from the article.
   */
  async getStoryCitations(args?: {
    slug?: string;
  }): Promise<StoryToolResult<{count: number; citations: CitationItem[]}>> {
    const resolved = await this.resolveForTool(args?.slug);
    if (!resolved.ok) {
      return {available: false, error: resolved.error};
    }

    const blocks = resolved.data.article.blocks || [];
    const citations: CitationItem[] = [];

    // Scan for quote blocks following "References" / "Attribution" headings, or quotes with cites
    let underReferencesSection = false;

    blocks.forEach((block: Block) => {
      if (block.type === "heading") {
        underReferencesSection = /reference|attribution|sources/i.test(block.text);
      } else if (block.type === "quote") {
        if (underReferencesSection || Boolean(block.cite)) {
          citations.push({
            index: citations.length + 1,
            text: block.text,
            cite: block.cite,
          });
        }
      }
    });

    if (citations.length === 0) {
      return {
        available: false,
        reason: "No citation blocks found in this story.",
      };
    }

    return {
      available: true,
      count: citations.length,
      citations,
    };
  }

  /**
   * Tool 3: getStoryVideoLinks
   * Extracts top-level hero video and all inline video embed blocks.
   */
  async getStoryVideoLinks(args?: {
    slug?: string;
  }): Promise<StoryToolResult<{count: number; videos: VideoItem[]}>> {
    const resolved = await this.resolveForTool(args?.slug);
    if (!resolved.ok) {
      return {available: false, error: resolved.error};
    }
    const {article} = resolved.data;

    const videos: VideoItem[] = [];

    if (article.videoUrl) {
      videos.push({
        url: article.videoUrl,
        title: article.title,
        source: "hero",
      });
    }

    (article.blocks || []).forEach((block: Block) => {
      if (block.type === "video" && block.url) {
        videos.push({
          url: block.url,
          caption: block.caption,
          source: "body",
        });
      }
    });

    if (videos.length === 0) {
      return {
        available: false,
        reason: "No video embeds or links in this story.",
      };
    }

    return {
      available: true,
      count: videos.length,
      videos,
    };
  }

  /**
   * Tool 4: getPeopleAlsoAsk
   * Extracts "People Also Ask" search questions and answer snippets from intelligence dossier.
   */
  async getPeopleAlsoAsk(args?: {
    slug?: string;
  }): Promise<StoryToolResult<{count: number; questions: PeopleAlsoAskItem[]}>> {
    const resolved = await this.resolveForTool(args?.slug);
    if (!resolved.ok) {
      return {available: false, error: resolved.error};
    }

    const paa = resolved.data.intel?.people_also_ask || [];
    if (paa.length === 0) {
      return {
        available: false,
        reason: "No 'People Also Ask' questions recorded for this story.",
      };
    }

    return {
      available: true,
      count: paa.length,
      questions: paa.map((item) => ({
        question: item.question,
        snippet: item.snippet,
        link: item.link,
      })),
    };
  }

  /**
   * Generates the 4 WebMcpTool schema definitions.
   */
  getToolDefinitions(): WebMcpTool[] {
    const baseSlugSchema = {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description:
            "Optional article slug (defaults automatically to the current active story on /story/:slug).",
        },
      },
    };

    return [
      {
        name: "getStoryAiOverview",
        description:
          "Returns the AI Overview and referenced research sources for the current story page (/story/:slug).",
        inputSchema: baseSlugSchema,
        parameters: baseSlugSchema,
        execute: (args?: {slug?: string}) => this.getStoryAiOverview(args),
      },
      {
        name: "getStoryCitations",
        description:
          "Returns the empirical references, research papers, and attribution quotes cited in the current story.",
        inputSchema: baseSlugSchema,
        parameters: baseSlugSchema,
        execute: (args?: {slug?: string}) => this.getStoryCitations(args),
      },
      {
        name: "getStoryVideoLinks",
        description:
          "Returns all embedded hero and inline video links and metadata for the current story.",
        inputSchema: baseSlugSchema,
        parameters: baseSlugSchema,
        execute: (args?: {slug?: string}) => this.getStoryVideoLinks(args),
      },
      {
        name: "getPeopleAlsoAsk",
        description:
          "Returns 'People Also Ask' questions and concise answer snippets relevant to the current story.",
        inputSchema: baseSlugSchema,
        parameters: baseSlugSchema,
        execute: (args?: {slug?: string}) => this.getPeopleAlsoAsk(args),
      },
    ];
  }
}
