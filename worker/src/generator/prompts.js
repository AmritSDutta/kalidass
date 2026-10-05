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

OUTPUT FORMAT REQUIREMENTS:
You MUST respond with a single valid JSON Object adhering strictly to this schema:
{
  "title": "A crisp, authoritative, evocative title",
  "subtitle": "A one-sentence distillation of the thesis",
  "excerpt": "2-3 sentences capturing the core takeaway and technical architecture",
  "tags": ["Systems", "Architecture", "Evals"],
  "accent": "${request.accent || "#6366f1"}",
  "blocks": [
    {"type": "heading", "text": "1. Section Heading"},
    {"type": "paragraph", "text": "Deep technical analysis body text..."},
    {"type": "quote", "text": "Key thesis or empirical insight", "cite": "Source Paper/Specification"}
  ]
}

CRITICAL SCHEMA INVARIANTS:
1. The root MUST be a JSON Object { ... } with keys "title", "subtitle", "excerpt", "tags", "accent", and "blocks".
2. Do NOT output a top-level JSON array [ ... ].
3. Allowed block types in "blocks" are strictly: "heading", "paragraph", and "quote".
4. Do NOT output any image blocks in "blocks" — exactly ONE cover image is generated separately for the article.
5. The final blocks must conclude with {"type": "heading", "text": "References & Empirical Attributions"} and a {"type": "quote", "text": "...", "cite": "..."} citing empirical papers/sources.

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
TARGET BLOCK COUNT: Approximately ${blockTarget} structured blocks (headings, technical paragraphs, and highlighted insight quotes).
ACCENT COLOR: ${request.accent || "#6366f1"}

Ensure the response contains only the structured JSON Object { "title": ..., "subtitle": ..., "excerpt": ..., "tags": [...], "accent": "...", "blocks": [...] } with full references and attributions. Do NOT output a bare JSON array.`;

  return template.replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
}
