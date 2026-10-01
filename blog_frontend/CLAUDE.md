# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also [`AGENTS.md`](./AGENTS.md) (the canonical source of truth for all coding rules).

---

## Hard Rules

- **Work in the most token-efficient way**: Concise, technical responses; no verbose chatter.
- **Git Restrictions**: `git status` (and read-only diff/log) only. Never run `git commit`, `git push`, `git stash`, or destructive commands.
- **No Subagents**: Do not invoke or spawn subagents unless explicitly asked.
- **Hermetic Mocks**: All test cases and verification steps must be hermetic without unmocked external dependencies. Note: no test runner script exists; verification is `typecheck` + `start`.

---

## Source Directory Layout

```text
blog_frontend/
├── docs/                      # Docs7 site (docs.json + .mdx pages with Mermaid)
├── src/
│   ├── client-modules/
│   │   └── api-base.ts        # window.AMRIT_API_BASE injection
│   ├── components/
│   │   ├── ArticleCard.tsx    # Article card with --card-accent
│   │   ├── StoryBody.tsx      # Polymorphic block renderer
│   │   ├── StoryPage.tsx      # Reader page for /story/:slug
│   │   └── VideoEmbed.tsx     # YouTube, Vimeo, HTML5 player
│   ├── css/
│   │   └── custom.css         # Theming gradients and custom properties
│   ├── lib/
│   │   ├── api.ts             # API client & Upstash upload pipeline
│   │   ├── config.ts          # apiUrl() helper
│   │   ├── media.ts           # parseVideo() regex & emptyDraft()
│   │   └── types.ts           # Author, Block, Article, ArticleDraft
│   └── pages/
│       ├── story/[slug].tsx   # Re-export of StoryPage
│       ├── admin.tsx          # Studio CMS (Compose, Drafts, Published, Delete)
│       ├── index.tsx          # Home page
│       └── magazine.tsx       # Search & tag filter page
├── static/                    # Static assets, _redirects, .nojekyll
├── AGENTS.md                  # Canonical agent rules and architecture
├── AI_AGENT_PUBLISH.md        # AI agent publishing API guide
├── docusaurus.config.ts       # Docusaurus config and proxy plugin
└── package.json               # Scripts & dependencies
```

---

## Commands

- **Package Manager**: Use `npm` (`package-lock.json` is committed; Node `>=20`).
- **Typecheck**: `npm run typecheck` (in Windows PowerShell, run `npm.cmd run typecheck`).
- **Development**: `npm run start` (serves on `0.0.0.0:3000`, proxies `/api` to `127.0.0.1:8787`).
- **Docs7 Validation**: `node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs`
- **Cache Clean**: `npm run clear` (clears `.docusaurus` cache).

---

## Critical Gotchas

1. **Never Commit `src/**/*.js`**:
   - Sources are `.ts/.tsx` ONLY. Sibling `.js` files in `src/` shadow `.tsx` files and crash Webpack dev with `exports is not defined`.
   - `tsconfig.json` enforces `"noEmit": true`. If `.js` files appear in `src/`, delete them and run `npm run clear`.
2. **Windows Build Quirk**:
   - `npm run build` fails on Windows with `EINVAL` on `/story/:slug` because colons are illegal in Windows paths.
   - On Windows, verify with `npm run typecheck` and `npm run start`. Production builds run on Linux CI.

---

## Architecture & Data Contracts

- **Content Flow**: Runtime API fetch from Cloudflare Worker (`GET /api/articles`) backed by Upstash Blob. Not Markdown SSG.
- **Data Types (`src/lib/types.ts`)**:
  - `Block`: 5-variant union (`paragraph`, `heading`, `quote`, `image`, `video`).
  - `ArticleDraft`: Payload for `createArticle` / `updateArticle` (no server-owned fields `id`, `publishedAt`, `readTime`).
  - `ArticleSummary`: Used in cards and index lists.
  - `Article`: Full article with `blocks: Block[]`.
- **Visibility & Flags**:
  - `published: false` = draft (requires Bearer token to read/list).
  - `private: true` = unlisted (excluded from public index/magazine, direct link works).
  - `aiGenerated: true` = renders `AI` chip on card and story bylines.
- **Client DOM Guards**: Wrap browser-only APIs in `typeof window !== "undefined"` or `ExecutionEnvironment.canUseDOM`.
