# AGENTS.md — blog_frontend (Amrit Journal)

Canonical guide and operational rules for AI coding agents working in this repository.

---

## 1. Operational Constraints & Hard Rules

- **Token Efficiency**: Work in a highly token-efficient manner. Keep responses concise, direct, and technical without conversational filler.
- **Git Restrictions**: `git status` (and read-only `git diff` / `git log` when strictly necessary) only. Never run `git commit`, `git push`, `git stash`, or destructive commands (`git reset --hard`, `git checkout .`, `git clean -f`).
- **No Subagents**: Do not invoke or spawn subagents unless explicitly instructed by the user.
- **Hermetic Testing**: All tests, verification steps, and mocks must be hermetic with zero unmocked network or filesystem side-effects.

---

## 2. Directory Structure

```text
blog_frontend/
├── docs/                      # Docs7 documentation site (JSON + MDX)
│   ├── docs.json              # Docs7 navigation, theming, and filterSidebar configuration
│   ├── custom.css             # Frame widening for responsive Mermaid diagrams (.mermaid-frame)
│   ├── index.mdx              # Documentation home with native <Tree> component
│   ├── architecture.mdx       # Routes, API-base wiring, dev proxy, and system topology
│   ├── agent-publishing.mdx   # Automated AI agent server-to-server publishing specification
│   ├── data-model.mdx         # TypeScript models, Block union, Author, and article flags
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

## 3. Toolchain & Commands

- **Node Version**: Node `>=20.0` (validated on Node 22).
- **Package Manager**: Use `npm` (`package-lock.json` is committed).
- **Development**: `npm run start` (serves on `0.0.0.0:3000`, proxies `/api` to `127.0.0.1:8787`).
- **Typecheck**: `npm run typecheck` (`tsc` with `noEmit`). On Windows PowerShell, execute via `npm.cmd run typecheck`.
- **Docs7 Site Preview**: `npx docs7 dev docs --port 3333`
- **Docs7 Validation**: `node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs`
- **Cache Clean**: `npm run clear`

---

## 4. Critical Gotchas & Architectural Invariants

### Sibling `.js` Source Conflicts
- Sources are `.ts/.tsx` ONLY.
- Never run a bare `tsc` without `noEmit: true`. Sibling `.js` files generated in `src/` shadow `.tsx` files in Webpack resolution, causing `exports is not defined` runtime crashes.
- `.gitignore` ignores `src/**/*.js`, `docusaurus.config.js`, and `sidebars.js`. If `.js` twins appear in `src/`, delete them and execute `npm run clear`.

### Dynamic Route SSG Quirk on Windows
- `npm run build` fails on Windows with `EINVAL` on `/story/:slug` because colons are illegal in Windows paths.
- On Windows, verify with `npm run typecheck` and `npm run start`. Production builds run on Linux CI.

### Browser DOM Guards
- Wrap all browser globals (`window`, `localStorage`, `document`) with `typeof window !== "undefined"` or `ExecutionEnvironment.canUseDOM`.

---

## 5. Architecture & Data Contracts

- **Static Frontend + Dynamic Edge**: Docusaurus 3.10 + React 19 static site. `preset-classic` has `docs: false, blog: false`. Articles are loaded at runtime from a Cloudflare Worker API backed by Upstash Blob.
- **Routes**:
  - `/` → `src/pages/index.tsx` (Cover story, lead grid, index list).
  - `/magazine` → `src/pages/magazine.tsx` (Live search and tag filter).
  - `/admin` → `src/pages/admin.tsx` (Studio CMS: Compose, Drafts, Published, Delete; supports `?mode=` and `?edit=<slug>`).
  - `/story/:slug` → `src/components/StoryPage.tsx` (Registered dynamic route via `amritPlugin.contentLoaded`).
- **Data Models (`src/lib/types.ts`)**:
  - `Block`: 5-variant union (`paragraph`, `heading`, `quote`, `image`, `video`).
  - `ArticleDraft`: Writable draft payload without server-owned fields (`id`, `publishedAt`, `readTime`, `createdAt`, `updatedAt`).
  - `ArticleSummary`: Summary shape used on cards, search index, and Studio listings.
  - `Article`: Full article with `blocks: Block[]`.
- **Operational Flags**:
  - `published`: `false` = draft (requires Bearer token; unauthenticated requests receive `404`).
  - `private`: Defaults to `true` (unlisted; accessible only via direct link).
  - `aiGenerated`: Defaults to `false` (renders `AI` badge on cards and headers).
- **Upload Pipeline (`src/lib/api.ts`)**:
  - Primary: Upstash browser SDK `upload(file, { route: apiUrl("/api/upload") })`.
  - Fallback: Multipart `FormData` `POST /api/objects` with Bearer auth.

---

## 6. Docs7 Documentation Standards

When editing or creating files in `docs/`:
1. **Derive from Code**: Ensure all endpoints, types, and flags reflect actual source code in `src/` and `worker/`.
2. **Mandatory Frontmatter**: Every `.mdx` file must have `title` and `description` in YAML frontmatter, followed by an `# H1` header.
3. **No Orphan Pages**: Every `.mdx` page must be registered under a group in `docs/docs.json`.
4. **Strict-Mode Mermaid**:
   - Double-quote subgraph IDs and titles: `subgraph ID["Title"]`.
   - Never use brackets `[` or `]` inside subgraph titles.
   - Never use `<br>` or `<br/>` in node labels; use dashes or separate nodes.
   - Keep diagram fences contiguous without blank lines or `%%` comments.
5. **Native `<Tree>` Components**: Always use `<Tree>`, `<Tree.Folder>`, and `<Tree.File>` components for directory hierarchies instead of ASCII characters (`├──`, `└──`).
6. **Validation**: Run `node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs` and ensure 0 warnings and 0 errors.
