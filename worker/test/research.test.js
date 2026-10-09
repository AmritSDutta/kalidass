import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import worker from "../src/index.js";
import { parseAtom } from "../src/research/searchArxiv.js";
import { scoreItemHeuristic, sortPapersByRelevancyThenRecency, parseUnifiedScore } from "../src/research/scorer.js";
import {
  getResearchObjectPath,
  isValidResearchPayload,
  getOrGenerateArticleResearch,
} from "../src/research/service.js";

const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title>ArXiv Search Results</title>
  <id>http://arxiv.org/api/query?search_query=all:distributed</id>
  <updated>2026-10-09T00:00:00Z</updated>
  <opensearch:totalResults>2</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2104.08653v1</id>
    <updated>2021-04-18T12:00:00Z</updated>
    <published>2021-04-18T10:00:00Z</published>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models are based on complex recurrent networks...</summary>
    <author>
      <name>Ashish Vaswani</name>
      <arxiv:affiliation>Google Brain</arxiv:affiliation>
    </author>
    <author>
      <name>Noam Shazeer</name>
    </author>
    <arxiv:primary_category term="cs.AI"/>
    <category term="cs.AI"/>
    <category term="cs.CL"/>
    <link rel="alternate" href="http://arxiv.org/abs/2104.08653v1"/>
    <link title="pdf" href="http://arxiv.org/pdf/2104.08653v1"/>
    <arxiv:doi>10.1234/test.doi</arxiv:doi>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2205.11111v1</id>
    <updated>2022-05-20T12:00:00Z</updated>
    <published>2022-05-20T10:00:00Z</published>
    <title>Distributed Systems Verification</title>
    <summary>We present formal verification techniques for consensus protocols in distributed edge clusters...</summary>
    <author>
      <name>Leslie Lamport</name>
    </author>
    <arxiv:primary_category term="cs.DC"/>
    <link rel="alternate" href="http://arxiv.org/abs/2205.11111v1"/>
    <link title="pdf" href="http://arxiv.org/pdf/2205.11111v1"/>
  </entry>
