export type Author = {
  name: string;
  role: string;
  avatar: string;
};

export type Block =
  | {type: "paragraph"; text: string; _id?: string}
  | {type: "heading"; text: string; _id?: string}
  | {type: "quote"; text: string; cite?: string; _id?: string}
  | {type: "image"; url: string; caption?: string; _id?: string}
  | {type: "video"; url: string; caption?: string; _id?: string};

export type AuthUser = {
  sub: string;
  email: string;
  name?: string;
  avatar?: string;
  role: "admin" | "author";
  isSuperuserEligible?: boolean;
};

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string;
  videoUrl: string;
  author: Author;
  authorEmail: string;
  tags: string[];
  accent: string;
  publishedAt: string;
  readTime: number;
  featured: boolean;
  published: boolean;
  private: boolean;
  aiGenerated: boolean;
  userId?: string;
  updatedAt?: string;
  evaluation?: QualityEvalResult | null;
};

export type Article = ArticleSummary & {
  blocks: Block[];
  createdAt?: string;
};

export type ArticleDraft = {
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string;
  videoUrl: string;
  author: Author;
  authorEmail?: string;
  tags: string[];
  accent: string;
  featured: boolean;
  blocks: Block[];
  slug?: string;
  published?: boolean;
  private?: boolean;
  aiGenerated?: boolean;
  userId?: string;
  evaluation?: QualityEvalResult | null;
};

export interface QualitySafetyRisks {
  violence: number;
  sexual: number;
  antisocial: number;
  verdict: "safe" | "flagged" | "rejected";
  violations: string[];
}

export interface QualityEditorialMetrics {
  isAiWritten: {
    probability: number;
    label: string;
  };
  accuracy: {
    score: number;
    level: string;
    confidence: number;
  };
  engagement: {
    score: number;
    level: string;
    confidence: number;
  };
  editorialReadiness: {
    choice: string;
    confidence: number;
  };
}

export interface QualityEvalResult {
  ok: boolean;
  source: "typesafe-jev" | "cloudflare-clef" | "local-heuristic";
  safety: QualitySafetyRisks;
  metrics: QualityEditorialMetrics;
  summary: string;
}

export interface QualityEvalRequest {
  title?: string;
  subtitle?: string;
  excerpt?: string;
  text?: string;
  blocks?: Block[];
  slug?: string;
  apiKey?: string;
  jevApiKey?: string;
  clefApiKey?: string;
  provider?: "jev" | "clef" | "heuristic";
}
