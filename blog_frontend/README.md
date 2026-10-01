# Amrit Journal — Frontend

The static frontend for **Amrit Journal**, a research magazine exploring AI systems (attention architectures, agent workflows, evals, and multimodal pipelines). Built with **Docusaurus 3.10**, **React 19**, and **TypeScript** (`src/**/*.ts(x)`).

Content is loaded dynamically at runtime via client-side requests to a **Cloudflare Worker API** backed by **Upstash Blob** storage.

---

## Directory Structure

```text
blog_frontend/
├── docs/                      # Docs7 documentation site (JSON + MDX)
│   ├── docs.json              # Docs7 navigation, theming, and filter configuration
│   ├── custom.css             # Frame widening for responsive Mermaid diagrams
│   ├── index.mdx              # Documentation home
│   ├── architecture.mdx       # Routes, API-base wiring, dev proxy, and topology
│   ├── agent-publishing.mdx   # Automated AI agent server-to-server publishing
│   ├── data-model.mdx         # TypeScript models, Block union, and article flags
│   ├── reading-experience.mdx # Reader UI, magazine archive, and cards
│   ├── studio.mdx             # Admin Studio CMS: Compose, Drafts, Published, Delete
│   ├── media-uploads.mdx      # Video parsing (YouTube/Vimeo/MP4) and Upstash Blob uploads
│   ├── api.mdx                # Cloudflare Worker REST API reference
│   ├── configuration.mdx      # Docusaurus configuration and CSS variables
│   ├── development.mdx        # Toolchain, verification order, and scripts
│   └── learnings.mdx          # Platform discoveries and CommonJS conflict prevention
├── src/
│   ├── client-modules/
│   │   └── api-base.ts        # Client module injecting API base onto window.AMRIT_API_BASE
│   ├── components/
│   │   ├── ArticleCard.tsx    # Article preview card with accent tints and AI badge
│   │   ├── StoryBody.tsx      # Polymorphic renderer for paragraph, quote, image, video blocks
│   │   ├── StoryPage.tsx      # Full-page reader for dynamic /story/:slug route
│   │   └── VideoEmbed.tsx     # Player resolving YouTube, Vimeo, and HTML5 video
│   ├── css/
│   │   └── custom.css         # Theme gradients, hero accent colors, and custom properties
│   ├── lib/
│   │   ├── api.ts             # API client functions with Bearer authentication and uploads
│   │   ├── config.ts          # URL prefix utility (apiUrl)
│   │   ├── media.ts           # Video URL regex parser and empty draft generator
│   │   └── types.ts           # Type definitions (Author, Block, Article, ArticleDraft)
│   └── pages/
│       ├── story/
│       │   └── [slug].tsx     # Re-export alias for StoryPage
│       ├── admin.tsx          # Studio CMS with Compose, Drafts, Published, and Delete tabs
│       ├── index.tsx          # Magazine homepage with featured cover and brief index
│       └── magazine.tsx       # Searchable issue archive with dynamic tag filters
├── static/
│   ├── img/                   # Static icons and logos
│   ├── _redirects             # Cloudflare Pages SPA fallback for /story/*
│   └── .nojekyll              # Static site hosting override
├── AGENTS.md                  # Canonical rules and guidelines for AI coding agents
├── AI_AGENT_PUBLISH.md        # API payload specifications for automated agent publishing
├── CLAUDE.md                  # Quick reference and operational constraints for Claude Code
├── docusaurus.config.ts       # Central Docusaurus configuration and custom proxy plugin
├── package.json               # Dependencies and scripts
└── tsconfig.json              # TypeScript strict configuration (noEmit: true)
```

---

## Core Features & Architecture

- **Client Routes**:
  - `/` — Homepage featuring the cover brief, recent articles, and index list.
  - `/magazine` — Searchable article archive with multi-tag filtering.
  - `/admin` — Studio CMS with four tab modes: **Compose**, **Drafts**, **Published**, and **Delete**. Deep linking supported via `?mode=` and `?edit=<slug>`.
  - `/story/:slug` — Dynamic reader route registered via `amritPlugin.contentLoaded`.
- **Publication Flags**:
  - `published`: When `false`, saved as an unlisted draft requiring Bearer authentication.
  - `private`: Defaults to `true` (unlisted). Accessible via direct `/story/:slug` link, but hidden from `/` and `/magazine` feeds.
  - `aiGenerated`: When `true`, displays an `AI` badge across cards and article bylines.
- **Server-to-Server Publishing**: Automated pipelines can publish directly to the Worker API (`POST /api/articles`). See [`AI_AGENT_PUBLISH.md`](./AI_AGENT_PUBLISH.md) and [`docs/agent-publishing.mdx`](./docs/agent-publishing.mdx).
- **Authentication**: Admin token stored in `localStorage["amrit-admin-token"]` and passed as `Authorization: Bearer <token>`.
- **Theming**: Dark mode default with dark-chocolate to charcoal gradient (`#2b1a13 → #1d1d21`) and gold hero accent; light mode with cream to white gradient (`#efe3c8 → #ffffff`) and green hero accent (`#4e9b47`).

---

## Quickstart & Local Development

### 1. Installation

```bash
npm install
```

> Requires Node.js `>=20.0` (validated on Node.js 22).

### 2. Run Dev Server

```bash
npm run start
```

Runs the Docusaurus frontend on `http://0.0.0.0:3000`. The development proxy automatically forwards `/api` requests to `http://127.0.0.1:8787`. Run the Worker locally in `../worker` to service backend calls.

### 3. Docs7 Documentation Preview

```bash
npx docs7 dev docs --port 3333
```

Previews the documentation site on `http://localhost:3333`.

---

## Verification & Build

```bash
# Static type check (fast gate)
npm run typecheck

# Validate docs7 documentation integrity
node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs

# Clear cache if stale
npm run clear
```

> **Windows Note**:
> 1. In Windows PowerShell environments with restricted script execution policies, run commands using `npm.cmd` (e.g. `npm.cmd run typecheck`).
> 2. `npm run build` fails on Windows due to the dynamic `/story/:slug` path (`:` is illegal in Windows paths). Verify Windows environments with `typecheck` + `start`. Linux deployment environments build cleanly.

---

## Deployment

Deployments target **Cloudflare Pages**:
- The `static/` folder ships verbatim, providing `_redirects` for SPA fallback on `/story/*`.
- Configure `AMRIT_API_BASE` as a build environment variable pointing to the deployed Cloudflare Worker API URL (leave empty for same-origin).
