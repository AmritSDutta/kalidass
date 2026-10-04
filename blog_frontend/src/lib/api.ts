import {apiUrl} from "./config";
import type {Article, ArticleDraft, ArticleSummary, AuthUser} from "./types";

export type TokenProvider = () => Promise<string | null> | string | null;

let customTokenProvider: TokenProvider | null = null;

export function setAuthTokenProvider(provider: TokenProvider | null) {
  customTokenProvider = provider;
}

export async function authHeaders(): Promise<HeadersInit> {
  if (typeof window === "undefined") return {};
  const adminToken = localStorage.getItem("kalidass-admin-token");
  if (adminToken) {
    return {Authorization: `Bearer ${adminToken}`};
  }
  let token: string | null = null;
  if (customTokenProvider) {
    try {
      token = await customTokenProvider();
    } catch {
      token = null;
    }
  }
  return token ? {Authorization: `Bearer ${token}`} : {};
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

export function getAuthMe(tokenOverride?: string) {
  return request<{ok: boolean; user: AuthUser}>("/api/auth/me", {
    headers: tokenOverride ? {Authorization: `Bearer ${tokenOverride}`} : {},
  });
}

export function listArticles(status?: "draft" | "published" | "all") {
  const query = status ? `?status=${status}` : "";
  return request<ArticleSummary[]>(`/api/articles${query}`);
}

export function getArticle(idOrSlug: string) {
  return request<Article>(`/api/articles/${encodeURIComponent(idOrSlug)}`);
}

export function createArticle(draft: ArticleDraft) {
  return request<Article>("/api/articles", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export function updateArticle(idOrSlug: string, draft: ArticleDraft) {
  return request<Article>(`/api/articles/${encodeURIComponent(idOrSlug)}`, {
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
