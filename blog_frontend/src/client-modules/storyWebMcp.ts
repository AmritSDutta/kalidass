import {getArticle, getArticleIntelligence, getArticleBooks, getArticleResearch, getAuthMe} from "../lib/api";
import type {Article, AiIntelligence, BooksSuggestionData, ResearchSuggestionData, Block} from "../lib/types";
import type {WebMcpTool} from "./webmcpShared";
import {getBrowserStorySlug} from "./webmcpShared";
import {formatResearchSuggestionPayload} from "./researchWebMcp";

export interface StoryWebMcpDeps {
  getArticleFn?: typeof getArticle;
  getIntelligenceFn?: typeof getArticleIntelligence;
  getArticleBooksFn?: typeof getArticleBooks;
  getArticleResearchFn?: typeof getArticleResearch;
  getAuthMeFn?: typeof getAuthMe;
  currentPathname?: string;
  adminTokenOverride?: string | null;
}

export interface StoryResolution {
  article: Article;
  intel: AiIntelligence | null;
}

// Module-level pending snapshot for composing consecutive enhancements in the same session
let pendingStaged: Article | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("kalidass:stage-clear", () => {
    pendingStaged = null;
  });
}

export function clearPendingStaged(): void {
  pendingStaged = null;
}

/**
 * Strips raw markdown tokens and normalizes text into humanized plain prose.
 * Removes heading markers, asterisks, underscores, bullets, and blockquote arrows.
 */
