import {describe, it, expect, vi, afterEach} from "vitest";
import {evaluateJev} from "../src/eval/jev.js";
import {runQualityEvaluation} from "../src/eval/index.js";

const ENV = {
  TYPESAFE_API_KEY: "ts-test-token",
};

const mockFetch = (response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const CLEAN_ANSWERS = {
  is_ai_written: {noul: 0.12},
  technical_accuracy: {score: 4, level: "expert", confidence: 0.96},
  engagement: {score: 3, level: "engaging", confidence: 0.92},
  editorial_readiness: {choice: "ready_for_publication", confidence: 0.98},
  risk_violence: {noul: 0.01},
  risk_sexual: {noul: 0.01},
  risk_antisocial: {noul: 0.02},
};

describe("evaluateJev (Hermetic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("maps a TypeSafe System One answers payload into a QualityEvalResult", async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({
        model: "jev-1.13.0",
        answers: CLEAN_ANSWERS,
        usage: {input_tokens: 350, output_tokens: 20},
      }),
    });

    const result = await evaluateJev("Deep dive into isolate scheduling and edge execution.", {}, ENV);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe("https://api.typesafe.ai/v1/systemone");
    expect(requestInit.headers.Authorization).toBe("Bearer ts-test-token");
    const sentPayload = JSON.parse(requestInit.body);
    expect(sentPayload.questions.technical_accuracy.criteria).toBeDefined();
    expect(sentPayload.questions.technical_accuracy.levels).toBeUndefined();
    expect(sentPayload.questions.engagement.criteria).toBeDefined();
    expect(sentPayload.questions.editorial_readiness.criteria).toBeDefined();
    expect(sentPayload.questions.editorial_readiness.choices).toBeUndefined();

    expect(result.ok).toBe(true);
    expect(result.source).toBe("typesafe-jev");
    expect(result.judging_model).toBe("jev-1.13.0");
    expect(result.safety.verdict).toBe("safe");
    expect(result.safety.violations).toEqual([]);
    expect(result.safety.violence).toBe(0.01);
    expect(result.metrics.isAiWritten.probability).toBe(0.12);
    expect(result.metrics.isAiWritten.label).toBe("Human-Authored");
    expect(result.metrics.accuracy.score).toBe(4);
    expect(result.metrics.accuracy.level).toBe("expert");
    expect(result.metrics.engagement.score).toBe(3);
    expect(result.metrics.editorialReadiness.choice).toBe("ready_for_publication");
  });

  it("throws when missing TYPESAFE_API_KEY", async () => {
    await expect(evaluateJev("Test text", {}, {})).rejects.toThrow("Missing TYPESAFE_API_KEY");
  });

  it("runQualityEvaluation executes Jev when EVAL_PROVIDER is jev", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model: "jev-latest",
        answers: CLEAN_ANSWERS,
      }),
    });

    const result = await runQualityEvaluation("Article body", {provider: "jev"}, ENV);
    expect(result.source).toBe("typesafe-jev");
    expect(result.ok).toBe(true);
  });

  it("safely resolves level string when TypeSafe returns continuous score and raw legend dictionary", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model: "jev-1.13.0",
        answers: {
          is_ai_written: {noul: 0.05},
          technical_accuracy: {
            type: "score",
            score: 3.2,
            confidence: 0.81,
            legend: {
              "0": "misleading",
              "1": "elementary",
              "2": "competent",
              "3": "rigorous",
              "4": "expert",
            },
            probabilities: {"0": 0.0, "1": 0.0, "2": 0.1, "3": 0.6, "4": 0.3},
          },
          engagement: {
            type: "score",
            score: 2.4,
            confidence: 0.75,
            legend: {
              "0": "dry",
              "1": "clear",
              "2": "engaging",
              "3": "captivating",
            },
            probabilities: {"0": 0.0, "1": 0.2, "2": 0.6, "3": 0.2},
          },
          editorial_readiness: {
            type: "choice",
            choice: "ready_for_publication",
            confidence: 0.95,
          },
          risk_violence: {noul: 0.0},
          risk_sexual: {noul: 0.0},
          risk_antisocial: {noul: 0.0},
        },
      }),
    });

    const result = await evaluateJev("Kernel memory management and page cache internals.", {}, ENV);

    expect(typeof result.metrics.accuracy.level).toBe("string");
    expect(result.metrics.accuracy.level).toBe("rigorous");
    expect(result.metrics.accuracy.level).not.toBeInstanceOf(Object);
    expect(typeof result.metrics.engagement.level).toBe("string");
    expect(result.metrics.engagement.level).toBe("engaging");
    expect(result.metrics.accuracy.score).toBe(3.2);
    expect(result.metrics.engagement.score).toBe(2.4);
  });
});
