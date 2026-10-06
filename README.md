# Kalidass Journal — Systems Research Magazine

**Kalidass Journal** is a colorful research publication exploring the neural heart: attention architectures, agent workflows, evals, and multimodal systems plumbing.

The application is structured as a **combined monorepo** consisting of a **Docusaurus 3.10** static frontend, a **Cloudflare Worker REST API**, and **Upstash Blob** object storage.

---

## 1. System Architecture & Data Flow

```mermaid
flowchart LR
    subgraph Client["Reader & Studio UI"]
        Reader["Reader (/story/:slug, /magazine, /)"]
        Studio["Studio CMS (/admin, /generate_article)"]
        WebMCP["In-Browser WebMCP Tools"]
    end

    subgraph PagesEdge["Cloudflare Pages Edge (kalidass.amrit.fyi)"]
        Pages["Docusaurus 3.10 Static SPA"]
        Proxy["Pages Function (functions/api/[[route]].ts)"]
    end

    subgraph PrivateWorker["Private Cloudflare Worker (workers_dev = false)"]
        Worker["Worker REST API (/api/*)"]
        EvalEngine["Quality & Safety Engine (Jev / Clef / Heuristic)"]
    end

    subgraph CloudSandbox["Upstash Box Sandboxes"]
        BoxGen["Article Generator (Node / Python)"]
        BoxIntel["Intelligence Runner (Python + SerpApi)"]
    end

    subgraph Storage["Persistence & Caching Layer"]
        Blob["Upstash Blob (Articles, Intelligence & Media)"]
        Redis["Upstash Redis (Dossier & Eval Cache)"]
        Memory["In-Memory Store (Dev Fallback)"]
    end

    Reader -->|Browse & Read| Pages
    Pages -->|Same-Origin fetch /api/*| Proxy
    Studio -->|Bearer Auth /api/*| Proxy
    WebMCP -->|Tool Calls| Pages
    Proxy ==>|env.JOURNAL_WORKER.fetch (Isolate RPC)| Worker
    Worker --> EvalEngine
    Worker -->|"Box.create"| BoxGen
    Worker -->|"Box.create"| BoxIntel
    Worker -->|Persistent Mode| Blob
    Worker -->|Cache Hits/Writes| Redis
    Worker -->|Fallback Mode| Memory
```

- **Static Frontend**: Pre-rendered Docusaurus 3.10 + React 19 SPA served on `https://kalidass.amrit.fyi` with contextual WebMCP tools.
- **Pages Function Gateway**: Catch-all function (`blog_frontend/functions/api/[[route]].ts`) intercepts `/api/*` and invokes the private worker via the `JOURNAL_WORKER` Service Binding in memory.
- **Private Worker API**: Cloudflare Worker (`workers_dev = false`, zero public exposure) handling CRUD operations (`/api/articles`), health checks (`/api/health`), media uploads (`/api/objects`), intelligence dossiers (`/api/articles/:slug/intel`), quality evals (`/api/eval/quality`), and signed browser uploads (`/api/upload`).
- **Autonomous Upstash Box Sandboxes**: Ephemeral containerized runners for article synthesis (`agent.py`) and live search grounding (`intelligence.py` with SerpApi).
- **Multi-Tier Persistence & Caching**: Durable JSON articles and media stored in Upstash Blob; intelligence dossiers and eval results cached in Upstash Redis (with in-memory fallbacks for local development).

---

## 2. Monorepo Directory Layout

