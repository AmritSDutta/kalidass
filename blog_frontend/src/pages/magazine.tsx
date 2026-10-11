import {useEffect, useState, type ReactNode} from "react";
import Layout from "@theme/Layout";
import ArticleCard from "@site/src/components/ArticleCard";
import {listArticles, getTopTags} from "@site/src/lib/api";
import type {ArticleSummary} from "@site/src/lib/types";
import styles from "./magazine.module.css";

const PAGE_SIZE = 9;

export default function Magazine(): ReactNode {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [tags, setTags] = useState<string[]>(["All"]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tag, setTag] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopTags()
      .then((topTags) => {
        if (Array.isArray(topTags) && topTags.length > 0) {
          setTags(["All", ...topTags]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    listArticles({
      tag,
      page: currentPage,
      query: debouncedQuery,
      limit: PAGE_SIZE,
    })
      .then((items) => {
        if (!ignore) setArticles(items || []);
      })
      .catch(() => {
        if (!ignore) setArticles([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [tag, debouncedQuery, currentPage]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
  };

  const handleTagChange = (t: string) => {
    setTag(t);
    setCurrentPage(1);
  };

  const changePage = (newPage: number) => {
    if (newPage < 1) return;
    setCurrentPage(newPage);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({top: 0, behavior: "smooth"});
      } catch {
        // Fallback for test environments without full scroll implementation
      }
    }
  };

  const hasNextPage = articles.length === PAGE_SIZE;

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
          {articles.length > 0 ? (
            articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))
          ) : (
            <div className={styles.empty}>
              {loading
                ? "Loading briefs..."
                : query || tag !== "All"
                ? "No matching briefs found."
                : "No briefs published yet. Launch Studio to compose your first brief."}
            </div>
          )}
        </div>

        {currentPage > 1 || hasNextPage ? (
          <nav className={styles.pagination} aria-label="Magazine pagination">
            <div className={styles.paginationInfo}>
              Page {currentPage} · {articles.length} brief{articles.length === 1 ? "" : "s"} shown
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
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => changePage(currentPage + 1)}
                disabled={!hasNextPage}
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
