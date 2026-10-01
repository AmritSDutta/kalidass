import {themes as prismThemes} from "prism-react-renderer";
import type {Config} from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Kalidass Journal",
  tagline: "Field notes from the model layer.",
  favicon: "img/favicon.ico",
  future: {
    v4: true,
  },
  url: "https://kalidass-journal.pages.dev",
  baseUrl: "/",
  organizationName: "kalidass-journal",
  projectName: "kalidass-journal",
  onBrokenLinks: "throw",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  customFields: {
    apiBase: process.env.KALIDASS_API_BASE || "",
  },
  clientModules: ["./src/client-modules/api-base.ts"],
  plugins: [
    function kalidassPlugin() {
      return {
        name: "kalidass-journal",
        configureWebpack() {
          return {
            mergeStrategy: {"devServer.proxy": "replace"},
            devServer: {
              host: "0.0.0.0",
              allowedHosts: [".kalidass.fyi", ".monkeycode-ai.live"],
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
        async contentLoaded({actions}) {
          actions.addRoute({
            path: "/story/:slug",
            component: "@site/src/components/StoryPage",
            exact: true,
          });
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
        {to: "/magazine", label: "Issue", position: "left"},
        {to: "/admin", label: "Studio", position: "right"},
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Read",
          items: [
            {label: "Issue", to: "/magazine"},
            {label: "Studio", to: "/admin"},
          ],
        },
        {
          title: "Stack",
          items: [
            {label: "Upstash Blob", to: "/admin"},
            {label: "Cloudflare Worker", to: "/"},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Kalidass Journal. Stored as objects.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
