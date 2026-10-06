// Shared WebMCP types and helpers — imported by both webmcp.ts and storyWebMcp.ts
// to keep their dependency graph acyclic (webmcp -> storyWebMcp, never back).

// Types for the W3C WebMCP Specification
export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema?: {
    type: "object";
    properties: Record<string, {type: string; description: string}>;
    required?: string[];
  };
  parameters?: {
    type: "object";
    properties: Record<string, {type: string; description: string}>;
    required?: string[];
  };
  execute: (args: any) => Promise<unknown> | unknown;
}

export interface ModelContextRegistry {
  tools: Record<string, WebMcpTool>;
  registerTool: (tool: WebMcpTool) => void;
  unregisterTool: (name: string) => void;
  listTools: () => Promise<WebMcpTool[]>;
  getTools: () => WebMcpTool[];
}

declare global {
  interface Document {
    modelContext?: ModelContextRegistry;
  }
  interface Navigator {
    modelContext?: ModelContextRegistry;
  }
  interface Window {
    modelContext?: ModelContextRegistry;
  }
}

/**
 * Extracts story slug from browser URL pathname if path starts with /story/:slug.
 * Returns null for non-story routes (e.g. /magazine, /, /admin).
 */
export function getBrowserStorySlug(pathname?: string): string | null {
  const path =
    typeof pathname === "string"
      ? pathname
      : typeof window !== "undefined" && window.location
      ? window.location.pathname || ""
      : "";
  const match = path.match(/^\/story\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1].trim()) : null;
}
