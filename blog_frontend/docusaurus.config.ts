import {themes as prismThemes} from "prism-react-renderer";
import type {Config} from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

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
  },
  clientModules: ["./src/client-modules/api-base.ts", "./src/client-modules/webmcp.ts"],
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
        configureWebpack() {
          return {
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
    image: "img/docusaurus-social-card.jpg",
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