```text
kalidass/
├── blog_frontend/             # Static frontend & reader application
│   ├── src/
│   │   ├── client-modules/    # api-base.ts, webmcp.ts (window.modelContext)
│   │   ├── components/        # ArticleCard, IntelligencePanel, StoryBody, StoryPage, VideoEmbed
│   │   ├── css/               # Neel theme, pigment tokens, and rainbow gradients
│   │   ├── lib/               # api.ts (CRUD/uploads), media.ts, types.ts
│   │   └── pages/             # /, /magazine, /admin, /generate_article (dynamic /story/:slug* via plugin)
│   ├── static/                # Static assets, _redirects, .nojekyll
│   ├── docusaurus.config.ts   # Docusaurus config, addRoute, and dev proxy
│   ├── package.json           # Frontend dependencies and scripts
│   └── tsconfig.json          # TypeScript strict configuration (noEmit: true)
├── worker/                    # Cloudflare Worker REST API
│   ├── src/
│   │   ├── index.js           # Main fetch handler, router, CORS, auth
│   │   ├── eval/              # Quality & safety evaluation pipeline (heuristic, Jev, Clef)
│   │   ├── generator/         # Upstash Box AI article generator (Python & Node harnesses)
│   │   ├── intelligence/      # Upstash Box Python research runner & SerpApi grounding
│   │   ├── redis/             # Redis caching adapter (Upstash Redis & memory fallback)
│   │   ├── memory.js          # In-memory storage adapter fallback
│   │   └── seed.js            # Seed bootstrap (empty by default)
│   ├── package.json           # Worker dependencies
│   ├── wrangler.toml          # Cloudflare Worker configuration & bindings
│   └── .dev.vars.example      # Example environment variables template
├── docs/                      # Unified Docs7 documentation suite
│   ├── docs.json              # Docs7 config ($schema, filterSidebar, groups)
│   ├── custom.css             # Frame widening for responsive Mermaid
│   ├── *.mdx                  # Frontend & system architecture docs
│   └── worker/*.mdx           # Worker & storage architecture docs
├── AGENTS.md                  # Canonical AI agent operational invariants
├── AI_AGENT_PUBLISH.md        # Machine-to-machine API publishing specification
├── CLAUDE.md                  # Fast-reference agent instructions & commands
├── DEPLOY.md                  # Direct Cloudflare Pages/Worker deployment guide
├── README.md                  # Master project guide (this file)
├── start.sh                   # Concurrent local dev startup script
└── ZERO_TRUST_DEPLOY.md       # Cloudflare Zero Trust Access & proxy runbook
```

---

## 3. Core Features & Data Contracts

### Routes
- `/` — Homepage featuring the publication header, dedicated **Featured Story** section (`Lead Dispatch`), 3-column "In This Cycle", and issue index.
- `/magazine` — Issue archive with real-time text search and dynamic tag filtering.
- `/admin` — Studio CMS with four tab modes: **Compose**, **Drafts**, **Published**, and **Delete**. Includes editable URL slugs (`/story/<slug>`), real-time title sync, and customizable pigment swatches (`ACCENTS`). Deep linking supported via `?mode=` and `?edit=<slug>`.
- `/story/:slug*` — Dynamic story reader registered via plugin `actions.addRoute` rendering polymorphic blocks with custom accent tints.

### Publication Flags
- `published`: When `false`, saved as a draft (requires Bearer authentication; unauthenticated queries return `404`).
- `private`: Defaults to `true` (unlisted). Excluded from public `/` and `/magazine` feeds, and readable only by its author or an admin (anonymous `/story/:slug` requests return `404`).
- `aiGenerated`: When `true`, renders the `AI` badge across cards and reader headers.

### Content Blocks (`src/lib/types.ts`)
Articles support 5 block types: `paragraph`, `heading`, `quote` (with optional `cite`), `image` (with optional `caption`), and `video` (YouTube, Vimeo, or direct MP4).

---

## 4. How to Run Locally

### Prerequisites
- Node.js `>=20.0` (validated on Node.js 22).
- `npm` package manager.

### Option A: Concurrent Startup (Recommended)

From the repository root:

```bash
chmod +x start.sh
./start.sh
```

This launches both the Cloudflare Worker on `http://127.0.0.1:8787` and the Docusaurus frontend on `http://0.0.0.0:3000`.

---

### Option B: Manual Multi-Terminal Startup

#### 1. Start the Cloudflare Worker
In your first terminal:

```bash
cd worker
npm install

# (Optional) Configure Upstash Blob for persistent local testing:
# Copy .dev.vars.example to .dev.vars and add your UPSTASH_BLOB_TOKEN

npm run start
```

- Worker listens on `http://127.0.0.1:8787`.
- Without `UPSTASH_BLOB_TOKEN`, the worker runs on an empty in-memory store (no seeded articles).

#### 2. Start the Frontend
In your second terminal:

```bash
cd blog_frontend
npm install
npm run start
```

- Frontend serves on `http://0.0.0.0:3000`.
- The Webpack dev server automatically proxies `/api/*` requests to `http://127.0.0.1:8787`.

---

## 5. Running & Validating Docs7 Documentation

The unified Docs7 documentation suite is hosted at the repository root in `docs/`:

```bash
# Preview documentation site on port 3333
npx docs7 dev docs --port 3333

# Validate docs integrity (zero errors / zero warnings)
node scripts/validate_docs.mjs docs
```

---

## 6. How to Deploy (Cloudflare Pages + Worker Service Binding)

