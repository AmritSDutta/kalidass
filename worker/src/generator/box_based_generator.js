import {Box} from "@upstash/box";
import {buildPythonAgentScript} from "./agent_python.js";
import {buildNodeAgentScript} from "./agent_node.js";
import {sanitizeArticleDraft} from "./schemas.js";

/**
 * Builds the attachHeaders map for Upstash Box.
 * Outbound headers are injected directly at the network proxy layer.
 *
 * @param {any} env
 * @param {import("./types").GenerateArticleRequest} request
 * @returns {Record<string, Record<string, string>>}
 */
function buildAttachHeaders(env, request) {
  const custom = request.attachHeaders || {};
  const map = {
    ...custom,
  };

  const serpApiKey = env.SERPAPI_API_KEY || env.SERP_API_KEY;
  if (serpApiKey && !map["serpapi.com"]) {
    map["serpapi.com"] = {
      "X-Api-Key": serpApiKey,
    };
  }

  if (env.TAVILY_API_KEY && !map["api.tavily.com"]) {
    map["api.tavily.com"] = {
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    };
  }

  if (env.GEMINI_API_KEY && !map["generativelanguage.googleapis.com"]) {
    map["generativelanguage.googleapis.com"] = {
      "x-goog-api-key": env.GEMINI_API_KEY,
    };
  }

  if (env.OLLAMA_API_KEY && !map["ollama.com"]) {
    map["ollama.com"] = {
      Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
    };
  }

  if (env.OPENAI_API_KEY && !map["api.openai.com"]) {
    map["api.openai.com"] = {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    };
  }

  return map;
}

/**
 * Implementation of ArticleGeneratorProvider using Upstash Box.
 * Supports both Node.js and Python runtimes with hybrid search, Gemini, Ollama, and DALL-E.
 *
 * @type {import("./types").ArticleGeneratorProvider}
 */
export const BoxBasedGenerator = {
  name: "upstash-box",

  /**
   * Executes autonomous article generation inside an Upstash Box cloud sandbox.
   *
   * @param {import("./types").GenerateArticleRequest} request
   * @param {any} env Cloudflare Worker environment bindings
   * @returns {Promise<any>}
   */
  async generate(request, env) {
    if (!env.UPSTASH_BOX_API_KEY) {
      throw new Error(
        "UPSTASH_BOX_API_KEY is not configured in worker environment. Set UPSTASH_BOX_API_KEY in secrets or .dev.vars."
      );
    }

    const attachHeaders = buildAttachHeaders(env, request);
    const boxName = `kalidass-gen-${Date.now()}`;
    const runtime = request.runtime === "python" ? "python" : "node";

    // 1. Create isolated Upstash Box sandbox with attachHeaders
    const box = await Box.create({
      name: boxName,
      runtime,
      size: "small",
      apiKey: env.UPSTASH_BOX_API_KEY,
      enableTelemetry: false,
      attachHeaders,
      timeout: 120_000,
    });

    try {
      let command = "";

      // 2. Select and write modular agent script based on runtime
      if (runtime === "python") {
        const pythonScript = buildPythonAgentScript(request, env);
        await box.files.write({
          path: "/workspace/home/agent.py",
          content: pythonScript,
        });
        command = "python /workspace/home/agent.py";
      } else {
        const nodeScript = buildNodeAgentScript(request, env);
        await box.files.write({
          path: "/workspace/home/custom_agent.mjs",
          content: nodeScript,
        });
        command = "node /workspace/home/custom_agent.mjs";
      }

      // 3. Execute the custom agent with a 90-second timeout guard
      const execPromise = box.exec.command(command);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Custom agent execution timed out after 90 seconds.")),
          90_000
        )
      );

      const execResult = await Promise.race([execPromise, timeoutPromise]);

      // 4. Read back the structured article JSON output
      let rawOutput = null;
      try {
        const fileContent = await box.files.read("/workspace/home/article_output.json");
        rawOutput = JSON.parse(fileContent);
      } catch {
        // Fallback: try parsing stdout
        const stdout = execResult?.stdout || "";
        const match = stdout.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            rawOutput = JSON.parse(match[0]);
          } catch {
            // Ignored if stdout match is not valid JSON
          }
        }
      }

      if (!rawOutput) {
        throw new Error(
          `Custom agent failed to produce structured article output. Stderr: ${execResult?.stderr || "None"}`
        );
      }

      // 5. Sanitize and validate article draft
      return sanitizeArticleDraft(rawOutput, request);
    } finally {
      // 6. Guarantee container deletion to avoid orphaned billing
      await box.delete().catch((err) => {
        console.warn("Failed to delete Upstash Box container:", err.message);
      });
    }
  },
};
