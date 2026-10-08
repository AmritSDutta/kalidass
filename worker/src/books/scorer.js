const BOOK_POSITIVE_TERMS = [
  "book", "edition", "paperback", "hardcover", "kindle", "guide", "handbook",
  "manual", "introduction", "principles", "patterns", "design", "programming",
  "systems", "architecture", "volume", "series", "textbook", "author", "reading"
];

const BOOK_NEGATIVE_TERMS = [
  "case", "cover", "stand", "holder", "charger", "cable", "sleeve", "protector",
  "skin", "adapter", "battery", "t-shirt", "mug", "sticker", "poster", "backpack"
];

export const BOOK_SCORE_CRITERIA = [
  "Not a book (e.g. case, charger, accessory, merchandise) or completely irrelevant to the topic",
  "Questionable publication or only tangentially related to the topic",
  "Genuinely a book and moderately relevant to the topic",
  "Highly relevant, authoritative book covering core aspects of the topic",
  "Essential, definitive book on this topic"
];

export const UNIFIED_LEVELS = BOOK_SCORE_CRITERIA;

/**
 * Deterministically checks whether a candidate item is genuinely a book.
 * Evaluates negative hardware/accessory tokens and positive book/reading cues.
 *
 * @param {{ title?: string, authors?: string[] }} item
 * @returns {boolean}
 */
export function isBookDeterministic(item) {
  const title = String(item?.title || "").toLowerCase();
  const titleTokens = title.split(/\W+/).filter(Boolean);

  // Hard negative check: accessories, hardware, merchandise
  for (const term of BOOK_NEGATIVE_TERMS) {
    if (titleTokens.includes(term)) {
      return false;
    }
  }

  // Positive indicator: authors present
  if (Array.isArray(item?.authors) && item.authors.length > 0) {
    return true;
  }

  // Positive indicator: book/reading tokens
  for (const term of BOOK_POSITIVE_TERMS) {
    if (titleTokens.includes(term)) {
      return true;
    }
  }

  // Default to true for items returned from Amazon book query without negative flags
  return true;
}

/**
 * Heuristic book and topic relevance scorer (for backwards compatibility).
 *
 * @param {{ title: string, authors?: string[], price?: string }} item
 * @param {string} topic
 * @returns {{ isBookConfidence: number, topicSimilarity: number, score: number }}
 */
export function scoreItemHeuristic(item, topic) {
  const isBook = isBookDeterministic(item);
  const title = String(item?.title || "").toLowerCase();
  const topicTokens = String(topic || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);

  let matchCount = 0;
  for (const token of topicTokens) {
    if (title.includes(token)) matchCount += 1;
  }

  const topicSimilarity = topicTokens.length > 0
    ? Math.min(1.0, matchCount / Math.max(1, topicTokens.length))
    : 0.50;

  const bookConfidence = isBook ? 0.85 : 0.20;
  const score = parseFloat((bookConfidence * 0.4 + topicSimilarity * 0.6).toFixed(3));

  return {
    isBookConfidence: parseFloat(bookConfidence.toFixed(2)),
    topicSimilarity: parseFloat(topicSimilarity.toFixed(2)),
    score,
  };
}

/**
 * Parses unified score level or numeric value from a decision model answer.
 * Normalizes 0..maxScore against top level (criteria.length - 1).
 *
 * @param {any} qResult
 * @param {string[]} [criteria]
 * @returns {{ isBookConfidence: number, topicSimilarity: number, score: number }}
 */
