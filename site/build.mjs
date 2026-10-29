// Builds the landing page into public/: one template, one strings file per language.
// `node build.mjs` is the whole build; Vercel runs it (vercel.json).

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'public')
const SITE = 'https://framesight.vercel.app'
const REPO = 'https://github.com/jawsbb/FrameSight'

const langs = [
  { code: 'en', path: '/', locale: 'en_US' },
  { code: 'fr', path: '/fr/', locale: 'fr_FR' },
]

const template = readFileSync(join(here, 'src/template.html'), 'utf8')
const strings = Object.fromEntries(langs.map(l => [l.code, JSON.parse(readFileSync(join(here, `src/${l.code}.json`), 'utf8'))]))

// Every language must say everything the first one says, or a page ships with a hole in it.
const keys = obj => Object.entries(obj).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map(s => `${k}.${s}`) : [k])
const reference = keys(strings.en).sort().join('\n')
for (const { code } of langs) {
  if (keys(strings[code]).sort().join('\n') !== reference) throw new Error(`${code}.json does not have the same keys as en.json`)
}

const lookup = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const attr = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const text = s => s.replace(/<[^>]+>/g, '')

function faqHtml(faq) {
  return faq.map((item, i) => `
        <details${i === 0 ? ' open' : ''}>
          <summary>${item.q}</summary>
          <div><p>${item.a}</p></div>
        </details>`).join('')
}

function jsonLd(t, lang) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE}/#app`,
        name: 'FrameSight',
        description: t.meta.ldDescription,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Windows 10, Windows 11, Linux, SteamOS',
        url: SITE + lang.path,
        downloadUrl: `${REPO}/releases/latest`,
        license: 'https://www.gnu.org/licenses/gpl-3.0.html',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        screenshot: `${SITE}/og.png`,
        inLanguage: lang.code,
      },
      {
        '@type': 'FAQPage',
        mainEntity: t.faq.items.map(({ q, a }) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } })),
      },
    ],
  }, null, 2)
}

rmSync(out, { recursive: true, force: true })
cpSync(join(here, 'static'), out, { recursive: true })
mkdirSync(join(out, 'assets'), { recursive: true })
cpSync(join(here, 'src/site.css'), join(out, 'assets/site.css'))
cpSync(join(here, 'src/site.js'), join(out, 'assets/site.js'))

for (const lang of langs) {
  const t = strings[lang.code]
  const other = langs.find(l => l !== lang)
  const vars = {
    lang: lang.code,
    locale: lang.locale,
    altLocale: other.locale,
    url: SITE + lang.path,
    site: SITE,
    repo: REPO,
    home: lang.path,
    otherHome: other.path,
    otherLang: other.code,
    faqHtml: faqHtml(t.faq.items),
    jsonLd: jsonLd(t, lang),
  }
  const html = template.replace(/\{\{(=?)([\w.]+)\}\}/g, (_, escape, key) => {
    const value = key in vars ? vars[key] : lookup(t, key)
    if (typeof value !== 'string') throw new Error(`${lang.code}: no string for {{${key}}}`)
    return escape ? attr(text(value)) : value
  })
  const dir = join(out, lang.path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
}

console.log(`built ${langs.map(l => l.path).join(' ')} into ${out}`)
