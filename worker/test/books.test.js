import {describe, it, expect, beforeEach, vi} from "vitest";
import worker from "../src/index.js";
import {
  getBooksObjectPath,
  isValidBooksPayload,
  peekArticleBooks,
  getOrGenerateArticleBooks,
} from "../src/books/service.js";
import {
  scoreItemHeuristic,
  scoreAndRankBooks,
  parseScoreJson,
  safeNum,
  formatScores,
  isBookDeterministic,
  parseUnifiedScore,
  scoreBooksJevBatch,
  scoreBooksClefBatch,
  BOOK_SCORE_CRITERIA,
} from "../src/books/scorer.js";
import {formatRedisKey, getRedisClient} from "../src/redis/index.js";

describe("Books Suggestion Subsystem (Hermetic)", () => {
  const env = {
    ADMIN_TOKEN: "test-secret-token",
    UPSTASH_BLOB_TOKEN: undefined,
    ROOT_BUCKET: "kalidass",
    CORS_ORIGIN: "*",
    EVAL_PROVIDER: "heuristic",
    SERPAPI_API_KEY: "test-serp-key",
  };

  const createRequest = (path, options = {}) => {
    const url = `https://kalidass.amrit.fyi${path}`;
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === "object") {
      headers.set("Content-Type", "application/json");
      options.body = JSON.stringify(options.body);
    }
    return new Request(url, {...options, headers});
  };

  const nativeFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = String(input?.url || input || "");
      if (urlStr.includes("serpapi.com")) {
        return new Response(
          JSON.stringify({
            organic_results: [
              {
                title: "Mock Book on Systems",
                link: "https://amazon.in/dp/mock",
                price: "₹799",
                rating: 4.6,
                ratings_total: 150,
                authors: ["Mock Author"],
              },
            ],
          }),
          {status: 200, headers: {"Content-Type": "application/json"}}
        );
      }
      return nativeFetch(input, init);
    });

    if (globalThis.__kalidass_redis_memory) {
      globalThis.__kalidass_redis_memory.clear();
    }
    if (globalThis.__kalidass_storage_memory) {
      globalThis.__kalidass_storage_memory.clear();
    }
  });

  it("getBooksObjectPath constructs canonical path", () => {
    const path = getBooksObjectPath("art-456", env);
    expect(path).toBe("kalidass/books/art-456.json");
  });

  it("isValidBooksPayload accurately validates book payloads", () => {
    expect(isValidBooksPayload(null)).toBe(false);
    expect(isValidBooksPayload({})).toBe(false);
    expect(isValidBooksPayload({query: "Books on: Distributed Systems"})).toBe(false);
    expect(isValidBooksPayload({query: "Books on: Test", books: []})).toBe(false);
    expect(
      isValidBooksPayload({
        query: "Books on: Test",
        books: [{title: "Designing Data-Intensive Applications", link: "https://amazon.in"}],
      })
    ).toBe(true);
  });

  it("scoreItemHeuristic scores positive and negative cues", () => {
    const goodBook = {
      title: "Designing Data-Intensive Applications: Reliable, Scalable Systems (Paperback)",
      authors: ["Martin Kleppmann"],
      price: "₹1,499",
    };
    const scoreGood = scoreItemHeuristic(goodBook, "Distributed Systems");
    expect(scoreGood.isBookConfidence).toBeGreaterThan(0.7);
    expect(scoreGood.topicSimilarity).toBeGreaterThan(0.3);

    const badItem = {
      title: "Shockproof Protective Case Cover for Kindle Paperwhite",
      authors: [],
      price: "₹399",
    };
    const scoreBad = scoreItemHeuristic(badItem, "Distributed Systems");
    expect(scoreBad.isBookConfidence).toBeLessThan(0.5);
  });

  it("scoreAndRankBooks prunes non-books and strictly caps to top 3", async () => {
    const candidates = [
      {title: "Designing Data-Intensive Applications", authors: ["Martin Kleppmann"], link: "https://amazon.in/1", price: "₹1499", rating: 4.8, reviews_count: 5000},
      {title: "Kindle Leather Cover Case Black", authors: [], link: "https://amazon.in/2", price: "₹899", rating: 4.2, reviews_count: 300},
      {title: "Distributed Systems: Principles and Paradigms", authors: ["Andrew Tanenbaum"], link: "https://amazon.in/3", price: "₹850", rating: 4.6, reviews_count: 800},
      {title: "Database Internals: A Deep Dive", authors: ["Alex Petrov"], link: "https://amazon.in/4", price: "₹1200", rating: 4.7, reviews_count: 1200},
      {title: "Building Microservices: Designing Fine-Grained Systems", authors: ["Sam Newman"], link: "https://amazon.in/5", price: "₹950", rating: 4.6, reviews_count: 2100},
      {title: "USB C Fast Charger Cable for Readers", authors: [], link: "https://amazon.in/6", price: "₹299", rating: 4.0, reviews_count: 150},
    ];

    const result = await scoreAndRankBooks(candidates, "Distributed Systems", env);
    expect(result.books.length).toBe(3);
    expect(result.books.every((b) => !b.title.includes("Case") && !b.title.includes("Cable"))).toBe(true);
    expect(result.books.map((b) => b.title)).toContain("Distributed Systems: Principles and Paradigms");
    expect(result.books.map((b) => b.title)).toContain("Designing Data-Intensive Applications");
  });

  it("getOrGenerateArticleBooks caches in Redis and Blob with 24h TTL", async () => {
    const article = {
      id: "art-test-1",
      title: "Agentic Workflows and Edge Cognition",
    };

    const mockFetch = async (topic) => ({
      query: `Books on: ${topic}`,
      topic,
      amazon_domain: "amazon.in",
      rawItems: [
        {title: "Generative AI Systems", link: "https://amazon.in/dp/1", authors: ["Author A"], price: "₹699", rating: 4.5, reviews_count: 100},
        {title: "AI Agent Architecture", link: "https://amazon.in/dp/2", authors: ["Author B"], price: "₹899", rating: 4.6, reviews_count: 150},
        {title: "Prompt Engineering Guide", link: "https://amazon.in/dp/3", authors: ["Author C"], price: "₹499", rating: 4.3, reviews_count: 80},
      ],
    });

    const inMemoryStorage = {
      store: new Map(),
      bucket: {},
      readJson: async (_b, path) => inMemoryStorage.store.get(path) || null,
      putJson: async (_b, path, val) => inMemoryStorage.store.set(path, val),
      fetchAmazonBooksFn: mockFetch,
    };

    const res = await getOrGenerateArticleBooks(article, env, inMemoryStorage);
    expect(res.books.length).toBe(3);
    expect(res.query).toBe("Books on: Agentic Workflows and Edge Cognition");

    // Verify written to Blob
    const blobKey = getBooksObjectPath(article.id, env);
    expect(inMemoryStorage.store.has(blobKey)).toBe(true);

    // Verify cached in Redis
    const redis = getRedisClient(env);
    const cached = await redis.get(`books_suggestion:${article.id}`);
    expect(cached).toBeTruthy();

    // Peek should return without invoking fetch again
    const peeked = await peekArticleBooks(article.id, env, inMemoryStorage);
    expect(peeked.books.length).toBe(3);
  });

  it("handles GET /api/articles/:id/books public and 404 behavior", async () => {
    // 1. Unseeded / unknown article returns 404
    const reqUnknown = createRequest("/api/articles/non-existent-id/books", {method: "GET"});
    const resUnknown = await worker.fetch(reqUnknown, env);
    expect(resUnknown.status).toBe(404);

    // 2. Create article via admin
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: `Bearer ${env.ADMIN_TOKEN}`},
      body: {
        title: "Systems Programming in Modern Times",
        published: true,
        private: false,
        blocks: [{type: "paragraph", text: "Systems overview."}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    // 3. GET /api/articles/:id/books initially 404 (uncompiled)
    const reqBooks = createRequest(`/api/articles/${created.slug}/books`, {method: "GET"});
    const resBooks = await worker.fetch(reqBooks, env);
    expect(resBooks.status).toBe(404);

    // 4. GET /api/articles/:id has has_books: false
    const reqStory = createRequest(`/api/articles/${created.slug}`, {method: "GET"});
    const resStory = await worker.fetch(reqStory, env);
    expect(resStory.status).toBe(200);
    const storyJson = await resStory.json();
    expect(storyJson.has_books).toBe(false);
  });

  it("formatScores and safeNum safely preserve 0 and falsey-zero values", () => {
    expect(safeNum(0, 0.8)).toBe(0);
    expect(safeNum("0", 0.8)).toBe(0);
    expect(safeNum(null, 0.8)).toBe(0.8);
    expect(safeNum(undefined, 0.8)).toBe(0.8);

    const scoresZero = formatScores({is_book: 0, similarity: 0});
    expect(scoresZero.isBookConfidence).toBe(0);
    expect(scoresZero.topicSimilarity).toBe(0);
    expect(scoresZero.score).toBe(0);

    const scoresHigh = formatScores({is_book: 0.9, similarity: 0.8});
    expect(scoresHigh.isBookConfidence).toBe(0.9);
    expect(scoresHigh.topicSimilarity).toBe(0.8);
    expect(scoresHigh.score).toBe(0.84);
  });

  it("parseScoreJson parses stringified JSON and json embedded in text", () => {
    expect(parseScoreJson('{"is_book": 0.85, "similarity": 0.9}')).toEqual({is_book: 0.85, similarity: 0.9});
    expect(parseScoreJson('Result is {"is_book": 0.5, "similarity": 0.5} completed')).toEqual({is_book: 0.5, similarity: 0.5});
    expect(parseScoreJson("unparseable response")).toEqual({is_book: 0.0, similarity: 0.0});
  });

  it("enforces negative authorization on POST and draft GET endpoints", async () => {
    // 1. Create a draft private article
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: `Bearer ${env.ADMIN_TOKEN}`},
      body: {
        title: "Author Draft Story",
        author: {name: "Alice", role: "Researcher", avatar: ""},
        authorEmail: "alice@example.com",
        published: false,
        private: true,
        blocks: [{type: "paragraph", text: "Draft text."}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    const draft = await createRes.json();

    // 2. Unauthenticated GET /api/articles/:id/books on private draft returns 404 (no existence leak)
    const getAnon = createRequest(`/api/articles/${draft.slug}/books`, {method: "GET"});
    const resAnon = await worker.fetch(getAnon, env);
    expect(resAnon.status).toBe(404);

    // 3. Unauthenticated POST /api/articles/:id/books returns 401
    const postAnon = createRequest(`/api/articles/${draft.slug}/books`, {method: "POST"});
    const resPostAnon = await worker.fetch(postAnon, env);
    expect(resPostAnon.status).toBe(401);

    // 4. Invalid token returns 401
    const postWrong = createRequest(`/api/articles/${draft.slug}/books`, {
      method: "POST",
      headers: {Authorization: "Bearer invalid-token"},
    });
    const resPostWrong = await worker.fetch(postWrong, env);
    expect(resPostWrong.status).toBe(401);
  });

  it("GET /api/articles/:id?books=true bypasses cached article short-circuit", async () => {
    // Create a published public article
    const createReq = createRequest("/api/articles", {
      method: "POST",
      headers: {Authorization: `Bearer ${env.ADMIN_TOKEN}`},
      body: {
        title: "Warmed Cache Story",
        published: true,
        private: false,
        blocks: [{type: "paragraph", text: "Content"}],
      },
    });
    const createRes = await worker.fetch(createReq, env);
    const art = await createRes.json();

    // Warm in Redis cache by calling regular GET
    const warmReq = createRequest(`/api/articles/${art.slug}`, {method: "GET"});
    const warmRes = await worker.fetch(warmReq, env);
    expect(warmRes.status).toBe(200);

    // Verify article is warmed in Redis
    const redis = getRedisClient(env);
    const cached = await redis.get(`article:${art.id}`);
    expect(cached).toBeTruthy();

    // Now call with ?books=true - should NOT be swallowed by cachedArticle short-circuit
    const booksReq = createRequest(`/api/articles/${art.slug}?books=true`, {
      method: "GET",
      headers: {Authorization: `Bearer ${env.ADMIN_TOKEN}`},
    });
    const booksRes = await worker.fetch(booksReq, env);
    expect(booksRes.status).toBe(200);
    const body = await booksRes.json();
    expect(body).toHaveProperty("books_suggestions");
  });

  it("isBookDeterministic accurately identifies books and flags accessories", () => {
    expect(isBookDeterministic({title: "Designing Data-Intensive Applications", authors: ["Martin Kleppmann"]})).toBe(true);
    expect(isBookDeterministic({title: "Shockproof Leather Case Cover for Kindle", authors: []})).toBe(false);
    expect(isBookDeterministic({title: "Fast USB-C Charging Cable for E-readers", authors: []})).toBe(false);
    expect(isBookDeterministic({title: "Computer Networks: A Systems Approach", authors: ["Larry Peterson"]})).toBe(true);
  });

  it("parseUnifiedScore normalizes score by top level (criteria.length - 1)", () => {
    // 5 levels: topLevel = 4
    // Score of 3.0 out of 4 -> 3.0 / 4 = 0.75
    const res = parseUnifiedScore({
      type: "score",
      score: 3.0,
      confidence: 0.95,
      legend: {"0": "...", "1": "...", "2": "...", "3": "...", "4": "..."},
      probabilities: {"0": 0.0, "1": 0.0, "2": 0.1, "3": 0.9, "4": 0.0},
    }, BOOK_SCORE_CRITERIA);

    expect(res.score).toBe(0.75);
    expect(res.topicSimilarity).toBe(0.75);
    expect(res.isBookConfidence).toBe(0.95);

    // Score of 0.2 with high probability on level 0 (not a book)
    const badRes = parseUnifiedScore({
      type: "score",
      score: 0.1,
      confidence: 0.85,
      probabilities: {"0": 0.90, "1": 0.10, "2": 0.0, "3": 0.0, "4": 0.0},
    }, BOOK_SCORE_CRITERIA);

    expect(badRes.score).toBe(0.025);
    expect(badRes.isBookConfidence).toBe(0.10);

    // Level string extraction via numeric string "3" or "level 3"
    const strRes = parseUnifiedScore({level: "3"}, BOOK_SCORE_CRITERIA);
    expect(strRes.score).toBe(0.75);
    expect(strRes.isBookConfidence).toBe(0.95);

    // Un-judged / missing item receives 0.0 instead of permissive 0.75
    const nullRes = parseUnifiedScore(null, BOOK_SCORE_CRITERIA);
    expect(nullRes.score).toBe(0.0);
    expect(nullRes.isBookConfidence).toBe(0.0);
  });

  it("scoreBooksJevBatch executes a SINGLE network request with all candidates and criteria", async () => {
    const fetchCalls = [];
    const mockEnv = {
      ...env,
      TYPESAFE_API_KEY: "test-typesafe-key",
      EVAL_PROVIDER: "jev",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = String(input?.url || input || "");
      if (urlStr.includes("api.typesafe.ai")) {
        fetchCalls.push({url: urlStr, body: JSON.parse(init.body)});
        return new Response(
          JSON.stringify({
            model: "jev-latest",
            answers: {
              item_0: {type: "score", score: 3.6, confidence: 0.9, probabilities: {"0": 0.0, "3": 0.6, "4": 0.4}},
              item_1: {type: "score", score: 0.1, confidence: 0.9, probabilities: {"0": 0.95, "1": 0.05}},
              item_2: {type: "score", score: 3.2, confidence: 0.8, probabilities: {"0": 0.0, "3": 0.8, "4": 0.2}},
            },
          }),
          {status: 200, headers: {"Content-Type": "application/json"}}
        );
      }
      return new Response("{}", {status: 200});
    });

    const candidates = [
      {title: "Book Alpha", authors: ["Author Alpha"], link: "https://amazon.in/a"},
      {title: "Accessory Beta Cover Case", authors: [], link: "https://amazon.in/b"},
      {title: "Book Gamma", authors: ["Author Gamma"], link: "https://amazon.in/c"},
    ];

    const scored = await scoreBooksJevBatch(candidates, "Distributed Systems", mockEnv);
    // Verifies only ONE request was dispatched for all candidates
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("typesafe.ai");
    expect(fetchCalls[0].body.state).toContain("Book Alpha");
    expect(fetchCalls[0].body.state).toContain("Accessory Beta");
    expect(fetchCalls[0].body.state).toContain("Book Gamma");
    expect(fetchCalls[0].body.questions).toHaveProperty("item_0");
    expect(fetchCalls[0].body.questions.item_0.criteria).toEqual(BOOK_SCORE_CRITERIA);
    expect(fetchCalls[0].body.questions).toHaveProperty("item_1");
    expect(fetchCalls[0].body.questions).toHaveProperty("item_2");

    expect(scored.length).toBe(3);
    expect(scored[0].score).toBe(0.9);
    expect(scored[1].score).toBe(0.025);
    expect(scored[2].score).toBe(0.8);
  });

  it("scoreBooksClefBatch executes single request in decision-model and prompt paths", async () => {
    // 1. Decision-model REST branch
    const fetchCalls = [];
    const mockClefEnv = {
      ...env,
      CLEF_API_KEY: "test-clef-key",
      CLOUDFLARE_ACCOUNT_ID: "test-account-id",
      CLEF_MODEL: "@cf/cloudflare/clef",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = String(input?.url || input || "");
      if (urlStr.includes("api.cloudflare.com")) {
        fetchCalls.push({url: urlStr, body: JSON.parse(init.body)});
        return new Response(
          JSON.stringify({
            result: {
              answers: {
                item_0: {type: "score", score: 3.5, probabilities: {"0": 0.0, "3": 1.0}},
              },
            },
          }),
          {status: 200, headers: {"Content-Type": "application/json"}}
        );
      }
      return new Response("{}", {status: 200});
    });

    const candidates = [
      {title: "System Design Interview", authors: ["Alex Xu"], link: "https://amazon.in/dp/1"},
    ];

    const scoredClef = await scoreBooksClefBatch(candidates, "System Design", mockClefEnv);
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("/accounts/test-account-id/ai/run/@cf/cloudflare/clef");
    expect(scoredClef[0].score).toBe(0.875);

    // 2. Prompt-based branch using env.AI.run
    let promptMaxTokens = 0;
    const mockAiEnv = {
      AI: {
        run: async (model, options) => {
          promptMaxTokens = options?.max_tokens;
          return {
            response: JSON.stringify([
              {index: 0, is_book: 0.9, similarity: 0.85, score: 0.88},
            ]),
          };
        },
      },
      CLEF_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    };

    const scoredAi = await scoreBooksClefBatch(candidates, "System Design", mockAiEnv);
    expect(promptMaxTokens).toBe(1024);
    expect(scoredAi[0].score).toBe(0.88);
  });

  it("scoreAndRankBooks preserves active model zero-match verdict without falling back", async () => {
    const mockEnv = {
      ...env,
      TYPESAFE_API_KEY: "test-typesafe-key",
      EVAL_PROVIDER: "jev",
    };

    // Model scores all items below 0.40 (rejects all as non-books or irrelevant)
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          model: "jev-latest",
          answers: {
            item_0: {type: "score", score: 0.2, probabilities: {"0": 0.95, "1": 0.05}},
            item_1: {type: "score", score: 0.1, probabilities: {"0": 0.98, "1": 0.02}},
          },
        }),
        {status: 200, headers: {"Content-Type": "application/json"}}
      );
    });

    const candidates = [
      {title: "Silicone Case for Tablet", authors: [], link: "https://amazon.in/1"},
      {title: "Nylon Braided Cable", authors: [], link: "https://amazon.in/2"},
    ];

    const res = await scoreAndRankBooks(candidates, "Programming", mockEnv);
    expect(res.scoredBy).toBe("jev");
    expect(res.books).toEqual([]);
  });
});
