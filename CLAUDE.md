# CLAUDE.md — Agent Operations & Technical Reference

Authoritative technical specification, operational invariants, and machine-level contracts for autonomous AI coding agents (Claude, Antigravity, etc.) working in the **Kalidass Journal** codebase.

> [!NOTE]
> **Human Developers**: Please refer to [`README.md`](./README.md) for human-focused onboarding, design rationale, and quickstart guides. This document is strictly an invariant-driven operational manual for AI agents.

---

## 1. Absolute Agent Rules & Non-Negotiable Invariants

### Security & Confidentiality
- **NO ACCESS TO `.env` FILES**: Never read, view, or look inside `.env` or any file matching `.env*` (`.env`, `.env.local`, `.env.production`, `.env.example`).
- **NO INSPECTION OF SYSTEM ENVIRONMENT VARIABLES**: Never dump, print, or log environment variables (e.g. via `env`, `printenv`, `set`, `Get-ChildItem Env:`, PowerShell `$env:...`, or Python `os.environ`).

### Git Safety
- **NO COMMITS, PUSHES, OR STASHES**: Never run `git commit`, `git push`, or `git stash`. Staging and committing is strictly reserved for the human engineer.
- **NO DESTRUCTIVE GIT COMMANDS**: Never execute `git reset --hard`, `git checkout .`, `git clean -f`, or any mutation that discards working tree state.
- **READ-ONLY INSPECTION ONLY**: Only `git status` (and read-only `git diff` / `git log` when strictly necessary) is permitted.

### Execution & Architecture Invariants
- **NO SUBAGENTS**: Never spawn or invoke subagents (`invoke_subagent`, `manage_subagents`). Perform all planning, research, editing, and verification in the primary context.
- **TOKEN EFFICIENCY**: Keep responses concise, direct, and technical without conversational preamble, padding, or repeating user instructions.
- **NO OVER-ENGINEERING**: Keep solutions direct and minimal. Do not introduce complex speculative abstractions or new dependencies without explicit user approval.
- **STRICT TYPE HINTS**: Explicit type annotations on all parameters and returns (TypeScript and Python).
- **HERMETIC TESTING**: All automated tests must be 100% hermetic with zero unmocked network or external filesystem side-effects.

---

