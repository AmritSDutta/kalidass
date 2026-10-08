/**
 * Common types and schema normalizers for the Kalidass Journal Evaluation Pipeline.
 *
 * @typedef {Object} QualitySafetyRisks
 * @property {number} violence
 * @property {number} sexual
 * @property {number} antisocial
 * @property {"safe" | "rejected" | "flagged"} verdict
 * @property {string[]} violations
 *
 * @typedef {Object} QualityEditorialMetrics
 * @property {{ probability: number, label: string }} isAiWritten
 * @property {{ score: number, level: string, confidence: number }} accuracy
 * @property {{ score: number, level: string, confidence: number }} engagement
 * @property {{ choice: string, confidence: number }} editorialReadiness
 *
 * @typedef {Object} QualityEvalResult
 * @property {boolean} ok
 * @property {"typesafe-jev" | "cloudflare-clef" | "local-heuristic"} source
 * @property {QualitySafetyRisks} safety
 * @property {QualityEditorialMetrics} metrics
 * @property {string} summary
 */

/**
 * Extracts unified plain text representation from an article or draft payload.
 * @param {any} payload
 * @returns {string}
 */
export function extractArticleText(payload) {
  if (!payload) return "";
  const parts = [
    payload.title || "",
    payload.subtitle || "",
    payload.excerpt || "",
    payload.text || "",
  ];
  if (Array.isArray(payload.blocks)) {
    for (const b of payload.blocks) {
      if (b.text) parts.push(b.text);
      if (b.caption) parts.push(b.caption);
    }
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

/**
 * Normalizes an evaluation result into the standard QualityEvalResult schema.
 * @param {Object} params
 * @param {"typesafe-jev" | "cloudflare-clef" | "local-heuristic"} [params.source]
 * @param {number} [params.violence]
 * @param {number} [params.sexual]
 * @param {number} [params.antisocial]
 * @param {number} [params.isAiProb]
 * @param {string} [params.aiLabel]
 * @param {number} [params.accuracyScore]
 * @param {string} [params.accuracyLevel]
 * @param {number} [params.accuracyConf]
 * @param {number} [params.engagementScore]
 * @param {string} [params.engagementLevel]
 * @param {number} [params.engagementConf]
 * @param {string} [params.readinessChoice]
 * @param {number} [params.readinessConf]
 * @param {number} [params.threshold]
 * @param {string} [params.summary]
 * @returns {QualityEvalResult}
 */
export function createEvalResult({
  source = "local-heuristic",
  violence = 0.01,
  sexual = 0.01,
  antisocial = 0.01,
  isAiProb = 0.5,
  aiLabel,
  accuracyScore = 3.5,
  accuracyLevel = "competent",
  accuracyConf = 0.85,
  engagementScore = 3.5,
  engagementLevel = "clear",
  engagementConf = 0.85,
  readinessChoice = "ready_for_publication",
  readinessConf = 0.88,
  threshold = 0.55,
  summary,
}) {
  const violations = [];
  if (violence > threshold) violations.push("Violence or harm risk detected");
  if (sexual > threshold) violations.push("Sexually explicit or NSFW content detected");
  if (antisocial > threshold) violations.push("Anti-social, hate, or harassment risk detected");

  const verdict = violations.length === 0 ? "safe" : "rejected";

  const resolvedAiLabel =
    aiLabel ||
    (isAiProb > 0.7
      ? "AI-Synthesized"
      : isAiProb > 0.35
        ? "Hybrid / AI-Assisted"
        : "Human-Authored");

  return {
    ok: true,
    source,
    safety: {
      violence: Number(violence.toFixed(3)),
      sexual: Number(sexual.toFixed(3)),
      antisocial: Number(antisocial.toFixed(3)),
      verdict,
      violations,
    },
    metrics: {
      isAiWritten: {
        probability: Number(isAiProb.toFixed(3)),
        label: resolvedAiLabel,
      },
      accuracy: {
        score: Number(accuracyScore.toFixed(2)),
        level: typeof accuracyLevel === "string" ? accuracyLevel : "competent",
        confidence: Number(accuracyConf.toFixed(2)),
      },
      engagement: {
        score: Number(engagementScore.toFixed(2)),
        level: typeof engagementLevel === "string" ? engagementLevel : "clear",
        confidence: Number(engagementConf.toFixed(2)),
      },
      editorialReadiness: {
        choice: typeof readinessChoice === "string" ? readinessChoice : "ready_for_publication",
        confidence: Number(readinessConf.toFixed(2)),
      },
    },
    summary:
      summary ||
      `Article heuristics: ${typeof accuracyLevel === "string" ? accuracyLevel : "competent"} accuracy, ${typeof engagementLevel === "string" ? engagementLevel : "clear"} prose, ${isAiProb > 0.6 ? "AI-drafted" : "Human-authored"}. Safety: ${verdict}.`,
  };
}
