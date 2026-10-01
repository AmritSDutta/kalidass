# How to Deploy Kalidass Journal

The live stack is three pieces:

- `blog_frontend` — Docusaurus static site (Cloudflare Pages or GitHub Pages)
- `worker` — Cloudflare Worker API
- Upstash Blob — article JSON and media objects

```text
Browser  ->  Pages (static UI)
                |
                |  /api/*  (prod: KALIDASS_API_BASE, local: dev server proxy)
                v
             Worker  ->  Upstash Blob
```

## 1. Create an Upstash Blob Bucket

1. Open the [Upstash Blob quickstart](https://upstash.com/docs/blob/overall/quickstart).
2. Create a **public** bucket (article covers, images, and videos need public URLs).
3. Copy the bucket token.

Keep the token on the Worker only. Never put `UPSTASH_BLOB_TOKEN` in the frontend or in client variables.

## 2. Deploy the Worker

From `worker`:

```bash
npm install
```

Set secrets (do not commit them):

```bash
npx wrangler secret put UPSTASH_BLOB_TOKEN
```

Optional studio lock. If set, `/admin` writes and uploads need `Authorization: Bearer <token>` (the UI reads `localStorage.getItem('kalidass-admin-token')`):

```bash
npx wrangler secret put ADMIN_TOKEN
```

Point CORS at the Pages origin after you know the URL. Until then `CORS_ORIGIN = "*"` in `worker/wrangler.toml` is fine.

Deploy:

```bash
npx wrangler deploy
```

Note the Worker URL, for example `https://kalidass-journal.<account>.workers.dev`.

Health check:

```bash
curl https://kalidass-journal.<account>.workers.dev/api/health
```

Expected:

```json
{"ok":true,"storage":"upstash-blob","runtime":"cloudflare-worker"}
```

If `storage` is `"memory"`, the token is missing and articles will not persist.

## 3. Deploy the UI on Cloudflare Pages

Build settings:

- Root directory: `blog_frontend`
- Build command:

```bash
npm install && npm run build
```

- Output directory: `build`

Set this Pages environment variable **before** the build:

```text
KALIDASS_API_BASE=https://kalidass-journal.<account>.workers.dev
```

No trailing slash. The static site inlines that value and calls the Worker for `/api/articles` and Upstash uploads.

`blog_frontend/static/_redirects` sends `/story/*` to the SPA so client article routes work on Pages.

After the first Pages URL exists, tighten Worker CORS:

```toml
[vars]
CORS_ORIGIN = "https://kalidass-journal.pages.dev"
```

Redeploy the Worker.

## 4. GitHub Pages (optional)

GitHub Pages can host the same static build. It cannot run the Worker.

1. Deploy the Worker as above.
2. Set `KALIDASS_API_BASE` to the Worker URL at build time.
3. If the site is not at the domain root, set Docusaurus `baseUrl` (for example `/kalidass-journal/`) and rebuild.

GitHub Pages has no `_redirects`. Direct loads of `/story/:slug` 404 unless you add a `404.html` copy of `index.html` or use a custom domain with SPA fallback. Cloudflare Pages is the intended host.

## Local preview

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

Or from the repo root:

```bash
./start.sh
```

Without `UPSTASH_BLOB_TOKEN`, the Worker seeds four AI briefs in memory. Reloading wrangler clears them. Uploads fall back to `/api/objects` on that memory store. Direct browser uploads to Upstash (`/api/upload`) need the token.

## Studio notes

- `/admin` composes text, image, and video blocks.
- With a Blob token, files go browser -> Upstash (Worker only signs the upload).
- Published articles are JSON objects at `journal/articles/<id>.json` plus `journal/index.json`.
- Optional `ADMIN_TOKEN`: in the browser console, `localStorage.setItem('kalidass-admin-token', '<token>')`.

## Checklist

1. Public Upstash Blob bucket and token
2. `wrangler secret put UPSTASH_BLOB_TOKEN`
3. `npx wrangler deploy`
4. Pages build with `KALIDASS_API_BASE=<worker-url>`
5. Confirm `/api/health` reports `upstash-blob`
6. Confirm `/magazine` and `/admin` on the Pages URL
