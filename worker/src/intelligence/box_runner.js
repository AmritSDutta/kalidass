import {Box} from "@upstash/box";
import {buildIntelligenceScript} from "./python_script.js";

/**
 * Spawns an ephemeral Upstash Box to execute the SerpApi intelligence extraction.
 *
 * @param {{ query: string, title: string, summary: string }} params
 * @param {any} env Cloudflare Worker environment bindings
 * @returns {Promise<any>}
 */
export async function runBoxIntelligence(params, env) {
  if (!env?.UPSTASH_BOX_API_KEY) {
    throw new Error(
      "UPSTASH_BOX_API_KEY is not configured in worker environment. Set UPSTASH_BOX_API_KEY in secrets or .dev.vars."
    );
  }

  const serpApiKey = env.SERPAPI_API_KEY || env.SERP_API_KEY;
  const attachHeaders = {};
  const boxEnv = {};
  if (serpApiKey) {
    attachHeaders["serpapi.com"] = {
      "X-Api-Key": serpApiKey,
      "Authorization": `Bearer ${serpApiKey}`,
    };
    attachHeaders["*.serpapi.com"] = {
      "X-Api-Key": serpApiKey,
      "Authorization": `Bearer ${serpApiKey}`,
    };
    boxEnv.SERPAPI_API_KEY = serpApiKey;
    boxEnv.SERPAPI_KEY = serpApiKey;
  }

  const boxName = `kalidass-intel-${Date.now()}`;
  const box = await Box.create({
    name: boxName,
    runtime: "python",
    size: "small",
    apiKey: env.UPSTASH_BOX_API_KEY,
    enableTelemetry: false,
    attachHeaders,
    env: boxEnv,
    timeout: 120_000,
  });

  try {
    const pythonScript = buildIntelligenceScript({
      ...params,
      apiKey: serpApiKey,
    });
    await box.files.write({
      path: "/workspace/home/intelligence.py",
      content: pythonScript,
    });

    const command = "python /workspace/home/intelligence.py";
    const execPromise = box.exec.command(command, { timeout: 90_000 });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Box intelligence extraction timed out after 90 seconds.")),
        90_000
      )
    );

    const execResult = await Promise.race([execPromise, timeoutPromise]);
    if (execResult && execResult.exitCode && execResult.exitCode !== 0) {
      console.warn(`[Box] Script exit code: ${execResult.exitCode}. stderr: ${execResult.stderr}`);
    }

    let output = null;
    try {
      const fileContent = await box.files.read("/workspace/home/intelligence.json");
      output = JSON.parse(fileContent);
    } catch {
      // Fallback stdout parsing
      const stdout = execResult?.stdout || "";
      const match = stdout.match(/---OUTPUT_START---([\s\S]*?)---OUTPUT_END---/);
      if (match) {
        output = JSON.parse(match[1].trim());
      } else {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) output = JSON.parse(jsonMatch[0]);
      }
    }

    if (!output) {
      throw new Error(`Box intelligence extraction produced no valid output: ${execResult?.stderr || execResult?.stdout}`);
    }

    return output;
  } finally {
    // Guaranteed cleanup of the ephemeral box
    try {
      await box.delete();
    } catch (cleanupErr) {
      console.warn(`[Box] Failed to terminate box ${boxName}:`, cleanupErr.message);
    }
  }
}
