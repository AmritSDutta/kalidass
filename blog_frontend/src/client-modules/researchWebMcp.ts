import type {ResearchPaperItem, ResearchSuggestionData} from "../lib/types";

export interface FormattedResearchPaper {
  id: string;
  title: string;
  authors: string;
  summary: string;
  links: {
    abstract: string;
    pdf?: string;
  };
  published?: string;
  primaryCategory?: string | null;
  score?: number;
}

export function truncateWords(text: string, count: number = 25): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= count) return text.trim();
  return words.slice(0, count).join(" ") + "...";
}

export function formatAuthorNames(authors?: Array<{name: string; affiliation?: string}>): string {
  const names = authors?.map((a) => a.name).filter(Boolean).join(", ") || "";
  return names || "Unknown authors";
}

export function formatResearchPaper(paper: ResearchPaperItem): FormattedResearchPaper {
  return {
    id: paper.id,
    title: paper.title,
    authors: formatAuthorNames(paper.authors),
    summary: truncateWords(paper.summary || "", 25),
    links: {
      abstract: paper.links?.abstract || `https://arxiv.org/abs/${paper.id}`,
      pdf: paper.links?.pdf,
    },
    published: paper.published,
    primaryCategory: paper.primaryCategory,
    score: paper.score,
  };
}

export function formatResearchSuggestionPayload(data: ResearchSuggestionData) {
  return {
    query: data.query,
    topic: data.topic,
    total: data.papers ? data.papers.length : 0,
    scoredBy: data.scoredBy,
    papers: (data.papers || []).map(formatResearchPaper),
  };
}
