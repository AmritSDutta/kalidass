import {useEffect, useMemo, useState, type ReactNode} from "react";
import Layout from "@theme/Layout";
import ArticleCard from "@site/src/components/ArticleCard";
import {listArticles} from "@site/src/lib/api";
import type {ArticleSummary} from "@site/src/lib/types";
import styles from "./magazine.module.css";

const PAGE_SIZE = 9;

export default function Magazine(): ReactNode {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    listArticles().then(setArticles).catch(() => setArticles([]));
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>(["All"]);
    articles.forEach((item) => item.tags?.forEach((t) => set.add(t)));
    return [...set];
  }, [articles]);

  const filtered = useMemo(() => {
    return articles.filter((item) => {
      const hay = `${item.title} ${item.excerpt} ${item.tags.join(" ")}`.toLowerCase();
      const matchesQuery = hay.includes(query.toLowerCase());
      const matchesTag = tag === "All" || item.tags.includes(tag);
      return matchesQuery && matchesTag;
    });
  }, [articles, query, tag]);

  // Enforce strict recency ordering (newest publishedAt first)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.publishedAt || (a as {updatedAt?: string}).updatedAt || 0).getTime();
      const timeB = new Date(b.publishedAt || (b as {updatedAt?: string}).updatedAt || 0).getTime();
      return timeB - timeA;
    });
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setCurrentPage(1);
  };

  const handleTagChange = (t: string) => {
    setTag(t);
    setCurrentPage(1);
  };

  const changePage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({top: 0, behavior: "smooth"});
      } catch {
        // Safe fallback in test environments without full scroll implementation
      }
    }
  };

  const startItem = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, sorted.length);

  return (
    <Layout title="Issue" description="The full Kalidass Journal issue.">
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.kicker}>
            <span className={styles.kickerDot} />
            Issue 01 // Meghaduta Edition
          </div>
          <h1>The Index</h1>
          <div className={styles.controls}>
            <input
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search essays, agents, evals, systems..."
              className={styles.search}
            />
            <div className={styles.tags}>
              {tags.map((item) => (
                <button
                  key={item}
                  className={tag === item ? styles.active : styles.tagBtn}
                  onClick={() => handleTagChange(item)}
                  type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className={styles.grid}>
          {paginated.length > 0 ? (
            paginated.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))
          ) : (
            <div className={styles.empty}>
              {articles.length === 0
                ? "No briefs published yet. Launch Studio to compose your first brief."
                : "No matching briefs found."}
            </div>
          )}
        </div>

        {totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Magazine pagination">
            <div className={styles.paginationInfo}>
              Showing {startItem}–{endItem} of {sorted.length} briefs
            </div>
            <div className={styles.paginationNav}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Previous page">
                ← Prev
              </button>
              {Array.from({length: totalPages}, (_, idx) => idx + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={pageNum === currentPage ? styles.pageBtnActive : styles.pageBtn}
                  onClick={() => changePage(pageNum)}
                  aria-current={pageNum === currentPage ? "page" : undefined}>
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => changePage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="Next page">
                Next →
              </button>
            </div>
          </nav>
        ) : null}
      </main>
    </Layout>
  );
}