export function parseUnifiedScore(qResult, criteria = BOOK_SCORE_CRITERIA) {
  if (!qResult) {
    return {isBookConfidence: 0.0, topicSimilarity: 0.0, score: 0.0};
  }

  const topLevel = Math.max(1, criteria.length - 1);

  if (typeof qResult.score === "number") {
    const rawScore = qResult.score;
    const normalized = Math.max(0, Math.min(1, rawScore / topLevel));
    const probLevel0 = qResult.probabilities?.["0"] ?? (rawScore === 0 ? 1.0 : 0.0);
    const isBookConfidence = probLevel0 > 0.5 ? 0.10 : 0.95;

    return {
      isBookConfidence,
      topicSimilarity: parseFloat(normalized.toFixed(3)),
      score: parseFloat(normalized.toFixed(3)),
    };
  }

  if (typeof qResult === "number") {
    const normalized = Math.max(0, Math.min(1, qResult > 1 ? qResult / topLevel : qResult));
    return {
      isBookConfidence: normalized >= 0.25 ? 0.95 : 0.10,
      topicSimilarity: parseFloat(normalized.toFixed(3)),
      score: parseFloat(normalized.toFixed(3)),
    };
  }

  // Probabilities argmax fallback
  if (qResult.probabilities && typeof qResult.probabilities === "object") {
    let maxProb = -1;
    let maxIdx = -1;
    for (let i = 0; i < criteria.length; i++) {
      const p = qResult.probabilities[String(i)] ?? qResult.probabilities[i];
      if (typeof p === "number" && p > maxProb) {
        maxProb = p;
        maxIdx = i;
      }
    }
    if (maxIdx >= 0) {
      const normalized = maxIdx / topLevel;
      return {
        isBookConfidence: maxIdx === 0 ? 0.10 : 0.95,
        topicSimilarity: parseFloat(normalized.toFixed(3)),
        score: parseFloat(normalized.toFixed(3)),
      };
    }
  }

  const levelVal = qResult.level || qResult.legend || qResult.choice || qResult.value;
  if (typeof levelVal === "string") {
    const trimmed = levelVal.trim();
    let idx = criteria.indexOf(trimmed);
    if (idx === -1) {
      const match = trimmed.match(/\b([0-9])\b/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= 0 && num < criteria.length) {
          idx = num;
        }
      }
    }
    if (idx === -1) {
      idx = criteria.findIndex(
        (c) => c.toLowerCase().includes(trimmed.toLowerCase()) || trimmed.toLowerCase().includes(c.toLowerCase())
      );
    }
    if (idx >= 0) {
      const normalized = idx / topLevel;
      return {
        isBookConfidence: idx === 0 ? 0.10 : 0.95,
        topicSimilarity: parseFloat(normalized.toFixed(3)),
        score: parseFloat(normalized.toFixed(3)),
      };
    }
  }

  return formatScores(qResult);
}

export function parseBatchArrayJson(input, count) {
  const text = typeof input === "string" ? input : JSON.stringify(input || []);
  const match = text.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {
      // ignore
    }
  }
  return null;
}

export function parseScoreJson(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input || {});
  const match = text.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // ignore
    }
  }
  return {is_book: 0.0, similarity: 0.0};
}

