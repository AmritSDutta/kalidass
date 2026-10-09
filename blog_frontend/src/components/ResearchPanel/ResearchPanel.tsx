import React, {type ReactNode} from "react";
import type {ResearchSuggestionData} from "@site/src/lib/types";
import {truncateWords, formatAuthorNames} from "@site/src/client-modules/researchWebMcp";
import styles from "./ResearchPanel.module.css";

interface ResearchPanelProps {
  researchData: ResearchSuggestionData | null;
  onFetch?: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
}

export function ResearchPanel({
  researchData,
  onFetch,
  loading = false,
  error,
  readOnly = false,
}: ResearchPanelProps): ReactNode {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.badge}>arXiv Research</span>
          {researchData ? (
            <>
              <span className={styles.cachedBadge}>
                Active {researchData.fetchedAt ? `(${new Date(researchData.fetchedAt).toLocaleDateString()})` : ""}
              </span>
              {researchData.scoredBy && (
                <span className={styles.scorerBadge}>
                  Ranked by {researchData.scoredBy}
                </span>
              )}
            </>
          ) : (
            <span className={styles.cachedBadge}>Unfetched</span>
          )}
        </div>

        {!readOnly && onFetch && (
          <button
            type="button"
            className={styles.fetchButton}
            onClick={() => onFetch()}
            disabled={loading}
          >
            {loading ? "Searching arXiv..." : researchData ? "↻ Refresh Research" : "⚡ Find Research Papers"}
          </button>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Harvesting arXiv & evaluating relevance...</p>
          <p>Querying preprints and ranking by semantic relevance and recency.</p>
        </div>
      )}

      {!loading && !error && (!researchData || !researchData.papers || researchData.papers.length === 0) && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No research papers compiled yet</p>
          <p>Relevant peer-reviewed and preprint literature from arXiv will appear here once generated.</p>
          {!readOnly && onFetch && (
            <button
              type="button"
              className={styles.fetchButton}
              style={{marginTop: "1rem"}}
              onClick={() => onFetch()}
            >
              ⚡ Find Research Papers
            </button>
          )}
        </div>
      )}

      {!loading && researchData?.papers && researchData.papers.length > 0 && (
        <div className={styles.grid}>
          {researchData.papers.map((paper, idx) => {
            const names = formatAuthorNames(paper.authors);
            const shortSummary = truncateWords(paper.summary, 25);
            const targetUrl = paper.links.abstract || paper.links.pdf || `https://arxiv.org/abs/${paper.id}`;

            return (
              <div key={paper.id || idx} className={styles.card}>
                <div className={styles.cardHeader}>
                  {paper.primaryCategory && (
                    <span className={styles.categoryTag}>{paper.primaryCategory}</span>
                  )}
                  {paper.score !== undefined && (
                    <span className={styles.cachedBadge} title="Relevancy score">
                      Relevance {(paper.score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                <h4 className={styles.cardTitle} title={paper.title}>
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.cardTitleLink}
                  >
                    {paper.title}
                  </a>
                </h4>

                <div className={styles.cardAuthors}>
                  by {names}
                </div>

                <div className={styles.cardSummary}>
                  {shortSummary}
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.metaInfo}>
                    {paper.published && (
                      <span>{new Date(paper.published).toLocaleDateString()}</span>
                    )}
                  </div>
                  <div className={styles.linkGroup}>
                    {paper.links.abstract && (
                      <a
                        href={paper.links.abstract}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.arxivBtn}
                      >
                        arXiv ↗
                      </a>
                    )}
                    {paper.links.pdf && (
                      <a
                        href={paper.links.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.pdfBtn}
                      >
                        PDF ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
