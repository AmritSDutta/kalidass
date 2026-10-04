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
          <div className={styles.kicker}>
            <span className={styles.kickerDot} />
            Vol. 01 // Meghaduta Edition
          </div>
          <h1>
            Field notes from
            <em> the neural heart.</em>
          </h1>
          <p className={styles.lede}>
            Kalidass Journal is a high-signal research publication at the intersection of
            agentic cognition, latent representation, and distributed edge architectures—inspired
            by Kalidasa&apos;s cloud messenger archetype.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} to="/magazine">
              <span>Open the issue</span>
              <span>→</span>
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
          <section className={styles.cycleSection}>
            <div className={styles.sectionHead}>
              <h2>In this cycle</h2>
              <p>Compact field notes, empirical evals, and architectural benchmarks.</p>
            </div>
            <div className={styles.grid}>
              {lead.map((article) => (
                <ArticleCard key={article.id} article={article} compact />
              ))}
            </div>
          </section>
        ) : null}

        {more.length > 0 ? (
          <section className={styles.listSection}>
            <div className={styles.sectionHead}>
              <h2>Index & Commentary</h2>
              <p>Chronological index of field notes.</p>
            </div>
            <div className={styles.list}>
              {more.map((article) => (
                <Link
                  key={article.id}
                  className={styles.row}
                  to={`/story/${article.slug}`}>
                  <span style={{background: article.accent || "var(--chroma-neel)"}} />
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