export function safeNum(val, fallback) {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (val !== null && val !== undefined) {
    const parsed = parseFloat(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function formatScores(parsed) {
  const isBookConfidence = Math.max(0.0, Math.min(1.0, safeNum(parsed?.is_book ?? parsed?.isBookConfidence, 0.0)));
  const topicSimilarity = Math.max(0.0, Math.min(1.0, safeNum(parsed?.similarity ?? parsed?.topicSimilarity, 0.0)));
  const score = Math.max(0.0, Math.min(1.0, safeNum(parsed?.score, parseFloat((isBookConfidence * 0.4 + topicSimilarity * 0.6).toFixed(3)))));
  return {isBookConfidence, topicSimilarity, score};
}

/**
 * Scores all candidate products in a SINGLE batch call using TypeSafe Jev.
 *
 * @param {any[]} candidates
 * @param {string} topic
 * @param {any} env
 * @returns {Promise<any[]>}
 */
export async function scoreBooksJevBatch(candidates, topic, env) {
  const apiKey = env?.TYPESAFE_API_KEY || env?.JEV_API_KEY;
  if (!apiKey) throw new Error("Missing Jev credentials");

  const state = `Topic: "${topic}"\n\nCandidate Products:\n` +
    candidates.map((item, idx) => `Item ${idx}: "${item.title}" by ${item.authors?.join(", ") || "Unknown"}`).join("\n");

  const questions = {};
  candidates.forEach((_, idx) => {
    questions[`item_${idx}`] = {
      type: "score",
      instructions: `Evaluate whether Item ${idx} is genuinely a book AND relevant to "${topic}".`,
      criteria: BOOK_SCORE_CRITERIA,
    };
  });

  const payload = {
    model: "jev-latest",
    state,
    questions,
  };

  console.log(`[Books Scorer] Calling TypeSafe Jev System One for ${candidates.length} candidates on topic "${topic}"`);

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[Books Scorer] TypeSafe Jev API error HTTP ${res.status}: ${errorText}`);
    throw new Error(`Jev HTTP ${res.status}: ${errorText}`);
  }
  const raw = await res.json();
  console.log(`[Books Scorer] TypeSafe Jev batch call succeeded (model: ${raw?.model || "jev"})`);
  const data = raw?.results || raw?.answers || raw;

  return candidates.map((item, idx) => {
    const qResult = data?.[`item_${idx}`] || data?.answers?.[`item_${idx}`] || data?.results?.[`item_${idx}`];
    const scoreVal = parseUnifiedScore(qResult, BOOK_SCORE_CRITERIA);
    return {...item, ...scoreVal};
  });
}

/**
 * Scores all candidate products in a SINGLE batch call using Cloudflare Clef / Workers AI.
 *
 * @param {any[]} candidates
 * @param {string} topic
 * @param {any} env
 * @returns {Promise<any[]>}
 */
export async function scoreBooksClefBatch(candidates, topic, env) {
  const apiKey = env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY;
  const accountId = env?.CLOUDFLARE_ACCOUNT_ID;
  const model = env?.CLEF_MODEL || "@cf/meta/llama-3.1-8b-instruct";

  if (!apiKey && !env?.AI) {
    throw new Error("Missing Clef credentials");
  }
  if (apiKey && !accountId && !env?.AI) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID for Clef REST endpoint");
  }

  const isDecisionModel = typeof model === "string" && model.includes("clef");

  if (isDecisionModel && ((apiKey && accountId) || env?.AI)) {
    const state = `Topic: "${topic}"\n\nCandidate Products:\n` +
      candidates.map((item, idx) => `Item ${idx}: "${item.title}" by ${item.authors?.join(", ") || "Unknown"}`).join("\n");

    const questions = {};
    candidates.forEach((_, idx) => {
      questions[`item_${idx}`] = {
        type: "score",
        instructions: `Evaluate whether Item ${idx} is genuinely a book AND relevant to "${topic}".`,
        criteria: BOOK_SCORE_CRITERIA,
      };
    });

    const payload = {model, state, questions};
    let raw;
    if (apiKey && accountId) {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Clef HTTP ${res.status}`);
      raw = await res.json();
    } else {
      raw = await env.AI.run(model, payload);
    }

    const data = raw?.result?.answers || raw?.result || raw?.answers || raw;
    return candidates.map((item, idx) => {
      const qResult = data?.[`item_${idx}`];
      const scoreVal = parseUnifiedScore(qResult, BOOK_SCORE_CRITERIA);
      return {...item, ...scoreVal};
    });
  }

  // LLM / prompt-based Workers AI run: single prompt evaluating all items
  const prompt = `Topic: "${topic}"\n\nCandidate Products:\n` +
    candidates.map((item, idx) => `[${idx}] "${item.title}" by ${item.authors?.join(", ") || "Unknown"}`).join("\n") +
    `\n\nEvaluate each item: determine if it is genuinely a book and its relevance to the topic.\n` +
    `Return strictly a JSON array with one object per item:\n` +
    `[{"index": 0, "is_book": 0.9, "similarity": 0.8, "score": 0.84}, ...]`;

  let responseText = "";
  if (env?.AI?.run) {
    const res = await env.AI.run(model, {prompt, max_tokens: 1024});
    responseText = typeof res === "string" ? res : (res?.response || JSON.stringify(res));
  } else {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({prompt, max_tokens: 1024}),
    });
    if (!res.ok) throw new Error(`Clef HTTP ${res.status}`);
    const data = await res.json();
    responseText = data?.result?.response || JSON.stringify(data?.result || "");
  }

  const parsedList = parseBatchArrayJson(responseText, candidates.length);
  if (!parsedList) {
    throw new Error("Failed to parse batch JSON response from Clef prompt");
  }

  return candidates.map((item, idx) => {
    const scored = parsedList[idx] || {is_book: 0.0, similarity: 0.0, score: 0.0};
    return {
      ...item,
      ...formatScores(scored),
    };
  });
}

