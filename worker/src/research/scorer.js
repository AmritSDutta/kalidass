export const PAPER_SCORE_CRITERIA = [
  "Not an academic research paper or completely irrelevant to the topic",
  "Tangentially related preprint or weak theoretical overlap",
  "Relevant research paper addressing aspects of the topic",
  "Highly relevant, authoritative paper presenting core methodologies or empirical findings on this topic",
  "Foundational, seminal, or definitive research paper on this topic"
];

/**
 * Checks if a candidate item is a valid academic preprint.
 *
 * @param {{ title?: string, summary?: string, id?: string }} item
 * @returns {boolean}
 */
export function isPaperDeterministic(item) {
  return Boolean(item?.title && (item?.id || item?.summary));
}

/**
 * Heuristic topic relevance scorer for candidate papers.
 *
 * @param {{ title: string, summary?: string }} item
 * @param {string} topic
 * @returns {{ isPaperConfidence: number, topicSimilarity: number, score: number }}
 */
export function scoreItemHeuristic(item, topic) {
  const isPaper = isPaperDeterministic(item);
  const text = `${item?.title || ""} ${item?.summary || ""}`.toLowerCase();
  const topicTokens = String(topic || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);

  let matchCount = 0;
  for (const token of topicTokens) {
    if (text.includes(token)) matchCount += 1;
  }

  const topicSimilarity = topicTokens.length > 0
    ? Math.min(1.0, matchCount / Math.max(1, topicTokens.length))
    : 0.50;

  const paperConfidence = isPaper ? 0.95 : 0.20;
  const score = parseFloat((paperConfidence * 0.3 + topicSimilarity * 0.7).toFixed(3));

  return {
    isPaperConfidence: parseFloat(paperConfidence.toFixed(2)),
    topicSimilarity: parseFloat(topicSimilarity.toFixed(2)),
    score,
  };
}

/**
 * Parses score level from model response.
 *
 * @param {any} qResult
 * @param {string[]} [criteria]
 * @returns {{ isPaperConfidence: number, topicSimilarity: number, score: number }}
 */
export function parseUnifiedScore(qResult, criteria = PAPER_SCORE_CRITERIA) {
  if (!qResult) {
    return { isPaperConfidence: 0.0, topicSimilarity: 0.0, score: 0.0 };
  }

  const topLevel = Math.max(1, criteria.length - 1);
  const rawAnswer = qResult?.answer ?? qResult?.choice ?? qResult?.score ?? qResult?.value;
  const probLevel0 = qResult?.probabilities?.["0"];

  let norm = null;
  if (typeof rawAnswer === "number" && !isNaN(rawAnswer)) {
    norm = Math.max(0.0, Math.min(1.0, rawAnswer > 1 ? rawAnswer / topLevel : rawAnswer));
  } else {
    const strAnswer = String(rawAnswer || "").trim().toLowerCase();
    const exactIndex = criteria.findIndex((c) => c.toLowerCase() === strAnswer);
    if (exactIndex !== -1) {
      norm = exactIndex / topLevel;
    } else {
      const numMatch = strAnswer.match(/(\d+(\.\d+)?)/);
      if (numMatch) {
        const parsed = parseFloat(numMatch[1]);
        norm = parsed > 1 ? Math.min(1.0, parsed / topLevel) : Math.min(1.0, parsed);
      }
    }
  }

  // Fail closed: an unparsable model verdict scores 0 and cannot clear the 0.40 admission gates.
  if (norm === null) {
    return { isPaperConfidence: 0.0, topicSimilarity: 0.0, score: 0.0 };
  }

  // The model's level-0 probability ("not a relevant paper") gates confidence independently of the score.
  const isPaperConfidence = typeof probLevel0 === "number"
    ? (probLevel0 > 0.5 ? 0.2 : 0.95)
    : (norm >= 0.4 ? 0.95 : 0.2);

  return {
    isPaperConfidence,
    topicSimilarity: parseFloat(norm.toFixed(3)),
    score: parseFloat(norm.toFixed(3)),
  };
}

/**
 * Evaluates candidate research papers using TypeSafe Jev System One.
 *
 * @param {any[]} candidates
 * @param {string} topic
 * @param {any} env
 * @returns {Promise<any[]>}
 */
export async function scorePapersJevBatch(candidates, topic, env) {
  const apiKey = env?.TYPESAFE_API_KEY || env?.JEV_API_KEY;
  if (!apiKey) throw new Error("Missing TYPESAFE_API_KEY");

  const state = `Topic: "${topic}"\n\nCandidate Papers:\n` +
    candidates.map((item, idx) => {
      const authors = Array.isArray(item.authors) ? item.authors.map((a) => a.name).filter(Boolean).join(", ") : "";
      return `Item ${idx}: "${item.title}" by ${authors || "Unknown"}. Abstract: ${item.summary || "None"}`;
    }).join("\n\n");

  const questions = {};
  candidates.forEach((_, idx) => {
    questions[`item_${idx}`] = {
      type: "score",
      instructions: `Evaluate whether Item ${idx} is an authoritative academic paper relevant to "${topic}".`,
      criteria: PAPER_SCORE_CRITERIA,
    };
  });

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "jev-latest",
      state,
      questions,
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const raw = await res.json();
  const data = raw?.results || raw?.answers || raw;

  return candidates.map((item, idx) => {
    const qResult = data?.[`item_${idx}`] || data?.answers?.[`item_${idx}`] || data?.results?.[`item_${idx}`];
    const scoreVal = parseUnifiedScore(qResult, PAPER_SCORE_CRITERIA);
    return { ...item, ...scoreVal };
  });
}

