declare global {
  interface Window {
    AMRIT_API_BASE?: string;
  }
}

export const API_BASE = (
  typeof window !== "undefined" ? window.AMRIT_API_BASE || "" : ""
).replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}
