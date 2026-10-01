# Zero Trust Deployment Plan — Amrit Journal

Complete runbook for deploying the Cloudflare Worker behind Cloudflare Zero Trust Access,
migrating to the `amrit.fyi` custom domain, and wiring the Docusaurus SPA via a Pages Function proxy.

---

## Domain Mapping

| Old Value | New Value | Location |
| --- | --- | --- |
| `amrit-journal.pages.dev` | `journal.amrit.fyi` | Pages custom domain |
| `.monkeycode-ai.live` | `.amrit.fyi` | Dev server `allowedHosts` |
| `amrit-journal.<subdomain>.workers.dev` | `api.amrit.fyi` | Worker custom domain |
| `AMRIT_API_BASE` env var (Pages) | Removed | No longer needed |

---

## Architecture After Deployment

```
Browser (journal.amrit.fyi)
  │
  │  fetch /api/*  (same-origin)
  ▼
Cloudflare Pages Function  ← functions/api/[[route]].ts
  │  adds CF-Access-Client-Id
  │  adds CF-Access-Client-Secret
  ▼
Cloudflare Zero Trust Access Policy  (api.amrit.fyi)
  │  validates service token
  ▼
Cloudflare Worker  (api.amrit.fyi — workers_dev = false)
  │
  ▼
Upstash Blob  (journal/* and media/*)
```

The browser never sees the Zero Trust service token. It calls relative `/api/*` URLs on its
own Pages origin. The Pages Function holds the token server-side in encrypted env vars.

---

## Part 1 — Manual Cloudflare Dashboard Steps

> You do these. Order matters — complete Steps A–B before setting env vars in E.

### A. Worker Custom Domain

1. **Workers & Pages** → `aether-journal` worker → **Settings** → **Domains & Routes**
   → **Add Custom Domain**.
2. Enter `api.amrit.fyi`.
3. Cloudflare creates the DNS A/AAAA record automatically.

### B. Pages Custom Domain

1. **Workers & Pages** → your Pages project → **Custom Domains** → **Set up a custom domain**.
2. Enter `journal.amrit.fyi`.
3. Cloudflare creates the CNAME record automatically.

### C. Zero Trust Access Application

1. **Cloudflare Zero Trust** → **Access** → **Applications** → **Add an Application** → **Self-hosted**.
2. **Application name**: `amrit-journal-worker`
3. **Application domain**: `api.amrit.fyi`
4. Under **Policies**, add a policy:
   - **Policy name**: `pages-proxy`
   - **Action**: Service Auth
5. Save. Note the **AUD (Audience Tag)** shown on the application detail page.

### D. Service Token

1. **Zero Trust** → **Access** → **Service Tokens** → **Create Service Token**.
2. **Name**: `amrit-journal-pages`
3. **Copy the Client ID and Client Secret immediately** — the secret is shown only once.
4. Edit the `pages-proxy` policy → add rule: **Service Token** → `amrit-journal-pages`.

### E. Pages Function Environment Variables

In **Workers & Pages** → Pages project → **Settings** → **Environment Variables** → **Production**:

| Variable | Value | Notes |
| --- | --- | --- |
| `WORKER_URL` | `https://api.amrit.fyi` | No trailing slash |
| `CF_ACCESS_CLIENT_ID` | *(from service token)* | Plain text |
| `CF_ACCESS_CLIENT_SECRET` | *(from service token)* | Encrypt this one |
| `NODE_VERSION` | `20` | Required for Docusaurus build |

Remove `AMRIT_API_BASE` if previously set.

---

## Part 2 — Code Changes

> I (Antigravity) implement these when you approve.

### 2.1 NEW — `blog_frontend/functions/api/[[route]].ts`

Catch-all Pages Function. Intercepts every `/api/*` browser request, injects ZT headers, proxies to worker.

```typescript
interface Env {
  WORKER_URL: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const workerUrl = `${env.WORKER_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
  headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);

  return fetch(workerUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
  });
};
```

Local dev is unchanged — the webpack proxy in `docusaurus.config.ts` already forwards
`/api` → `http://127.0.0.1:8787`. Pages Functions only run on the Cloudflare edge.

