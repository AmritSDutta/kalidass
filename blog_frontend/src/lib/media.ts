export type ParsedVideo =
  | {kind: "youtube"; id: string}
  | {kind: "vimeo"; id: string}
  | {kind: "file"; url: string};

export function parseVideo(url: string): ParsedVideo | null {
  const raw = (url || "").trim();
  if (!raw) return null;
  const youtube = raw.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/
  );
  if (youtube) return {kind: "youtube", id: youtube[1]};
  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return {kind: "vimeo", id: vimeo[1]};
  return {kind: "file", url: raw};
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function emptyDraft(): import("./types").ArticleDraft {
  return {
    title: "",
    subtitle: "",
    excerpt: "",
    coverImage: "",
    videoUrl: "",
    author: {name: "", role: "Writer", avatar: ""},
    tags: [],
    accent: "#22d3ee",
    featured: false,
    private: true,
    aiGenerated: false,
    blocks: [{type: "paragraph", text: ""}],
  };
}
