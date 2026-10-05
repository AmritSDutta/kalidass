import {describe, it, expect} from "vitest";
import worker from "../src/index.js";

describe("Worker Concurrency & Race Conditions (100% Hermetic Mocked)", () => {
  const env = {
    ADMIN_TOKEN: "test-concurrency-token",
    UPSTASH_BLOB_TOKEN: undefined, // Activates memoryBucket (zero network, 100% hermetic)
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

  it("handles 10 parallel article creations without lost updates or slug collisions", async () => {
    const parallelCount = 10;
    const baseTitle = "Concurrent System Dispatch";

    // Fire 10 parallel article creation requests simultaneously
    const requests = Array.from({length: parallelCount}, (_, i) => {
      return worker.fetch(
        createRequest("/api/articles", {
          method: "POST",
          headers: {
            Authorization: "Bearer test-concurrency-token",
          },
          body: {
            title: baseTitle,
            excerpt: `Parallel article batch item index ${i}`,
            tags: ["Concurrency", "Systems"],
            published: true,
            private: false,
            blocks: [
              {type: "paragraph", text: `High-frequency concurrent dispatch sequence ${i}.`},
            ],
          },
        }),
        env
      );
    });

    const responses = await Promise.all(requests);

    // Verify all 10 creations succeeded with HTTP 201
    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const createdArticles = await Promise.all(responses.map((r) => r.json()));
    expect(createdArticles).toHaveLength(parallelCount);

    // Verify that every single article was assigned a UNIQUE slug (no collisions)
    const slugs = createdArticles.map((a) => a.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(parallelCount);

    // Verify index.json integrity: all 10 articles must exist (zero lost updates)
    const listRes = await worker.fetch(createRequest("/api/articles"), env);
    expect(listRes.status).toBe(200);
    const indexList = await listRes.json();

    const createdIds = new Set(createdArticles.map((a) => a.id));
    const indexedCreated = indexList.filter((item) => createdIds.has(item.id));

    expect(indexedCreated).toHaveLength(parallelCount);
  });

  it("handles parallel update and create operations simultaneously without corrupting index", async () => {
    // 1. Create an initial article
    const createInitial = await worker.fetch(
      createRequest("/api/articles", {
        method: "POST",
        headers: {Authorization: "Bearer test-concurrency-token"},
        body: {
          title: "Base Article To Update",
          excerpt: "Initial version",
          published: true,
          private: false,
          blocks: [{type: "paragraph", text: "V1 content."}],
        },
      }),
      env
    );
    expect(createInitial.status).toBe(201);
    const initialArticle = await createInitial.json();

    // 2. Concurrently update initial article AND create a new article in parallel
    const [updateRes, createNewRes] = await Promise.all([
      worker.fetch(
        createRequest(`/api/articles/${initialArticle.id}`, {
          method: "PUT",
          headers: {Authorization: "Bearer test-concurrency-token"},
          body: {
            title: "Base Article Updated V2",
            excerpt: "Updated version",
            published: true,
            private: false,
            blocks: [{type: "paragraph", text: "V2 content."}],
          },
        }),
        env
      ),
      worker.fetch(
        createRequest("/api/articles", {
          method: "POST",
          headers: {Authorization: "Bearer test-concurrency-token"},
          body: {
            title: "Sibling Parallel Article",
            excerpt: "Created during update",
            published: true,
            private: false,
            blocks: [{type: "paragraph", text: "Sibling content."}],
          },
        }),
        env
      ),
    ]);

    expect(updateRes.status).toBe(200);
    expect(createNewRes.status).toBe(201);

    const updatedData = await updateRes.json();
    const newData = await createNewRes.json();

    expect(updatedData.title).toBe("Base Article Updated V2");
    expect(newData.title).toBe("Sibling Parallel Article");

    // 3. Verify index contains both the updated article and the new sibling
    const listRes = await worker.fetch(createRequest("/api/articles"), env);
    const indexList = await listRes.json();

    const foundUpdated = indexList.find((item) => item.id === initialArticle.id);
    const foundNew = indexList.find((item) => item.id === newData.id);

    expect(foundUpdated).toBeDefined();
    expect(foundUpdated.title).toBe("Base Article Updated V2");
    expect(foundNew).toBeDefined();
    expect(foundNew.title).toBe("Sibling Parallel Article");
  });
});
