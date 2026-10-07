import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "@docusaurus/Link" is a Docusaurus webpack alias, not an npm package
      "@docusaurus/Link": fileURLToPath(
        new URL("./src/test-utils/docusaurus-link-stub.tsx", import.meta.url)
      ),
      "@theme/CodeBlock": fileURLToPath(
        new URL("./src/test-utils/docusaurus-codeblock-stub.tsx", import.meta.url)
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