/**
 * Evaluates candidate Amazon products in a single call with active model (Jev/Clef),
 * or falls back to deterministic item-by-item search-ordered filtering.
 *
 * @param {any[]} rawItems
 * @param {string} topic
 * @param {any} env
 * @param {Object} [options]
 * @returns {Promise<{ scoredBy: "jev" | "clef" | "heuristic", books: any[] }>}
 */
export async function scoreAndRankBooks(rawItems, topic, env, options = {}) {
  const providerReq = (
    options?.provider ||
    env?.EVAL_PROVIDER ||
    (env?.TYPESAFE_API_KEY || env?.JEV_API_KEY ? "jev" : env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY || env?.AI ? "clef" : "heuristic")
  ).toLowerCase().trim();

  const candidates = rawItems.slice(0, 10);
  let scoredBy = "heuristic";
  let scoredList = null;

  // 1. Try Jev in a single batch call over all candidates
  if (providerReq === "jev") {
    if (env?.TYPESAFE_API_KEY || env?.JEV_API_KEY) {
      try {
        scoredList = await scoreBooksJevBatch(candidates, topic, env);
        scoredBy = "jev";
      } catch (err) {
        console.warn("[Books Jev Batch Error, falling back]:", err?.message);
      }
    } else {
      console.warn("[Books Scorer] Provider 'jev' requested, but TYPESAFE_API_KEY is missing in environment variables. Falling back to alternative provider.");
    }
  }

  // 2. Try Clef in a single batch call over all candidates
  if (!scoredList && (providerReq === "clef" || env?.CLEF_API_KEY || env?.CLOUDFLARE_API_KEY || env?.AI)) {
    try {
      scoredList = await scoreBooksClefBatch(candidates, topic, env);
      scoredBy = "clef";
    } catch (err) {
      console.warn("[Books Clef Batch Error, falling back]:", err?.message);
    }
  }

  // 3. Active scorer ranking: filter out non-books, sort by composite score, cap to top 3.
  // If the active model ran successfully, its verdict is respected even if zero books qualify.
  if (scoredList !== null) {
    const validBooks = scoredList
      .filter((item) => (item.score >= 0.40 && item.isBookConfidence >= 0.40))
      .sort((a, b) => (b.score - a.score) || (b.rating - a.rating) || (b.reviews_count - a.reviews_count));

    return {
      scoredBy,
      books: validBooks.slice(0, 3),
    };
  }

  // 4. Fallback deterministic case: only runs when active models failed or are absent.
  // Run one by one to find whether each is a book; no custom score ordering necessary,
  // top 3 ordered by search results.
  const fallbackBooks = [];
  for (const item of candidates) {
    if (isBookDeterministic(item)) {
      fallbackBooks.push({
        ...item,
        isBookConfidence: 1.0,
        topicSimilarity: 1.0,
        score: 1.0,
      });
      if (fallbackBooks.length >= 3) break;
    }
  }

  return {
    scoredBy: "heuristic",
    books: fallbackBooks,
  };
}