## 2. System Architecture & Request Topologies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PRODUCTION REQUEST PATH                                                     │
│                                                                             │
│ Browser (https://kalidass.amrit.fyi)                                        │
│   │                                                                         │
│   ├── Static Assets & SPA Pages ──> Cloudflare Pages CDN                    │
│   │                                                                         │
│   └── API Requests (/api/*)     ──> Pages Function Gateway                  │
│                                     (blog_frontend/functions/api/[[route]])│
│                                       │ (Isolate RPC via Service Binding    │
│                                       │  env.JOURNAL_WORKER.fetch)          │
│                                       ▼                                     │
│                                     Private Cloudflare Worker Edge API      │
│                                     (workers_dev = false, no public URL)    │
│                                       │                                     │
│                                       ├── Upstash Redis (Cache / TTLs)      │
│                                       ├── Upstash Blob (Object Storage)     │
│                                       └── Upstash Box (Container Runners)   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ LOCAL DEVELOPMENT PATH                                                      │
│                                                                             │
│ Browser (http://localhost:3000)                                             │
│   │                                                                         │
│   ├── Docusaurus Dev Server (Webpack on :3000)                              │
│   │                                                                         │
│   └── Webpack Dev Proxy (/api/*) ──> Cloudflare Worker (Wrangler on :8787)  │
│                                       │                                     │
│                                       ├── Upstash Redis or In-Memory Cache  │
│                                       └── Upstash Blob or In-Memory Store   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Monorepo Structure & File Roles

```
kalidass/
├── blog_frontend/                    # Docusaurus 3.10 + React 19 Frontend
│   ├── functions/api/[[route]].ts   # Cloudflare Pages Function Service Binding proxy
│   ├── static/
│   │   ├── _headers                 # Enterprise security headers & CSP (connect-src *.grafana.net)
│   │   └── _redirects               # SPA fallback (/story/* -> /index.html 200)
│   ├── src/
│   │   ├── client-modules/
│   │   │   ├── api-base.ts          # Dynamic /api resolution (SSR safe)
│   │   │   ├── faro.ts              # Grafana Faro client module & route change observer
│   │   │   ├── hardening.ts         # Cosmetic deterrent against devtools shortcuts in prod
│   │   │   ├── webmcp.ts            # WebMCP core tools & modelContext registry
│   │   │   ├── storyWebMcp.ts       # Story-scoped WebMCP tools & stage enhancement
│   │   │   └── webmcpShared.ts      # Shared WebMCP types & URL slug extractor
│   │   ├── components/
│   │   │   ├── ArticleCard.tsx      # Magazine & index card preview with AI badge
│   │   │   ├── ArticleCodeBlock.tsx # Reusable syntax-highlighted code block
│   │   │   ├── ErrorBoundary.tsx    # FaroAwareErrorBoundary wrapping UI with crash reporting
│   │   │   ├── IntelligencePanel/   # SerpApi search grounding accordion dossier
│   │   │   ├── KalidasaEpigraph.tsx # Prologue verse banner from Mālavikāgnimitra
│   │   │   ├── StoryBody.tsx        # Polymorphic block renderer (all 6 types)
│   │   │   ├── StoryPage.tsx        # Dynamic reader (/story/:slug) + outline metrics
│   │   │   └── VideoEmbed.tsx       # YouTube, Vimeo, and direct MP4 player
│   │   ├── lib/
│   │   │   ├── api.ts               # Typed client methods (CRUD, intel, eval, upload)
│   │   │   ├── media.ts             # Video player URL parser & embed resolvers
│   │   │   └── types.ts             # Canonical Block union, Article, and Auth types
│   │   ├── pages/
│   │   │   ├── index.tsx            # Lead Dispatch featured hero & issue index
│   │   │   ├── magazine.tsx         # Issue archive with search & dynamic tag filter
│   │   │   ├── admin.tsx            # Studio CMS (Compose, Drafts, Published, Delete)
│   │   │   └── generate_article.tsx # AI agent article generation form
│   │   ├── theme/
│   │   │   └── Root.tsx             # Root wrapper injecting FaroAwareErrorBoundary & AuthProvider
│   │   └── test-utils/              # Vitest webpack stubs (@docusaurus/Link, @theme/CodeBlock)
│   ├── docusaurus.config.ts          # Dynamic route plugin, Prism languages, Faro uploader plugin
│   ├── vitest.config.ts             # Vitest jsdom configuration & module aliases
│   └── package.json
├── worker/                           # Cloudflare Worker REST API
│   ├── src/
│   │   ├── index.js                  # Main router, route dispatch, fetch guard
│   │   ├── helper/                   # Core modular service helpers
│   │   │   ├── auth.js               # AuthHelper: Auth0 JWT, constant-time token match
│   │   │   ├── response.js           # ResponseHelper: CORS headers, JSON formatting, options
│   │   │   └── storage.js            # StorageHelper: Blob/memory persistence, models, index lock
│   │   ├── eval/
│   │   │   ├── heuristic.js         # Whole-word regex safety & editorial readiness
│   │   │   ├── jev.js / clef.js     # External eval provider adaptors
│   │   │   └── types.js             # Evaluation schemas and risk thresholds
│   │   ├── generator/
│   │   │   ├── box_based_generator.js # Upstash Box article generation orchestration
│   │   │   ├── agent_python.js      # Python agent script harness & LangChain runner
│   │   │   ├── agent_node.js        # Node agent script harness
│   │   │   ├── schemas.js           # Zod schemas for article & block validation
│   │   │   └── prompts.js           # Editorial research brief prompt templates
│   │   ├── intelligence/
│   │   │   ├── service.js           # Dossier orchestration & in-flight lock manager
│   │   │   ├── runner.js            # Upstash Box Python research script execution
│   │   │   └── storage.js           # Dossier persistence in Upstash Blob
│   │   ├── redis/
│   │   │   └── cache.js             # Upstash Redis client with memory fallback
│   │   ├── memory.js                 # In-memory storage adapter fallback
│   │   └── seed.js                  # Initial bootstrap seed (empty by default)
│   ├── test/                         # 100% hermetic Vitest suites
│   ├── wrangler.toml                 # Cloudflare Worker bindings & private route config
│   └── package.json
├── docs/                             # Docs7 Documentation Site
│   ├── docs.json                     # Docs7 config with filterSidebar & navigation groups
│   ├── custom.css                    # Diagram frame widening for strict-mode Mermaid
│   ├── faro-observability.mdx        # Grafana Faro RUM, Web Vitals & sourcemap guide
│   └── *.mdx                         # Architectural & operational documentation
├── scripts/
│   └── validate_docs.mjs             # Docs7 automated structural validator
├── AGENTS.md                         # Canonical agent guidelines & entry points
├── AI_AGENT_PUBLISH.md               # Machine-to-machine API publishing specification
├── CLAUDE.md                         # This file: Authoritative technical contract for AI agents
├── DEPLOY.md                         # Cloudflare production deployment runbook
└── README.md                         # Human-centric project guide & quickstart for engineers
```

---

## 4. Exact Execution Toolchains & Commands

### Windows PowerShell Execution Rules
> [!IMPORTANT]
> Windows PowerShell disables `.ps1` script execution by default. Avoid executing raw `npm` or script wrappers that invoke `.ps1`. Run Node binaries directly or use `.cmd` extensions:

```powershell
# Frontend Typecheck
node ./node_modules/typescript/bin/tsc --noEmit
# Or: npm.cmd run typecheck

# Frontend Hermetic Vitest Tests
node ./node_modules/vitest/vitest.mjs run
# Or: npm.cmd test

# Worker Hermetic Vitest Tests (from worker/ directory)
node ./node_modules/vitest/vitest.mjs run
# Or: npm.cmd test

# Docs7 Documentation Validation (from repo root)
node scripts/validate_docs.mjs docs
```

### Linux / macOS / Bash Commands
```bash
# Frontend
cd blog_frontend && npm run typecheck && npm test

# Worker
cd worker && npm test

# Local full stack concurrent launch
./start.sh
```

---

## 5. Data Contracts & Type Models

### Polymorphic Block Union (`blog_frontend/src/lib/types.ts` & `worker/src/generator/schemas.js`)
Articles support 6 polymorphic block types:
```typescript
export type Block =
  | { type: "paragraph"; text: string; _id?: string }
  | { type: "heading"; text: string; _id?: string }
  | { type: "quote"; text: string; cite?: string; _id?: string }
  | { type: "image"; url: string; caption?: string; _id?: string }
  | { type: "video"; url: string; caption?: string; _id?: string }
  | { type: "code"; text: string; language?: string; title?: string; showLineNumbers?: boolean; wrapLines?: boolean; highlightLines?: string; _id?: string };
```

### Core Article Models
- **`ArticleDraft`**: Input payload for `createArticle` / `updateArticle`:
  - `title`, `subtitle`, `excerpt`, `coverImage`, `videoUrl`, `author`, `tags`, `accent`, `featured`, `blocks`, `published`, `private`, `aiGenerated`, `slug`.
  - Server-managed fields (`id`, `authorEmail`, `publishedAt`, `readTime`, `createdAt`, `updatedAt`) are stripped by client and set server-side.
- **`ArticleSummary`**: Card and list view projection containing immutable `authorEmail`, `has_intelligence: boolean`, and formatted `readTime`.
- **`Article`**: Full record including `blocks: Block[]`, `authorEmail`, and `has_intelligence`.

### Operational & Visibility Flags
- `published: false` = Draft. Requires Bearer authentication. Authors see only their own drafts; admins see all.
- `private: true` = Unlisted. Excluded from `/` and `/magazine` feeds. Anonymous `/story/:slug` fetches return `404`. Only the author or an admin can access.
- `aiGenerated: true` = Displays the `AI` badge across cards and reader headers.
- `authorEmail`: Immutable creator email stamped server-side from verified Auth0 JWT or admin token.

---

## 6. WebMCP In-Browser AI Tools Specification

Kalidass Journal exposes 7 structured tools on `window.modelContext`, `document.modelContext`, and `navigator.modelContext`:

| Tool | Scope | Parameters | Description |
|---|---|---|---|
| `searchArticles` | Global / Story | `query?: string`, `tag?: string` | Returns up to 5 matching articles, or isolates to the active story on `/story/:slug`. |
| `readArticle` | Global / Story | `slug?: string` | Returns direct URL and metadata. Resolves automatically from `location.pathname` on `/story/:slug`. |
| `getStoryAiOverview` | Story-scoped | none | Returns Google AI Overview text, query, and cited research references from the dossier. |
| `getStoryCitations` | Story-scoped | none | Extracts attribution quotes and references from the story body. |
| `getStoryVideoLinks` | Story-scoped | none | Returns hero and inline body video players and captions. |
| `getPeopleAlsoAsk` | Story-scoped | none | Returns searcher questions and answer snippets from the dossier. |
| `enhanceStoryContent` | Story-scoped (Auth) | `enhancedText?`, `sectionHeading?`, `addNewSection?`, `blockIndex?`, `enhancedBlocks?`, `instruction?` | Stages in-browser content modifications with live preview bar. Resolves route internally via `window.location`. |

### Staging Lifecycle Events
- **`kalidass:stage-enhancement`**: Dispatched by `enhanceStoryContent`. Handled by `StoryPage.tsx` to render the floating diff preview bar with dirty block highlights.
- **`kalidass:stage-clear`**: Dispatched by `StoryPage.tsx` on save, discard, or route navigation. Handled by `storyWebMcp.ts` to reset accumulated staged blocks.

---

## 7. Critical Implementation Gotchas

1. **No Sibling `.js` Source Files**:
   - `blog_frontend/src/` is strictly TypeScript. Any `.js` twin created next to a `.ts` or `.tsx` file will shadow the TypeScript file in Webpack and cause runtime `exports is not defined` crashes.
2. **Windows Path Colon Quirk**:
   - `npm run build` in `blog_frontend` fails on Windows because Docusaurus tries to emit `/story/:slug*` to the filesystem (Windows forbids `:` in filenames).
   - On Windows, verify frontend code with `tsc --noEmit` and Vitest. Full static builds run on Linux CI.
3. **Browser DOM Guards**:
   - Wrap browser globals (`window`, `document`, `localStorage`) in `typeof window !== "undefined"` or `ExecutionEnvironment.canUseDOM` for SSR safety.
4. **Vitest Docusaurus Webpack Aliases**:
   - Docusaurus aliases `@docusaurus/Link` and `@theme/CodeBlock` are not npm packages. They must be mapped in `blog_frontend/vitest.config.ts` to stub implementations in `src/test-utils/`.
5. **Admin Auth Token Invariant**:
   - The single token key in `localStorage` is `kalidass-admin-token`. Never introduce secondary token names.
6. **Safety Evaluator Regex Boundary Invariant**:
   - In `worker/src/eval/heuristic.js`, always use whole-word boundaries `\b${escapedTerm}\b`. Never use `.includes()` on short stems to avoid Scunthorpe false positives.
7. **Upstash Box Generator Invariants**:
   - Enforce strictly ONE image per article: `coverImage` via `gpt-image-1` (16:9 typography-free infographic). No inline body images.
8. **Intelligence Concurrency Locks & Cache TTLs**:
   - In-flight lock `_intelInflightLocks` in `worker/src/intelligence/service.js` prevents duplicate container runs.
   - Redis cache keys: Feed = `kalidass:feed:public` (3h TTL), Story = `kalidass:article:<id>` (24h TTL), Intel = `kalidass:ai_intel:<id>` (24h TTL).
9. **Constant-Time Secret Comparison Invariant**:
   - In `worker/src/helper/auth.js`, `matchesAdminToken` must compare secrets via `timingSafeEqual` over SHA-256 digests (`node:crypto`) to prevent timing side channels.
10. **Isolate Index Mutation Mutex**:
    - `withIndexLock` in `worker/src/helper/storage.js` serializes all async index read-modify-write operations within each Cloudflare Worker isolate.

---

## 8. Grafana Faro Frontend Observability Architecture

Kalidass Journal integrates Grafana Faro for browser Real User Monitoring (RUM), Web Vitals, console/error capture, distributed HTTP tracing, and build-time source map uploads:

### Secret & Credential Invariants
- **Zero Values Checked In**: Never commit any specific Faro endpoint, app ID, stack ID, or API key. All values are read dynamically from environment variables:
  - `FARO_COLLECTOR_URL`: Ingestion endpoint for browser telemetry.
  - `FARO_ENDPOINT`: Grafana Cloud source map upload API endpoint.
  - `FARO_APP_ID`: Unique application identifier. Public by design — embedded in the client-visible collector URL when auto-derived (never confuse with `FARO_API_KEY`).
  - `FARO_STACK_ID`: Stack identifier.
  - `FARO_API_KEY`: Secret build token with `sourcemaps:write` scope.
  - `FARO_APP_NAME`: Application name in Grafana (defaults to `kalidass`).

### Automatic Collector URL Derivation
- `resolveFaroCollectorUrl` in `docusaurus.config.ts` and `src/client-modules/faro.ts`:
  - Uses explicit `FARO_COLLECTOR_URL` if defined.
  - Falls back to deriving collector URL from `FARO_ENDPOINT` and `FARO_APP_ID` by transforming host (`faro-api-*` → `faro-collector-*`) and appending `/collect/${FARO_APP_ID}`.
  - Gracefully returns empty string if unconfigured, keeping telemetry safely inactive.

### Bundler & SSR Invariants
- **Webpack 5 Client Only (`!isServer`)**: In `docusaurus.config.ts`, `@grafana/faro-webpack-plugin` is registered strictly during client compilation when all build variables are present.
- **DOM Guard**: `src/client-modules/faro.ts` gates initialization with `ExecutionEnvironment.canUseDOM` to prevent Node.js static generation crashes.
- **Trace Header CORS Isolation**: `TracingInstrumentation` limits W3C trace propagation to `/^\/api/` and `kalidass.amrit.fyi`.
- **No `@grafana/faro-react`**: Removed — its `react-router ^7 || ^8` peer conflicts with Docusaurus's `react-router@5` and breaks `npm clean-install` on Cloudflare Pages. Error capture uses `src/components/ErrorBoundary.tsx` (`FaroAwareErrorBoundary` → `getFaro()?.api.pushError`).
- **Route View Tracking**: `src/client-modules/faro.ts` exports `onRouteDidUpdate` → `api.setView` per SPA navigation.
- **CSP Connect Allowance**: `blog_frontend/static/_headers` `connect-src` includes the vendor wildcard `https://*.grafana.net` (pattern of `*.auth0.com` / `*.blob.upstash.io`). Never hardcode stack-specific Faro origins.
- **Production Console Stripping**: Terser `pure_funcs` drops `console.log/info/debug/warn` from the production client bundle (`console.error` kept).
- **Client Hardening (`src/client-modules/hardening.ts`)**: Production-only cosmetic deterrent — blocks context menu and devtools/view-source shortcuts (F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U). Not a security boundary.
- **Root Error Boundary**: `src/theme/Root.tsx` wraps the application in `<FaroAwareErrorBoundary>` with an accessible fallback screen.

