# Vellum

Vellum is a small web app for annotating Markdown source texts. You can ingest a URL or pasted HTML, edit the extracted text, attach range-based notes, publish the result, and export the text plus annotations in a portable two-file format.

## What is production-ready here

This repo is prepared for a small public deployment:

- published texts and exports are readable without authentication
- write actions can be protected with a shared access key
- basic rate limiting is built in for public instances
- the app exposes a `/health` endpoint for hosting platforms
- saved data is no longer exposed by static file serving
- `DATA_DIR` is configurable for persistent storage
- a `render.yaml` blueprint is included for Render
- GitHub Actions runs the test suite on push and pull request

This is still a lightweight app, not a multi-tenant SaaS. It is appropriate for a small group of trusted users, not for unrestricted anonymous internet traffic.

## Hosting summary

### GitHub Pages

GitHub Pages is not enough for the live app because Vellum needs server-side POST routes and persistent storage for new submissions.

GitHub Pages can still host:

- static exported HTML files
- static documentation
- a gallery of already-exported texts

It cannot host the actual collaborative annotation app with live submissions.

### Recommended hosting

Use a small Node host with persistent disk storage. The repo includes a `render.yaml` blueprint, so Render is the lowest-friction option for this codebase.

Other workable options:

- Fly.io
- Railway
- a VPS running Node behind Nginx

Requirements for any host:

- Node 20+
- writable persistent storage for `DATA_DIR`
- one long-running web process

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

Open `http://127.0.0.1:3000`.

Run tests:

```bash
npm test
```

## Publish to GitHub

This repo is already on the `main` branch locally. To publish it:

1. Create a new empty GitHub repository.
2. Add it as `origin`.
3. Push `main`.

Example:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## Environment variables

See `.env.example`.

Important settings:

- `PORT`: server port
- `HOST`: bind host, defaults to `0.0.0.0`
- `DATA_DIR`: where published submissions are stored
- `VELLUM_ACCESS_KEY`: optional shared key required for `/extract` and `/submit`
- `TRUST_PROXY`: set to `true` behind Render or another reverse proxy
- `RATE_LIMIT_WINDOW_MS`: rate-limit window
- `EXTRACT_RATE_LIMIT_MAX`: max extract requests per IP per window
- `SUBMIT_RATE_LIMIT_MAX`: max submit requests per IP per window

## Access control

If `VELLUM_ACCESS_KEY` is set:

- `POST /extract` requires the key
- `POST /submit` requires the key
- readers can still view published texts and exports without the key

The browser UI includes an Access key field on both the ingest screen and the main editor. The key is stored in local browser storage for convenience.

For a friends-only deployment, this is the recommended default:

- set `VELLUM_ACCESS_KEY`
- share it only with people allowed to publish or edit
- keep rate limiting enabled

## Render deployment

The repo includes `render.yaml`.

Suggested deployment flow:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Keep the persistent disk enabled.
4. Set `VELLUM_ACCESS_KEY` in Render as a secret env var.
5. Deploy.

Notes:

- the included blueprint mounts a persistent disk at `/var/data`
- `DATA_DIR` is set to `/var/data/vellum`
- the health check path is `/health`
- Render persistent disks generally require a paid instance, so check current pricing before you commit
- set `VELLUM_ACCESS_KEY` before sharing the app with friends

Recommended first secret:

```bash
openssl rand -base64 24
```

Use the generated value as `VELLUM_ACCESS_KEY` in Render, then share it privately with your allowed contributors.

## Repository hygiene

This repo now includes:

- `.gitignore` to avoid committing runtime junk and generated submission files
- `.github/workflows/test.yml` for CI
- `render.yaml` for deployment

By default, new saved submissions in `data/*.json` are ignored by Git. The sample Nietzsche text is still kept in the repo.

## Portable format

Vellum supports a linked export pair:

- Markdown file: base text plus document metadata in YAML frontmatter
- JSON sidecar: annotations linked back to the Markdown file

### Markdown file

```md
---
format: "vellum.markdown/v1"
annotations_path: "portable-essay.annotations.json"
title: "Portable Essay"
author: "Casey"
date: "2026-03-21"
annotator: "Tester"
source: "https://example.com/post"
---

Alpha beta gamma
```

### Annotations sidecar

```json
{
  "format": "vellum.annotations/v1",
  "markdown_path": "portable-essay.md",
  "text_length": 16,
  "annotations": [
    {
      "start": 6,
      "end": 10,
      "quote": "beta",
      "prefix": "Alpha ",
      "suffix": " gamma",
      "note": "beta note"
    }
  ]
}
```

`start` and `end` are 0-based character offsets into the Markdown body text, not the rendered HTML.

## Import and export in the editor

The annotation panel includes:

- live Markdown export
- live annotations sidecar export
- Markdown import
- annotation merge import
- annotation replace import

Imported annotations are validated against the current text:

- ranges must fit the current document
- notes must be present
- if `quote`, `prefix`, or `suffix` are present, they must match exactly

This is intentionally strict so annotations do not silently attach to the wrong passage.

## Saved export routes

Published texts expose:

- `GET /text/:slug` for the rendered publication
- `GET /export/:slug` for standalone HTML
- `GET /export/:slug/markdown` for the portable Markdown file
- `GET /export/:slug/annotations` for the JSON sidecar

## Operational notes

This app stores submissions as JSON files on disk. That keeps the deployment simple, but it also means:

- use exactly one app instance unless you add shared storage
- back up the persistent disk if the data matters
- do not expect strong concurrency guarantees under heavy load

For a private small-group deployment, that tradeoff is reasonable.
