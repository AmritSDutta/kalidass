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
 * Returns the current runtime execution year.
 *
 * @returns {string}
 */
export function getCurrentYear() {
  return new Date().getFullYear().toString();
}

/**
 * Builds a date-aware search query string for Tavily / SerpApi.
 * Incorporates topic, non-negotiable angle directives, and current year for temporal relevance.
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @returns {string}
 */
export function buildSearchQuery(request) {
  const parts = [];

  if (request.topic?.trim()) {
    parts.push(request.topic.trim());
  }

  if (request.angle?.trim()) {
    const condensedAngle = request.angle.replace(/\s+/g, " ").slice(0, 100).trim();
    parts.push(condensedAngle);
  }

  return parts.join(" ");
}

/**
 * Generates the editorial system instructions for the in-box research agent.
 * Includes temporal grounding, strict non-negotiable angle invariant, IEEE/Elsevier
 * standards, beginner-friendly introduction, and elaborated block depth.
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @returns {string}
 */
export function buildSystemPrompt(request) {
  const currentDate = getCurrentDateFormatted();
  const currentYear = getCurrentYear();
  const toneDesc = {
    research: "Rigorous systems research publication. Focus on architecture, trade-offs, formal mechanics, and empirical evals.",
    "field-notes": "Concise, high-velocity engineering dispatches from active experimentation, profiling, and benchmarking.",
    explainer: "Clear, deeply technical breakdown of complex latent mechanics, distributed plumbing, and agentic workflows.",
    speculative: "Forward-looking synthesis on next-generation model capabilities, neural runtime topologies, and autonomous agents.",
  }[request.tone || "research"] || "Rigorous systems research publication.";

  const template = `You are the Kalidass Journal Principal Research Agent.
You write for Kalidass Journal (Meghaduta Edition) — a publication dedicated to neural architectures, agent workflows, evals, and multimodal systems plumbing.

SYSTEM RUNTIME TEMPORAL GROUNDING:
- Current Operational Date: {{CURRENT_DATE}} (Year: {{CURRENT_YEAR}})
- Temporal Invariant: Evaluate all architectures, benchmarks, and research claims relative to this current date.

MANDATORY THESIS ANGLE & DIRECTIVES INVARIANT:
- Top Priority Rule: The user's thesis angle and architectural focus ("angle") is a STRICT NON-NEGOTIABLE INVARIANT.
- If a thesis angle is provided, you MUST explicitly structure the article around it. Every architectural comparison, technical constraint, question, and framework specified in the angle MUST be comprehensively analyzed and directly addressed.
- Never dilute, bypass, or ignore the user's thesis angle in favor of generic topic summaries or tangential web search results. Search results serve strictly as secondary empirical citations to substantiate the user's non-negotiable angle.

EDITORIAL & ACADEMIC STANDARDS:
- Tone: ${toneDesc}
- Academic & Publishing Rigor: Benchmark against IEEE Transactions and Elsevier Computer Science journal publications. Maintain formal precision, structured discourse, precise technical taxonomy, and empirical attribution.
- Developer-Friendly Pragmatism: Bridge theoretical rigor with pragmatic software engineering. Ground abstract concepts in concrete system architectures, runtime mechanics, memory layouts, and practical developer trade-offs. Avoid impenetrable mathematical gatekeeping; prioritize clear, actionable mental models.
- Beginner-Friendly Introduction & Summary: The article excerpt and the opening section (introductory heading and initial paragraph blocks) MUST be welcoming and accessible. Provide clear conceptual intuition, relatable analogies, and articulate *why* the technology matters before descending into deeper systems mechanics.
- Elaborated Technical Block Depth: Every 'paragraph' block must be deeply elaborated and substantive (3-5 comprehensive sentences). Reject superficial 1-sentence summaries. Detail exact data conduits, cache dynamics, state machine transitions, latency/throughput implications, and execution flow causality.
- Quality Standard: Extreme signal-to-noise ratio. Reject fluff, generic summaries, and buzzword padding.

OUTPUT FORMAT REQUIREMENTS:
You MUST respond with a single valid JSON Object adhering strictly to this schema:
{
  "title": "A crisp, authoritative, evocative title (STRICTLY MAXIMUM 4 WORDS)",
  "subtitle": "A one-sentence distillation of the thesis",
  "excerpt": "2-3 beginner-friendly sentences capturing the core intuitive motivation, practical takeaway, and technical architecture",
  "tags": ["Systems", "Architecture", "Evals"],
  "accent": "${request.accent || "#6366f1"}",
  "blocks": [
    {"type": "heading", "text": "1. Section Heading (e.g. Conceptual Foundations & Intuitive Architecture)"},
    {"type": "paragraph", "text": "Accessible introductory foundation establishing the core motivation and conceptual mental model..."},
    {"type": "heading", "text": "2. Section Heading (e.g. Deep Systems Mechanics & Runtime Dynamics)"},
    {"type": "paragraph", "text": "Deep, elaborated technical analysis detailing data conduits, state machines, and cache locality (3-5 dense sentences)..."},
    {"type": "quote", "text": "Key thesis or empirical insight", "cite": "Source Paper/Specification"}
  ]
}

CRITICAL SCHEMA INVARIANTS:
1. The root MUST be a JSON Object { ... } with keys "title", "subtitle", "excerpt", "tags", "accent", and "blocks".
2. Do NOT output a top-level JSON array [ ... ].
3. Allowed block types in "blocks" are strictly: "heading", "paragraph", and "quote".
4. Do NOT output any image blocks in "blocks" — exactly ONE cover image is generated separately for the article.
5. The final blocks must conclude with {"type": "heading", "text": "References & Empirical Attributions"} and a {"type": "quote", "text": "...", "cite": "..."} citing empirical papers/sources.
6. Title Word Limit Invariant: The "title" MUST be strictly 4 words or fewer (maximum 4 words; e.g. "Attention as Routing", "Sparse MoE Plumbing", "Speculative Edge Execution"). Never exceed 4 words.

Always output strictly valid JSON conforming to the requested schema.`;

  return template
    .replace(/\{\{CURRENT_DATE\}\}/g, currentDate)
    .replace(/\{\{CURRENT_YEAR\}\}/g, currentYear);
}

