import {createEvalResult} from "./types.js";

/**
 * Deterministic offline rule-based heuristic evaluator.
 * @param {string} text
 * @param {Object} options
 * @param {number} [options.threshold]
 * @returns {import("./types.js").QualityEvalResult}
 */
export function evaluateHeuristic(text, options = {}) {
  const content = String(text || "").toLowerCase();
  const words = content.trim() ? content.trim().split(/\s+/) : [];
  const wordCount = words.length;

  const violenceTerms = [
    "kill", "murder", "bomb", "suicide", "stab", "assassinate", "massacre",
    "slaughter", "shoot", "gunshot", "blood", "torture", "decapitate",
    "lynch", "strangle", "mutilate", "mutilation", "behead", "bullet", "homicide"
  ];
  const sexualTerms = [
    "sex", "sexual", "sexually", "bad sex", "porn", "porno", "nsfw", "erotic",
    "nude", "nudity", "xxx", "hentai", "blowjob", "intercourse", "positions in bed",
    "69", "climax", "orgasm", "masturbate", "masturbation", "masturbating", "anal sex", "anus", "genital", "fetish",
    "dildo", "vagina", "penis", "boobs", "breast", "slut", "whore", "hooker"
  ];
  const hateTerms = [
    "hate speech", "harass", "slur", "terrorist", "nazi", "supremacist",
    "racist", "faggot", "nigger", "retard", "chink", "kike", "spic",
    "die in a fire", "kill yourself"
  ];

  const countWordMatches = (termList) => {
    let hits = 0;
    for (const term of termList) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(content)) hits += 1;
    }
    return hits;
  };

  const violenceHits = countWordMatches(violenceTerms);
  const sexualHits = countWordMatches(sexualTerms);
  const hateHits = countWordMatches(hateTerms);

  const violenceProb = violenceHits > 0 ? Math.min(0.99, 0.75 + (violenceHits - 1) * 0.12) : 0.02;
  const sexualProb = sexualHits > 0 ? Math.min(0.99, 0.85 + (sexualHits - 1) * 0.10) : 0.01;
  const antisocialProb = hateHits > 0 ? Math.min(0.99, 0.80 + (hateHits - 1) * 0.10) : 0.02;

  const aiPhrases = [
    "in summary", "delve into", "testament to", "it's important to remember",
    "furthermore", "moreover", "leverage", "paradigm shift"
  ];
  const technicalTerms = [
    "kernel", "gpu", "kv cache", "attention", "transformer", "latency",
    "throughput", "cuda", "rocm", "isolate", "wrangler", "sharding",
    "mixture-of-experts", "fp8", "vllm"
  ];

  let aiHits = 0;
  for (const p of aiPhrases) {
    if (content.includes(p)) aiHits += 1;
  }

  const techHits = countWordMatches(technicalTerms);

  const aiProb = Math.min(0.95, Math.max(0.08, (aiHits * 0.18) + (words.length > 200 && techHits === 0 ? 0.4 : 0.15)));
  const techScore = Math.min(5.0, Math.max(2.0, 2.8 + (techHits * 0.35) + (wordCount > 300 ? 0.5 : 0)));
  const engScore = Math.min(5.0, Math.max(2.5, 3.2 + (wordCount > 200 ? 0.6 : 0) + (techHits > 2 ? 0.5 : 0)));

  const accLevel = techScore >= 4.5 ? "expert" : techScore >= 3.8 ? "rigorous" : techScore >= 3.0 ? "competent" : "elementary";
  const engLevel = engScore >= 4.5 ? "captivating" : engScore >= 3.8 ? "engaging" : "clear";
  const threshold = options.threshold ?? 0.55;
  const isUnsafe = violenceProb > threshold || sexualProb > threshold || antisocialProb > threshold;
  const editChoice = isUnsafe
    ? "needs_major_revision"
    : techScore >= 3.8
      ? "ready_for_publication"
      : "needs_minor_polish";

  return createEvalResult({
    source: "local-heuristic",
    violence: violenceProb,
    sexual: sexualProb,
    antisocial: antisocialProb,
    isAiProb: aiProb,
    accuracyScore: techScore,
    accuracyLevel: accLevel,
    engagementScore: engScore,
    engagementLevel: engLevel,
    readinessChoice: editChoice,
    threshold: options.threshold ?? 0.55,
  });
}
