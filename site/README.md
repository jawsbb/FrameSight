# FrameSight website

The landing page and the pages that answer one search each (Linux, Steam Deck, the reward
overlay, the Ducat Kiosk, the comparisons), in English and French, built into `public/` by a
dependency-free script:

- `src/layout.html`: the document, header and footer shared by every page, with `{{content}}`
  where the page goes
- `src/pages/<id>/page.html` with `en.json` and `fr.json`: one folder per page; the page list,
  with each page's path and breadcrumb parent, is `pages` in `build.mjs`
- `src/partials/*.html`: blocks used on several pages, included with `{{>name}}` (the reward
  screen demo, the kiosk demo, a page's head and end, the closer)
- `src/strings/en.json`, `fr.json`: strings shared by every page (navigation, footer, buttons)
- `src/site.css`, `src/site.js`: styles and motion
- `static/`: copied as is (fonts, currency icons, part silhouettes, favicons, `og.png`)

`{{key}}` fills a string (`{{=key}}` escaped, for attributes), and `{{link.<id>}}` the path of
another page in the same language, also from inside a string. The build refuses a language
missing a key the English has, and any placeholder left unfilled. It also writes `sitemap.xml`
(with hreflang pairs), `robots.txt`, each page's canonical and alternates, and its JSON-LD
(`SoftwareApplication`, `WebPage`, `BreadcrumbList`, and `FAQPage` when the page has a FAQ).

```bash
cd site && node build.mjs && python3 -m http.server 4173 -d public
```

Paths are absolute (`/assets/...`), so preview through a server, not as a file.

## Adding a page

1. Add `{ id, path, parent? }` to `pages` in `build.mjs`.
2. Create `src/pages/<id>/page.html`, usually `{{>page-hero}}`, a `.doc` of sections, then
   `{{>page-end}}`.
3. Write `en.json` and `fr.json` with `meta.title` (60 characters or so), `meta.description`
   (under 160), `crumb`, `card` (its line on other pages' "Keep reading" cards), `see` (the ids of
   the pages to suggest), `hero.title`, `hero.lede`, `faq.title` and `faq.items`.
4. Link it from the pages it belongs with, and from the header or footer in `src/layout.html` if
   it is a main page.

Claims about other tools carry their source and the month they were checked.

## Deploy on Vercel

New project from this repository, **Root Directory** `site`, framework preset **Other**.
`vercel.json` runs `node build.mjs`, serves `public/`, and sets clean URLs, cache and security
headers.

## Before going live

- **Domain.** `SITE` in `build.mjs` says `https://framesight.vercel.app`; the sitemap, robots.txt,
  canonicals and JSON-LD follow it. Change it there if the site gets another address.
- **Search engines.** Once deployed, add the domain to Google Search Console and Bing Webmaster
  Tools and submit `/sitemap.xml`.
- **Releases.** The download buttons point at `https://github.com/jawsbb/FrameSight/releases/latest`;
  `src/site.js` (`REPO`) asks the GitHub API for the latest release and swaps in the direct
  `.exe`, `.rpm`, `.deb` and `.AppImage` links, file names and the version.
- **Shared image.** `static/og.png` (1200×630) is a capture of the hero: the reward screen rising
  out of the canopy. Every page uses it. Recapture it if the hero changes.

The hills, the valley and the canopy are painted by `src/site.js` on canvases at load (seeded, so
they come out the same every time); there are no landscape images to replace.

Geist and Geist Mono are self-hosted from Google Fonts (SIL Open Font License).