</feed>`;

describe("Research Subsystem (Hermetic)", () => {
  const env = {
    ADMIN_TOKEN: "test-secret-token",
    UPSTASH_BLOB_TOKEN: undefined,
    ROOT_BUCKET: "kalidass",
    CORS_ORIGIN: "*",
    EVAL_PROVIDER: "heuristic",
  };

  const createRequest = (path, options = {}) => {
    const url = `https://kalidass.amrit.fyi${path}`;
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === "object") {
      headers.set("Content-Type", "application/json");
      options.body = JSON.stringify(options.body);
    }
    return new Request(url, { ...options, headers });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    if (globalThis.__kalidass_redis_memory) {
      globalThis.__kalidass_redis_memory.clear();
    }
    if (globalThis.__kalidass_storage_memory) {
      globalThis.__kalidass_storage_memory.clear();
    }
  });

  describe("Atom XML Parser", () => {
    it("parses feed and entries correctly", () => {
      const feed = parseAtom(SAMPLE_ATOM_XML);
      expect(feed.totalResults).toBe(2);
      expect(feed.entries.length).toBe(2);

      const first = feed.entries[0];
      expect(first.id).toBe("2104.08653v1");
      expect(first.title).toBe("Attention Is All You Need");
      expect(first.authors.length).toBe(2);
      expect(first.authors.map((a) => a.name).join(", ")).toBe("Ashish Vaswani, Noam Shazeer");
      expect(first.links.abstract).toBe("http://arxiv.org/abs/2104.08653v1");
      expect(first.links.pdf).toBe("http://arxiv.org/pdf/2104.08653v1");
      expect(first.primaryCategory).toBe("cs.AI");
      expect(first.doi).toBe("10.1234/test.doi");
    });

    it("handles error XML gracefully", () => {
      const errXml = `<feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/api/errors#1</id>
          <title>Error</title>
          <summary>Malformed search query</summary>
        </entry>
      </feed>`;
      const feed = parseAtom(errXml);
      expect(feed.error).toBe("Malformed search query");
    });
  });

  describe("System One Paper Scorer & Sorting", () => {
    it("scores heuristic correctly based on topic match", () => {
      const item = {
        title: "Distributed Consensus Protocols in Modern Storage",
        summary: "An empirical analysis of raft and paxos in edge computing.",
      };
      const result = scoreItemHeuristic(item, "Distributed Consensus");
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.isPaperConfidence).toBe(0.95);
    });

    it("sorts papers primarily by relevancy score and secondarily by recency", () => {
      const papers = [
        {
          id: "1",
          title: "Paper A",
          score: 0.90,
          isPaperConfidence: 0.95,
          published: "2020-01-01T00:00:00Z",
        },
        {
          id: "2",
          title: "Paper B (Same score, newer)",
          score: 0.90,
          isPaperConfidence: 0.95,
          published: "2024-05-01T00:00:00Z",
        },
        {
          id: "3",
          title: "Paper C (Much higher score, older)",
          score: 0.98,
          isPaperConfidence: 0.95,
          published: "2019-01-01T00:00:00Z",
        },
      ];

      const sorted = sortPapersByRelevancyThenRecency(papers);
      expect(sorted[0].id).toBe("3"); // Highest score first
      expect(sorted[1].id).toBe("2"); // Higher recency for same score tier
      expect(sorted[2].id).toBe("1");
    });

    it("filters out papers with score < 0.40", () => {
      const papers = [
        { id: "1", score: 0.20, isPaperConfidence: 0.95 },
        { id: "2", score: 0.85, isPaperConfidence: 0.95, published: "2023-01-01Z" },
      ];
      const sorted = sortPapersByRelevancyThenRecency(papers);
      expect(sorted.length).toBe(1);
      expect(sorted[0].id).toBe("2");
    });

    it("fails closed on unparsable model verdicts", () => {
      const closed = parseUnifiedScore({answer: "banana"});
      expect(closed).toEqual({isPaperConfidence: 0, topicSimilarity: 0, score: 0});
    });

    it("gates confidence independently via level-0 probabilities", () => {
      const vetoed = parseUnifiedScore({answer: 4, probabilities: {"0": 0.9}});
      expect(vetoed.score).toBe(1);
      expect(vetoed.isPaperConfidence).toBe(0.2);

      const endorsed = parseUnifiedScore({answer: 4, probabilities: {"0": 0.1}});
      expect(endorsed.score).toBe(1);
      expect(endorsed.isPaperConfidence).toBe(0.95);
    });
  });

  describe("Research Service & Caching", () => {
    it("constructs canonical blob path", () => {
      const path = getResearchObjectPath("art-123", env);
      expect(path).toBe("kalidass/research/art-123.json");
    });

    it("validates research payload", () => {
      expect(isValidResearchPayload(null)).toBe(false);
      expect(isValidResearchPayload({ query: "test" })).toBe(false);
      expect(isValidResearchPayload({ query: "test", papers: [] })).toBe(false);
      expect(isValidResearchPayload({ query: "test", papers: [{ title: "Paper 1" }] })).toBe(true);
    });

    it("fetches and caches research papers via getOrGenerateArticleResearch", async () => {
      const mockStorage = {
        bucket: {},
        readJson: vi.fn().mockResolvedValue(null),
        putJson: vi.fn().mockResolvedValue(true),
        fetchArxivFn: vi.fn().mockResolvedValue({
          query: "all:Distributed",
          topic: "Distributed Systems",
          rawItems: [
            {
              id: "2205.11111",
              title: "Distributed Systems Verification",
              summary: "Verification for consensus.",
              published: "2022-05-20T10:00:00Z",
              authors: [{ name: "Leslie Lamport" }],
              links: { abstract: "https://arxiv.org/abs/2205.11111" },
            },
          ],
        }),
      };

      const article = { id: "art-test", title: "Distributed Systems" };
      const result = await getOrGenerateArticleResearch(article, env, mockStorage, { refresh: true });

      expect(result.papers.length).toBe(1);
      expect(result.papers[0].title).toBe("Distributed Systems Verification");
      expect(mockStorage.putJson).toHaveBeenCalled();
    });

    it("serves repeat lookups from cache without re-fetching arXiv", async () => {
      const fetchArxivFn = vi.fn().mockResolvedValue({
        query: "all:Cache",
        topic: "Cache Topic",
        rawItems: [
          { id: "1", title: "Cache Topic Paper", summary: "Analysis of cache topic behavior.", authors: [] },
        ],
      });
      const mockStorage = {
        bucket: {},
        readJson: vi.fn().mockResolvedValue(null),
        putJson: vi.fn().mockResolvedValue(true),
        fetchArxivFn,
      };

      const article = { id: "art-cache", title: "Cache Topic" };
      const first = await getOrGenerateArticleResearch(article, env, mockStorage, { refresh: true });
      expect(first.papers.length).toBeGreaterThan(0);

      const second = await getOrGenerateArticleResearch(article, env, mockStorage);
      expect(fetchArxivFn).toHaveBeenCalledTimes(1);
      expect(second.papers[0].title).toBe("Cache Topic Paper");
    });

    it("dedupes concurrent generations via the in-flight lock", async () => {
      let resolveFetch;
      const fetchArxivFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );
      const mockStorage = {
        bucket: {},
        readJson: vi.fn().mockResolvedValue(null),
        putJson: vi.fn().mockResolvedValue(true),
        fetchArxivFn,
      };

      const article = { id: "art-lock", title: "Locking Topic" };
      const p1 = getOrGenerateArticleResearch(article, env, mockStorage, { refresh: true });
      const p2 = getOrGenerateArticleResearch(article, env, mockStorage, { refresh: true });
      resolveFetch({
        query: "all:Locking",
        topic: "Locking Topic",
        rawItems: [
          { id: "2", title: "Locking Topic Coordination", summary: "Coordination for the locking topic.", authors: [] },
        ],
      });
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(fetchArxivFn).toHaveBeenCalledTimes(1);
      expect(r1).toEqual(r2);
      expect(r1.papers.length).toBeGreaterThan(0);
    });
  });

  describe("HTTP Routes in Worker", () => {
    it("returns 404 for uncompiled research on public GET", async () => {
      const req = createRequest("/api/articles/non-existent-article/research", { method: "GET" });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(404);
    });

    it("rejects unauthorized POST generation with 401 on existing article", async () => {
      const createReq = createRequest("/api/articles", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
        body: {
          title: "Public Article",
          slug: "public-article",
          published: true,
          blocks: [{ type: "paragraph", text: "Text" }],
        },
      });
      const createRes = await worker.fetch(createReq, env);
      const art = await createRes.json();

      const postAnon = createRequest(`/api/articles/${art.slug}/research`, { method: "POST" });
      const res = await worker.fetch(postAnon, env);
      expect(res.status).toBe(401);
    });

    it("allows authenticated admin POST to generate research", async () => {
      const nativeFetch = globalThis.fetch;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const urlStr = String(input?.url || input || "");
        if (urlStr.includes("export.arxiv.org")) {
          return new Response(SAMPLE_ATOM_XML, {
            status: 200,
            headers: { "Content-Type": "application/atom+xml" },
          });
        }
        return nativeFetch(input, init);
      });

      const seedReq = createRequest("/api/articles", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
        body: {
          title: "Distributed Systems at the Edge",
          slug: "distributed-systems-edge",
          excerpt: "Deep dive into edge consensus.",
          blocks: [{ type: "paragraph", text: "Distributed systems intro" }],
          published: true,
          private: false,
        },
      });
      const seedRes = await worker.fetch(seedReq, env);
      expect(seedRes.status).toBe(201);
      const created = await seedRes.json();

      const postReq = createRequest(`/api/articles/${created.id}/research`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
      });
      const postRes = await worker.fetch(postReq, env);
      expect(postRes.status).toBe(201);
      const postData = await postRes.json();
      expect(postData.papers.length).toBeGreaterThan(0);

      // Now public GET should return the compiled research dossier
      const getReq = createRequest(`/api/articles/${created.id}/research`, { method: "GET" });
      const getRes = await worker.fetch(getReq, env);
      const getBody = await getRes.json();
      expect(getBody).toHaveProperty("papers");
      expect(getRes.status).toBe(200);
      expect(getBody.papers.length).toBeGreaterThan(0);
    });

    it("returns 404 for anonymous GET on a private article's research", async () => {
      const createRes = await worker.fetch(
        createRequest("/api/articles", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
          body: {
            title: "Private Research Topic",
            slug: "private-research-topic",
            published: true,
            private: true,
            blocks: [{ type: "paragraph", text: "Private" }],
          },
        }),
        env
      );
      const art = await createRes.json();

      const res = await worker.fetch(
        createRequest(`/api/articles/${art.slug}/research`, { method: "GET" }),
        env
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when a non-owner author POSTs research generation", async () => {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "test-key-id";
      jwk.alg = "RS256";
      jwk.use = "sig";

      const auth0Domain = `auth-research-${Date.now()}.example.com`;
      const testEnv = { ...env, AUTH0_DOMAIN: auth0Domain, ADMIN_EMAILS: "admin@example.com" };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const urlStr = String(input?.url || input);
        if (urlStr.includes("/.well-known/jwks.json")) {
          return new Response(JSON.stringify({ keys: [jwk] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(input, init);
      };

      try {
        const strangerToken = await new SignJWT({
          sub: "auth0|stranger-research",
          email: "stranger@example.com",
        })
          .setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
          .setIssuer(`https://${auth0Domain}/`)
          .setIssuedAt()
          .setExpirationTime("2h")
          .sign(privateKey);

        const createRes = await worker.fetch(
          createRequest("/api/articles", {
            method: "POST",
            headers: { Authorization: "Bearer test-secret-token" },
            body: {
              title: "Owned Research Article",
              slug: "owned-research-article",
              authorEmail: "owner@example.com",
              published: true,
              blocks: [{ type: "paragraph", text: "Owner content." }],
            },
          }),
          testEnv
        );
        expect(createRes.status).toBe(201);
        const art = await createRes.json();

        const forbiddenRes = await worker.fetch(
          createRequest(`/api/articles/${art.slug}/research`, {
            method: "POST",
            headers: { Authorization: `Bearer ${strangerToken}` },
          }),
          testEnv
        );
        expect(forbiddenRes.status).toBe(403);
        const errData = await forbiddenRes.json();
        expect(errData.error).toContain("Forbidden");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
