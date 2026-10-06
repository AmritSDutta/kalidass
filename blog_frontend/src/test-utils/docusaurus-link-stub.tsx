import type {CSSProperties, ReactNode} from "react";

// Test-only stub for the Docusaurus "@docusaurus/Link" webpack alias.
type LinkProps = {
  to?: string;
  href?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export default function LinkStub({to, href, className, style, children, ...rest}: LinkProps): ReactNode {
  return (
    <a href={to || href} className={className} style={style} {...rest}>
      {children}
    </a>
  );
}
