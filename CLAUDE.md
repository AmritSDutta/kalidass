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
│   │   ├── css/               # Neel theme, pigment tokens, and rainbow gradients
│   │   ├── lib/               # api.ts (CRUD & uploads), config.ts, media.ts, types.ts
│   │   └── pages/             # /, /magazine, /admin, /generate_article (dynamic /story/:slug* via plugin)
│   ├── functions/api/         # [[route]].ts Pages Function gateway (/api/* proxy)
│   ├── static/                # Static assets, _redirects, .nojekyll
│   ├── docusaurus.config.ts   # Central config, addRoute, and dev proxy to :8787
│   ├── package.json           # Dependencies and scripts
│   └── tsconfig.json          # TypeScript strict config (noEmit: true)
├── worker/                    # Cloudflare Worker REST API
│   ├── src/
│   │   ├── index.js           # Main routing, auth, and request handlers
│   │   ├── eval/              # Heuristic, Jev, and Clef quality & safety evaluators
│   │   ├── generator/         # Upstash Box sandbox article generator & agent runners
│   │   ├── memory.js          # In-memory dev fallback store
│   │   └── seed.js            # Default article seeds
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

## 3. Production Request Path

- Browser → Cloudflare Pages → `blog_frontend/functions/api/[[route]].ts` intercepts `/api/*` and forwards via `env.JOURNAL_WORKER.fetch(request)` (Service Binding RPC, adds security headers).
- Worker is private (`workers_dev = false`, route `api.kalidass.amrit.fyi/*`; vars `CORS_ORIGIN`, `ROOT_BUCKET`) → Upstash Blob.
- Local dev path instead: Webpack dev server proxies `/api/*` → `127.0.0.1:8787`.

---

## 4. Toolchain & Essential Commands

### Frontend (`blog_frontend/`)
- **Package Manager**: Use `npm` (`package-lock.json` committed, Node `>=20.0`).
- **Typecheck**: `npm run typecheck` (in Windows PowerShell: `npm.cmd run typecheck`).
- **Dev Server**: `npm run start` (serves `0.0.0.0:3000`, proxies `/api` to `127.0.0.1:8787`).
- **Cache Clean**: `npm run clear`

### Worker (`worker/`)
- **Dev Server**: `npm run start` (binds `0.0.0.0:8787` with memory/Upstash store).
- **Deploy**: `npm run deploy` (`npx wrangler deploy`).

### Unified Documentation (`docs/`)
- **Docs7 Preview**: `npx docs7 dev docs --port 3333`
- **Docs7 Validation**: `node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs`

---

## 5. Critical Gotchas & Invariants

1. **No Sibling `.js` Source Files**:
   - `blog_frontend/src/` is strictly TypeScript (`.ts/.tsx`). Sibling `.js` files shadow `.tsx` files in Webpack resolution and cause runtime `exports is not defined` crashes.
   - Always run `tsc` with `noEmit: true`. If `.js` twins appear in `src/`, delete them and execute `npm run clear`.
2. **Windows Path Colon Quirk**:
   - `npm run build` fails on Windows due to the dynamic route `/story/:slug*` (`:` is illegal in Windows filenames).
   - On Windows, verify using `npm.cmd run typecheck` and `npm run start`. Production builds run cleanly on Linux CI.
3. **Browser DOM Guards**:
   - Wrap browser globals (`window`, `localStorage`, `document`) with `typeof window !== "undefined"` or `ExecutionEnvironment.canUseDOM`.
4. **Storage Modes & Cloudflare Fetch Guard**:
   - In-memory fallback seeds 4 default articles when `UPSTASH_BLOB_TOKEN` is unset.
   - Upstash Blob storage activates automatically when `UPSTASH_BLOB_TOKEN` is configured.
   - Cloudflare Workers buffer stream bodies to `Uint8Array` in `globalThis.fetch` to ensure `Content-Length` preservation on `@upstash/blob` S3 calls.
