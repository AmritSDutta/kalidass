import type {CSSProperties, ReactNode} from "react";
import Link from "@docusaurus/Link";
import type {ArticleSummary} from "../lib/types";
import {formatDate} from "../lib/media";
import styles from "./ArticleCard.module.css";

type Props = {
  article: ArticleSummary;
  featured?: boolean;
};

export default function ArticleCard({article, featured}: Props): ReactNode {
  return (
    <Link
      className={`${styles.card} ${featured ? styles.featured : ""}`}
      to={`/story/${article.slug}`}
      style={{"--card-accent": article.accent} as CSSProperties}>
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
          <span>{article.readTime} min read</span>
          {article.aiGenerated ? <span className={styles.aiTag}>AI</span> : null}
        </p>
        <h3>{article.title}</h3>
        <p className={styles.excerpt}>{article.subtitle || article.excerpt}</p>
        <div className={styles.author}>
          {article.author?.avatar ? (
            <img src={article.author.avatar} alt="" />
          ) : (
            <span className={styles.initial}>
              {(article.author?.name || "C").slice(0, 1)}
            </span>
          )}
          <div>
            <strong>{article.author?.name}</strong>
            <span>{article.author?.role}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