### Step 1: Upstash Blob Setup
1. Create a public bucket in [Upstash Console](https://console.upstash.com).
2. Copy the bucket token (`UPSTASH_BLOB_TOKEN`).

### Step 2: Deploy the Private Cloudflare Worker
```bash
cd worker
npm install

# Configure secret tokens (do not commit secrets)
npx wrangler secret put UPSTASH_BLOB_TOKEN
npx wrangler secret put ADMIN_TOKEN  # Legacy/M2M password for Studio writes and AI agent publishing
npx wrangler secret put AUTH0_DOMAIN # e.g. dev-xxx.us.auth0.com (or in wrangler.toml)
npx wrangler secret put AUTH0_AUDIENCE # e.g. https://api.kalidass.amrit.fyi (or in wrangler.toml)
npx wrangler secret put ADMIN_EMAILS # Comma-separated Super-Admin email addresses

# Deploy private worker to Cloudflare (workers_dev = false, zero public exposure)
npx wrangler deploy
```

### Step 3: Deploy the Frontend to Cloudflare Pages
1. Connect your Git repository in the Cloudflare Dashboard under **Workers & Pages** → **Create application** → **Pages**.
2. Set Build Settings:
   - **Framework preset**: None / Docusaurus
   - **Root directory**: `blog_frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `build`
   - **Environment variables**:
     - `NODE_VERSION`: `20`
     - `AUTH0_DOMAIN`: `your-tenant.us.auth0.com`
     - `AUTH0_CLIENT_ID`: `your-spa-client-id`
     - `AUTH0_AUDIENCE`: `https://api.kalidass.amrit.fyi`
     - `PRIVATE_APP`: `false` (optional; set to `true` to disable Auth0 UI and run admin-token-only single-operator mode)
3. Configure the **Service Binding**:
   - Under Pages **Settings** → **Bindings** (or **Functions** → **Service bindings**), add:
     - **Type**: `Service binding`
     - **Name**: `JOURNAL_WORKER`
     - **Value**: `kalidass-journal-worker`
4. Set Custom Domain:
   - Add `kalidass.amrit.fyi` to Pages Custom Domains.
5. Deploy. `blog_frontend/functions/api/[[route]].ts` automatically proxies all `/api/*` requests in-memory via `context.env.JOURNAL_WORKER.fetch(request)`.

> Refer to [`ZERO_TRUST_DEPLOY.md`](./ZERO_TRUST_DEPLOY.md) and [`DEPLOY.md`](./DEPLOY.md) for complete runbooks.

---

## 7. Studio CMS & Authentication

1. Navigate to `/admin` to open the Studio CMS.
2. Sign in with **Auth0** using the login prompt in the top navigation bar. Alternatively, enter an `ADMIN_TOKEN` via the manual token prompt or browser console:
   ```javascript
   localStorage.setItem("kalidass-admin-token", "<your-admin-token>");
   ```
3. **Operating Modes**:
   - **Multi-User Auth0 Mode (Default)**: Authors authenticate via Auth0. Regular authors only see and edit their own drafts and private articles (`GET /api/articles?status=draft`). Super-Admins (`ADMIN_TOKEN` or `ADMIN_EMAILS`) have full global access across all articles.
   - **Private App Mode (`PRIVATE_APP=true`)**: Disables the Auth0 login UI entirely. The Studio runs as a single-operator CMS unlocking exclusively with `ADMIN_TOKEN`.
4. Use the tabs to:
   - **Compose**: Write text, add pull quotes, insert images, and embed videos with automatic `authorEmail` stamping.
   - **Drafts**: Edit and preview your unlisted drafts.
   - **Published**: Manage live articles and toggles.
   - **Delete**: Purge authorized articles.

---

## 8. Machine-to-Machine Agent Publishing

Autonomous AI agents can publish articles directly via HTTP through the edge gateway:

```bash
curl -X POST https://kalidass.amrit.fyi/api/articles \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Field notes from the eval trench",
    "subtitle": "What broke and what we measured",
    "excerpt": "A summary deck for search cards.",
    "author": {"name": "Agent", "role": "Correspondent", "avatar": ""},
    "tags": ["Evals", "Agents"],
    "accent": "#6366f1",
    "published": false,
    "private": true,
    "aiGenerated": true,
    "blocks": [{"type": "paragraph", "text": "Opening section content."}]
  }'
```

> Refer to [`AI_AGENT_PUBLISH.md`](./AI_AGENT_PUBLISH.md) for the complete JSON schema and publishing lifecycle.

---

## 9. Article Heuristics (Quality & Safety Evaluation)

Kalidass Journal integrates automated editorial quality assessment and content safety guardrails powered by pluggable providers (TypeSafe Jev, Cloudflare Clef, and local deterministic heuristics) at the authenticated `POST /api/eval/quality` endpoint (Bearer token required):

- **AI Writing Detection (`noul` primitive)**: Computes probability of synthetic AI generation vs. human composition.
- **Technical Accuracy & Rigor (`score` primitive)**: Analyzes systems architecture depth and technical precision ($1.0 - 5.0$).
- **Reader Engagement (`score` primitive)**: Measures flow, pacing, and narrative clarity ($1.0 - 5.0$).
- **Editorial Readiness (`choice` primitive)**: Triage classifier returning `ready_for_publication`, `needs_minor_polish`, or `needs_major_revision`.
- **Pre-Submit Safety Hard-Blocking**: Evaluates violence, sexual, and antisocial risk primitives. If any risk exceeds $0.55$, saving/publishing is immediately blocked in Studio Compose and rejected with HTTP `422` by the edge worker.
- **Exact Word Boundary Scunthorpe Defense**: Local heuristic evaluator (`worker/src/eval/heuristic.js`) enforces regex whole-word boundaries (`\b${escapedTerm}\b`), ensuring technical terminology (such as `"analysis"`, `"analytics"`, and `"analyzer"`) never false-matches substrings like `"anal"`.
- **Live Reader & Studio Badges**: Live audit cards in `StoryPage.tsx` and `admin.tsx` display real-time safety verdicts, AI probability, and technical rigor scores under the "Article Heuristics" banner.

> Refer to [`docs/worker/quality-eval.mdx`](./docs/worker/quality-eval.mdx) for architecture diagrams, schema specifications, provider cascade details, and local heuristic fallback behavior.

---

## 10. Autonomous Upstash Box AI Article Generator

Kalidass Journal provides containerized research article synthesis powered by isolated cloud sandboxes via `@upstash/box` (`POST /api/generate` and `/generate_article` UI):

- **Ephemeral Cloud Sandbox**: Spins up isolated Linux containers on-demand via the `@upstash/box` SDK to execute custom Python (`agent.py`) and Node.js research agents.
- **Hypervisor Secret Injection via `attachHeaders`**: API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`) reside in Worker environment secrets and are injected into outbound network calls at the hypervisor level. Secrets never touch the container disk or shell variables.
- **Resilient JSON Output**: Features `parse_json_safely()` to strip markdown fences and automatically normalize bare lists or array wrappers into standard article schemas.
- **Single Cover Image Invariant**: Strictly generates exactly ONE image per article (`coverImage` via `gpt-image-1` typography-free 16:9 infographics). No inline images are emitted.
- **Direct Draft Persistence**: Generated articles undergo immediate safety evaluation and are persisted into Upstash Blob as unlisted drafts (`published: false, private: true, aiGenerated: true`).
- **Single Admin Token**: Authenticated seamlessly with `kalidass-admin-token` in `localStorage`.

> Refer to [`docs/worker/upstash-box-generator.mdx`](./docs/worker/upstash-box-generator.mdx) for architecture, prompt schemas, and runner specifications.

---

## 11. Article Intelligence Engine (SerpApi & Upstash Box)

Kalidass Journal integrates an automated search grounding and live intelligence compiler powered by **Upstash Box** and **SerpApi** (`worker/src/intelligence/`):

- **Ephemeral Python Sandbox**: Executes a standalone research script (`intelligence.py`) inside an isolated Upstash Box container (`runtime: "python"`, `size: "small"`) to query Google Search via SerpApi.
- **Empirical Grounding Primitives**: Extracts Google AI Overviews (with source citations and expanded text blocks), Knowledge Graph entities, People Also Ask (PAA) questions, related inline videos, and organic citations.
- **In-Flight Concurrency Locks**: Uses module-level promise locking (`_intelInflightLocks`) to guarantee that concurrent requests for the same article never spawn duplicate Box containers.
- **Multi-Tier Caching & Persistence**: Compiled dossiers are cached in Upstash Redis (24-hour TTL) with an in-memory Map fallback, and durably stored in Upstash Blob (`kalidass/intelligence/{id}.json`).
- **Gated Compilation vs. Public Peek**:
  - `GET /api/articles/:slug/intel`: Public read-only sub-resource reading from Redis/Blob without spawning containers (gated by draft/private state).
  - `GET /api/articles/:slug?intelligence=true[&refresh=true]`: Authenticated route enabling authors and admins to compile or refresh live intelligence.
  - `GET /api/articles/:slug`: Returns `has_intelligence: boolean` so the reader UI renders the tab badge without eagerly downloading the full payload.
- **Interactive Reader UI (`IntelligencePanel`)**: Dynamic story header tabs ("Article", "AI Intelligence", "Article Heuristics") featuring lazy-loaded accordions, verified citations, and live status badges ("Cached", "Live", "Compiling").

> Refer to [`docs/worker/intelligence.mdx`](./docs/worker/intelligence.mdx) for architecture diagrams, schema specifications, and endpoint contracts.

---

## 12. WebMCP (In-Browser Model Context Protocol)

Kalidass Journal natively implements **WebMCP** (`document.modelContext` / `navigator.modelContext` / `window.modelContext`), enabling browser AI agents (Chrome built-in AI, Gemini Nano, OpenAI Operator, and extensions like **WebMCP – Model Context Tool Inspector**) to search and read research dispatches directly within the browser runtime without DOM scraping:

- **`searchArticles({ query, tag })`**: Filter and search publication briefs by keyword or category tag. On `/story/:slug`, automatically isolates and returns **only the current article**; on catalog pages, returns up to 5 matching briefs.
- **`readArticle({ slug })`**: Fetch canonical reading URL, path, and summary metadata. On `/story/:slug`, defaults to the current story slug if omitted.

```javascript
// Test directly in DevTools Console (F12):
await window.modelContext.tools.searchArticles.execute({ query: "evals" });
await window.modelContext.tools.readArticle.execute({ slug: "attention-as-routing" });
```

> Validated with Chrome's **WebMCP – Model Context Tool Inspector** extension (`chrome://flags/#enable-webmcp-testing`). Refer to [`docs/webmcp.mdx`](./docs/webmcp.mdx) for architecture, schema declarations, and extension setup.

---

## 13. Verification & Quality Gates

```bash
# Frontend static type check (mandatory before deployment)
cd blog_frontend && npm.cmd run typecheck

# Run hermetic frontend UI test suite (jsdom, zero network, 100% mocked)
cd blog_frontend && npm.cmd test

# Run hermetic Worker Vitest test suite (zero network, 100% mocked)
cd worker && npm.cmd test

# Validate unified Docs7 documentation suite
node scripts/validate_docs.mjs docs

# Clear build artifacts if cache is stale
cd blog_frontend && npm run clear
```

Automated verification runs on every push and pull request via [GitHub Actions CI](.github/workflows/ci.yml).

---

## 14. Architecture Notes & Known Limitations

An honest assessment for contributors evaluating this codebase.

### Strengths
1. **Edge-Native Zero-Maintenance Storage**: Upstash Blob with a configurable root bucket eliminates database migrations; the in-memory fallback keeps local dev dependency-free.
2. **Polymorphic Content Pipeline**: The 5-variant `Block` union renders cleanly across web and API clients without raw HTML parsing.
3. **Agent-Native Publishing**: Standardized `POST /api/articles` payload and WebMCP in-browser tools let AI agents draft and read content through stable contracts.
4. **Validated Documentation**: The Docs7 suite is machine-validated in CI, keeping docs synchronized with code.
5. **Multi-Tier Edge Caching**: Upstash Redis integration caches intelligence dossiers and eval results with TTL expiration, eliminating duplicate compute.

### Known Limitations
1. **Worker is untyped JavaScript**: The frontend is strict TypeScript, but the Worker (the security-critical surface) relies on JSDoc annotations only.
2. **Whole-index read-modify-write**: Article listing loads and rewrites the full JSON index per mutation (guarded by `withIndexLock`); fine at personal-journal scale, a ceiling at high traffic.
3. **Frontend tests are component-level only**: No end-to-end browser or visual regression tests; coverage focuses on render contracts of core components and the WebMCP registry.
4. **Windows build limitation**: `npm run build` fails locally due to the `/story/:slug*` route colon; production builds run on Linux CI.
5. **Single-region Worker**: Global edge storage runs across Cloudflare Workers and Upstash, but mutations serialize to a primary region.

### Roadmap
- **Dynamic SSG Fallback**: Pre-rendered static routes or a custom 404 rewrite fallback for local Windows builds.
- **Worker Type Safety**: Migrate `worker/src` to TypeScript or add `checkJs` typechecking in CI.
- **E2E Smoke Tests**: Browser-level publish/read flow against the memory store.

