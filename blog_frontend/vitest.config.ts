import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@site": fileURLToPath(new URL("./", import.meta.url)),
      // "@docusaurus/Link" is a Docusaurus webpack alias, not an npm package
      "@docusaurus/Link": fileURLToPath(
        new URL("./src/test-utils/docusaurus-link-stub.tsx", import.meta.url)
      ),
      "@theme/CodeBlock": fileURLToPath(
        new URL("./src/test-utils/docusaurus-codeblock-stub.tsx", import.meta.url)
      ),
      "@theme/Layout": fileURLToPath(
        new URL("./src/test-utils/docusaurus-layout-stub.tsx", import.meta.url)
      ),
      "@generated/docusaurus.config": fileURLToPath(
        new URL("./src/test-utils/docusaurus-config-stub.ts", import.meta.url)
      ),
      "@docusaurus/useDocusaurusContext": fileURLToPath(
        new URL("./src/test-utils/docusaurus-context-stub.ts", import.meta.url)
      ),
      "@docusaurus/ExecutionEnvironment": fileURLToPath(
        new URL("./src/test-utils/docusaurus-execution-environment-stub.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    isolate: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
