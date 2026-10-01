import {useEffect, useState, type CSSProperties, type ReactNode} from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import {useLocation} from "@docusaurus/router";
import StoryBody from "@site/src/components/StoryBody";
import VideoEmbed from "@site/src/components/VideoEmbed";
import {getArticle} from "@site/src/lib/api";
import {formatDate} from "@site/src/lib/media";
import type {Article} from "@site/src/lib/types";
import styles from "./StoryPage.module.css";

export default function StoryPage(): ReactNode {
  const location = useLocation();
  const slug = location.pathname.replace(/^\/story\//, "").replace(/\/$/, "");
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    getArticle(slug)
      .then(setArticle)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <Layout title="Missing story">
        <main className={styles.page}>
          <p>{error}</p>
          <Link to="/magazine">Back to issue</Link>
        </main>
      </Layout>
    );
  }

  if (!article) {
    return (
      <Layout title="Loading">
        <main className={styles.page}>
          <p>Setting type...</p>
        </main>
      </Layout>
    );
  }

  return (
    <Layout title={article.title} description={article.excerpt}>
      <main
        className={styles.page}
        style={{"--story-accent": article.accent} as CSSProperties}>
        <div className={styles.hero}>
          {article.coverImage ? (
            <img className={styles.cover} src={article.coverImage} alt="" />
          ) : null}
          <div className={styles.veil} />
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              {(article.tags || []).join(" / ") || "Essay"}
            </p>
            <h1>{article.title}</h1>
            <p className={styles.sub}>{article.subtitle}</p>
            <div className={styles.byline}>
              {article.author?.avatar ? (
                <img src={article.author.avatar} alt="" />
              ) : null}
              <div>
                <strong>{article.author?.name}</strong>
                <span>
                  {article.author?.role} · {formatDate(article.publishedAt)} ·{" "}
                  {article.readTime} min
                  {article.aiGenerated ? (
                    <>
                      {" · "}
                      <span className={styles.aiTag}>AI</span>
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        </div>
        <article className={styles.article}>
          <p className={styles.deck}>{article.excerpt}</p>
          {article.videoUrl ? (
            <VideoEmbed url={article.videoUrl} title={article.title} />
          ) : null}
          <StoryBody article={article} />
          <div className={styles.footer}>
            <Link to="/magazine">All briefs</Link>
            <Link to={`/admin?edit=${article.slug}`}>Edit in studio</Link>
          </div>
        </article>
      </main>
    </Layout>
  );
}
