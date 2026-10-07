import {apiUrl} from "./config";
import type {
  Article,
  ArticleDraft,
  ArticleSummary,
  AuthUser,
  GenerateArticleRequest,
  GenerateArticleResponse,
  AiIntelligence,
  AiSearchInsightResponse,
  QualityEvalRequest,
  QualityEvalResult,
} from "./types";

export type TokenProvider = () => Promise<string | null> | string | null;

let customTokenProvider: TokenProvider | null = null;

export function setAuthTokenProvider(provider: TokenProvider | null) {
  customTokenProvider = provider;
}

export async function authHeaders(): Promise<HeadersInit> {
  if (typeof window === "undefined") return {};
  const headers: Record<string, string> = {};

  let token: string | null = null;
  if (customTokenProvider) {
    try {
      token = await customTokenProvider();
    } catch {
      token = null;
    }
  }

  const adminToken = localStorage.getItem("kalidass-admin-token");

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    if (adminToken) {
      headers["X-Admin-Token"] = adminToken;
    }
  } else if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
    headers["X-Admin-Token"] = adminToken;
  }

  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeaders();
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : {"Content-Type": "application/json"}),
      ...auth,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function getAuthMe(tokenOverride?: string, adminTokenOverride?: string) {
  const headers: Record<string, string> = {};
  if (tokenOverride) headers["Authorization"] = `Bearer ${tokenOverride}`;
  const effectiveAdminToken = adminTokenOverride || (typeof window !== "undefined" ? localStorage.getItem("kalidass-admin-token") : null);
  if (effectiveAdminToken) headers["X-Admin-Token"] = effectiveAdminToken;
  return request<{ok: boolean; user: AuthUser}>("/api/auth/me", {headers});
}

export function elevateAuth(adminToken: string, tokenOverride?: string) {
  const headers: Record<string, string> = {};
  if (tokenOverride) headers["Authorization"] = `Bearer ${tokenOverride}`;
  return request<{ok: boolean; elevated: boolean}>("/api/auth/elevate", {
    method: "POST",
    headers,
    body: JSON.stringify({adminToken: adminToken.trim()}),
  });
}

export function listArticles(status?: "draft" | "published" | "all") {
  const query = status ? `?status=${status}` : "";
  return request<ArticleSummary[]>(`/api/articles${query}`);
}

export function getArticle(
  idOrSlug: string,
  includeIntelligence: boolean = false,
  refresh: boolean = false
) {
  const params = new URLSearchParams();
  if (includeIntelligence) params.set("intelligence", "true");
  if (refresh) params.set("refresh", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<Article>(`/api/articles/${encodeURIComponent(idOrSlug)}${query}`);
}

// Public read-only dossier fetch (lazy): called when the AI Intel tab activates.
export function getArticleIntelligence(idOrSlug: string) {
  return request<AiIntelligence>(`/api/articles/${encodeURIComponent(idOrSlug)}/intel`);
}

export function createArticle(draft: ArticleDraft) {
  return request<Article>("/api/articles", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export function updateArticle(
  idOrSlug: string,
  draft: ArticleDraft,
  options?: { invalidateFeed?: boolean }
) {
  const query = options?.invalidateFeed === false ? "?invalidate_feed=false" : "";
  return request<Article>(`/api/articles/${encodeURIComponent(idOrSlug)}${query}`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });
}

export function removeArticle(idOrSlug: string) {
  return request<{ok: boolean}>(`/api/articles/${encodeURIComponent(idOrSlug)}`, {
    method: "DELETE",
  });
}

export async function uploadObject(file: File): Promise<{url: string; name: string}> {
  const body = new FormData();
  body.append("file", file);
  const auth = await authHeaders();
  const response = await fetch(apiUrl("/api/objects"), {
    method: "POST",
    headers: auth,
    body,
  });
  if (!response.ok) {
    let message = "Upload failed";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json() as Promise<{url: string; name: string}>;
}

export function evaluateQuality(payload: QualityEvalRequest) {
  return request<QualityEvalResult>("/api/eval/quality", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateArticle(payload: GenerateArticleRequest) {
  return request<GenerateArticleResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAiSearchInsight(query: string) {
  return request<AiSearchInsightResponse>(
    `/api/ai_search_insight?q=${encodeURIComponent(query)}`
  );
}
