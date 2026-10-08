import {describe, it, expect} from "vitest";
import {evaluateHeuristic} from "../src/eval/heuristic.js";

describe("evaluateHeuristic (Hermetic)", () => {
  it("evaluates clean technical systems text as safe with 0 violations", () => {
    const text = `
      Decoupling static frontends from edge storage provides resilience and speed.
      Systems architecture demands strict boundary isolation across micro-services.
      GPU clusters leverage FP8 and CUDA kernels for high-throughput attention computation.
    `;
    const result = evaluateHeuristic(text);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("local-heuristic");
    expect(result.judging_model).toBe("deterministic");
    expect(result.safety.verdict).toBe("safe");
    expect(result.safety.violations).toEqual([]);
    expect(result.safety.sexual).toBeLessThan(0.55);
    expect(result.safety.violence).toBeLessThan(0.55);
    expect(result.safety.antisocial).toBeLessThan(0.55);
  });

  it("prevents Scunthorpe false positives: 'analysis' and 'analytics' do NOT match 'anal'", () => {
    const text = `
      Our field analysis identifies critical performance shifts in network throughput.
      Statistical analytics and system performance analyzers demonstrate steady state latency.
      Analog signals are converted to digital packets for distributed processing.
    `;
    const result = evaluateHeuristic(text);
    expect(result.safety.sexual).toBe(0.01);
    expect(result.safety.violations).toEqual([]);
    expect(result.safety.verdict).toBe("safe");
  });

  it("prevents Scunthorpe false positives for violence: 'skills' and 'stability' do not match 'kill' or 'stab'", () => {
    const text = `
      Engineering skills and system stability are essential for zero-downtime infrastructure.
    `;
    const result = evaluateHeuristic(text);
    expect(result.safety.violence).toBe(0.02);
    expect(result.safety.violations).toEqual([]);
    expect(result.safety.verdict).toBe("safe");
  });

  it("triggers safety violations on genuine explicit content", () => {
    const explicitText = "Explicit prohibited pornography and anal sex depictions.";
    const result = evaluateHeuristic(explicitText);
    expect(result.safety.sexual).toBeGreaterThanOrEqual(0.85);
    expect(result.safety.verdict).toBe("rejected");
    expect(result.safety.violations).toContain("Sexually explicit or NSFW content detected");
  });

  it("computes technical accuracy, AI probability, and engagement scores", () => {
    const text = `
      Attention routing in Transformer architectures requires KV cache optimization.
      CUDA kernel sharding across GPU clusters minimizes latency and maximizes throughput.
      Wrangler isolates provide lightweight execution at the edge.
    `;
    const result = evaluateHeuristic(text);
    expect(result.metrics.accuracy.score).toBeGreaterThanOrEqual(3.0);
    expect(result.metrics.engagement.score).toBeGreaterThanOrEqual(2.5);
    expect(typeof result.metrics.isAiWritten.probability).toBe("number");
    expect(result.summary).toContain("Article heuristics:");
  });
});
