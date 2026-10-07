import {useState, type CSSProperties, type ReactNode} from "react";
import CodeBlock from "@theme/CodeBlock";
import styles from "./ArticleCodeBlock.module.css";

export function getLanguageIndentSize(language?: string): number {
  const lang = (language || "").trim().toLowerCase();
  switch (lang) {
    case "python":
    case "py":
    case "rust":
    case "rs":
    case "go":
    case "golang":
    case "java":
    case "csharp":
    case "cs":
    case "c#":
    case "cpp":
    case "c++":
    case "c":
      return 4;
    default:
      return 2;
  }
}

export interface ArticleCodeBlockProps {
  text: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
  wrapLines?: boolean;
  highlightLines?: string;
  className?: string;
}

/**
 * Reusable Code Block component for Kalidass Journal articles.
 * Wraps Docusaurus @theme/CodeBlock with interactive formatting controls:
 * line numbering toggle, word wrap toggle, line highlighting, and one-click copy.
 */
export default function ArticleCodeBlock({
  text,
  language = "text",
  title,
  showLineNumbers = true,
  wrapLines = false,
  highlightLines,
  className = "",
}: ArticleCodeBlockProps): ReactNode {
  const [lineNumbersActive, setLineNumbersActive] = useState<boolean>(showLineNumbers);
  const [wrappedActive, setWrappedActive] = useState<boolean>(wrapLines);
  const [copied, setCopied] = useState<boolean>(false);

  const normalizedLang = (language || "text").trim().toLowerCase();
  const indentSize = getLanguageIndentSize(normalizedLang);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback silently if clipboard is restricted
    }
  };

  const metastring = highlightLines
    ? `{${highlightLines.replace(/[{}]/g, "").trim()}}`
    : undefined;

  return (
    <div
      className={`${styles.codeContainer} ${wrappedActive ? styles.wrapped : ""} ${className}`.trim()}
      style={{"--code-tab-size": indentSize} as CSSProperties}
    >
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.langBadge}>{normalizedLang}</span>
          {title ? <span className={styles.title}>{title}</span> : null}
        </div>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.optBtn} ${lineNumbersActive ? styles.optBtnActive : ""}`.trim()}
            onClick={() => setLineNumbersActive((prev) => !prev)}
            title="Toggle line numbers"
            aria-label="Toggle line numbers"
          >
            # Lines
          </button>
          <button
            type="button"
            className={`${styles.optBtn} ${wrappedActive ? styles.optBtnActive : ""}`.trim()}
            onClick={() => setWrappedActive((prev) => !prev)}
            title="Toggle line wrapping"
            aria-label="Toggle line wrapping"
          >
            Wrap
          </button>
          <button
            type="button"
            className={`${styles.optBtn} ${copied ? styles.optBtnActive : ""}`.trim()}
            onClick={handleCopy}
            title="Copy code to clipboard"
            aria-label="Copy code"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <CodeBlock
        language={normalizedLang}
        showLineNumbers={lineNumbersActive}
        metastring={metastring}
      >
        {text}
      </CodeBlock>
    </div>
  );
}
