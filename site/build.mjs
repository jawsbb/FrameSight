// Builds the site into public/: one layout, one folder per page (its template and one strings file
// per language), shared partials and strings. `node build.mjs` is the whole build; Vercel runs it
// (vercel.json). It also writes the sitemap and robots.txt, so the domain lives here only.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, 'src')
const out = join(here, 'public')
const SITE = 'https://framesight.vercel.app'
const REPO = 'https://github.com/jawsbb/FrameSight'

const langs = [
  { code: 'en', prefix: '/', locale: 'en_US' },
  { code: 'fr', prefix: '/fr/', locale: 'fr_FR' },
]

// Every page, its path under a language's prefix, and its parent in the breadcrumb. The order is
// the sitemap's.
const pages = [
  { id: 'home', path: '' },
  { id: 'relic-reward-overlay', path: 'relic-reward-overlay/' },
  { id: 'ducat-kiosk', path: 'ducat-kiosk/' },
  { id: 'linux', path: 'linux/' },
  { id: 'steam-deck', path: 'steam-deck/' },
  { id: 'alternatives', path: 'alternatives/' },
  { id: 'alecaframe', path: 'alternatives/alecaframe/', parent: 'alternatives' },
]

const read = path => readFileSync(join(src, path), 'utf8')
const readJson = path => JSON.parse(read(path))
const layout = read('layout.html')
const partials = Object.fromEntries(readdirSync(join(src, 'partials')).map(f => [f.replace(/\.html$/, ''), read(`partials/${f}`)]))

// Every language must say everything the first one says, or a page ships with a hole in it.
const keys = obj => Object.entries(obj).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map(s => `${k}.${s}`) : [k])
function sameKeys(byLang, what) {
  const reference = keys(byLang.en).sort().join('\n')
  for (const { code } of langs) {
    if (keys(byLang[code]).sort().join('\n') !== reference) throw new Error(`${what}: ${code}.json does not have the same keys as en.json`)
  }
}
const deepMerge = (a, b) => {
  const merged = { ...a }
  for (const [k, v] of Object.entries(b)) merged[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a[k] === 'object' ? deepMerge(a[k], v) : v
  return merged
}

const shared = Object.fromEntries(langs.map(l => [l.code, readJson(`strings/${l.code}.json`)]))
sameKeys(shared, 'strings')
// The page inside the layout, with its partials in, and theirs: the same for every language.
function expand(template) {
  let html = layout.replace('{{content}}', template)
  while (/\{\{>[\w-]+\}\}/.test(html)) {
    html = html.replace(/\{\{>([\w-]+)\}\}/g, (_, name) => {
      if (!(name in partials)) throw new Error(`no partial ${name}`)
      return partials[name]
    })
  }
  return html
}
for (const page of pages) {
  page.template = expand(read(`pages/${page.id}/page.html`))
  page.strings = Object.fromEntries(langs.map(l => [l.code, readJson(`pages/${page.id}/${l.code}.json`)]))
  sameKeys(page.strings, `pages/${page.id}`)
}

const lookup = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const attr = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const text = s => s.replace(/<[^>]+>/g, '')
const pathOf = (page, lang) => lang.prefix + page.path
const urlOf = (page, lang) => SITE + pathOf(page, lang)
const byId = id => pages.find(p => p.id === id)
const crumbName = (p, lang, t) => p.id === 'home' ? t.crumbs.home : p.strings[lang.code].crumb
const alternates = page => [...langs.map(l => ({ hreflang: l.code, href: urlOf(page, l) })), { hreflang: 'x-default', href: urlOf(page, langs[0]) }]
const trail = page => page.parent ? [...trail(byId(page.parent)), page] : page.id === 'home' ? [page] : [byId('home'), page]

function faqHtml(faq) {
  return faq.map((item, i) => `
        <details${i === 0 ? ' open' : ''}>
          <summary>${item.q}</summary>
          <div><p>${item.a}</p></div>
        </details>`).join('')
}

function crumbsHtml(page, lang, t) {
  return trail(page).map((p, i, all) => {
    const name = crumbName(p, lang, t)
    return i === all.length - 1 ? `<span aria-current="page">${name}</span>` : `<a href="${pathOf(p, lang)}">${name}</a>`
  }).join('<span class="crumb-sep" aria-hidden="true">/</span>')
}

function relatedHtml(page, lang, t) {
  return (page.strings[lang.code].see ?? []).map(id => {
    const other = byId(id), s = other.strings[lang.code]
    return `
      <a class="related-card card" href="${pathOf(other, lang)}">
        <span class="related-kicker">${s.crumb}</span>
        <b>${s.card}</b>
        <span class="related-more">${t.related.more}<svg class="icon"><use href="#i-arrow"/></svg></span>
      </a>`
  }).join('')
}

function jsonLd(page, lang, t) {
  const app = {
    '@type': 'SoftwareApplication',
    '@id': `${SITE}/#app`,
    name: 'FrameSight',
    description: shared[lang.code].app.description,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Windows 10, Windows 11, Linux, SteamOS',
    url: SITE + lang.prefix,
    downloadUrl: `${REPO}/releases/latest`,
    license: 'https://www.gnu.org/licenses/gpl-3.0.html',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    screenshot: `${SITE}/og.png`,
  }
  const graph = [
    page.id === 'home' ? app : { '@type': 'SoftwareApplication', '@id': `${SITE}/#app`, name: 'FrameSight' },
    {
      '@type': 'WebPage',
      '@id': urlOf(page, lang),
      url: urlOf(page, lang),
      name: text(t.meta.title),
      description: text(t.meta.description),
      inLanguage: lang.code,
      about: { '@id': `${SITE}/#app` },
      ...(page.id === 'home' ? {} : { breadcrumb: { '@id': `${urlOf(page, lang)}#crumbs` } }),
    },
  ]
  if (page.id !== 'home') {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${urlOf(page, lang)}#crumbs`,
      itemListElement: trail(page).map((p, i) => ({
        '@type': 'ListItem', position: i + 1, item: urlOf(p, lang),
        name: crumbName(p, lang, t),
      })),
    })
  }
  graph.push({
    '@type': 'FAQPage',
    mainEntity: t.faq.items.map(({ q, a }) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } })),
  })
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
}