5. **Admin Auth Token Invariant**:
   - Single token key `kalidass-admin-token` in `localStorage` represents administrator credentials for Bearer token and `x-admin-key`. Never introduce secondary elevation tokens (`kalidass-elevation-token`).
6. **Safety Evaluator Regex Boundary Invariant**:
   - In `worker/src/eval/heuristic.js`, always enforce exact regex whole-word boundaries (`\b${escapedTerm}\b`). Never use `content.includes(term)` for short stems, preventing Scunthorpe false positives (e.g. `"analysis"` or `"analytics"` falsely matching `"anal"`).
7. **Upstash Box Generator Invariants**:
   - Enforce strictly ONE image per article (`coverImage` via `gpt-image-1` 16:9 typography-free landscape infographics). No inline images.
   - Agents must use `parse_json_safely()` to strip markdown fences and auto-normalize bare block arrays to `{title, blocks}` dictionaries before property access.

---

## 6. Data Contracts & Operational Flags

- **Worker Endpoints** (`worker/src/index.js`): `/api/articles` (GET/POST, PUT/DELETE by id-or-slug), `/api/generate` (autonomous Upstash Box article synthesis), `/api/auth/me` (user profile handshake), `/api/eval/quality` (Article Heuristics: AI detection, accuracy, engagement, and safety check with pluggable Jev/Clef/heuristic providers), `/api/objects` (media upload, Bearer), `/api/upload` (signed browser upload), `/api/blob/*`, `/api/health`, `/api/admin/reset`.
- **Testing**: No automated test suite. Verification gates: `npm.cmd run typecheck` (frontend) + Docs7 validation (hermetic).

- **Data Models (`blog_frontend/src/lib/types.ts`)**:
  - `Block`: 5-variant union (`paragraph`, `heading`, `quote`, `image`, `video`).
  - `ArticleDraft`: Payload for `createArticle` / `updateArticle` (omits server-generated fields: `id`, `authorEmail`, `publishedAt`, `readTime`, `createdAt`, `updatedAt`).
  - `ArticleSummary`: Used in cards, index lists, and search queries (includes immutable `authorEmail`).
  - `Article`: Full article containing `blocks: Block[]` and server-stamped immutable `authorEmail`.
  - `AuthUser`: User profile `{ email, role: 'admin' | 'author', sub }`.
  - `QualityEvalResult`: Output containing `safety` (verdict, risks, violations), `metrics` (`isAiWritten`, `accuracy`, `engagement`, `editorialReadiness`), and summary.
- **Operational & Auth Flags**:
  - `published`: `false` = draft (requires Bearer token; unauthenticated requests receive `404`; non-admin authors only see their own drafts).
  - `private`: `true` = unlisted (hidden from public `/` and `/magazine`, accessible via direct link; authors only see their own private items in studio).
  - `aiGenerated`: `true` = renders `AI` badge on cards and reader headers.
  - `authorEmail`: Immutable author email stamped server-side by worker from verified Auth0 JWT credentials.
  - `Role Isolation`: Authors can create, edit, and delete only their own articles; Super-Admin (`ADMIN_TOKEN` or `ADMIN_EMAILS`) has full global access. Mutation attempts on other users' articles return `403 Forbidden`.
  - `PRIVATE_APP`: `true` = single-operator mode (hides Auth0 UI; unlocks exclusively with `ADMIN_TOKEN`). Off by default.
  - `Quality & Safety Guardrails`: Automatic pre-submit evaluation in Studio Compose and worker mutation routes (`POST`/`PUT`). Hard-blocks save/publish when safety risk > 0.55.
  - `WebMCP In-Browser Registry`: Defined in `blog_frontend/src/client-modules/webmcp.ts` (registered in `docusaurus.config.ts`). Exposes `searchArticles` and `readArticle` on `window.modelContext` and `navigator.modelContext` for browser AI agent interaction.
