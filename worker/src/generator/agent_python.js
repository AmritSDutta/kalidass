import {buildSystemPrompt, buildUserPrompt} from "./prompts.js";

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
  const searchTopic = JSON.stringify(request.topic || "systems research");
  const rawWeight = parseFloat(env.TAVILY_SEARCH_WEIGHT || "80");
  const tavilyWeight = rawWeight <= 1.0 ? rawWeight * 100 : rawWeight;
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

def search_tavily(query):
    # attachHeaders injects Authorization: Bearer <key> for api.tavily.com
    url = "https://api.tavily.com/search"
    payload = {
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "max_results": 5
    }
    data = http_post_json(url, payload)
    if data and "results" in data:
        return [
            {"title": r.get("title", ""), "url": r.get("url", ""), "description": r.get("content", "")}
            for r in data.get("results", [])
        ]
    return []

def search_serpapi(query):
    # attachHeaders injects X-Api-Key for serpapi.com, or queries with engine=google
    url = f"https://serpapi.com/search.json?engine=google&q={urllib.parse.quote(query)}"
    data = http_get_json(url)
    results = []
    if data:
        # Check for AI overview
        ai_overview = data.get("ai_overview")
        if ai_overview:
            results.append({
                "title": "Google SGE AI Overview",
                "url": "https://google.com/search",
                "description": json.dumps(ai_overview)
            })
        for r in data.get("organic_results", [])[:5]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("link", ""),
                "description": r.get("snippet", "")
            })
    return results

def search_web(query):
    tavily_weight = ${tavilyWeight}
    pick_tavily = (random.random() * 100) < tavily_weight
    results = []
    if pick_tavily:
        results = search_tavily(query)
        if not results:
            results = search_serpapi(query)
    else:
        results = search_serpapi(query)
        if not results:
            results = search_tavily(query)
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

    final_user_prompt = usr_prompt + search_context

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
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                generated_json = json.loads(match.group(0))
            else:
                generated_json = json.loads(text)
        except Exception as e:
            print(f"Gemini parsing failed: {e}", file=sys.stderr)

    # 3. Fallback: Ollama Cloud API
    if not generated_json:
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
                match = re.search(r"\{[\s\S]*\}", content)
                if match:
                    generated_json = json.loads(match.group(0))
                else:
                    generated_json = json.loads(content)
            except Exception:
                pass

    # 4. Deterministic fallback if external LLMs are unconfigured
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
                "name": "Neural Agent (Upstash Box)",
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

    # 5. OpenAI gpt-image-1 Technical Infographic Generation
    try:
        title = generated_json.get("title", "")
        excerpt = generated_json.get("excerpt", "")
        topic_desc = f"{title} — {excerpt}" if excerpt else title
        topic_desc = topic_desc[:300]

        infographic_prompt = (
            f"Create a modern PREMIUM horizontal landscape infographic on:\\n"
            f"{topic_desc}\\n\\n"
            f"STYLE:\\n"
            f"- ultra clean pictorial colorful infographic for modern systems engineering and computing research\\n"
            f"- STRICTLY NO TEXT, NO WORDS, NO LABELS, NO LETTERS, NO TYPOGRAPHY anywhere in the image (except the subtle watermark below)\\n"
            f"- 100% visual and pictorial depiction using high-tech diagrams, architecture blocks, nodes, data conduits, neural pathways, memory hierarchy schematics, and geometric illustrations only\\n"
            f"- wide horizontal landscape composition (16:9 banner)\\n"
            f"- balanced systems architecture blocks arranged horizontally\\n"
            f"- sleek editorial engineering companion design with calm soothing colors and vivid accent highlights\\n"
            f"- looks like premium IEEE / ACM editorial systems poster\\n"
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
    blocks = generated_json.get("blocks", [])
    if citations:
        attribution_items = "\\n".join([f"• [{c['title']}]({c['url']})" for c in citations if c.get("url")])
        blocks.append({
            "type": "heading",
            "text": "References & Empirical Attributions"
        })
        blocks.append({
            "type": "quote",
            "text": f"Synthesized with live empirical sources gathered via hybrid search:\\n{attribution_items}",
            "cite": "Autonomous Research Tooling (Tavily/SerpApi)"
        })
    generated_json["blocks"] = blocks

    with open("/workspace/home/article_output.json", "w", encoding="utf-8") as f:
        json.dump(generated_json, f, indent=2)

    print("PYTHON_GENERATION_COMPLETE")

if __name__ == "__main__":
    main()
`;
}
