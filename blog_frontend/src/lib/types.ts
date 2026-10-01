export type Author = {
  name: string;
  role: string;
  avatar: string;
};

export type Block =
  | {type: "paragraph"; text: string}
  | {type: "heading"; text: string}
  | {type: "quote"; text: string; cite?: string}
  | {type: "image"; url: string; caption?: string}
  | {type: "video"; url: string; caption?: string};

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string;
  videoUrl: string;
  author: Author;
  tags: string[];
  accent: string;
  publishedAt: string;
  readTime: number;
  featured: boolean;
  published: boolean;
  private: boolean;
  aiGenerated: boolean;
  updatedAt?: string;
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
  tags: string[];
  accent: string;
  featured: boolean;
  blocks: Block[];
  slug?: string;
  published?: boolean;
  private?: boolean;
  aiGenerated?: boolean;
};
