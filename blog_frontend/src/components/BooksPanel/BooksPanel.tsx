import React, {type ReactNode} from "react";
import type {BooksSuggestionData} from "@site/src/lib/types";
import styles from "./BooksPanel.module.css";

interface BooksPanelProps {
  booksData: BooksSuggestionData | null;
  onFetch?: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
}

export function BooksPanel({
  booksData,
  onFetch,
  loading = false,
  error,
  readOnly = false,
}: BooksPanelProps): ReactNode {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.badge}>Books Suggestion</span>
          {booksData ? (
            <>
              <span className={styles.cachedBadge}>
                Active {booksData.fetchedAt ? `(${new Date(booksData.fetchedAt).toLocaleDateString()})` : ""}
              </span>
              {booksData.scoredBy && (
                <span className={styles.scorerBadge}>
                  Ranked by {booksData.scoredBy}
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
            {loading ? "Scoring Books..." : booksData ? "↻ Refresh Suggestions" : "⚡ Find Book Suggestions"}
          </button>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Scanning Amazon & scoring publications...</p>
          <p>Evaluating literary quality and thematic relevance with active decision models.</p>
        </div>
      )}

      {!loading && !error && (!booksData || !booksData.books || booksData.books.length === 0) && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No book suggestions compiled yet</p>
          <p>Curated literature and top reference books will appear here once generated.</p>
          {!readOnly && onFetch && (
            <button
              type="button"
              className={styles.fetchButton}
              style={{marginTop: "1rem"}}
              onClick={() => onFetch()}
            >
              ⚡ Find Book Suggestions
            </button>
          )}
        </div>
      )}

      {!loading && booksData?.books && booksData.books.length > 0 && (
        <div className={styles.grid}>
          {booksData.books.map((book, idx) => (
            <div key={book.asin || idx} className={styles.card}>
              <div className={styles.thumbnailWrap}>
                {book.thumbnail ? (
                  <img
                    src={book.thumbnail}
                    alt={book.title}
                    className={styles.thumbnail}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.thumbnailFallback}>📖</div>
                )}
              </div>

              <div className={styles.cardContent}>
                <h4 className={styles.cardTitle} title={book.title}>
                  {book.title}
                </h4>

                {book.authors && book.authors.length > 0 && (
                  <div className={styles.cardAuthors}>
                    by {book.authors.join(", ")}
                  </div>
                )}

                {book.rating ? (
                  <div className={styles.ratingRow}>
                    <span className={styles.starRating}>★ {book.rating.toFixed(1)}</span>
                    {book.reviews_count ? (
                      <span>({book.reviews_count.toLocaleString()} reviews)</span>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.metaRow}>
                  <div className={styles.price}>{book.price || "See price"}</div>
                  <a
                    href={book.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.amazonBtn}
                  >
                    View on Amazon.in ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
