import React, {type ReactNode} from "react";

// Test-only stub for the Docusaurus "@theme/Layout" webpack alias.
type LayoutProps = {
  children?: ReactNode;
  title?: string;
  description?: string;
};

export default function LayoutStub({children}: LayoutProps): ReactNode {
  return <div data-testid="layout-stub">{children}</div>;
}
