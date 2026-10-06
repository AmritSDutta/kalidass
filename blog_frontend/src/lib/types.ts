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
  isFallback?: boolean;
  fallbackNotice?: string;
};

export type Article = ArticleSummary & {
  blocks: Block[];
  createdAt?: string;
  ai_intelligence?: AiIntelligence | null;
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
  isFallback?: boolean;
  fallbackNotice?: string;
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

export interface GenerateArticleRequest {
  topic: string;
  angle?: string;
  tone?: "research" | "field-notes" | "explainer" | "speculative";
  blockCount?: number;
  accent?: string;
  provider?: string;
  harness?: string;
  model?: string;
  runtime?: "node" | "python";
  attachHeaders?: Record<string, Record<string, string>>;
  publishImmediately?: boolean;
  private?: boolean;
}

export interface GenerateArticleResponse {
  ok: boolean;
  article: Article;
  evaluation: QualityEvalResult;
}

export interface AiSearchInsightResponse {
  ok: boolean;
  query: string;
  ai_overview?: string | null;
  organic_results: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
  search_metadata?: unknown;
}

export interface AiIntelligenceTrendPoint {
  date?: string;
  timestamp?: string;
  values?: Array<{
    query?: string;
    value?: string | number;
    extracted_value?: number;
  }>;
  value?: string | number;
  extracted_value?: number;
  formatted_value?: string;
}

export interface AiIntelligenceRegionInterest {
  location?: string;
  value?: string | number;
  extracted_value?: number;
}


export interface AiIntelligenceQueryTopic {
  query?: string;
  topic?: {
    title?: string;
    type?: string;
  };
  value?: string | number;
  extracted_value?: number;
}

export interface AiIntelligence {
  query: string;
  ai_overview?: {
    text?: string;
    snippet?: string;
    expanded?: {
      text_blocks?: Array<{type?: string; text?: string}>;
      references?: Array<{title?: string; link?: string; source?: string}>;
    };
    references?: Array<{title?: string; link?: string; source?: string}>;
  } | null;
  knowledge_graph?: {
    title?: string;
    type?: string;
    description?: string;
    website?: string;
    attributes?: Record<string, string | number | boolean>;
  } | null;
  answer_box?: {
    type?: string;
    title?: string;
    answer?: string;
    snippet?: string;
    link?: string;
  } | null;
  inline_videos?: Array<{
    title?: string;
    link?: string;
    channel?: string;
    duration?: string;
  }>;
  books_shopping?: Array<{
    title?: string;
    price?: string;
    source?: string;
    link?: string;
    thumbnail?: string;
  }>;
  jobs_results?: Array<{
    title?: string;
    company_name?: string;
    location?: string;
    via?: string;
  }>;
  twitter_results?: Array<{
    tweet?: string;
    link?: string;
    snippet?: string;
  }>;
  discussions_and_forums?: Array<{
    title?: string;
    link?: string;
    forum?: string;
  }>;
  people_also_ask?: Array<{
    question: string;
    snippet?: string;
    link?: string;
  }>;
  trends?: {
    interest_over_time?: {
      timeline_data?: AiIntelligenceTrendPoint[];
    } | Array<AiIntelligenceTrendPoint | number> | null;
    interest_by_region?: Array<AiIntelligenceRegionInterest> | null;
    related_queries?: {
      top?: AiIntelligenceQueryTopic[];
      rising?: AiIntelligenceQueryTopic[];
    };
    related_topics?: {
      top?: AiIntelligenceQueryTopic[];
      rising?: AiIntelligenceQueryTopic[];
    };
  } | null;
  news?: Array<{
    title?: string;
    source?: string;
    date?: string;
    link?: string;
  }>;
  organic_results?: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
  fetchedAt?: string;
}



