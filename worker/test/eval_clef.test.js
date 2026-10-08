import {describe, it, expect, vi, afterEach} from "vitest";
import {evaluateClef} from "../src/eval/clef.js";
import {runQualityEvaluation} from "../src/eval/index.js";

const ENV = {
  CLEF_API_KEY: "cf-test-token",
  CLOUDFLARE_ACCOUNT_ID: "acc-123",
  CLEF_MODEL: "clef-flash",
};

const answersPayload = (answers) => ({
  model: "clef-flash",
  answers,
  usage: {total_tokens: 42},
});

const restResponse = (answers) => ({
  result: answersPayload(answers),
  success: true,
  errors: [],
  messages: [],
});

const CLEAN_ANSWERS = {
  is_ai_written: {noul: 0.18},
  technical_accuracy: {score: 3, confidence: 0.94},
  engagement: {score: 2, confidence: 0.91},
  editorial_readiness: {choice: "ready_for_publication", confidence: 0.95},
  risk_violence: {noul: 0.01},
  risk_sexual: {noul: 0.01},
  risk_antisocial: {noul: 0.02},
};

const mockFetch = (response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("evaluateClef (Hermetic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a Cloudflare Clef REST response into a QualityEvalResult", async () => {
    mockFetch({ok: true, json: async () => restResponse(CLEAN_ANSWERS)});

    const result = await evaluateClef("Deep dive into isolate scheduling.", {}, ENV);

    expect(result.ok).toBe(true);
    expect(result.source).toBe("cloudflare-clef");
    expect(result.judging_model).toBe("clef-flash");
    expect(result.safety.verdict).toBe("safe");
    expect(result.safety.violations).toEqual([]);
    expect(result.safety.violence).toBe(0.01);
    expect(result.metrics.isAiWritten.probability).toBe(0.18);
    expect(result.metrics.isAiWritten.label).toBe("Human-Authored");
    expect(result.metrics.accuracy.score).toBe(4);
    expect(result.metrics.accuracy.level).toBe("rigorous");
    expect(result.metrics.accuracy.confidence).toBe(0.94);
    expect(result.metrics.engagement.score).toBe(3);
    expect(result.metrics.engagement.level).toBe("engaging");
    expect(result.metrics.editorialReadiness.choice).toBe("ready_for_publication");
  });

  it("calls the Workers AI REST endpoint with the model and Bearer token", async () => {
    const fetchMock = mockFetch({ok: true, json: async () => restResponse(CLEAN_ANSWERS)});

    await evaluateClef("Systems text.", {}, ENV);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc-123/ai/run/@cf/cloudflare/clef-flash",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer cf-test-token");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("clef-flash");
    expect(body.state).toBe("Systems text.");
    expect(body.questions.technical_accuracy.criteria).toEqual([
      "misleading",
      "elementary",
      "competent",
      "rigorous",
      "expert",
    ]);
    expect(body.questions.editorial_readiness.type).toBe("choice");
    expect(body.questions.editorial_readiness.criteria).toHaveProperty("ready_for_publication");
    expect(body.questions.risk_sexual.type).toBe("noul");
  });

  it("honors a per-request clefModel override", async () => {
    const fetchMock = mockFetch({ok: true, json: async () => restResponse(CLEAN_ANSWERS)});

    await evaluateClef("Systems text.", {clefModel: "clef"}, ENV);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc-123/ai/run/@cf/cloudflare/clef",
    );
  });

  it("falls back to a score-derived level when only per-level probabilities are returned", async () => {
    mockFetch({
      ok: true,
      json: async () =>
        restResponse({
          ...CLEAN_ANSWERS,
          technical_accuracy: {probabilities: {misleading: 0, elementary: 0.1, competent: 0.2, rigorous: 0.7, expert: 0}},
        }),
    });

    const result = await evaluateClef("Systems text.", {}, ENV);

    expect(result.metrics.accuracy.score).toBe(3.6);
    expect(result.metrics.accuracy.level).toBe("rigorous");
  });

  it("rejects when neither an API key nor an AI binding is available", async () => {
    await expect(evaluateClef("Systems text.", {}, {})).rejects.toThrow(/Missing CLEF_API_KEY/);
  });

  it("rejects when an API key is present but the account id is missing", async () => {
    await expect(
      evaluateClef("Systems text.", {}, {CLEF_API_KEY: "cf-test-token"}),
    ).rejects.toThrow(/Missing CLOUDFLARE_ACCOUNT_ID/);
  });

  it("uses the env.AI binding when no API key is present", async () => {
    const run = vi.fn().mockResolvedValue(answersPayload(CLEAN_ANSWERS));

    const result = await evaluateClef("Systems text.", {}, {AI: {run}, CLEF_MODEL: "clef"});

    expect(run).toHaveBeenCalledWith("@cf/cloudflare/clef", expect.any(Object));
    expect(result.source).toBe("cloudflare-clef");
  });

  it("is selected by the dispatcher via EVAL_PROVIDER=clef", async () => {
    mockFetch({ok: true, json: async () => restResponse(CLEAN_ANSWERS)});

    const result = await runQualityEvaluation(
      "Edge isolates provide lightweight execution.",
      {},
      {...ENV, EVAL_PROVIDER: "clef"},
    );

    expect(result.source).toBe("cloudflare-clef");
  });

  it("cascades to the local heuristic when Clef fails", async () => {
    mockFetch({ok: false, status: 500, text: async () => "upstream boom"});

    const result = await runQualityEvaluation(
      "Edge isolates provide lightweight execution.",
      {},
      {...ENV, EVAL_PROVIDER: "clef"},
    );

    expect(result.source).toBe("local-heuristic");
    expect(result.ok).toBe(true);
  });
});
