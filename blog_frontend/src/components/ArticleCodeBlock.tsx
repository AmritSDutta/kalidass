import type {ReactNode} from "react";
import CodeBlock from "@theme/CodeBlock";
import styles from "./ArticleCodeBlock.module.css";

export interface ArticleCodeBlockProps {
  text: string;
  language?: string;
  title?: string;
  className?: string;
}

/**
 * Reusable Code Block component for Kalidass Journal articles.
 * Wraps Docusaurus @theme/CodeBlock with typography and theme integration.
 */
export default function ArticleCodeBlock({
  text,
  language = "text",
  title,
  className = "",
}: ArticleCodeBlockProps): ReactNode {
  const normalizedLang = (language || "text").trim().toLowerCase();

  return (
    <div className={`${styles.codeContainer} ${className}`.trim()}>
      <CodeBlock
        language={normalizedLang}
        title={title || undefined}
        showLineNumbers
      >
        {text}
      </CodeBlock>
    </div>
  );
}
