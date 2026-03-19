# releases

Static site that summarizes **items from roughly the last 24 hours** from:

| Source | Endpoint (public) |
|--------|-------------------|
| arXiv | Atom API (`lastUpdatedDate`) |
| YC | [Blog RSS](https://www.ycombinator.com/blog/feed) |
| a16z | [Future / a16z](https://future.com/feed) |
| G2 | [G2 Learn RSS](https://learn.g2.com/rss.xml) |
| Capterra | Blog feed (often blocked for bots; may be empty) |

## Quick start

```bash
cd releases
npm install
npm run fetch    # writes src/_data/daily/YYYY-MM-DD.json
npm run build    # output in dist/
npx serve dist -p 8080
```

Open `/` for the latest day, `/archive/` for all days, `/releases/YYYY-MM-DD/` for a specific file, `/feed.xml` for RSS (latest day).

### Environment

- `TARGET_DATE=2026-03-19` — label for the output JSON filename (default: today UTC).

## Daily habit (local)

Run once per day (cron, launchd, etc.):

```bash
npm run fetch && npm run build
```

Then commit `src/_data/daily/*.json` and `dist/` (or only data + rebuild in CI).

## GitHub Pages

1. Set `baseUrl` in `src/_data/site.json` to your site root, e.g. `https://nikitarogers333.github.io/releases`.
2. Build and deploy `dist/` (e.g. `peaceiris/actions-gh-pages` or Cloudflare Pages).

## Notes

- **Capterra** frequently returns 403 to automated clients; the script continues and still writes other sources.
- **24h window** is based on each item’s published/updated time vs script run time.
- Create the GitHub repo `releases` under your user and push this folder when ready.

## Repo

Suggested remote: `https://github.com/nikitarogers333/releases.git`
