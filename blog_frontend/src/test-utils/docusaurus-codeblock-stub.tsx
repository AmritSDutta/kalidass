import type {ReactNode} from "react";

// Test-only stub for the Docusaurus "@theme/CodeBlock" webpack alias.
type CodeBlockProps = {
  children?: ReactNode;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
  metastring?: string;
  className?: string;
};

export default function CodeBlockStub({
  children,
  language,
  title,
  showLineNumbers,
  metastring,
  className,
}: CodeBlockProps): ReactNode {
  return (
    <pre
      className={className}
      data-language={language}
      data-title={title}
      data-show-line-numbers={showLineNumbers !== undefined ? String(showLineNumbers) : undefined}
      data-metastring={metastring}
    >
      {title && <div className="code-title">{title}</div>}
      <code>{children}</code>
    </pre>
  );
}