export function humanizeSectionText(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^[\*\-\+]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

const HIGHLIGHT_LINES_PATTERN = /^\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*$/;

export function validateEnhancedBlocks(blocks: unknown[]): {valid: true} | {valid: false; error: string} {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") {
      return {valid: false, error: `enhancedBlocks[${i}]: block must be an object.`};
    }
    const blk = b as Record<string, unknown>;
    const type = blk.type;
    if (type === "paragraph" || type === "heading" || type === "quote" || type === "code") {
      if (typeof blk.text !== "string" || !blk.text.trim()) {
        return {valid: false, error: `enhancedBlocks[${i}]: ${type} block requires a non-empty text string.`};
      }
      if (
        type === "code" &&
        blk.highlightLines !== undefined &&
        blk.highlightLines !== "" &&
        (typeof blk.highlightLines !== "string" || !HIGHLIGHT_LINES_PATTERN.test(blk.highlightLines.trim()))
      ) {
        return {valid: false, error: `enhancedBlocks[${i}]: code block highlightLines must be comma-separated line ranges like "1, 4-6".`};
      }
    } else if (type === "image" || type === "video") {
      if (typeof blk.url !== "string" || !blk.url.trim()) {
        return {valid: false, error: `enhancedBlocks[${i}]: ${type} block requires a non-empty url string.`};
      }
    } else {
      return {valid: false, error: `enhancedBlocks[${i}]: invalid block type '${String(type)}'. Allowed: paragraph, heading, quote, image, video, code.`};
    }
  }
  return {valid: true};
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
   * Tool: getStoryBookSuggestions
   * Returns curated Amazon book recommendations and literature details for the current story.
   */
  async getStoryBookSuggestions(args?: {slug?: string}): Promise<
    StoryToolResult<{
      query: string;
      topic: string;
      total: number;
      scoredBy?: string;
      books: Array<{
        title: string;
        authors?: string[];
        price?: string;
        rating?: number;
        reviews_count?: number;
        link: string;
        thumbnail?: string;
      }>;
    }>
  > {
    const resolved = await this.resolveForTool(args?.slug);
    if (!resolved.ok) {
      return {available: false, error: resolved.error};
    }
    const {article} = resolved.data;
    const targetSlug = args?.slug || article.slug || getBrowserStorySlug(this.deps.currentPathname) || "";

    let booksData: BooksSuggestionData | null = article.books_suggestions || null;
    if (!booksData && targetSlug) {
      const getBooksFn = this.deps.getArticleBooksFn || getArticleBooks;
      try {
        booksData = await getBooksFn(targetSlug);
      } catch {
        booksData = null;
      }
    }

    if (!booksData || !booksData.books || booksData.books.length === 0) {
      return {
        available: false,
        reason: "No book suggestions available for this story.",
      };
    }

    return {
      available: true,
      query: booksData.query,
      topic: booksData.topic,
      total: booksData.books.length,
      scoredBy: booksData.scoredBy,
      books: booksData.books.map((b) => ({
        title: b.title,
        authors: b.authors,
        price: b.price,
        rating: b.rating,
        reviews_count: b.reviews_count,
        link: b.link,
        thumbnail: b.thumbnail,
      })),
    };
  }

  /**
   * Tool: getStoryResearchPapers
   * Returns relevant arXiv academic papers and preprint suggestions for the current story page (/story/:slug).
   */
  async getStoryResearchPapers(args?: {
    slug?: string;
  }): Promise<
    StoryToolResult<{
      query: string;
      topic: string;
      total: number;
      scoredBy?: string;
      papers: Array<{
        id: string;
        title: string;
        authors: string;
        summary: string;
        links: {
          abstract: string;
          pdf?: string;
        };
        published?: string;
        primaryCategory?: string | null;
        score?: number;
      }>;
    }>
  > {
    const resolved = await this.resolveForTool(args?.slug);
    if (!resolved.ok) {
      return {available: false, error: resolved.error};
    }
    const {article} = resolved.data;
    const targetSlug = args?.slug || article.slug || getBrowserStorySlug(this.deps.currentPathname) || "";

    let researchData: ResearchSuggestionData | null = article.research_suggestions || null;
    if (!researchData && targetSlug) {
      const getResearchFn = this.deps.getArticleResearchFn || getArticleResearch;
      try {
        researchData = await getResearchFn(targetSlug);
      } catch {
        researchData = null;
      }
    }

    if (!researchData || !researchData.papers || researchData.papers.length === 0) {
      return {
        available: false,
        reason: "No research papers available for this story.",
      };
    }

    return {
      available: true,
      ...formatResearchSuggestionPayload(researchData),
    };
  }

  /**
   * Tool 5: enhanceStoryContent
   * Enhances textual blog content (headings, paragraphs, quotes) on the story page.
   * Target story is strictly resolved from window.location (/story/:slug).
   * Enforces privilege: caller must be the author or an elevated admin.
   * Staged transiently into the page session via 'kalidass:stage-enhancement' custom event.
   */
  async enhanceStoryContent(args?: {
    instruction?: string;
    sectionHeading?: string;
    addNewSection?: boolean;
    blockIndex?: number;
    enhancedText?: string;
    enhancedBlocks?: Block[];
  }): Promise<
    StoryToolResult<{
      ok: true;
      staged: true;
      slug: string;
      dirtyIndices: number[];
      updatedIndices: number[];
      articleTitle: string;
      message: string;
    }>
  > {
    const routeSlug = getBrowserStorySlug(this.deps.currentPathname);
    if (!routeSlug) {
      return {available: false, error: "Tool only available on a story page (/story/:slug)."};
    }

    let article: Article;
    try {
      const getFn = this.deps.getArticleFn || getArticle;
      article = await getFn(routeSlug);
    } catch (err) {
      return {
        available: false,
        error: `Story lookup failed for '${routeSlug}': ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }

    // Check edit privileges
    const getMeFn = this.deps.getAuthMeFn || getAuthMe;
    let authUser: {email?: string; role?: string} | null = null;
    const adminToken =
      this.deps.adminTokenOverride !== undefined
        ? this.deps.adminTokenOverride
        : typeof window !== "undefined"
          ? localStorage.getItem("kalidass-admin-token")
          : null;

    try {
      const meRes = await getMeFn(undefined, adminToken || undefined);
      if (meRes?.user) {
        authUser = meRes.user;
      }
    } catch {
      authUser = null;
    }

    const isAuthor =
      Boolean(authUser?.email && article.authorEmail) &&
      authUser!.email!.toLowerCase().trim() === article.authorEmail.toLowerCase().trim();
    const isAdmin = authUser?.role === "admin";

    if (!isAuthor && !isAdmin) {
      return {
        available: false,
        error: "Not privileged to change: you must be the author or an admin to enhance this story.",
      };
    }

    // Compose on top of any already staged edits for this slug
    const baseArticle =
      pendingStaged && pendingStaged.slug === routeSlug ? pendingStaged : article;
    const existingBlocks = [...(baseArticle.blocks || [])];
    const dirtyIndices: number[] = [];

    if (args?.addNewSection) {
      const headingText = humanizeSectionText(args?.sectionHeading || "New Section");
      const bodyText = humanizeSectionText(args?.enhancedText || "");
      const newBlocks: Block[] = [{type: "heading", text: headingText}];
      if (bodyText) {
        newBlocks.push({type: "paragraph", text: bodyText});
      }
      const insertIdx =
        typeof args?.blockIndex === "number" && args.blockIndex >= 0 && args.blockIndex <= existingBlocks.length
          ? args.blockIndex
          : existingBlocks.length;
      existingBlocks.splice(insertIdx, 0, ...newBlocks);
      for (let i = 0; i < newBlocks.length; i++) {
        dirtyIndices.push(insertIdx + i);
      }
    } else if (Array.isArray(args?.enhancedBlocks) && args!.enhancedBlocks.length > 0) {
      const sanitizedBlocks: Block[] = args!.enhancedBlocks.map((b) => {
        if (b.type === "paragraph" || b.type === "heading") {
          return {...b, text: humanizeSectionText(b.text)};
        }
        return b;
      });
      const validation = validateEnhancedBlocks(sanitizedBlocks);
      if (!validation.valid) {
        return {available: false, error: validation.error};
      }
      if (typeof args?.blockIndex === "number" && args.blockIndex >= 0 && args.blockIndex <= existingBlocks.length) {
        const insertIndex = args.blockIndex;
        existingBlocks.splice(insertIndex, 1, ...sanitizedBlocks);
        for (let i = 0; i < sanitizedBlocks.length; i++) {
          dirtyIndices.push(insertIndex + i);
        }
      } else {
        const startIdx = existingBlocks.length;
        existingBlocks.push(...sanitizedBlocks);
        for (let i = 0; i < sanitizedBlocks.length; i++) {
          dirtyIndices.push(startIdx + i);
        }
      }
    } else if (typeof args?.enhancedText === "string" && args.enhancedText.trim()) {
      const textToUse = humanizeSectionText(args.enhancedText);
      let targetIdx = -1;

      if (typeof args?.blockIndex === "number" && args.blockIndex >= 0 && args.blockIndex < existingBlocks.length) {
        targetIdx = args.blockIndex;
      } else if (args?.sectionHeading) {
        const headingQuery = args.sectionHeading.toLowerCase().trim();
        targetIdx = existingBlocks.findIndex(
          (b) => b.type === "heading" && (b.text || "").toLowerCase().trim().includes(headingQuery)
        );
        if (targetIdx === -1) {
          const availableHeadings = existingBlocks
            .filter((b) => b.type === "heading")
            .map((b) => b.text || "")
            .filter(Boolean);
          return {
            available: false,
            error: `No heading matching '${args.sectionHeading}'. To add a new section, set addNewSection: true. Available headings: ${availableHeadings.length ? availableHeadings.join(" | ") : "none"}`,
          };
        }
      }

      if (targetIdx >= 0) {
        const targetBlock = existingBlocks[targetIdx];
        // Code blocks keep raw text: markdown stripping would corrupt source (# comments, - bullets).
        const finalText = targetBlock.type === "code" ? args.enhancedText.trim() : textToUse;
        if (targetBlock.type === "image" || targetBlock.type === "video") {
          existingBlocks[targetIdx] = {...targetBlock, caption: textToUse};
        } else {
          existingBlocks[targetIdx] = {...targetBlock, text: finalText};
        }
        dirtyIndices.push(targetIdx);
      } else {
        const newBlock: Block = {type: "paragraph", text: textToUse};
        dirtyIndices.push(existingBlocks.length);
        existingBlocks.push(newBlock);
      }
    } else {
      return {
        available: false,
        error: "No enhancedText or enhancedBlocks provided to stage.",
      };
    }

    const stagedArticle: Article = {
      ...baseArticle,
      blocks: existingBlocks,
    };

    pendingStaged = stagedArticle;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("kalidass:stage-enhancement", {
          detail: {
            stagedArticle,
            dirtyIndices,
            instruction: args?.instruction || "AI Content Enhancement",
          },
        })
      );
    }

    return {
      available: true,
      ok: true,
      staged: true,
      slug: routeSlug,
      dirtyIndices,
      updatedIndices: dirtyIndices,
      articleTitle: article.title,
      message: `Staged enhancements across ${dirtyIndices.length} block(s). Review in preview bar and save to publish.`,
    };
  }

  /**
   * Generates the 5 WebMcpTool schema definitions.
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

    const enhanceSchema = {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "Description of the enhancement rationale (e.g. 'Add empirical citation data to section 2').",
        },
        sectionHeading: {
          type: "string",
          description:
            "Section heading title to locate, update, or add. When adding a section, provide clean humanized text without markdown formatting.",
        },
        addNewSection: {
          type: "boolean",
          description:
            "Set to true when adding a brand new section (creates a heading block and accompanying humanized paragraph block).",
        },
        blockIndex: {
          type: "number",
          description:
            "Optional 0-based block index to target or replace.",
        },
        enhancedText: {
          type: "string",
          description:
            "Humanized, non-markdown editorial text for the section or paragraph. Provide plain humanized prose WITHOUT markdown formatting (no '#', '##', '**', '*', or backticks; UI renders typography natively).",
        },
        enhancedBlocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {type: "string"},
              text: {type: "string"},
              cite: {type: "string"},
              url: {type: "string"},
              caption: {type: "string"},
              language: {type: "string"},
              title: {type: "string"},
              showLineNumbers: {type: "boolean"},
              wrapLines: {type: "boolean"},
              highlightLines: {type: "string"},
            },
            required: ["type"],
          },
          description:
            "Optional full replacement blocks array. For headings and paragraphs, provide humanized non-markdown text.",
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
      {
        name: "getStoryBookSuggestions",
        description:
          "Returns curated Amazon book recommendations and relevant literature for the current story page (/story/:slug).",
        inputSchema: baseSlugSchema,
        parameters: baseSlugSchema,
        execute: (args?: {slug?: string}) => this.getStoryBookSuggestions(args),
      },
      {
        name: "getStoryResearchPapers",
        description:
          "Returns relevant arXiv academic papers and preprint suggestions for the current story page (/story/:slug).",
        inputSchema: baseSlugSchema,
        parameters: baseSlugSchema,
        execute: (args?: {slug?: string}) => this.getStoryResearchPapers(args),
      },
      {
        name: "enhanceStoryContent",
        description:
          "Enhance or add sections on the active story page (/story/:slug). When adding or editing a section, provide humanized, natural, non-markdown text (no raw '#', '##', '**', '*', or bullet characters). Sections render plain humanized typography natively. Target story resolved automatically from URL. Requires author or admin privilege.",
        inputSchema: enhanceSchema,
        parameters: enhanceSchema,
        execute: (args?: {
          instruction?: string;
          sectionHeading?: string;
          addNewSection?: boolean;
          blockIndex?: number;
          enhancedText?: string;
          enhancedBlocks?: Block[];
        }) => this.enhanceStoryContent(args),
      },
    ];
  }
}
