import type {ReactNode} from "react";
import {parseVideo} from "../lib/media";
import styles from "./VideoEmbed.module.css";

type Props = {
  url: string;
  caption?: string;
  title?: string;
};

export default function VideoEmbed({url, caption, title}: Props): ReactNode {
  const parsed = parseVideo(url);
  if (!parsed) return null;

  return (
    <figure className={styles.figure}>
      <div className={styles.frame}>
        {parsed.kind === "youtube" ? (
          <iframe
            src={`https://www.youtube.com/embed/${parsed.id}`}
            title={title || "Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : parsed.kind === "vimeo" ? (
          <iframe
            src={`https://player.vimeo.com/video/${parsed.id}`}
            title={title || "Video"}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video src={parsed.url} controls playsInline />
        )}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
