import {buildSystemPrompt, buildUserPrompt, buildSearchQuery, getCurrentDateFormatted} from "./prompts.js";

/**
 * Builds the Node.js in-box research agent script.
 * Runs in an Upstash Box with runtime: "node".
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @param {any} env
 * @returns {string}
 */
export function buildNodeAgentScript(request, env) {
  const systemPrompt = JSON.stringify(buildSystemPrompt(request));
  const userPrompt = JSON.stringify(buildUserPrompt(request));
  const searchTopic = JSON.stringify(buildSearchQuery(request));
  const currentDateFormatted = JSON.stringify(getCurrentDateFormatted());
  const rawWeight = parseFloat(env.FIRECRAWL_SEARCH_WEIGHT || "70");
  const firecrawlWeight = rawWeight <= 1.0 ? rawWeight * 100 : rawWeight;
  const geminiModelName = JSON.stringify(request.model || env.GEMINI_MODEL || "gemini-3.1-flash-lite");
  const ollamaModelName = JSON.stringify(env.OLLAMA_MODEL || "gemma4:31b-cloud");
  const ollamaBaseUrl = JSON.stringify(env.OLLAMA_API_BASE_URL || "https://ollama.com");

  return `// Kalidass Journal — Custom In-Box Research Agent (Node.js Runtime)
import fs from "node:fs";

function parseJsonSafely(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const cleaned = rawText.trim().replace(/^[\\x60]{3}(?:json)?\\s*/i, "").replace(/\\s*[\\x60]{3}$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const matchObj = cleaned.match(/\{[\s\S]*\}/);
  if (matchObj) {
    try {
      return JSON.parse(matchObj[0]);
    } catch {}
  }
  const matchArr = cleaned.match(/\[[\s\S]*\]/);
  if (matchArr) {
    try {
      return JSON.parse(matchArr[0]);
    } catch {}
  }
  return null;
}

async function searchTavily(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        include_answer: true,
        time_range: "year",
        max_results: 5
      })
    });
    if (res.ok) {
      const data = await res.json();
      return (data.results || []).map(r => ({
        title: r.title || "",
        url: r.url || "",
        description: r.content || ""
      }));
    }
  } catch (err) {
    console.error("Tavily search failed:", err);
  }
  return [];
}

async function searchFirecrawl(query) {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ["markdown"] }
      })
    });
    if (res.ok) {
      const data = await res.json();
      return (data.data || []).map(r => ({
        title: r.title || "",
        url: r.url || "",
        description: r.description || (r.markdown ? r.markdown.slice(0, 300) : "") || ""
      }));
    }
  } catch (err) {
    console.error("Firecrawl search failed:", err);
  }
  return [];
}

async function searchWeb(query) {
  const firecrawlWeight = ${firecrawlWeight};
  const pickFirecrawl = Math.random() * 100 < firecrawlWeight;
  let results = [];
  if (pickFirecrawl) {
    results = await searchFirecrawl(query);
    if (!results.length) results = await searchTavily(query);
  } else {
    results = await searchTavily(query);
    if (!results.length) results = await searchFirecrawl(query);
  }
  return results;
}

async function run() {
  const sysPrompt = ${systemPrompt};
  const usrPrompt = ${userPrompt};

  // 1. Gather empirical research citations via hybrid search
  const citations = await searchWeb(${searchTopic});
  let searchContext = "";
  if (citations.length > 0) {
    searchContext = "\\n\\nEMPIRICAL WEB RESEARCH CITATIONS:\\n" +
      citations.map(c => "- " + c.title + ": " + c.description + " (" + c.url + ")").join("\\n");
  }

  const finalUserPrompt = usrPrompt + searchContext +
    "\\n\\n" +
    "MANDATORY REMINDER:\\n" +
    "The user's thesis angle and architectural focus specified above is a NON-NEGOTIABLE INVARIANT. " +
    "Fulfill and prioritize all constraints, frameworks, and questions in the thesis angle. " +
    "Do not allow search citations to override or dilute the user's explicit intent.";

  // 2. Primary: Google Gemini API
  let generatedJson = null;
  const geminiModel = ${geminiModelName};
  try {
    const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents: [{ role: "user", parts: [{ text: finalUserPrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (geminiRes.ok) {
      const data = await geminiRes.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      generatedJson = parseJsonSafely(content);
    }
  } catch (err) {
    console.warn("Gemini synthesis failed, cascading to Ollama:", err.message);
  }

  // 3. Fallback: Ollama Cloud API
  if (!generatedJson) {
    try {
      const ollamaUrl = ${ollamaBaseUrl} + "/api/chat";
      const ollamaRes = await fetch(ollamaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ${ollamaModelName},
          format: "json",
          stream: false,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: finalUserPrompt }
          ]
        })
      });

      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        const content = data.message?.content || "";
        generatedJson = parseJsonSafely(content);
      }
    } catch (err) {
      console.warn("Ollama synthesis failed:", err.message);
    }
  }

  // 3.5. Normalize polymorphic structure (handle bare block arrays or wrapped arrays)
  if (Array.isArray(generatedJson)) {
    if (generatedJson.length > 0 && typeof generatedJson[0] === "object" && generatedJson[0] !== null && ("blocks" in generatedJson[0] || "title" in generatedJson[0])) {
      generatedJson = generatedJson[0];
    } else if (generatedJson.length > 0 && generatedJson.every(item => typeof item === "object" && item !== null && "type" in item)) {
      generatedJson = {
        title: ${JSON.stringify(request.topic || "Autonomous Systems Synthesis")},
        subtitle: ${JSON.stringify(request.angle || "Field notes from isolated container runtime.")},
        excerpt: "Empirical systems research on " + ${JSON.stringify(request.topic || "systems architecture")} + ".",
        tags: ["Systems", "Research", "Upstash Box"],
        accent: ${JSON.stringify(request.accent || "#6366f1")},
        blocks: generatedJson,
      };
    } else {
      generatedJson = null;
    }
  }

  if (!generatedJson || typeof generatedJson !== "object") {
    generatedJson = null;
  }

  // 4. Deterministic fallback if external LLMs are unconfigured or failed
  if (!generatedJson) {
    generatedJson = {
      title: ${JSON.stringify(request.topic || "Autonomous Systems Synthesis")},
      subtitle: ${JSON.stringify(request.angle || "Field notes from isolated container runtime.")},
      excerpt: "Deep synthesis on neural state synchronization and containerized agentic execution in Kalidass Journal.",
      coverImage: "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png",
      videoUrl: "",
      author: {
        name: "Neural Author",
        role: "Systems Research Agent",
        avatar: "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png"
      },
      tags: ["Systems", "Upstash Box", "Neural Runtimes", "Node"],
      accent: ${JSON.stringify(request.accent || "#6366f1")},
      featured: false,
      blocks: [
        {
          type: "heading",
          text: "1. Node Runtime Invariants in Isolated Containers"
        },
        {
          type: "paragraph",
          text: "By running an isolated Node container in Upstash Box, research agents orchestrate hybrid research workflows combining Tavily and SerpApi intelligence."
        }
      ],
      published: false,
      private: true,
      aiGenerated: true,
      isFallback: true,
      fallbackNotice: "Generated using local systems fallback template. Configure GEMINI_API_KEY via attachHeaders for live neural synthesis."
    };
  }

  // 5. OpenAI gpt-image-1 Technical Infographic Generation (strictly single cover image)
  try {
    const title = (generatedJson && typeof generatedJson === "object" && generatedJson.title) || "";
    const excerpt = (generatedJson && typeof generatedJson === "object" && generatedJson.excerpt) || "";
    const userContext = ${JSON.stringify([request.topic, request.angle].filter(Boolean).join(" — ") || "Systems Architecture")};
    const topicDesc = (title ? (title + (excerpt ? " — " + excerpt : "")) : userContext).slice(0, 300);

    const infographicPrompt = \`Create a modern PREMIUM horizontal landscape infographic on:
\${topicDesc}

STYLE & COLOR PALETTE:
- ultra clean pictorial colorful infographic with whitish background for modern systems engineering and computing research
- BACKGROUND: Clean, elegant whitish background (light off-white, light silver-gray, or soft alabaster white canvas) providing crisp contrast for colorful infographic elements
- COLOR PALETTE: MILDER, VIBRANT COLOR SHADES. Harmonious balance combining milder, muted matte foundation shades (soft slate, gentle charcoal, titanium, subtle deep indigo) with vibrant, luminous accent color highlights (electric indigo, radiant cyan, warm amber, vibrant violet, and emerald)
- gentle, balanced contrast that is soothing and elegant, strictly avoiding harsh over-saturated neons or dark murky clutter
- STRICTLY NO TEXT, NO WORDS, NO LABELS, NO LETTERS, NO TYPOGRAPHY anywhere in the image (except the subtle watermark below)
- 100% visual and pictorial depiction using high-tech diagrams, architecture blocks, nodes, data conduits, neural pathways, memory hierarchy schematics, and geometric illustrations only
- wide horizontal landscape composition (16:9 banner)
- balanced systems architecture blocks arranged horizontally
- looks like a premium IEEE / Elsevier editorial systems publication companion poster
- minimal clutter, mathematically precise framing

SAFETY & ETHICS:
- strictly professional, dignified, and universally positive
- strictly NO vulgarity, NO nudity, NO suggestive content, and NO socially or morally abusive depictions
- celebrate engineering rigor, distributed consensus, neural architectures, algorithmic beauty, and open-source systems

WATERMARK (SOLE TEXT EXCEPTION):
Add subtle semi-transparent watermark text:
"Kalidass"

Place watermark diagonally near bottom-right.
Keep watermark elegant and non-intrusive.\`;

    const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: infographicPrompt,
        size: "1536x1024",
        quality: "low",
        output_format: "webp",
        output_compression: 80,
        n: 1
      })
    });

    if (imgRes.ok) {
      const imgData = await imgRes.json();
      const firstItem = imgData?.data?.[0];
      const b64 = firstItem?.b64_json || firstItem?.image_bytes;
      const remoteUrl = firstItem?.url;

      if (b64 && typeof b64 === "string") {
        generatedJson.coverImage = "data:image/webp;base64," + b64;
      } else if (remoteUrl && typeof remoteUrl === "string") {
        generatedJson.coverImage = remoteUrl;
      }
    } else {
      console.warn("gpt-image-1 returned status " + imgRes.status + ", retaining curated fallback cover.");
    }
  } catch (err) {
    console.warn("gpt-image-1 infographic generation skipped:", err.message);
  }

  // 6. Ensure Mandatory Sources Attribution Block at the End
  const rawBlocks = generatedJson && typeof generatedJson === "object" && Array.isArray(generatedJson.blocks) ? generatedJson.blocks : [];
  const blocks = [...rawBlocks];
  if (citations.length > 0) {
    const attributionItems = citations
      .filter(c => c.url)
      .map(c => "• [" + c.title + "](" + c.url + ")")
      .join("\\n");

    blocks.push({
      type: "heading",
      text: "References & Empirical Attributions"
    });
    blocks.push({
      type: "quote",
      text: "Synthesized with live empirical sources gathered via hybrid search:\\n" + attributionItems,
      cite: "Autonomous Research Tooling (Firecrawl/Tavily)"
    });
  }
  generatedJson.blocks = blocks;

  fs.writeFileSync("/workspace/home/article_output.json", JSON.stringify(generatedJson, null, 2));
  console.log("NODE_GENERATION_COMPLETE");
}

run().catch((err) => {
  console.error("Node agent run error:", err);
  process.exit(1);
});
`;
}
