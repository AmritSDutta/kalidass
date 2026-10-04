import {useEffect, useState, type CSSProperties, type ReactNode} from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import {useLocation} from "@docusaurus/router";
import StoryBody from "@site/src/components/StoryBody";
import VideoEmbed from "@site/src/components/VideoEmbed";
import {getArticle} from "@site/src/lib/api";
import {useAuth} from "@site/src/lib/auth";
import {formatDate} from "@site/src/lib/media";
import type {Article} from "@site/src/lib/types";
import styles from "./StoryPage.module.css";

export default function StoryPage(): ReactNode {
  const {user, isAdmin, isAuthenticated} = useAuth();
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
          <div className={styles.loadingContainer}>
            <p>Setting type...</p>
          </div>
        </main>
      </Layout>
    );
  }

  const storyAccent = article.accent || "var(--chroma-neel)";
  const userEmail = (user?.email || "").toLowerCase().trim();
  const authorEmail = (article.authorEmail || "").toLowerCase().trim();
  const canEdit = Boolean(
    isAuthenticated && (isAdmin || (authorEmail && userEmail === authorEmail))
  );

  return (
    <Layout title={article.title} description={article.excerpt}>
      <main
        className={styles.page}
        style={{"--story-accent": storyAccent} as CSSProperties}>
        <div className={styles.hero}>
          {article.coverImage ? (
            <img className={styles.cover} src={article.coverImage} alt="" />
          ) : null}
          <div className={styles.veil} />
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              {(article.tags || []).join(" · ") || "Essay"}
            </p>
            <h1>{article.title}</h1>
            {article.subtitle ? <p className={styles.sub}>{article.subtitle}</p> : null}
            <div className={styles.byline}>
              {article.author?.avatar ? (
                <img src={article.author.avatar} alt="" />
              ) : (
                <span className={styles.initial}>
                  {(article.author?.name || "K").slice(0, 1)}
                </span>
              )}
              <div>
                <strong>{article.author?.name || "Kalidass Author"}</strong>
                <span>
                  {article.author?.role || "Research Note"} · {formatDate(article.publishedAt)} ·{" "}
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
            <Link to="/magazine" className={styles.footerLink}>
              ← All briefs
            </Link>
            {canEdit ? (
              <Link to={`/admin?edit=${article.slug}`} className={styles.footerLink}>
                Edit in studio →
              </Link>
            ) : null}
          </div>
        </article>
      </main>
    </Layout>
  );
}