/**
 * Scores candidate research papers using Cloudflare Clef / Workers AI fallback.
 *
 * @param {any[]} candidates
 * @param {string} topic
 * @param {any} env
 * @returns {Promise<any[]>}
 */
export async function scorePapersClefBatch(candidates, topic, env) {
  const apiKey = env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY;
  const accountId = env?.CLOUDFLARE_ACCOUNT_ID;
  const model = env?.CLEF_MODEL || "@cf/meta/llama-3.1-8b-instruct";

  if (!apiKey && !env?.AI) throw new Error("Missing Clef credentials");

  const prompt = `Topic: "${topic}"\n\nCandidate Papers:\n` +
    candidates.map((item, idx) => `[${idx}] "${item.title}" - ${item.summary || ""}`).join("\n\n") +
    `\n\nEvaluate each paper: determine relevance to topic.\n` +
    `Return strictly a JSON array with one object per item:\n` +
    `[{"index": 0, "score": 0.85}, ...]`;

  let responseText = "";
  if (env?.AI?.run) {
    const res = await env.AI.run(model, { prompt, max_tokens: 1024 });
    responseText = typeof res === "string" ? res : (res?.response || JSON.stringify(res));
  } else {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, max_tokens: 1024 }),
    });
    if (!res.ok) throw new Error(`Clef HTTP ${res.status}`);
    const data = await res.json();
    responseText = data?.result?.response || JSON.stringify(data?.result || "");
  }

  const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const parsedList = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

  return candidates.map((item, idx) => {
    const scored = parsedList.find((p) => p.index === idx) || parsedList[idx];
    const scoreVal = parseUnifiedScore(scored, PAPER_SCORE_CRITERIA);
    return { ...item, ...scoreVal };
  });
}

/**
 * Two-tier sorting: primarily by relevance score, secondarily by recency (publication date).
 *
 * @param {any[]} papers
 * @returns {any[]}
 */
export function sortPapersByRelevancyThenRecency(papers) {
  return papers
    .filter((p) => (p.score >= 0.40 && p.isPaperConfidence >= 0.40))
    .sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (Math.abs(scoreDiff) > 0.05) {
        return scoreDiff;
      }
      const dateA = new Date(a.published || a.updated || 0).getTime();
      const dateB = new Date(b.published || b.updated || 0).getTime();
      return dateB - dateA;
    });
}

/**
 * Ranks candidate papers with active model or heuristic fallback, returning top 5.
 *
 * @param {any[]} rawItems
 * @param {string} topic
 * @param {any} env
 * @param {Object} [options]
 * @returns {Promise<{ scoredBy: "jev" | "clef" | "heuristic", papers: any[] }>}
 */
export async function scoreAndRankPapers(rawItems, topic, env, options = {}) {
  const providerReq = (
    options?.provider ||
    env?.EVAL_PROVIDER ||
    (env?.TYPESAFE_API_KEY || env?.JEV_API_KEY ? "jev" : env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY || env?.AI ? "clef" : "heuristic")
  ).toLowerCase().trim();

  const candidates = rawItems.slice(0, 10);
  let scoredBy = "heuristic";
  let scoredList = null;

  if (providerReq === "jev" && (env?.TYPESAFE_API_KEY || env?.JEV_API_KEY)) {
    try {
      scoredList = await scorePapersJevBatch(candidates, topic, env);
      scoredBy = "jev";
    } catch (err) {
      console.warn("[Research Jev Batch Error, falling back]:", err?.message);
    }
  }

  if (!scoredList && (providerReq === "clef" || env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY || env?.AI)) {
    try {
      scoredList = await scorePapersClefBatch(candidates, topic, env);
      scoredBy = "clef";
    } catch (err) {
      console.warn("[Research Clef Batch Error, falling back]:", err?.message);
    }
  }

  if (scoredList !== null) {
    const sorted = sortPapersByRelevancyThenRecency(scoredList);
    return {
      scoredBy,
      papers: sorted.slice(0, 5),
    };
  }

  const fallback = candidates
    .filter(isPaperDeterministic)
    .map((item) => {
      const h = scoreItemHeuristic(item, topic);
      return { ...item, ...h };
    });

  const sortedFallback = sortPapersByRelevancyThenRecency(fallback);

  return {
    scoredBy: "heuristic",
    papers: sortedFallback.slice(0, 5),
  };
}
