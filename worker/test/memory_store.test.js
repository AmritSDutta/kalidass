import {describe, it, expect, beforeEach} from "vitest";
import {memoryBucket, getMemoryObject, clearMemoryStore} from "../src/memory.js";

describe("memoryBucket (Hermetic)", () => {
  let bucket;

  beforeEach(() => {
    clearMemoryStore();
    bucket = memoryBucket();
  });

  it("puts and gets string objects", async () => {
    const path = "kalidass/test-file.txt";
    const data = "Hermetic in-memory storage content";
    await bucket.put(path, data, {contentType: "text/plain"});

    const fetched = await bucket.get(path);
    expect(fetched.path).toBe(path);
    expect(fetched.contentType).toBe("text/plain");

    const reader = fetched.body.getReader();
    const {value} = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toBe(data);
  });

  it("stores and retrieves JSON objects via getMemoryObject", async () => {
    const path = "kalidass/articles/test-article.json";
    const article = {id: "123", title: "Hermetic Systems Test"};
    await bucket.put(path, JSON.stringify(article), {contentType: "application/json"});

    const raw = getMemoryObject(path);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(new TextDecoder().decode(raw.bytes));
    expect(parsed.id).toBe("123");
    expect(parsed.title).toBe("Hermetic Systems Test");
  });

  it("deletes objects properly and throws not_found on subsequent get", async () => {
    const path = "kalidass/temp.json";
    await bucket.put(path, JSON.stringify({ok: true}));
    await bucket.del(path);

    expect(getMemoryObject(path)).toBeNull();
    await expect(bucket.get(path)).rejects.toThrow("not_found");
  });

  it("lists objects filtered by prefix matching @upstash/blob Bucket.list contract", async () => {
    await bucket.put("kalidass/articles/art-1.json", JSON.stringify({id: "art-1"}));
    await bucket.put("kalidass/articles/art-2.json", JSON.stringify({id: "art-2"}));
    await bucket.put("kalidass/media/pic.png", "fake-binary");

    const result = await bucket.list({prefix: "kalidass/articles/"});
    expect(result.blobs.length).toBe(2);
    const paths = result.blobs.map((b) => b.path);
    expect(paths).toContain("kalidass/articles/art-1.json");
    expect(paths).toContain("kalidass/articles/art-2.json");
    expect(paths).not.toContain("kalidass/media/pic.png");
  });
});
