import {useEffect, useMemo, useState, type ReactNode} from "react";
import Layout from "@theme/Layout";
import ArticleCard from "@site/src/components/ArticleCard";
import {listArticles} from "@site/src/lib/api";
import type {ArticleSummary} from "@site/src/lib/types";
import styles from "./magazine.module.css";

export default function Magazine(): ReactNode {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");

  useEffect(() => {
    listArticles().then(setArticles).catch(() => setArticles([]));
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>(["All"]);
    articles.forEach((item) => item.tags?.forEach((t) => set.add(t)));
    return [...set];
  }, [articles]);

  const filtered = articles.filter((item) => {
    const hay = `${item.title} ${item.excerpt} ${item.tags.join(" ")}`.toLowerCase();
    const matchesQuery = hay.includes(query.toLowerCase());
    const matchesTag = tag === "All" || item.tags.includes(tag);
    return matchesQuery && matchesTag;
  });

  return (
    <Layout title="Issue" description="The full Kalidass Journal issue.">
      <main className={styles.page}>
        <header className={styles.header}>
          <p>Issue 01 / Upstash Blob</p>
          <h1>The index</h1>
          <div className={styles.controls}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents, evals, systems..."
            />
            <div className={styles.tags}>
              {tags.map((item) => (
                <button
                  key={item}
                  className={tag === item ? styles.active : ""}
                  onClick={() => setTag(item)}
                  type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className={styles.grid}>
          {filtered.length > 0 ? (
            filtered.map((article) => (
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
      </main>
    </Layout>
  );
}
