import type {ReactNode} from "react";
import type {Article} from "../lib/types";
import VideoEmbed from "./VideoEmbed";
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
};

export default function StoryBody({article}: Props): ReactNode {
  return (
    <div className={styles.body}>
      {(article.blocks || []).map((block, index) => {
        if (block.type === "heading") {
          const id = headingSlug(block.text, index);
          return (
            <h2 key={index} id={id} className={styles.heading}>
              {block.text}
            </h2>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} className={styles.quote}>
              <p>{block.text}</p>
              {block.cite ? <cite>{block.cite}</cite> : null}
            </blockquote>
          );
        }
        if (block.type === "image") {
          return (
            <figure key={index} className={styles.image}>
              <img src={block.url} alt={block.caption || article.title} />
              {block.caption ? <figcaption>{block.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "video") {
          return (
            <VideoEmbed
              key={index}
              url={block.url}
              caption={block.caption}
              title={article.title}
            />
          );
        }
        return (
          <p key={index} className={styles.paragraph}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