/**
 * Builds the user prompt describing the specific research task.
 * Includes dynamic runtime date placeholder and non-negotiable angle enforcement.
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @returns {string}
 */
export function buildUserPrompt(request) {
  const currentDate = getCurrentDateFormatted();
  const currentYear = getCurrentYear();
  const blockTarget = request.blockCount || 8;

  const template = `Please research and author a complete, publication-ready Kalidass Journal research article on the following topic:

CURRENT DATE: {{CURRENT_DATE}} (Year: {{CURRENT_YEAR}})
TOPIC: ${request.topic}
${request.angle ? `\nCRITICAL NON-NEGOTIABLE THESIS ANGLE & DIRECTIVES (MUST BE FULLY ADDRESSED & EXPANDED):\n${request.angle}\n` : ""}
EDITORIAL TONE: ${request.tone || "research"}
TARGET BLOCK COUNT: Approximately ${blockTarget} structured blocks (headings, technical paragraphs, and highlighted insight quotes).
ACCENT COLOR: ${request.accent || "#6366f1"}

STRUCTURAL & EDITORIAL REQUIREMENTS:
1. Beginner-Friendly Introduction: The excerpt and opening section (heading + initial paragraphs) must introduce the topic intuitively with real-world analogies and motivation for why it matters.
2. Elaborated Technical Depth: Subsequent paragraph blocks must be dense, detailed, and substantive (3-5 comprehensive sentences each), explaining exact mechanisms, runtime dynamics, memory/concurrency trade-offs, and causality.
3. IEEE & Elsevier Rigor + Developer Pragmatism: Adhere to IEEE/Elsevier academic precision, taxonomy, and citations while keeping the narrative directly actionable and developer-friendly.
4. Non-Negotiable Angle Enforcement: If a thesis angle is specified, ensure every single aspect, framework, and constraint in it is deeply explored and featured as the central thesis of the article.
5. Title Word Limit Invariant: The "title" MUST be strictly 4 words or fewer (maximum 4 words). Do not use long descriptive titles.

Ensure the response contains only the structured JSON Object { "title": ..., "subtitle": ..., "excerpt": ..., "tags": [...], "accent": "...", "blocks": [...] } with full references and attributions. Do NOT output a bare JSON array.`;

  return template
    .replace(/\{\{CURRENT_DATE\}\}/g, currentDate)
    .replace(/\{\{CURRENT_YEAR\}\}/g, currentYear);
}
