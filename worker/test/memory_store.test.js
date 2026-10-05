import {describe, it, expect, beforeEach} from "vitest";
import {memoryBucket, getMemoryObject} from "../src/memory.js";

describe("memoryBucket (Hermetic)", () => {
  let bucket;

  beforeEach(() => {
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
});