---

### 2.2 MODIFY — `blog_frontend/docusaurus.config.ts`

```diff
-  url: "https://amrit-journal.pages.dev",
+  url: "https://journal.amrit.fyi",

   customFields: {
-    apiBase: process.env.AMRIT_API_BASE || "",
+    apiBase: "",
   },

-            allowedHosts: [".monkeycode-ai.live"],
+            allowedHosts: [".amrit.fyi"],
```

With `apiBase: ""`, `window.AMRIT_API_BASE` is always `""`, so `apiUrl("/api/articles")`
returns a relative `/api/articles` — intercepted by the Pages Function in production.

---

### 2.3 MODIFY — `worker/wrangler.toml`

```diff
  name = "aether-journal"
  main = "src/index.js"
  compatibility_date = "2026-09-01"
  compatibility_flags = ["nodejs_compat"]
+ workers_dev = false

+ [[routes]]
+ pattern = "api.amrit.fyi/*"
+ zone_name = "amrit.fyi"

  [vars]
- CORS_ORIGIN = "*"
+ CORS_ORIGIN = "https://journal.amrit.fyi"
```

`workers_dev = false` removes the public `*.workers.dev` URL entirely.
All traffic now flows through `api.amrit.fyi` which is behind Zero Trust.

---

### 2.4 MODIFY — `blog_frontend/docs/deployment.mdx`

- Replace all `amrit-journal.<subdomain>.workers.dev` → `api.amrit.fyi`
- Replace `amrit-journal.pages.dev` → `journal.amrit.fyi`
- Remove `AMRIT_API_BASE` from prerequisites table and Step 3.2 env vars
- Add a **Section 7: Zero Trust Access** documenting the Pages Function proxy and manual steps

---

### 2.5 MODIFY — `blog_frontend/docs/configuration.mdx`

```diff
- **Target URL**: `url: "https://amrit-journal.pages.dev"`, `baseUrl: "/"`
+ **Target URL**: `url: "https://journal.amrit.fyi"`, `baseUrl: "/"`
```

---

### 2.6 MODIFY — `worker/docs/wrangler.mdx`

- Update annotated `wrangler.toml` to include `workers_dev = false` and `[[routes]]`
- Update health check curl example: `api.amrit.fyi/api/health`
- Update CORS_ORIGIN example: `https://journal.amrit.fyi`

---

### 2.7 MODIFY — `worker/docs/environment.mdx`

- Update `CORS_ORIGIN` description: note it must be set to `https://journal.amrit.fyi` in production

---

## Part 3 — Deployment Order

```
1. Deploy Worker (wrangler deploy) with workers_dev=false + api.amrit.fyi route
2. Add worker custom domain: api.amrit.fyi  (dashboard)
3. Create ZT Access Application on api.amrit.fyi  (dashboard)
4. Create Service Token amrit-journal-pages  (dashboard)
5. Set Pages env vars: WORKER_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET  (dashboard)
6. Add pages custom domain: journal.amrit.fyi  (dashboard)
7. Deploy Pages project (git push or wrangler pages deploy)
8. Verify via curl and browser
```

---

## Part 4 — Verification

```bash
# 1. Typecheck (local, before deploy)
cd blog_frontend && npm.cmd run typecheck

# 2. Docs7 validator
node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs
node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs ../worker/docs

# 3. Worker no longer public — must return 403 or block
curl https://api.amrit.fyi/api/health

# 4. Via Pages Function — must return {"ok":true,"storage":"upstash-blob"}
curl https://journal.amrit.fyi/api/health

# 5. Browser DevTools Network tab:
#    /api/articles calls should show origin journal.amrit.fyi (not api.amrit.fyi)
```

---

## Notes

- The `ADMIN_TOKEN` secret on the worker remains unchanged — it protects Studio write
  operations regardless of Zero Trust.
- Local dev (`npm run start` + `wrangler dev`) works without any ZT credentials because
  the webpack proxy routes directly to `http://127.0.0.1:8787`.
- The Pages Function adds negligible latency (~1ms) since both Pages and Workers run
  on the same Cloudflare edge network.
