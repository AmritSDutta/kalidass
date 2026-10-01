declare global {
  interface Window {
    KALIDASS_API_BASE?: string;
  }
}

export const API_BASE = (
  typeof window !== "undefined" ? window.KALIDASS_API_BASE || "" : ""
).replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}
