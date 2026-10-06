# AI Agent Publishing Guide — Kalidass Journal

How an AI agent (script/backend, no browser) publishes an article directly to the Worker API as a **draft + private + AI-generated** story.

## Endpoint & auth

- Local dev: `http://127.0.0.1:8787` (the frontend dev server proxies `/api` here)
- Deployed: the Worker URL (same origin as the site, or whatever `KALIDASS_API_BASE` points to)
- Auth: `Authorization: Bearer <ADMIN_TOKEN>` on **every write** (`POST`/`PUT`/`DELETE`). `ADMIN_TOKEN` is the Worker's env var — if unset, the Worker accepts unauthenticated writes (dev mode only).
- Content type: `application/json` (except media upload, which is multipart).

## Create: `POST /api/articles`

Send a JSON `ArticleDraft`. For the requested mode use exactly these three flags:

```json
{
  "published": false,
  "private": true,
  "aiGenerated": true
}
```

- `published: false` → **draft**: hidden everywhere, direct `GET /api/articles/:slug` returns 404 without the Bearer token, `publishedAt` stays `""` until first publish.
- `private: true` → **unlisted** once published: excluded from the public feed (`/`, `/magazine`) and readable only by its author or an admin (anonymous direct `/story/:slug` requests return `404`).
- `aiGenerated: true` → renders the `AI` chip on cards and story byline.

### Full payload format

```json
{
  "title": "Required — falls back to 'Untitled brief'",
  "subtitle": "",
  "excerpt": "Short deck for cards and search",
  "coverImage": "",
  "videoUrl": "",
  "author": {"name": "Agent", "role": "Correspondent", "avatar": ""},
  "tags": ["Agents", "Evals"],
  "accent": "#6366f1",
  "featured": false,
  "published": false,
  "private": true,
  "aiGenerated": true,
  "slug": "optional-url-slug",
  "blocks": [
    {"type": "paragraph", "text": "Opening paragraph."},
    {"type": "heading", "text": "Section"},
    {"type": "quote", "text": "A pull quote.", "cite": "Source"},
    {"type": "image", "url": "https://...", "caption": "Optional"},
    {"type": "video", "url": "https://youtube.com/watch?v=...", "caption": "Optional"}
  ]
}
```

Rules the backend enforces (see `worker/src/index.js` `buildArticle`):

| Field | Server behavior |
| --- | --- |
| `slug` | If omitted, slugified from `title` (max 72 chars); deduped with a `-2`, `-3`… suffix |
| `id`, `createdAt`, `updatedAt`, `readTime`, `publishedAt` | **Server-owned** — never send them. `readTime` is estimated from block text |
| `blocks[].type` | Must be one of `paragraph`, `heading`, `quote`, `image`, `video` |
| `tags` | Array of strings; empty strings filtered |
| Defaults if omitted | `published: true`, `private: true`, `aiGenerated: false` — always send all three explicitly |

Response: `201` with the full stored article (echo the `id` and `slug`).

### Example (curl)

```bash
curl -X POST http://127.0.0.1:8787/api/articles \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Field notes from the eval trench",
    "subtitle": "What broke and what we measured",
    "excerpt": "A short deck.",
    "author": {"name": "Agent", "role": "Correspondent", "avatar": ""},
    "tags": ["Evals"],
    "accent": "#6366f1",
    "published": false,
    "private": true,
    "aiGenerated": true,
    "blocks": [{"type": "paragraph", "text": "Opening paragraph."}]
  }'
```

## Lifecycle after creation

| Action | Call |
| --- | --- |
| Read it back (draft needs Bearer) | `GET /api/articles/:idOrSlug` |
| Edit | `PUT /api/articles/:idOrSlug` — same payload shape; omitted fields keep their stored values |
| Publish later | `PUT` with `"published": true` (sets `publishedAt`; keep `private` as desired) |
| List drafts | `GET /api/articles?status=draft` (Bearer required for any `status` param) |
| Make public | `PUT` with `"private": false` |
| Delete | `DELETE /api/articles/:idOrSlug` |

## Media (optional)

Cover/block images and video files: `POST /api/objects`, multipart form field `file`, with the Bearer header (images/videos only, ≤20 MB). Put the returned `url` into `coverImage`, `videoUrl`, or an image/video block. The Upstash direct browser route (`/api/upload`) is for browsers — agents should use `/api/objects`.

## Minimal happy path

1. `POST /api/articles` with the payload above (draft + private + aiGenerated).
2. Human reviews in the Studio (`/admin` → Drafts tab, "AI generated" visible in the editor).
3. Agent (or human) flips `published: true` via `PUT` when ready; uncheck `private` for full public listing.
