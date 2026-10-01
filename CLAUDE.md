# CLAUDE.md — Kalidass Journal

Quick-reference and operational guidance for Claude Code and AI assistants working in this repository.

> For comprehensive architecture, local execution, and full deployment runbooks, refer to [`README.md`](./README.md).
> For canonical agent hard rules, refer to [`AGENTS.md`](./AGENTS.md).

---

## 1. Hard Rules & Operational Invariants

- **Token Efficiency**: Work in a strictly token-efficient manner. Keep responses concise, direct, and technical without conversational padding.
- **Git Restrictions**: `git status` (and read-only `git diff` / `git log` when strictly necessary) only. Never run `git commit`, `git push`, `git stash`, or destructive commands (`git reset --hard`, `git checkout .`, `git clean -f`).
- **No Subagents**: Do not invoke or spawn subagents unless explicitly requested by the user.
- **Hermetic Testing**: All tests, verification steps, and mocks must be hermetic with zero unmocked network or filesystem side-effects.

---

## 2. Monorepo Structure

```text
kalidass/
├── blog_frontend/             # Docusaurus 3.10 + React 19 UI & Reader
│   ├── src/
│   │   ├── client-modules/    # window.KALIDASS_API_BASE client initialization
│   │   ├── components/        # ArticleCard, StoryBody, StoryPage, VideoEmbed
│   │   ├── css/               # Theming gradients and custom properties
│   │   ├── lib/               # api.ts (CRUD & uploads), media.ts, types.ts
│   │   └── pages/             # /, /magazine, /admin, /story/[slug]
│   ├── static/                # Static assets, _redirects, .nojekyll
│   ├── docusaurus.config.ts   # Central config & dev proxy to :8787
│   ├── package.json           # Dependencies and scripts
│   └── tsconfig.json          # TypeScript strict config (noEmit: true)
├── worker/                    # Cloudflare Worker REST API
│   ├── src/                   # index.js, memory.js, seed.js
│   ├── package.json           # Worker dependencies
│   ├── wrangler.toml          # Worker routing and environment bindings
│   └── .dev.vars.example      # Example local environment secrets
├── docs/                      # Unified Docs7 documentation suite
│   ├── docs.json              # Docs7 config ($schema, filterSidebar, groups)
│   ├── custom.css             # Frame widening for responsive Mermaid
│   ├── *.mdx                  # Frontend & system architecture docs
│   └── worker/*.mdx           # Worker & storage architecture docs
├── AGENTS.md                  # Minimal canonical agent invariants
├── AI_AGENT_PUBLISH.md        # Machine-to-machine API publish specification
├── CLAUDE.md                  # Fast-reference agent instructions (this file)
├── DEPLOY.md                  # Direct Cloudflare deployment checklist
├── README.md                  # Comprehensive architecture, run, & deploy guide
├── start.sh                   # Local dual-process startup script
└── ZERO_TRUST_DEPLOY.md       # Cloudflare Zero Trust Access runbook
```

---

## 3. Toolchain & Essential Commands

### Frontend (`blog_frontend/`)
- **Package Manager**: Use `npm` (`package-lock.json` committed, Node `>=20.0`).
- **Typecheck**: `npm run typecheck` (in Windows PowerShell: `npm.cmd run typecheck`).
- **Dev Server**: `npm run start` (serves `0.0.0.0:3000`, proxies `/api` to `127.0.0.1:8787`).
- **Cache Clean**: `npm run clear`

### Worker (`worker/`)
- **Dev Server**: `npm run start` (serves `127.0.0.1:8787` with memory/Upstash store).
- **Deploy**: `npm run deploy` (`npx wrangler deploy`).

### Unified Documentation (`docs/`)
- **Docs7 Preview**: `npx docs7 dev docs --port 3333`
- **Docs7 Validation**: `node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs`

---

## 4. Critical Gotchas & Invariants

1. **No Sibling `.js` Source Files**:
   - `blog_frontend/src/` is strictly TypeScript (`.ts/.tsx`). Sibling `.js` files shadow `.tsx` files in Webpack resolution and cause runtime `exports is not defined` crashes.
   - Always run `tsc` with `noEmit: true`. If `.js` twins appear in `src/`, delete them and execute `npm run clear`.
2. **Windows Path Colon Quirk**:
   - `npm run build` fails on Windows due to the dynamic route `/story/:slug` (`:` is illegal in Windows filenames).
   - On Windows, verify using `npm.cmd run typecheck` and `npm run start`. Production builds run cleanly on Linux CI.
3. **Browser DOM Guards**:
   - Wrap browser globals (`window`, `localStorage`, `document`) with `typeof window !== "undefined"` or `ExecutionEnvironment.canUseDOM`.
4. **Storage Modes**:
   - In-memory fallback seeds 4 default articles when `UPSTASH_BLOB_TOKEN` is unset.
   - Upstash Blob storage activates automatically when `UPSTASH_BLOB_TOKEN` is configured.

---

## 5. Data Contracts & Operational Flags

- **Data Models (`blog_frontend/src/lib/types.ts`)**:
  - `Block`: 5-variant union (`paragraph`, `heading`, `quote`, `image`, `video`).
  - `ArticleDraft`: Payload for `createArticle` / `updateArticle` (omits server-generated fields: `id`, `publishedAt`, `readTime`, `createdAt`, `updatedAt`).
  - `ArticleSummary`: Used in cards, index lists, and search queries.
  - `Article`: Full article containing `blocks: Block[]`.
- **Operational Flags**:
  - `published`: `false` = draft (requires Bearer token; unauthenticated requests receive `404`).
  - `private`: `true` = unlisted (hidden from `/` and `/magazine`, accessible via `/story/:slug`).
  - `aiGenerated`: `true` = renders `AI` badge on cards and reader headers.
