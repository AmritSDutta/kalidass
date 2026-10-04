import type {CSSProperties, ReactNode} from "react";
import Link from "@docusaurus/Link";
import type {ArticleSummary} from "../lib/types";
import {formatDate} from "../lib/media";
import styles from "./ArticleCard.module.css";

type Props = {
  article: ArticleSummary;
  featured?: boolean;
  compact?: boolean;
};

export default function ArticleCard({article, featured, compact}: Props): ReactNode {
  const cardClasses = [
    styles.card,
    featured ? styles.featured : "",
    compact ? styles.compact : "",
  ]
    .filter(Boolean)
    .join(" ");

  const accentColor = article.accent || "var(--chroma-neel)";

  return (
    <Link
      className={cardClasses}
      to={`/story/${article.slug}`}
      style={{"--card-accent": accentColor} as CSSProperties}>
      <div className={styles.media}>
        {article.coverImage ? (
          <img src={article.coverImage} alt="" />
        ) : (
          <div className={styles.fallback} />
        )}
        <div className={styles.wash} />
        {article.tags?.[0] ? <span className={styles.tag}>{article.tags[0]}</span> : null}
      </div>
      <div className={styles.body}>
        <p className={styles.meta}>
          <span>{formatDate(article.publishedAt)}</span>
          <span>·</span>
          <span>{article.readTime} min</span>
          {article.aiGenerated ? <span className={styles.aiTag}>AI</span> : null}
        </p>
        <h3>{article.title}</h3>
        <p className={styles.excerpt}>{article.subtitle || article.excerpt}</p>
        <div className={styles.author}>
          {article.author?.avatar ? (
            <img src={article.author.avatar} alt="" />
          ) : (
            <span className={styles.initial}>
              {(article.author?.name || "K").slice(0, 1)}
            </span>
          )}
          <div>
            <strong>{article.author?.name || "Kalidass Author"}</strong>
            <span>{article.author?.role || "Research Note"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
