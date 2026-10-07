import {themes as prismThemes} from "prism-react-renderer";
import type {Config} from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

function resolveFaroCollectorUrl(): string {
  if (process.env.FARO_COLLECTOR_URL) {
    return process.env.FARO_COLLECTOR_URL.trim();
  }
  const endpoint = (process.env.FARO_ENDPOINT || "").trim();
  const appId = (process.env.FARO_APP_ID || "").trim();
  if (endpoint && appId) {
    try {
      const parsed = new URL(endpoint);
      const host = parsed.hostname.replace(/^faro-api-/, "faro-collector-");
      return `${parsed.protocol}//${host}/collect/${appId}`;
    } catch {
      return "";
    }
  }
  return "";
}

const config: Config = {
  title: "Kalidass Journal",
  tagline: "Field notes from the neural heart.",
  favicon: "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png",
  headTags: [
    {
      tagName: "link",
      attributes: {
        rel: "icon",
        type: "image/png",
        href: "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "apple-touch-icon",
        href: "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png",
      },
    },
  ],
  future: {
    v4: true,
  },
  url: "https://kalidass.amrit.fyi",
  baseUrl: "/",
  organizationName: "kalidass-journal",
  projectName: "kalidass-journal",
  onBrokenLinks: "throw",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  customFields: {
    apiBase: "",
    auth0Domain: process.env.AUTH0_DOMAIN || "",
    auth0ClientId: process.env.AUTH0_CLIENT_ID || "",
    auth0Audience: process.env.AUTH0_AUDIENCE || "",
    adminEmails: process.env.ADMIN_EMAILS || "",
    // PRIVATE_APP=true hides Auth0 login entirely — admin-token unlock only
    privateApp: process.env.PRIVATE_APP === "true",
    faroCollectorUrl: resolveFaroCollectorUrl(),
    faroAppName: process.env.FARO_APP_NAME || "kalidass",
    faroAppVersion: process.env.FARO_APP_VERSION || "1.0.0",
    faroEnvironment: process.env.NODE_ENV || "production",
  },
  clientModules: [
    "./src/client-modules/api-base.ts",
    "./src/client-modules/webmcp.ts",
    "./src/client-modules/faro.ts",
    "./src/client-modules/hardening.ts",
  ],
  plugins: [
    function kalidassPlugin() {
      return {
        name: "kalidass-journal",
        async contentLoaded({actions}: any) {
          actions.addRoute({
            path: "/story",
            component: "@site/src/components/StoryPage.tsx",
            exact: false,
          });
        },
        configureWebpack(config: any, isServer: boolean, utils: any) {
          const plugins: any[] = [];
          const faroApiKey = process.env.FARO_API_KEY;
          const faroEndpoint = process.env.FARO_ENDPOINT;
          const faroAppId = process.env.FARO_APP_ID;
          const faroStackId = process.env.FARO_STACK_ID;

          // Strip console noise from the production client bundle (keeps console.error).
          if (!isServer && utils?.isProd && Array.isArray(config?.optimization?.minimizer)) {
            for (const minimizer of config.optimization.minimizer) {
              if (minimizer?.options?.terserOptions) {
                minimizer.options.terserOptions.compress = {
                  ...minimizer.options.terserOptions.compress,
                  pure_funcs: ["console.log", "console.info", "console.debug", "console.warn"],
                };
              }
            }
          }

          if (!isServer && faroApiKey && faroEndpoint && faroAppId && faroStackId) {
            try {
              const FaroSourceMapUploaderPlugin = require("@grafana/faro-webpack-plugin");
              plugins.push(
                new FaroSourceMapUploaderPlugin({
                  appName: process.env.FARO_APP_NAME || "kalidass",
                  endpoint: faroEndpoint,
                  appId: faroAppId,
                  stackId: faroStackId,
                  apiKey: faroApiKey,
                  verbose: true,
                  gzipContents: true,
                })
              );
            } catch (pluginErr) {
              console.warn("[Faro] Warning: Could not initialize FaroSourceMapUploaderPlugin:", pluginErr);
            }
          }

          return {
            plugins,
            mergeStrategy: {"devServer.proxy": "replace"},
            devServer: {
              host: "0.0.0.0",
              allowedHosts: [".amrit.fyi", ".kalidass.fyi", ".monkeycode-ai.live"],
              proxy: [
                {
                  context: ["/api"],
                  target: "http://127.0.0.1:8787",
                  changeOrigin: true,
                },
              ],
            },
          };
        },
      };
    },
  ],
  presets: [
    [
      "classic",
      {
        docs: false,
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    // Interim og:image/twitter:card fallback — replace with a designed 1200x630 brand card later.
    image: "https://pub-c1d80f0f7327493997a3c1285f43a9ea.r2.dev/amrit_logo.png",
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Kalidass Journal",
      logo: {
        alt: "Kalidass Journal",
        src: "img/logo.svg",
      },
      items: [
        {to: "/magazine", label: "Issue", position: "right"},
        {to: "/admin", label: "Studio", position: "right"},
        {to: "/generate_article", label: "Neural Gen", position: "right"},
        {type: "custom-auth" as any, position: "right"},
      ],
    },
    footer: {
      style: "dark",
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} Kalidass Journal. Stored as objects.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: [
        "python",
        "bash",
        "go",
        "rust",
        "java",
        "csharp",
        "sql",
        "json",
        "yaml",
        "ruby",
        "kotlin",
        "swift",
        "docker",
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
