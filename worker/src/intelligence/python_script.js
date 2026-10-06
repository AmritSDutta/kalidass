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
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

SEARCH_URL = "https://serpapi.com/search.json"
MAIN_QUERY = ${queryStr}
TITLE = ${titleStr}
API_KEY = ${apiKeyStr}

SERP_KEYS = [
    "ai_overview",
    "answer_box",
    "knowledge_graph",
    "organic_results",
    "related_questions",
    "related_searches",
    "top_stories",
    "news_results",
    "inline_videos",
    "inline_images",
    "inline_shopping",
    "shopping_results",
    "jobs_results",
    "twitter_results",
    "discussions_and_forums",
    "perspectives",
    "top_insights",
    "things_to_know",
]

def search(params):
    query = {k: v for k, v in params.items() if v is not None and v != ""}
    api_key = os.environ.get("SERPAPI_API_KEY") or os.environ.get("SERPAPI_KEY") or API_KEY
    if api_key:
        query["api_key"] = api_key
    url = f"{SEARCH_URL}?{urllib.parse.urlencode(query, doseq=True)}"
    headers = {"User-Agent": "kalidass-intel/1.0"}
    if api_key:
        headers["X-Api-Key"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except Exception:
            return {"error": body, "_http_status": exc.code}
    except Exception as e:
        return {"error": str(e)}

def pick_serp_blocks(google):
    out = {}
    for key in SERP_KEYS:
        if key in google:
            out[key] = google[key]
    return out

def expand_ai_overview(google):
    overview = google.get("ai_overview") or {}
    token = overview.get("page_token")
    if not token:
        return overview
    extra = search({"engine": "google_ai_overview", "page_token": token})
    merged = dict(overview)
    merged["expanded"] = extra.get("ai_overview") or extra
    return merged

def fetch_trends(q):
    packs = {}
    for data_type in ("TIMESERIES", "GEO_MAP_0", "RELATED_QUERIES", "RELATED_TOPICS"):
        params = {
            "engine": "google_trends",
            "q": q,
            "data_type": data_type,
            "hl": "en",
            "date": "today 12-m",
        }
        res = search(params)
        if not res.get("error"):
            packs[data_type] = res
    return packs

def main():
    q = MAIN_QUERY
    print(f"Fetching SERP intelligence for: {q}", file=sys.stderr)

    # 1. Main Google Search
    google = search({"engine": "google", "q": q, "gl": "us", "hl": "en", "num": 10})

    # Finding 1 Validation: fail early if SerpApi rejected or returned zero results due to error
    if google.get("error"):
        print(f"SERP API Error: {google.get('error')}", file=sys.stderr)
        sys.exit(1)

    organic = google.get("organic_results") or []
    if not organic and not google.get("ai_overview") and not google.get("knowledge_graph"):
        print("SERP search returned empty payload without organic, AI overview or KG results.", file=sys.stderr)
        sys.exit(1)

    blocks = pick_serp_blocks(google)

    # 2. Expanded AI Overview
    ai_overview = expand_ai_overview(google)

    # 3. People Also Ask (dedicated high-yield engine fallback)
    paa_res = google.get("related_questions")
    if not paa_res:
        paa_search = search({"engine": "google_related_questions", "q": q, "gl": "us", "hl": "en"})
        paa_res = paa_search.get("related_questions") or []

    # 4. Books Shopping List (via google_shopping_light)
    books_query = f"{TITLE} books"
    books_res = search({"engine": "google_shopping_light", "q": books_query, "gl": "us", "hl": "en"})
    shopping_books = books_res.get("shopping_results") or []

    # 5. Job Opportunities (via google_jobs)
    jobs_res = google.get("jobs_results")
    if not jobs_res:
        jobs_search = search({"engine": "google_jobs", "q": q, "gl": "us", "hl": "en"})
        jobs_res = jobs_search.get("jobs_results") or []

    # 6. Trends & Graph Velocity
    trends = fetch_trends(q)

    # 7. News Light
    news_res = google.get("news_results") or google.get("top_stories")
    if not news_res:
        news_search = search({"engine": "google_news_light", "q": q, "gl": "us", "hl": "en"})
        news_res = news_search.get("news_results") or []

    intelligence = {
        "query": q,
        "ai_overview": ai_overview if ai_overview else None,
        "knowledge_graph": google.get("knowledge_graph"),
        "answer_box": google.get("answer_box"),
        "inline_videos": google.get("inline_videos") or [],
        "books_shopping": shopping_books[:8] if isinstance(shopping_books, list) else [],
        "jobs_results": jobs_res[:6] if isinstance(jobs_res, list) else [],
        "twitter_results": google.get("twitter_results") or [],
        "discussions_and_forums": google.get("discussions_and_forums") or google.get("perspectives") or [],
        "people_also_ask": paa_res if isinstance(paa_res, list) else [],
        "trends": {
            "interest_over_time": trends.get("TIMESERIES", {}).get("interest_over_time"),
            "interest_by_region": trends.get("GEO_MAP_0", {}).get("interest_by_region"),
            "related_queries": trends.get("RELATED_QUERIES", {}).get("related_queries"),
            "related_topics": trends.get("RELATED_TOPICS", {}).get("related_topics"),
        },
        "news": news_res[:5] if isinstance(news_res, list) else [],
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
        print(f"Intelligence successfully written to {output_path}", file=sys.stderr)
    except Exception:
        # Fallback dump to stdout
        print("---OUTPUT_START---")
        print(json.dumps(intelligence))
        print("---OUTPUT_END---")

if __name__ == "__main__":
    main()
`;
}
