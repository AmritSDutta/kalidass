import {describe, it, expect, beforeEach} from "vitest";
import worker from "../src/index.js";

describe("Worker REST API (Hermetic Integration)", () => {
  const env = {
    ADMIN_TOKEN: "test-secret-token",
    UPSTASH_BLOB_TOKEN: undefined, // activates memoryBucket
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
    return new Request(url, {...options, headers});
  };

  it("GET /api/health returns 200 with ok: true", async () => {
    const req = createRequest("/api/health");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("GET /api/articles returns 200 with articles array", async () => {
    const req = createRequest("/api/articles");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/eval/quality requires auth and evaluates technical content safely without external APIs", async () => {
    const payload = {
      title: "Deterministic Edge Computing",
      subtitle: "Memory safety in serverless runtimes",
      excerpt: "Field analysis of isolate execution performance.",
      blocks: [
        {type: "paragraph", text: "Cloudflare Workers run on V8 isolates with zero cold-start overhead."},
      ],
    };

    // Unauthenticated callers are rejected
    const unauthRes = await worker.fetch(
      createRequest("/api/eval/quality", {method: "POST", body: payload}),
      env
    );
    expect(unauthRes.status).toBe(401);

    // Authenticated callers evaluate successfully
    const req = createRequest("/api/eval/quality", {
      method: "POST",
      headers: {Authorization: "Bearer test-secret-token"},
      body: payload,
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.source).toBe("local-heuristic");
    expect(data.safety.verdict).toBe("safe");
    expect(data.safety.violations).toEqual([]);
  });

  it("POST /api/articles rejects unauthenticated requests with 401", async () => {
    const req = createRequest("/api/articles", {
      method: "POST",
      body: {
        title: "Unauthorized Article Attempt",
        excerpt: "Should fail.",
        blocks: [{type: "paragraph", text: "Blocked content."}],
      },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("POST /api/articles creates a draft when authenticated with Bearer ADMIN_TOKEN", async () => {
    const uniqueSlug = `hermetic-test-${Date.now()}`;
    const req = createRequest("/api/articles", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-token",
      },
      body: {
        title: "Hermetic Verified Article",
        slug: uniqueSlug,
        excerpt: "An empirical look at isolated test architectures.",
        tags: ["Testing", "Vitest"],
        accent: "#6366f1",
        published: false,
        private: true,
        blocks: [
          {type: "heading", text: "Zero Network Boundary"},
          {type: "paragraph", text: "Every dependency is stubbed or runs within memory buffers."},
        ],
      },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Hermetic Verified Article");
    expect(data.slug).toBe(uniqueSlug);

    // Verify GET /api/articles/:slug retrieves it when authorized
    const getReq = createRequest(`/api/articles/${uniqueSlug}`, {
      headers: {
        Authorization: "Bearer test-secret-token",
      },
    });
    const getRes = await worker.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.title).toBe("Hermetic Verified Article");

    // Anonymous access to the draft/private article is denied (404, no existence leak)
    const anonGet = createRequest(`/api/articles/${uniqueSlug}`);
    const anonRes = await worker.fetch(anonGet, env);
    expect(anonRes.status).toBe(404);
  });

  it("returns 404 for unknown endpoints", async () => {
    const req = createRequest("/api/unknown-route-12345");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
  });
});
