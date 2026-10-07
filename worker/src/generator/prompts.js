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
- Minimum Article Word Count: The whole article MUST be a minimum of 1400 words across its structured content blocks. Ensure thorough, comprehensive elaboration across all sections to satisfy this minimum length.
- Readability & Lucidity: The article MUST be easy to read and understand. Maintain extreme clarity, engaging prose, intuitive mental models, and accessible explanations without sacrificing rigorous technical precision. Avoid impenetrable jargon barriers.
- Section Architecture & Invisible Subsections: Every major section (each section heading and its accompanying paragraph blocks) MUST seamlessly integrate an invisible subsection blueprint addressing these 4 core dimensions in its narrative flow (without creating separate clutter subheadings):
  1. What is this section all about: Crystal-clear statement of the section's core scope, premise, and foundational mental model.
  2. How it helps in the overall article: Explicit connective tissue explaining the section's structural role in advancing the article's broader thesis.
  3. Why it is important: Concrete stakes, failure modes, performance trade-offs, and critical system invariants.
  4. How to use the knowledge: Actionable takeaways, engineering guidelines, and pragmatic guidance for applying the concepts in real-world systems.
- Academic & Publishing Rigor: Benchmark against IEEE Transactions and Elsevier Computer Science journal publications. Maintain formal precision, structured discourse, precise technical taxonomy, and empirical attribution.
- Developer-Friendly Pragmatism: Bridge theoretical rigor with pragmatic software engineering. Ground abstract concepts in concrete system architectures, runtime mechanics, memory layouts, and practical developer trade-offs. Avoid impenetrable mathematical gatekeeping; prioritize clear, actionable mental models.
- Beginner-Friendly Introduction & Summary: The article excerpt and the opening section (introductory heading and initial paragraph blocks) MUST be welcoming and accessible. Provide clear conceptual intuition, relatable analogies, and articulate *why* the technology matters before descending into deeper systems mechanics.
- Elaborated Technical Block Depth: Every 'paragraph' block must be deeply elaborated and substantive (3-5 comprehensive sentences). Reject superficial 1-sentence summaries. Detail exact data conduits, cache dynamics, state machine transitions, latency/throughput implications, and execution flow causality.
- Non-Markdown Humanized Prose Invariant: When authoring or adding sections, all text in 'paragraph' and 'heading' blocks MUST be clean, non-markdown humanized text. Never output raw markdown formatting syntax (no '#', '##', '**', '*', '_', or bullet lists) inside block 'text' fields. The UI typography system renders headings, paragraphs, and styling natively.
- Authentic Human Cadence: Write in an authentic, natural, compelling human editorial voice with conversational fluidity and engineering authority. Strictly avoid formulaic AI clichés and robotic transitions (e.g. 'In conclusion', 'Delving deeper', 'It is crucial to note', 'Furthermore', 'Moreover', 'A testament to', 'Tapestry', 'Beacon', 'Symphony').
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
    {"type": "quote", "text": "Key thesis or empirical insight", "cite": "Source Paper/Specification"},
    {"type": "code", "text": "Minimal working snippet illustrating the mechanism", "language": "python", "title": "snippet.py"}
  ]
}

CRITICAL SCHEMA INVARIANTS:
1. The root MUST be a JSON Object { ... } with keys "title", "subtitle", "excerpt", "tags", "accent", and "blocks".
2. Do NOT output a top-level JSON array [ ... ].
3. Allowed block types in "blocks" are strictly: "heading", "paragraph", "quote", and "code".
4. Do NOT output any image blocks in "blocks" — exactly ONE cover image is generated separately for the article.
5. Code Block Invariant: "code" blocks are optional (at most 2 per article), MUST include a "language" (e.g. "python", "go", "sql"), and may include an optional "title" filename. Use them only when the mechanism is best shown as a short snippet.
6. The final blocks must conclude with {"type": "heading", "text": "References & Empirical Attributions"} and a {"type": "quote", "text": "...", "cite": "..."} citing empirical papers/sources.
7. Title Word Limit Invariant: The "title" MUST be strictly 4 words or fewer (maximum 4 words; e.g. "Attention as Routing", "Sparse MoE Plumbing", "Speculative Edge Execution"). Never exceed 4 words.
8. Article Word Count Invariant: The entire article across all blocks MUST contain a minimum of 1400 words.
9. Non-Markdown Block Text Invariant: All 'heading' and 'paragraph' block text must be clean humanized prose without raw markdown formatting (no '#', '**', '*', or bullet characters inside block text strings).

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
  const blockTarget = request.blockCount || 10;

  const template = `Please research and author a complete, publication-ready Kalidass Journal research article on the following topic:

CURRENT DATE: {{CURRENT_DATE}} (Year: {{CURRENT_YEAR}})
TOPIC: ${request.topic}
${request.angle ? `\nCRITICAL NON-NEGOTIABLE THESIS ANGLE & DIRECTIVES (MUST BE FULLY ADDRESSED & EXPANDED):\n${request.angle}\n` : ""}
EDITORIAL TONE: ${request.tone || "research"}
TARGET BLOCK COUNT: Approximately ${blockTarget} structured blocks (headings, technical paragraphs, and highlighted insight quotes).
ACCENT COLOR: ${request.accent || "#6366f1"}

STRUCTURAL & EDITORIAL REQUIREMENTS:
1. Minimum Word Count (1400+ words): The whole article must be a minimum of 1400 words across all blocks.
2. Readability & Lucidity: The article must be easy to read and understand, with clear explanations, intuitive mental models, and beginner-welcoming prose.
3. Invisible Subsection Architecture Per Section: Each section must organically weave in 4 invisible subsections/facets within its paragraph narrative:
   - What is this section all about (core scope and intuitive premise)
   - How it helps in the overall article (connective role in the broader thesis)
   - Why it is important (stakes, failure modes, trade-offs, and critical system invariants)
   - How to use the knowledge (pragmatic implementation rules and concrete real-world usage)
4. Beginner-Friendly Introduction: The excerpt and opening section (heading + initial paragraphs) must introduce the topic intuitively with real-world analogies and motivation for why it matters.
5. Elaborated Technical Depth: Subsequent paragraph blocks must be dense, detailed, and substantive (3-5 comprehensive sentences each), explaining exact mechanisms, runtime dynamics, memory/concurrency trade-offs, and causality.
6. IEEE & Elsevier Rigor + Developer Pragmatism: Adhere to IEEE/Elsevier academic precision, taxonomy, and citations while keeping the narrative directly actionable and developer-friendly.
7. Non-Negotiable Angle Enforcement: If a thesis angle is specified, ensure every single aspect, framework, and constraint in it is deeply explored and featured as the central thesis of the article.
8. Title Word Limit Invariant: The "title" MUST be strictly 4 words or fewer (maximum 4 words). Do not use long descriptive titles.
9. Non-Markdown Humanized Sections: All section headings and paragraphs must be clean, natural, humanized prose without raw markdown formatting (no '#', '**', '*', or bullet characters inside block text).

Ensure the response contains only the structured JSON Object { "title": ..., "subtitle": ..., "excerpt": ..., "tags": [...], "accent": "...", "blocks": [...] } with full references and attributions. Do NOT output a bare JSON array.`;

  return template
    .replace(/\{\{CURRENT_DATE\}\}/g, currentDate)
    .replace(/\{\{CURRENT_YEAR\}\}/g, currentYear);
}
