import {describe, it, expect} from "vitest";
import {
  getCurrentDateFormatted,
  getCurrentYear,
  buildSearchQuery,
  buildSystemPrompt,
  buildUserPrompt,
} from "../src/generator/prompts.js";
import {buildPythonAgentScript} from "../src/generator/agent_python.js";
import {buildNodeAgentScript} from "../src/generator/agent_node.js";
import {buildAttachHeaders} from "../src/generator/box_based_generator.js";

describe("Generator Prompts & Non-Negotiable Angle (Hermetic)", () => {
  const currentYear = new Date().getFullYear().toString();
  const currentDate = getCurrentDateFormatted();

  it("getCurrentYear returns current numeric year string", () => {
    const yr = getCurrentYear();
    expect(yr).toBe(currentYear);
  });

  it("buildSearchQuery builds a clean query combining verbatim topic and angle", () => {
    const req = {
      topic: "State Space Models in Production",
      angle: "Selective scan hardware efficiency on Hopper H100 vs FlashAttention-3",
    };
    const query = buildSearchQuery(req);

    expect(query).toContain("State Space Models in Production");
    expect(query).toContain("Selective scan hardware efficiency on Hopper H100");
  });

  it("buildSearchQuery works with topic alone", () => {
    const req = {topic: "PagedAttention"};
    const query = buildSearchQuery(req);
    expect(query).toBe("PagedAttention");
  });

  it("buildSystemPrompt incorporates IEEE/Elsevier, developer pragmatism, beginner introduction, and non-negotiable angle", () => {
    const req = {
      topic: "RadixAttention KV Caching",
      angle: "Prefix matching in multi-turn chat serving",
      tone: "research",
    };
    const sysPrompt = buildSystemPrompt(req);

    // Temporal grounding
    expect(sysPrompt).toContain(`Year: ${currentYear}`);

    // IEEE / Elsevier Academic Standard
    expect(sysPrompt).toContain("IEEE Transactions");
    expect(sysPrompt).toContain("Elsevier Computer Science journal");

    // Developer-friendly pragmatism
    expect(sysPrompt).toContain("Developer-Friendly Pragmatism");
    expect(sysPrompt).toContain("mathematical gatekeeping");

    // Beginner-friendly intro
    expect(sysPrompt).toContain("Beginner-Friendly Introduction & Summary");
    expect(sysPrompt).toContain("analogies");

    // Elaborated block depth
    expect(sysPrompt).toContain("Elaborated Technical Block Depth");
    expect(sysPrompt).toContain("3-5 comprehensive sentences");

    // Non-negotiable thesis angle invariant
    expect(sysPrompt).toContain("MANDATORY THESIS ANGLE & DIRECTIVES INVARIANT");
    expect(sysPrompt).toContain("STRICT NON-NEGOTIABLE INVARIANT");

    // Title word limit invariant
    expect(sysPrompt).toContain("Title Word Limit Invariant");
    expect(sysPrompt).toContain("STRICTLY MAXIMUM 4 WORDS");
  });

  it("buildUserPrompt incorporates critical non-negotiable thesis angle and structural directives", () => {
    const req = {
      topic: "RadixAttention KV Caching",
      angle: "Radix trees vs hash tables with concrete memory overhead benchmarks",
      blockCount: 12,
    };
    const userPrompt = buildUserPrompt(req);

    expect(userPrompt).toContain("TOPIC: RadixAttention KV Caching");
    expect(userPrompt).toContain("CRITICAL NON-NEGOTIABLE THESIS ANGLE & DIRECTIVES");
    expect(userPrompt).toContain("Radix trees vs hash tables with concrete memory overhead benchmarks");
    expect(userPrompt).toContain("Beginner-Friendly Introduction");
    expect(userPrompt).toContain("Elaborated Technical Depth");
    expect(userPrompt).toContain("IEEE & Elsevier Rigor + Developer Pragmatism");
    expect(userPrompt).toContain("Non-Negotiable Angle Enforcement");
    expect(userPrompt).toContain("Title Word Limit Invariant");
    expect(userPrompt).toContain("strictly 4 words or fewer");
    expect(userPrompt).toContain("Approximately 12 structured blocks");
  });

  it("buildPythonAgentScript embeds Firecrawl and Tavily (70/30 ratio), excludes SerpApi, and milder vibrant infographic styling", () => {
    const req = {
      topic: "Sparse Autoencoders",
      angle: "Feature dictionary steering in language models with top-k activation sparsification",
    };
    const script = buildPythonAgentScript(req, {});

    // Search query & 70/30 weight
    expect(script).toContain("search_web(");
    expect(script).toContain("Sparse Autoencoders");
    expect(script).toContain("firecrawl_weight = 70");

    // Firecrawl and Tavily integration
    expect(script).toContain("search_firecrawl(");
    expect(script).toContain("api.firecrawl.dev");
    expect(script).toContain("search_tavily(");
    expect(script).toContain('"time_range": "year"');

    // SerpApi exclusion from article generator
    expect(script).not.toContain("search_serpapi");
    expect(script).not.toContain("serpapi.com");

    // Attribution
    expect(script).toContain("Autonomous Research Tooling (Firecrawl/Tavily)");

    // Anti-recency reminder
    expect(script).toContain("MANDATORY REMINDER");
    expect(script).toContain("NON-NEGOTIABLE INVARIANT");
    expect(script).toContain("Do not allow search citations to override or dilute");

    // Milder vibrant infographic styling with whitish background
    expect(script).toContain("MILDER, VIBRANT COLOR SHADES");
    expect(script).toContain("whitish background");
    expect(script).toContain("IEEE / Elsevier");
  });

  it("buildNodeAgentScript embeds Firecrawl and Tavily (70/30 ratio), excludes SerpApi, and milder vibrant infographic styling", () => {
    const req = {
      topic: "Sparse Autoencoders",
      angle: "Feature dictionary steering in language models with top-k activation sparsification",
    };
    const script = buildNodeAgentScript(req, {});

    // Search query & 70/30 weight
    expect(script).toContain("searchWeb(");
    expect(script).toContain("Sparse Autoencoders");
    expect(script).toContain("firecrawlWeight = 70");

    // Firecrawl and Tavily integration
    expect(script).toContain("searchFirecrawl(");
    expect(script).toContain("api.firecrawl.dev");
    expect(script).toContain("searchTavily(");
    expect(script).toContain('time_range: "year"');

    // SerpApi exclusion from article generator
    expect(script).not.toContain("searchSerpApi");
    expect(script).not.toContain("serpapi.com");

    // Attribution
    expect(script).toContain("Autonomous Research Tooling (Firecrawl/Tavily)");

    // Anti-recency reminder
    expect(script).toContain("MANDATORY REMINDER");
    expect(script).toContain("NON-NEGOTIABLE INVARIANT");
    expect(script).toContain("Do not allow search citations to override or dilute");

    // Milder vibrant infographic styling with whitish background
    expect(script).toContain("MILDER, VIBRANT COLOR SHADES");
    expect(script).toContain("whitish background");
    expect(script).toContain("IEEE / Elsevier");
  });

  it("buildAttachHeaders injects Firecrawl header and isolates SerpApi from generator", () => {
    const env = {
      FIRECRAWL_API_KEY: "fc-test-key",
      TAVILY_API_KEY: "tv-test-key",
      SERPAPI_API_KEY: "serp-secret",
    };
    const headers = buildAttachHeaders(env, {});

    expect(headers["api.firecrawl.dev"]).toEqual({
      Authorization: "Bearer fc-test-key",
    });
    expect(headers["api.tavily.com"]).toEqual({
      Authorization: "Bearer tv-test-key",
    });
    // SerpApi is preserved exclusively for AI intelligence dossiers
    expect(headers["serpapi.com"]).toBeUndefined();
  });
});