function render(page, lang) {
  const t = deepMerge(shared[lang.code], page.strings[lang.code])
  const other = langs.find(l => l !== lang)
  const vars = {
    lang: lang.code,
    locale: lang.locale,
    altLocale: other.locale,
    url: urlOf(page, lang),
    alternates: alternates(page).map(a => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`).join('\n'),
    site: SITE,
    repo: REPO,
    home: lang.prefix,
    otherUrl: pathOf(page, other),
    otherLang: other.code,
    faqHtml: faqHtml(t.faq.items),
    crumbs: page.id === 'home' ? '' : crumbsHtml(page, lang, t),
    relatedCards: relatedHtml(page, lang, t),
    jsonLd: jsonLd(page, lang, t),
    ...Object.fromEntries(pages.map(p => [`link.${p.id}`, pathOf(p, lang)])),
  }
  let html = page.template
  // Strings may carry placeholders of their own (a link to another page), so fill until none is left.
  for (let pass = 0; /\{\{=?[\w.-]+\}\}/.test(html); pass++) {
    if (pass > 2) throw new Error(`${page.id} (${lang.code}): placeholders nested too deep`)
    html = html.replace(/\{\{(=?)([\w.-]+)\}\}/g, (_, escape, key) => {
      const value = key in vars ? vars[key] : lookup(t, key)
      if (typeof value !== 'string') throw new Error(`${page.id} (${lang.code}): no string for {{${key}}}`)
      return escape ? attr(text(value)) : value
    })
  }
  if (html.includes('{{')) throw new Error(`${page.id} (${lang.code}): a placeholder was left unfilled`)
  // The page's own links in the header and footer say where you are.
  return html.replaceAll(`<a href="${pathOf(page, lang)}">`, `<a href="${pathOf(page, lang)}" aria-current="page">`)
}

function sitemap() {
  const links = page => alternates(page).map(a => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`).join('\n')
  const urls = pages.flatMap(page => langs.map(lang => `  <url>\n    <loc>${urlOf(page, lang)}</loc>\n${links(page)}\n  </url>`))
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

rmSync(out, { recursive: true, force: true })
cpSync(join(here, 'static'), out, { recursive: true })
mkdirSync(join(out, 'assets'), { recursive: true })
cpSync(join(src, 'site.css'), join(out, 'assets/site.css'))
cpSync(join(src, 'site.js'), join(out, 'assets/site.js'))
writeFileSync(join(out, 'sitemap.xml'), sitemap())
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)

for (const page of pages) {
  for (const lang of langs) {
    const dir = join(out, pathOf(page, lang))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), render(page, lang))
  }
}

console.log(`built ${pages.length * langs.length} pages into ${out}`)
