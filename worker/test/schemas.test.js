import {describe, it, expect} from "vitest";
import {sanitizeArticleDraft} from "../src/generator/schemas.js";

describe("sanitizeArticleDraft (Hermetic)", () => {
  it("sanitizes a standard valid article draft", () => {
    const raw = {
      title: "State Space Models in Production",
      subtitle: "Selective retention mechanisms",
      excerpt: "An architectural review of Mamba and SSM throughput.",
      tags: ["SSM", "Mamba"],
      blocks: [
        {type: "heading", text: "Linear Time Invariance"},
        {type: "paragraph", text: "Recurrent state equations enable infinite context handling."},
        {type: "quote", text: "Fast inference through parallel scan.", cite: "Gu et al."},
      ],
    };
    const sanitized = sanitizeArticleDraft(raw, {topic: "SSM"});
    expect(sanitized.title).toBe("State Space Models in Production");
    expect(sanitized.subtitle).toBe("Selective retention mechanisms");
    expect(sanitized.tags).toEqual(["SSM", "Mamba"]);
    expect(sanitized.blocks).toHaveLength(3);
    expect(sanitized.blocks[0].type).toBe("heading");
    expect(sanitized.blocks[1].type).toBe("paragraph");
    expect(sanitized.blocks[2].cite).toBe("Gu et al.");
    expect(sanitized.published).toBe(false);
    expect(sanitized.private).toBe(true);
    expect(sanitized.aiGenerated).toBe(true);
  });

  it("auto-normalizes a bare array of blocks into a valid draft", () => {
    const bareBlocks = [
      {type: "heading", text: "Topological Sorting in DAGs"},
      {type: "paragraph", text: "Resolving cyclic dependencies using Tarjan's algorithm."},
    ];
    const sanitized = sanitizeArticleDraft(bareBlocks, {topic: "Topological Sort", angle: "Graph algorithms"});
    expect(sanitized.title).toBe("Topological Sort");
    expect(sanitized.subtitle).toBe("Graph algorithms");
    expect(sanitized.blocks).toHaveLength(2);
    expect(sanitized.blocks[0].text).toBe("Topological Sorting in DAGs");
  });

  it("unwraps a wrapped array [ { title, blocks } ] into a standard article", () => {
    const wrapped = [
      {
        title: "KV-Cache Sharding on Distributed Nodes",
        excerpt: "PagedAttention principles.",
        blocks: [{type: "paragraph", text: "Memory management for LLM serving."}],
      },
    ];
    const sanitized = sanitizeArticleDraft(wrapped, {topic: "KV-Cache"});
    expect(sanitized.title).toBe("KV-Cache Sharding on Distributed Nodes");
    expect(sanitized.excerpt).toBe("PagedAttention principles.");
    expect(sanitized.blocks[0].text).toBe("Memory management for LLM serving.");
  });

  it("supplies fallback block and tags if raw blocks are empty", () => {
    const emptyDraft = {title: "Empty Topic"};
    const sanitized = sanitizeArticleDraft(emptyDraft, {topic: "Empty Topic"});
    expect(sanitized.blocks.length).toBeGreaterThanOrEqual(1);
    expect(sanitized.tags).toEqual(["Research", "Neural Systems", "Upstash Box"]);
    expect(sanitized.accent).toBe("#6366f1");
    expect(sanitized.author.name).toBe("Neural Author");
    expect(sanitized.author.role).toBe("Systems Research Agent");
  });

  it("defaults author name to Neural Author when missing in draft", () => {
    const raw = {
      title: "Asynchronous Agent Topologies",
      blocks: [{type: "paragraph", text: "Runtime actors communicate via durable event buses."}],
    };
    const sanitized = sanitizeArticleDraft(raw);
    expect(sanitized.author).toBeDefined();
    expect(sanitized.author.name).toBe("Neural Author");
    expect(sanitized.author.role).toBe("Systems Research Agent");
  });
});
