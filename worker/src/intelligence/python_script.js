/**
 * Generates the Python script to run inside the ephemeral Upstash Box.
 * Executes SERP queries against SerpApi (leveraging attachHeaders proxy auth).
 *
 * @param {{ query: string, title: string, summary: string }} params
 * @returns {string} Python script string
 */
export function buildIntelligenceScript(params) {
  const queryStr = JSON.stringify(params.query || params.title);
  const titleStr = JSON.stringify(params.title);
  const apiKeyStr = JSON.stringify(params.apiKey || "");

  return `#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

SEARCH_URL = "https://serpapi.com/search.json"
MAIN_QUERY = ${queryStr}
TITLE = ${titleStr}
API_KEY = ${apiKeyStr}

def log(msg):
    print(f"[Box Intel] {msg}", file=sys.stderr, flush=True)

def search(params, timeout=35, max_retries=1):
    query = {k: v for k, v in params.items() if v is not None and v != ""}
    api_key = os.environ.get("SERPAPI_API_KEY") or os.environ.get("SERPAPI_KEY") or API_KEY
    if api_key:
        query["api_key"] = api_key
    url = f"{SEARCH_URL}?{urllib.parse.urlencode(query, doseq=True)}"
    headers = {"User-Agent": "kalidass-intel/1.0"}
    if api_key:
        headers["X-Api-Key"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"

    for attempt in range(max_retries + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                return json.loads(body)
            except Exception:
                return {"error": body, "_http_status": exc.code}
        except Exception as e:
            if attempt < max_retries:
                log(f"Warning: search attempt {attempt + 1} failed ({e}). Retrying in 1.5s...")
                time.sleep(1.5)
                continue
            return {"error": str(e)}

def main():
    start_total = time.time()
    q = MAIN_QUERY
    log(f"Starting single-pass SERP extraction for: {TITLE}")
    log(f"Search Query: '{q}'")

    api_key = os.environ.get("SERPAPI_API_KEY") or os.environ.get("SERPAPI_KEY") or API_KEY
    has_key = bool(api_key and len(api_key) > 5)
    log(f"Auth check: Attached proxy headers active; API key parameter resolved: {has_key}")

    # 1. Single primary call to SerpApi Google search engine
    t0 = time.time()
    log("Calling SerpApi Google Search engine (single unified request for all keys)...")
    google = search({"engine": "google", "q": q, "gl": "us", "hl": "en", "num": 10}, timeout=35)
    t_search = time.time() - t0

    if google.get("error"):
        log(f"FATAL: SerpApi returned error: {google.get('error')}")
        sys.exit(1)

    log(f"SerpApi Google search completed in {t_search:.2f}s (HTTP 200).")

    # Extract all SERP blocks from the single response
    organic = google.get("organic_results") or []
    ai_overview = google.get("ai_overview")
    kg = google.get("knowledge_graph")
    answer_box = google.get("answer_box")
    paa = google.get("related_questions") or []
    videos = google.get("inline_videos") or []
    news = google.get("news_results") or google.get("top_stories") or []
    shopping = google.get("shopping_results") or google.get("inline_shopping") or []
    jobs = google.get("jobs_results") or []
    discussions = google.get("discussions_and_forums") or []

    log(
        f"Keys extracted: organic={len(organic)}, ai_overview={bool(ai_overview)}, "
        f"kg={bool(kg)}, answer_box={bool(answer_box)}, paa={len(paa)}, videos={len(videos)}, "
        f"news={len(news)}, shopping={len(shopping)}, jobs={len(jobs)}, discussions={len(discussions)}"
    )

    if not organic and not ai_overview and not kg:
        log("ERROR: Google search returned empty results without organic, AI overview or KG.")
        sys.exit(1)

    # 2. Expand AI Overview only if a page_token is present
    if ai_overview and isinstance(ai_overview, dict) and ai_overview.get("page_token"):
        token = ai_overview.get("page_token")
        log("Expanding AI overview via page token...")
        t_exp = time.time()
        extra = search({"engine": "google_ai_overview", "page_token": token}, timeout=10)
        log(f"Expanded AI overview completed in {time.time() - t_exp:.2f}s.")
        merged = dict(ai_overview)
        merged["expanded"] = extra.get("ai_overview") or extra
        ai_overview = merged

    # 3. Strip re-query metadata: serpapi_link can embed account credentials
    #    and page_token/serpapi_link are never rendered by the panel.
    for block in (ai_overview, kg, answer_box):
        if isinstance(block, dict):
            block.pop("serpapi_link", None)
            block.pop("page_token", None)
    expanded = ai_overview.get("expanded") if isinstance(ai_overview, dict) else None
    if isinstance(expanded, dict):
        expanded.pop("serpapi_link", None)
        expanded.pop("page_token", None)

    intelligence = {
        "query": q,
        "ai_overview": ai_overview if ai_overview else None,
        "knowledge_graph": kg,
        "answer_box": answer_box,
        "inline_videos": videos,
        "books_shopping": shopping[:8] if isinstance(shopping, list) else [],
        "jobs_results": jobs[:6] if isinstance(jobs, list) else [],
        "discussions_and_forums": discussions,
        "people_also_ask": paa if isinstance(paa, list) else [],
        "news": news[:5] if isinstance(news, list) else [],
        "organic_results": [
            {
                "title": r.get("title", ""),
                "link": r.get("link", ""),
                "snippet": r.get("snippet", ""),
            }
            for r in organic[:10]
        ],
        "fetchedAt": datetime.now(timezone.utc).isoformat()
    }

    output_path = "/workspace/home/intelligence.json"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(intelligence, f, indent=2)
        total_time = time.time() - start_total
        file_size = os.path.getsize(output_path)
        log(f"Intelligence successfully written to {output_path} ({file_size} bytes).")
        log(f"Total Box execution time: {total_time:.2f}s. Exiting cleanly with code 0.")
    except Exception as f_err:
        log(f"Error saving to disk ({f_err}), emitting stdout fallback...")
        print("---OUTPUT_START---")
        print(json.dumps(intelligence))
        print("---OUTPUT_END---")

if __name__ == "__main__":
    main()
`;
}
