# FrameSight landing page

Static site, no build step: `index.html` (English), `fr/index.html` (French), `assets/site.css`,
`assets/site.js`. It reuses the app's tokens (`app/src/index.css`) and its currency icons and
part silhouettes (see `THIRD_PARTY_NOTICES.md`).

## Deploy on Vercel

New project from this repository, **Root Directory** `site`, framework preset **Other**, no build
command, no output directory. `vercel.json` sets clean URLs, cache and security headers.

## Before going live

- **Domain.** Every absolute URL uses `https://framesight.vercel.app`: the canonical and
  `hreflang` links, Open Graph tags and JSON-LD in both pages, `robots.txt` and `sitemap.xml`.
  Replace it everywhere if the site gets another address.
- **Releases.** The download buttons point at `https://github.com/jawsbb/FrameSight/releases/latest`;
  `assets/site.js` (`REPO`) asks the GitHub API for the latest release and swaps in the direct
  `.exe`, `.rpm`, `.deb` and `.AppImage` links and the version. The repository has to be public and
  have a published release, or the buttons lead to a 404.
- **Shared image.** `og.png` (1200×630) is a capture of the hero's reward slips; recapture it if
  the hero changes.

## Preview locally

```bash
cd site && python3 -m http.server 4173
```

Paths are absolute (`/assets/...`), so open it through a server, not as a file.
