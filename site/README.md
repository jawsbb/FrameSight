# FrameSight landing page

One template, one strings file per language, built into `public/` by a dependency-free script:

- `src/template.html`: the page, with `{{key}}` placeholders (`{{=key}}` for attributes)
- `src/en.json`, `src/fr.json`: every string, same keys in both (the build refuses a mismatch)
- `src/site.css`, `src/site.js`: styles and motion
- `static/`: copied as is (fonts, currency icons, part silhouettes, favicons, `og.png`,
  `robots.txt`, `sitemap.xml`)
- `build.mjs`: writes `public/index.html` (English) and `public/fr/index.html` (French), with the
  FAQ and its JSON-LD generated from the strings

```bash
cd site && node build.mjs && python3 -m http.server 4173 -d public
```

Paths are absolute (`/assets/...`), so preview through a server, not as a file.

## Deploy on Vercel

New project from this repository, **Root Directory** `site`, framework preset **Other**.
`vercel.json` runs `node build.mjs`, serves `public/`, and sets clean URLs, cache and security
headers.

## Before going live

- **Domain.** `SITE` in `build.mjs`, `robots.txt` and `sitemap.xml` say
  `https://framesight.vercel.app`. Change all three if the site gets another address.
- **Releases.** The download buttons point at `https://github.com/jawsbb/FrameSight/releases/latest`;
  `src/site.js` (`REPO`) asks the GitHub API for the latest release and swaps in the direct
  `.exe`, `.rpm`, `.deb` and `.AppImage` links and the version. The repository has to be public and
  have a published release, or the buttons lead to a 404.
- **Shared image.** `static/og.png` (1200×630) is a capture of the hero's reward screen; recapture
  it if the hero changes.

Geist and Geist Mono are self-hosted from Google Fonts (SIL Open Font License).
