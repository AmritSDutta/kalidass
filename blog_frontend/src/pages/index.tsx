import {useEffect, useState, type ReactNode} from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import ArticleCard from "@site/src/components/ArticleCard";
import {listArticles} from "@site/src/lib/api";
import type {ArticleSummary} from "@site/src/lib/types";
import styles from "./index.module.css";

export default function Home(): ReactNode {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listArticles()
      .then(setArticles)
      .catch((err: Error) => setError(err.message));
  }, []);

  const featured = articles.find((item) => item.featured) || articles[0];
  const rest = articles.filter((item) => item.id !== featured?.id);
  const lead = rest.slice(0, 3);
  const more = rest.slice(3);

  return (
    <Layout
      title="Kalidass Journal"
      description="A research magazine for models, agents, evals, and the systems under them.">
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.orb} />
          <div className={styles.orbAlt} />
          <p className={styles.kicker}>Vol. 01 // latent issue</p>
          <h1>
            Field notes from
            <em> the model layer.</em>
          </h1>
          <p className={styles.lede}>
            Kalidass Journal is a colorful research magazine for AI systems:
            attention, agents, evals, and multimodal plumbing. Essays live in
            Upstash Blob. The API is a Cloudflare Worker. The site is static.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} to="/magazine">
              Open the issue
            </Link>
            <Link className={styles.ghost} to="/admin">
              Launch studio
            </Link>
          </div>
        </section>

        {error ? <p className={styles.error}>{error}</p> : null}

        {featured ? (
          <section className={styles.featureWrap}>
            <ArticleCard article={featured} featured />
          </section>
        ) : null}

        {lead.length > 0 ? (
          <section>
            <div className={styles.sectionHead}>
              <h2>In this cycle</h2>
              <p>Systems writing with stills, clips, and durable object URLs.</p>
            </div>
            <div className={styles.grid}>
              {lead.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : null}

        {more.length > 0 ? (
          <section className={styles.listSection}>
            <div className={styles.sectionHead}>
              <h2>Index</h2>
            </div>
            <div className={styles.list}>
              {more.map((article) => (
                <Link
                  key={article.id}
                  className={styles.row}
                  to={`/story/${article.slug}`}>
                  <span style={{background: article.accent}} />
                  <strong>{article.title}</strong>
                  <em>{article.tags?.[0] || "Brief"}</em>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </Layout>
  );
}
