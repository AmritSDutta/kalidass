import type {ReactNode} from "react";
import type {Article} from "../lib/types";
import VideoEmbed from "./VideoEmbed";
import ArticleCodeBlock from "./ArticleCodeBlock";
import styles from "./StoryBody.module.css";

export function headingSlug(text: string, index?: number): string {
  const base = String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `section-${(index ?? 0) + 1}`;
}

type Props = {
  article: Article;
  dirtyIndices?: number[];
};

export default function StoryBody({article, dirtyIndices = []}: Props): ReactNode {
  const isDirty = (index: number) => dirtyIndices.includes(index);

  return (
    <div className={styles.body}>
      {(article.blocks || []).map((block, index) => {
        const dirtyClass = isDirty(index) ? ` ${styles.dirtyBlock}` : "";
        if (block.type === "heading") {
          const id = headingSlug(block.text, index);
          return (
            <h2 key={index} id={id} className={`${styles.heading}${dirtyClass}`}>
              {block.text}
            </h2>
          );
        }
        if (block.type === "quote") {
          const prev = (article.blocks || [])[index - 1];
          const isReferences =
            prev?.type === "heading" && /reference|attribution/i.test(prev.text);
          const lines = String(block.text || "")
            .split(/\r?\n/)
            .filter((line) => line.trim());
          const baseQuoteClass = isReferences ? `${styles.quote} ${styles.quoteRef}` : styles.quote;
          return (
            <blockquote
              key={index}
              className={`${baseQuoteClass}${dirtyClass}`}>
              {isReferences ? (
                <div className={styles.refLines}>
                  {lines.map((line, li) => (
                    <p key={li} className={styles.refLine}>
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <p>{block.text}</p>
              )}
              {block.cite ? <cite>{block.cite}</cite> : null}
            </blockquote>
          );
        }
        if (block.type === "image") {
          return (
            <figure key={index} className={`${styles.image}${dirtyClass}`}>
              <img src={block.url} alt={block.caption || article.title} />
              {block.caption ? <figcaption>{block.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "video") {
          return (
            <div key={index} className={dirtyClass.trim() || undefined}>
              <VideoEmbed
                url={block.url}
                caption={block.caption}
                title={article.title}
              />
            </div>
          );
        }
        if (block.type === "code") {
          return (
            <ArticleCodeBlock
              key={index}
              text={block.text}
              language={block.language}
              title={block.title}
              className={dirtyClass.trim()}
            />
          );
        }
        return (
          <p key={index} className={`${styles.paragraph}${dirtyClass}`}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
