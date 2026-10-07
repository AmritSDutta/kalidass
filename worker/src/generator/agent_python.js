import {buildSystemPrompt, buildUserPrompt, buildSearchQuery, getCurrentDateFormatted} from "./prompts.js";

/**
 * Builds the Python in-box research agent script.
 * Runs in an Upstash Box with runtime: "python".
 *
 * @param {import("./types").GenerateArticleRequest} request
 * @param {any} env
 * @returns {string}
 */
export function buildPythonAgentScript(request, env) {
  const systemPrompt = JSON.stringify(buildSystemPrompt(request));
  const userPrompt = JSON.stringify(buildUserPrompt(request));
  const searchTopic = JSON.stringify(buildSearchQuery(request));
  const currentDateFormatted = JSON.stringify(getCurrentDateFormatted());
  const rawWeight = parseFloat(env.FIRECRAWL_SEARCH_WEIGHT || "70");
  const firecrawlWeight = rawWeight <= 1.0 ? rawWeight * 100 : rawWeight;
  const geminiModelName = JSON.stringify(request.model || env.GEMINI_MODEL || "gemini-3.1-flash-lite");
  const ollamaModelName = JSON.stringify(env.OLLAMA_MODEL || "gemma4:31b-cloud");
  const ollamaBaseUrl = JSON.stringify(env.OLLAMA_API_BASE_URL || "https://ollama.com");

  return `# Kalidass Journal — Custom In-Box Research Agent (Python Runtime)
import json
import os
import random
import re
import sys
import urllib.request
import urllib.parse

def log(msg):
    print(f"[Box Intel] {msg}")

def http_post_json(url, payload, headers=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"POST {url} failed: {e}", file=sys.stderr)
        return None

def http_get_json(url, headers=None):
    req = urllib.request.Request(url, method="GET")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"GET {url} failed: {e}", file=sys.stderr)
        return None

def parse_json_safely(raw_text):
    if not raw_text or not isinstance(raw_text, str):
        return None
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^[\\x60]{3}(?:json)?\\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\\s*[\\x60]{3}$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    match_obj = re.search(r"\{[\s\S]*\}", cleaned)
    if match_obj:
        try:
            return json.loads(match_obj.group(0))
        except Exception:
            pass
    match_arr = re.search(r"\[[\s\S]*\]", cleaned)
    if match_arr:
        try:
            return json.loads(match_arr.group(0))
        except Exception:
            pass
    return None

def search_tavily(query):
    # attachHeaders injects Authorization: Bearer <key> for api.tavily.com
    log(f"Tavily called...")
    url = "https://api.tavily.com/search"
    payload = {
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "time_range": "year",
        "max_results": 5
    }
    data = http_post_json(url, payload)
    if data and "results" in data:
        return [
            {"title": r.get("title", ""), "url": r.get("url", ""), "description": r.get("content", "")}
            for r in data.get("results", [])
        ]

    return []

def search_firecrawl(query):
    # attachHeaders injects Authorization: Bearer <key> for api.firecrawl.dev
    log(f"firecrawl called...")
    url = "https://api.firecrawl.dev/v1/search"
    payload = {
        "query": query,
        "limit": 5,
        "scrapeOptions": {"formats": ["markdown"]}
    }
    data = http_post_json(url, payload)
    if data and "data" in data and isinstance(data["data"], list):
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "description": r.get("description", "") or (r.get("markdown", "")[:300] if r.get("markdown") else "")
            }
            for r in data["data"]
        ]
    return []

def search_web(query):
    firecrawl_weight = ${firecrawlWeight}
    pick_firecrawl = (random.random() * 100) < firecrawl_weight
    results = []
    if pick_firecrawl:
        results = search_firecrawl(query)
        if not results:
            results = search_tavily(query)
    else:
        results = search_tavily(query)
        if not results:
            results = search_firecrawl(query)
    return results

def main():
    sys_prompt = ${systemPrompt}
    usr_prompt = ${userPrompt}

    # 1. Execute Hybrid Search
    citations = search_web(${searchTopic})
    search_context = ""
    if citations:
        search_context = "\\n\\nEMPIRICAL WEB RESEARCH CITATIONS:\\n" + "\\n".join(
            [f"- {c['title']}: {c['description']} ({c['url']})" for c in citations]
        )

    final_user_prompt = (
        f"{usr_prompt}"
        f"{search_context}\\n\\n"
        "MANDATORY REMINDER:\\n"
        "The user's thesis angle and architectural focus specified above is a NON-NEGOTIABLE INVARIANT. "
        "Fulfill and prioritize all constraints, frameworks, and questions in the thesis angle. "
        "Do not allow search citations to override or dilute the user's explicit intent."
    )

    # 2. Primary Synthesis: Google Gemini API (headers injected via attachHeaders)
    gemini_model = ${geminiModelName}
    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
    gemini_payload = {
        "systemInstruction": {"parts": [{"text": sys_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": final_user_prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }

    generated_json = None
    data = http_post_json(gemini_url, gemini_payload)
    if data:
        try:
            cand = data.get("candidates", [])[0]
            text = cand.get("content", {}).get("parts", [])[0].get("text", "")
            generated_json = parse_json_safely(text)
        except Exception as e:
            log(f"Gemini parsing failed: {e}", file=sys.stderr)
            print(f"Gemini parsing failed: {e}", file=sys.stderr)

    # 3. Fallback: Ollama Cloud API
    if not generated_json:
        log(f"ollama getting called")

        ollama_url = f"{${ollamaBaseUrl}}/api/chat"
        ollama_payload = {
            "model": ${ollamaModelName},
            "format": "json",
            "stream": False,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": final_user_prompt}
            ]
        }
        data = http_post_json(ollama_url, ollama_payload)
        if data and "message" in data:
            try:
                content = data["message"].get("content", "")
                generated_json = parse_json_safely(content)
            except Exception as e:
                log(f"Ollama parsing failed: {e}", file=sys.stderr)
                print(f"Ollama parsing failed: {e}", file=sys.stderr)

    # 3.5. Normalize polymorphic structure (handle bare block arrays or wrapped arrays)
    if isinstance(generated_json, list):
        if len(generated_json) > 0 and isinstance(generated_json[0], dict) and ("blocks" in generated_json[0] or "title" in generated_json[0]):
            generated_json = generated_json[0]
        elif len(generated_json) > 0 and all(isinstance(item, dict) and "type" in item for item in generated_json):
            generated_json = {
                "title": ${JSON.stringify(request.topic || "Autonomous Systems Synthesis")},
                "subtitle": ${JSON.stringify(request.angle || "Field notes from isolated container runtime.")},
                "excerpt": f"Empirical systems research on {${JSON.stringify(request.topic || 'systems architecture')}}.",
                "tags": ["Systems", "Research", "Upstash Box"],
                "accent": ${JSON.stringify(request.accent || "#6366f1")},
                "blocks": generated_json
            }
        else:
            generated_json = None

    if not isinstance(generated_json, dict):
        generated_json = None

    # 4. Deterministic fallback if external LLMs are unconfigured or failed
    is_fallback = False
    if not generated_json:
        is_fallback = True
        generated_json = {
            "title": ${JSON.stringify(request.topic || "Autonomous Systems Synthesis")},
            "subtitle": ${JSON.stringify(request.angle || "Field notes from isolated container runtime.")},
            "excerpt": "Deep synthesis on neural state synchronization and containerized agentic execution in Kalidass Journal.",
            "coverImage": "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png",
            "videoUrl": "",
            "author": {
                "name": "Neural Author",
                "role": "Systems Research Agent",
                "avatar": "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png"
            },
            "tags": ["Systems", "Upstash Box", "Neural Runtimes", "Python"],
            "accent": ${JSON.stringify(request.accent || "#6366f1")},
            "featured": False,
            "blocks": [
                {
                    "type": "heading",
                    "text": "1. Python Runtime Invariants in Isolated Containers"
                },
                {
                    "type": "paragraph",
                    "text": "By running an isolated Python container in Upstash Box, research agents orchestrate hybrid research workflows combining Tavily and SerpApi intelligence."
                }
            ],
            "published": False,
            "private": True,
            "aiGenerated": True,
            "isFallback": True,
            "fallbackNotice": "Generated using local systems fallback template. Configure GEMINI_API_KEY via attachHeaders for live neural synthesis."
        }

    # 5. OpenAI gpt-image-1 Technical Infographic Generation (strictly single cover image)
    try:
        title = generated_json.get("title", "") if isinstance(generated_json, dict) else ""
        excerpt = generated_json.get("excerpt", "") if isinstance(generated_json, dict) else ""
        user_context = ${JSON.stringify([request.topic, request.angle].filter(Boolean).join(" — ") || "Systems Architecture")}
        topic_desc = f"{title} — {excerpt}" if excerpt else str(title or user_context)
        topic_desc = topic_desc[:300]

        infographic_prompt = (
            f"Create a modern PREMIUM horizontal landscape infographic on:\\n"
            f"{topic_desc}\\n\\n"
            f"STYLE & COLOR PALETTE:\\n"
            f"- ultra clean pictorial colorful infographic with whitish background for modern systems engineering and computing research\\n"
            f"- BACKGROUND: Clean, elegant whitish background (light off-white, light silver-gray, or soft alabaster white canvas) providing crisp contrast for colorful infographic elements\\n"
            f"- COLOR PALETTE: MILDER, VIBRANT COLOR SHADES. Harmonious balance combining milder, muted matte foundation shades (soft slate, gentle charcoal, titanium, subtle deep indigo) with vibrant, luminous accent color highlights (electric indigo, radiant cyan, warm amber, vibrant violet, and emerald)\\n"
            f"- gentle, balanced contrast that is soothing and elegant, strictly avoiding harsh over-saturated neons or dark murky clutter\\n"
            f"- STRICTLY NO TEXT, NO WORDS, NO LABELS, NO LETTERS, NO TYPOGRAPHY anywhere in the image (except the subtle watermark below)\\n"
            f"- 100% visual and pictorial depiction using high-tech diagrams, architecture blocks, nodes, data conduits, neural pathways, memory hierarchy schematics, and geometric illustrations only\\n"
            f"- wide horizontal landscape composition (16:9 banner)\\n"
            f"- balanced systems architecture blocks arranged horizontally\\n"
            f"- looks like a premium IEEE / Elsevier editorial systems publication companion poster\\n"
            f"- minimal clutter, mathematically precise framing\\n\\n"
            f"SAFETY & ETHICS:\\n"
            f"- strictly professional, dignified, and universally positive\\n"
            f"- strictly NO vulgarity, NO nudity, NO suggestive content, and NO socially or morally abusive depictions\\n"
            f"- celebrate engineering rigor, distributed consensus, neural architectures, algorithmic beauty, and open-source systems\\n\\n"
            f"WATERMARK (SOLE TEXT EXCEPTION):\\n"
            f"Add subtle semi-transparent watermark text:\\n"
            f"\\"Kalidass\\"\\n\\n"
            f"Place watermark diagonally near bottom-right.\\n"
            f"Keep watermark elegant and non-intrusive."
        )

        gpt_img_payload = {
            "model": "gpt-image-1",
            "prompt": infographic_prompt,
            "size": "1536x1024",
            "quality": "low",
            "output_format": "webp",
            "output_compression": 80,
            "n": 1
        }
        gpt_img_data = http_post_json("https://api.openai.com/v1/images/generations", gpt_img_payload)
        if gpt_img_data and "data" in gpt_img_data and len(gpt_img_data["data"]) > 0:
            first_item = gpt_img_data["data"][0]
            b64 = first_item.get("b64_json") or first_item.get("image_bytes")
            remote_url = first_item.get("url")
            if b64:
                generated_json["coverImage"] = f"data:image/webp;base64,{b64}"
            elif remote_url:
                generated_json["coverImage"] = remote_url
    except Exception as e:
        print(f"gpt-image-1 generation skipped: {e}", file=sys.stderr)

    # 6. Ensure Mandatory Sources Attribution Block at the End
    raw_blocks = generated_json.get("blocks", []) if isinstance(generated_json, dict) else []
    blocks = raw_blocks if isinstance(raw_blocks, list) else []
    if citations:
        attribution_items = "\\n".join([f"• [{c['title']}]({c['url']})" for c in citations if c.get("url")])
        blocks.append({
            "type": "heading",
            "text": "References & Empirical Attributions"
        })
        blocks.append({
            "type": "quote",
            "text": f"Synthesized with live empirical sources gathered via hybrid search:\\n{attribution_items}",
            "cite": "Autonomous Research Tooling (Firecrawl/Tavily)"
        })
    generated_json["blocks"] = blocks

    with open("/workspace/home/article_output.json", "w", encoding="utf-8") as f:
        json.dump(generated_json, f, indent=2)

    log("PYTHON_GENERATION_COMPLETE")
    print("PYTHON_GENERATION_COMPLETE")

if __name__ == "__main__":
    main()
`;
}
