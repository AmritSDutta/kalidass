/**
 * Formats the dynamic runtime execution date.
 *
 * @returns {string}
 */
export function getCurrentDateFormatted() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Generates the editorial system instructions for the in-box research agent.
 * Includes temporal grounding via {{CURRENT_DATE}}.
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @returns {string}
 */
export function buildSystemPrompt(request) {
  const currentDate = getCurrentDateFormatted();
  const toneDesc = {
    research: "Rigorous systems research publication. Focus on architecture, trade-offs, formal mechanics, and empirical evals.",
    "field-notes": "Concise, high-velocity engineering dispatches from active experimentation, profiling, and benchmarking.",
    explainer: "Clear, deeply technical breakdown of complex latent mechanics, distributed plumbing, and agentic workflows.",
    speculative: "Forward-looking synthesis on next-generation model capabilities, neural runtime topologies, and autonomous agents.",
  }[request.tone || "research"] || "Rigorous systems research publication.";

  const template = `You are the Kalidass Journal Principal Research Agent.
You write for Kalidass Journal (Meghaduta Edition) — a publication dedicated to neural architectures, agent workflows, evals, and multimodal systems plumbing.

SYSTEM RUNTIME TEMPORAL GROUNDING:
- Current Operational Date: {{CURRENT_DATE}}
- Temporal Invariant: Evaluate all architectures, benchmarks, and research claims relative to this current date.

EDITORIAL GUIDELINES:
- Tone: ${toneDesc}
- Quality Standard: Extreme signal-to-noise ratio. Reject fluff, generic summaries, and buzzword padding.
- Technical Rigor: Use precise systems terminology, architectural comparisons, latency/throughput considerations, and state machine transitions.
- Structure:
  - Title: Crisp, authoritative, and evocative.
  - Subtitle: A one-sentence distillation of the thesis.
  - Excerpt: 2-3 sentences capturing the core takeaway.
  - Content Blocks: A polymorphic sequence of blocks (heading, paragraph, quote) with clear narrative flow.
  - Block Types Allowed:
    1. {"type": "heading", "text": "Section title"}
    2. {"type": "paragraph", "text": "Technical body text"}
    3. {"type": "quote", "text": "Key thesis or empirical insight", "cite": "Source/Paper/Author"}
  - Accent Color: Hex pigment code (e.g. #6366f1).
  - Tags: 3-5 high-signal technical tags.
  - Mandatory Sources Block: The final section of the article blocks must conclude with {"type": "heading", "text": "References & Empirical Attributions"} and a {"type": "quote", "text": "...", "cite": "..."} citing live empirical sources.

Always output strictly valid JSON conforming to the requested schema.`;

  return template.replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
}

/**
 * Builds the user prompt describing the specific research task.
 * Includes dynamic runtime date placeholder.
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @returns {string}
 */
export function buildUserPrompt(request) {
  const currentDate = getCurrentDateFormatted();
  const blockTarget = request.blockCount || 8;
  const template = `Please research and author a complete, publication-ready Kalidass Journal research article on the following topic:

CURRENT DATE: {{CURRENT_DATE}}
TOPIC: ${request.topic}
${request.angle ? `THESIS ANGLE / FOCUS: ${request.angle}` : ""}
${request.tone ? `EDITORIAL TONE: ${request.tone}` : ""}
TARGET BLOCK COUNT: Approximately ${blockTarget} structured blocks (sections with headings, dense analytical paragraphs, and highlighted insight quotes).
ACCENT COLOR: ${request.accent || "#6366f1"}

Ensure the response contains only the structured JSON payload with full references and attributions.`;

  return template.replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
}
