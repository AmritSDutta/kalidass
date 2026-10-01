# Zero Trust Deployment Plan — Kalidass Journal

Complete runbook for deploying the Cloudflare Worker behind Cloudflare Zero Trust Access,
migrating to the `kalidass.fyi` custom domain, and wiring the Docusaurus SPA via a Pages Function proxy.

---

## Domain Mapping

| Old Value | New Value | Location |
| --- | --- | --- |
| `kalidass-journal.pages.dev` | `journal.kalidass.fyi` | Pages custom domain |
| `.monkeycode-ai.live` | `.kalidass.fyi` | Dev server `allowedHosts` |
| `kalidass-journal.<subdomain>.workers.dev` | `api.kalidass.fyi` | Worker custom domain |
| `KALIDASS_API_BASE` env var (Pages) | Removed | No longer needed |

---

## Architecture After Deployment

```
Browser (journal.kalidass.fyi)
  │
  │  fetch /api/*  (same-origin)
  ▼
Cloudflare Pages Function  ← functions/api/[[route]].ts
  │  adds CF-Access-Client-Id
  │  adds CF-Access-Client-Secret
  ▼
Cloudflare Zero Trust Access Policy  (api.kalidass.fyi)
  │  validates service token
  ▼
Cloudflare Worker  (api.kalidass.fyi — workers_dev = false)
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

1. **Workers & Pages** → `kalidass-journal-worker` worker → **Settings** → **Domains & Routes**
   → **Add Custom Domain**.
2. Enter `api.kalidass.fyi`.
3. Cloudflare creates the DNS A/AAAA record automatically.

### B. Pages Custom Domain

1. **Workers & Pages** → your Pages project → **Custom Domains** → **Set up a custom domain**.
2. Enter `journal.kalidass.fyi`.
3. Cloudflare creates the CNAME record automatically.

### C. Zero Trust Access Application

1. **Cloudflare Zero Trust** → **Access** → **Applications** → **Add an Application** → **Self-hosted**.
2. **Application name**: `kalidass-journal-worker`
3. **Application domain**: `api.kalidass.fyi`
4. Under **Policies**, add a policy:
   - **Policy name**: `pages-proxy`
   - **Action**: Service Auth
5. Save. Note the **AUD (Audience Tag)** shown on the application detail page.

### D. Service Token

1. **Zero Trust** → **Access** → **Service Tokens** → **Create Service Token**.
2. **Name**: `kalidass-journal-pages`
3. **Copy the Client ID and Client Secret immediately** — the secret is shown only once.
4. Edit the `pages-proxy` policy → add rule: **Service Token** → `kalidass-journal-pages`.

### E. Pages Function Environment Variables

In **Workers & Pages** → Pages project → **Settings** → **Environment Variables** → **Production**:

| Variable | Value | Notes |
| --- | --- | --- |
| `WORKER_URL` | `https://api.kalidass.fyi` | No trailing slash |
| `CF_ACCESS_CLIENT_ID` | *(from service token)* | Plain text |
| `CF_ACCESS_CLIENT_SECRET` | *(from service token)* | Encrypt this one |
| `NODE_VERSION` | `20` | Required for Docusaurus build |

Remove `KALIDASS_API_BASE` if previously set.

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
-  url: "https://kalidass-journal.pages.dev",
+  url: "https://journal.kalidass.fyi",

   customFields: {
-    apiBase: process.env.KALIDASS_API_BASE || "",
+    apiBase: "",
   },

-            allowedHosts: [".monkeycode-ai.live"],
+            allowedHosts: [".kalidass.fyi"],
```

With `apiBase: ""`, `window.KALIDASS_API_BASE` is always `""`, so `apiUrl("/api/articles")`
returns a relative `/api/articles` — intercepted by the Pages Function in production.

---

### 2.3 MODIFY — `worker/wrangler.toml`

```diff
   name = "kalidass-journal-worker"
   main = "src/index.js"
   compatibility_date = "2026-09-01"
   compatibility_flags = ["nodejs_compat"]
+ workers_dev = false

+ [[routes]]
+ pattern = "api.kalidass.fyi/*"
+ zone_name = "kalidass.fyi"

   [vars]
- CORS_ORIGIN = "*"
+ CORS_ORIGIN = "https://journal.kalidass.fyi"
```

`workers_dev = false` removes the public `*.workers.dev` URL entirely.
All traffic now flows through `api.kalidass.fyi` which is behind Zero Trust.

---

### 2.4 MODIFY — `docs/deployment.mdx`

- Replace all `kalidass-journal.<subdomain>.workers.dev` → `api.kalidass.fyi`
- Replace `kalidass-journal.pages.dev` → `journal.kalidass.fyi`
- Remove `KALIDASS_API_BASE` from prerequisites table and Step 3.2 env vars
- Add a **Section 7: Zero Trust Access** documenting the Pages Function proxy and manual steps

---

### 2.5 MODIFY — `docs/configuration.mdx`

```diff
- **Target URL**: `url: "https://kalidass-journal.pages.dev"`, `baseUrl: "/"`
+ **Target URL**: `url: "https://journal.kalidass.fyi"`, `baseUrl: "/"`
```

---

### 2.6 MODIFY — `docs/worker/wrangler.mdx`

- Update annotated `wrangler.toml` to include `workers_dev = false` and `[[routes]]`
- Update health check curl example: `api.kalidass.fyi/api/health`
- Update CORS_ORIGIN example: `https://journal.kalidass.fyi`

---

### 2.7 MODIFY — `docs/worker/environment.mdx`

- Update `CORS_ORIGIN` description: note it must be set to `https://journal.kalidass.fyi` in production

---

## Part 3 — Deployment Order

```
1. Deploy Worker (wrangler deploy) with workers_dev=false + api.kalidass.fyi route
2. Add worker custom domain: api.kalidass.fyi  (dashboard)
3. Create ZT Access Application on api.kalidass.fyi  (dashboard)
4. Create Service Token kalidass-journal-pages  (dashboard)
5. Set Pages env vars: WORKER_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET  (dashboard)
6. Add pages custom domain: journal.kalidass.fyi  (dashboard)
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

# 3. Worker no longer public — must return 403 or block
curl https://api.kalidass.fyi/api/health

# 4. Via Pages Function — must return {"ok":true,"storage":"upstash-blob"}
curl https://journal.kalidass.fyi/api/health

# 5. Browser DevTools Network tab:
#    /api/articles calls should show origin journal.kalidass.fyi (not api.kalidass.fyi)
```

---

## Notes

- The `ADMIN_TOKEN` secret on the worker remains unchanged — it protects Studio write
  operations regardless of Zero Trust.
- Local dev (`npm run start` + `wrangler dev`) works without any ZT credentials because
  the webpack proxy routes directly to `http://127.0.0.1:8787`.
- The Pages Function adds negligible latency (~1ms) since both Pages and Workers run
  on the same Cloudflare edge network.
