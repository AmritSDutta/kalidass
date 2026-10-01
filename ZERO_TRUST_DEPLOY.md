# Cloudflare Pages Service Binding Deployment — Kalidass Journal

Canonical runbook for deploying the Cloudflare Worker privately behind Cloudflare Pages via Service Bindings (`JOURNAL_WORKER`), served on `kalidass.amrit.fyi`.

---

## Architecture Topology

```
Browser (https://kalidass.amrit.fyi)
  │
  │  fetch /api/*  (same-origin)
  ▼
Cloudflare Pages Function  ← functions/api/[[route]].ts
  │
  │  context.env.JOURNAL_WORKER.fetch(request)  (Edge RPC in memory)
  ▼
Cloudflare Worker (kalidass-journal-worker — workers_dev = false, no public URL)
  │
  │  Bearer token validation (ADMIN_TOKEN) on mutations
  ▼
Upstash Blob Storage (bc778577d594.blob.upstash.io)
```

### Key Security & Performance Invariants
1. **Zero Public Exposure**: The Worker has `workers_dev = false` and no public custom domain. Only the Pages project can invoke it via internal isolate binding.
2. **Zero Overhead**: No Zero Trust Access apps, Service Tokens (`CF-Access-Client-Id`/`Secret`), or CORS headers required.
3. **Sub-Millisecond RPC**: Direct memory edge-to-edge execution between Pages and Worker.
4. **Strict Token Auth**: Studio mutations and draft previews require `ADMIN_TOKEN` Bearer authentication.

---

## 1. Cloudflare Dashboard Setup

### A. Pages Custom Domain
1. **Workers & Pages** → `kalidass` Pages project → **Custom Domains** → **Set up a custom domain**.
2. Set `kalidass.amrit.fyi`.
3. Cloudflare automatically configures DNS CNAME `kalidass.amrit.fyi` → `kalidass.pages.dev`.

### B. Service Binding Configuration
1. **Workers & Pages** → `kalidass` Pages project → **Settings** → **Bindings** (or **Functions** → **Service bindings**).
2. Click **Add binding** (or **Add Service binding**):
   - **Type**: `Service binding`
   - **Name**: `JOURNAL_WORKER`
   - **Value**: `kalidass-journal-worker`
   - **Environment**: `production`
3. Click **Save**.

### C. Clean Environment Variables
In **Workers & Pages** → `kalidass` Pages project → **Settings** → **Environment Variables**:
- Ensure `NODE_VERSION` is set to `20` or `22`.
- Remove any obsolete variables (`WORKER_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `KALIDASS_API_BASE`).

### D. Worker Privacy Confirmation
In **Workers & Pages** → `kalidass-journal-worker` → **Settings** → **Domains & Routes**:
- Ensure `workers.dev` is **Disabled**.
- Confirm no external custom domains exist for the worker.

---

## 2. Code Implementation

### 2.1 Pages Function Proxy — `blog_frontend/functions/api/[[route]].ts`

```typescript
interface Env {
  JOURNAL_WORKER: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.JOURNAL_WORKER) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "JOURNAL_WORKER service binding is not configured in Cloudflare Pages settings.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return env.JOURNAL_WORKER.fetch(request);
};
```

### 2.2 Worker Configuration — `worker/wrangler.toml`

```toml
name = "kalidass-journal-worker"
main = "src/index.js"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

workers_dev = false

[vars]
CORS_ORIGIN = "https://kalidass.amrit.fyi"
ROOT_BUCKET = "kalidass"
```

---

## 3. Verification Commands

```bash
# 1. Typecheck Frontend
cd blog_frontend && npm.cmd run typecheck

# 2. Validate Docs Suite
node C:/Users/amrit/.gemini/config/skills/docs7/scripts/validate_docs7.mjs docs

# 3. Deploy Worker
cd ../worker && npx.cmd wrangler deploy

# 4. Test Live Health via Pages
curl https://kalidass.amrit.fyi/api/health
# Expected: {"ok":true,"storage":"upstash-blob"}

# 5. Test Live Article Index via Pages
curl https://kalidass.amrit.fyi/api/articles
```
