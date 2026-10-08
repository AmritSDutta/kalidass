# How to Deploy Kalidass Journal

The live production stack comprises three components:

- `blog_frontend` — Docusaurus 3.10 static SPA on Cloudflare Pages (`kalidass.amrit.fyi`)
- `worker` — Private Cloudflare Worker API (`kalidass-journal-worker`, `workers_dev = false`)
- Upstash Blob — Durable JSON article storage and media objects

```text
Browser  ->  Cloudflare Pages (https://kalidass.amrit.fyi)
                 |
                 |  fetch /api/* (same-origin)
                 v
             Pages Function Proxy (functions/api/[[route]].ts)
                 |
                 |  env.JOURNAL_WORKER.fetch(request)  (Edge RPC in memory)
                 v
             Private Worker  ->  Upstash Blob
```

## 1. Create an Upstash Blob Bucket

1. Open the [Upstash Blob console](https://console.upstash.com/blob).
2. Create a **public** bucket (article covers, images, and videos need public CDN URLs).
3. Copy the bucket read-write token.

> [!IMPORTANT]
> Keep `UPSTASH_BLOB_TOKEN` on the Worker only. Never put `UPSTASH_BLOB_TOKEN` in the frontend client code or environment variables.

## 2. Deploy the Private Worker

From `worker`:

```bash
cd worker
npm install
```

Set secrets (do not commit them to Git):

```bash
npx wrangler secret put UPSTASH_BLOB_TOKEN
npx wrangler secret put ADMIN_TOKEN  # Password for Studio writes and M2M agent publishing
npx wrangler secret put SERPAPI_API_KEY  # Live AI Intel dossiers and Amazon book suggestions
```

Deploy:

```bash
npx wrangler deploy
```

*Note: In `worker/wrangler.toml`, `workers_dev = false` ensures the worker remains completely private with zero public internet exposure.*

## 3. Deploy the UI on Cloudflare Pages

Build settings in Cloudflare Dashboard (**Workers & Pages** → **Create application** → **Pages**):

- Root directory: `blog_frontend`
- Build command: `npm install && npm run build`
- Output directory: `build`
- Environment variables:
  - `NODE_VERSION=22` (Node 20 is EOL; Vitest 5 / Vite 8 engines require Node `^22.12.0 || ^24.0.0`)
  - `FARO_COLLECTOR_URL` (optional: Grafana Cloud RUM telemetry collector URL)
  - `FARO_ENDPOINT` (optional: Grafana Cloud sourcemaps upload API URL)
  - `FARO_APP_ID` (optional: Grafana Cloud App ID)
  - `FARO_STACK_ID` (optional: Grafana Cloud Stack ID)
  - `FARO_API_KEY` (optional: Grafana Cloud API token with `sourcemaps:write` scope)

Configure the **Service Binding**:
- Under Pages **Settings** → **Bindings** (or **Functions** → **Service bindings**):
  - **Type**: `Service binding`
  - **Name**: `JOURNAL_WORKER`
  - **Value**: `kalidass-journal-worker`

Configure Custom Domain:
- Add `kalidass.amrit.fyi` to Pages Custom Domains.

Deploy. The Pages catch-all function (`blog_frontend/functions/api/[[route]].ts`) forwards all `/api/*` traffic via `context.env.JOURNAL_WORKER.fetch(request)` across the internal isolate boundary, injecting security headers (`HSTS`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`).

## 4. Local Preview

```bash
# Worker on :8787 (memory store if no token)
cd worker
cp .dev.vars.example .dev.vars
# optional: edit .dev.vars and set UPSTASH_BLOB_TOKEN
npm install
npm run start
```

```bash
# Site on :3000, proxies /api to the Worker
cd blog_frontend
npm install
npm run start
```

Without `UPSTASH_BLOB_TOKEN`, the Worker's in-memory store starts empty. Direct browser uploads to Upstash (`/api/upload`) require the token.

## 5. Studio Notes

- `/admin` composes text, image, and video blocks.
- With a Blob token, files go browser -> Upstash (Worker only signs the upload).
- Published articles are JSON objects at `kalidass/articles/<id>.json` plus `kalidass/index.json`.
- Compiled reader dossiers are stored at `kalidass/intelligence/<id>.json` (AI Intel) and `kalidass/books/<id>.json` (book suggestions).
- Optional `ADMIN_TOKEN`: in the browser console or Studio prompt, enter the token to unlock.

## 6. Verification Checklist

1. Public Upstash Blob bucket and token configured on Worker.
2. `wrangler secret put UPSTASH_BLOB_TOKEN` executed.
3. `npx wrangler deploy` executed on Worker.
4. Pages Service Binding `JOURNAL_WORKER` configured to `kalidass-journal-worker`.
5. Confirm `curl https://kalidass.amrit.fyi/api/health` reports `{"ok":true}`.
6. Confirm `/` and `/magazine` render without console errors on `https://kalidass.amrit.fyi`.
