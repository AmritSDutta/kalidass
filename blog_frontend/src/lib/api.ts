import {upload} from "@upstash/blob/browser";
import {apiUrl} from "./config";
import type {Article, ArticleDraft, ArticleSummary} from "./types";

function authHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("kalidass-admin-token") || ""
      : "";
  return token ? {Authorization: `Bearer ${token}`} : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : {"Content-Type": "application/json"}),
      ...authHeaders(),
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

export async function uploadObject(file: File) {
  try {
    const task = upload(file, {route: apiUrl("/api/upload")});
    const blob = await task.done;
    const url = blob.url || (blob as {data?: {url?: string}}).data?.url;
    if (!url) throw new Error("Upload did not return a public URL");
    return {url, name: file.name};
  } catch {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(apiUrl("/api/objects"), {
      method: "POST",
      headers: authHeaders(),
      body,
    });
    if (!response.ok) throw new Error("Upload failed");
    return response.json() as Promise<{url: string; name: string}>;
  }
}
