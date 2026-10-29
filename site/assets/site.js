// FrameSight landing page: the reward screen demo, the app tour, the kiosk, the access selector and
// the download links resolved from the latest GitHub release. Everything here enhances markup that
// already reads and links correctly without it.

const REPO = 'jawsbb/FrameSight'
const RELEASES = `https://github.com/${REPO}/releases/latest`

const root = document.documentElement
root.classList.add('js')
const lang = root.lang.startsWith('fr') ? 'fr' : 'en'
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const words = {
  en: {
    plat: 'plat', ducats: 'ducats', topPlat: 'Top plat', topDucats: 'Top ducats',
    owned: n => `Owned ×${n}`, notOwned: 'Not owned', unmastered: 'Unmastered', completes: 'Completes set',
    reading: 'Reading the reward screen…', priced: 'Priced from players in game now', waiting: 'Waiting for the reward screen',
    forWindows: 'Download for Windows', forLinux: 'Download for Linux', download: 'Download',
    latest: v => `Latest release ${v}`, copied: 'Copied', copy: 'Copy command',
    pick: 'Pick parts to sell',
  },
  fr: {
    plat: 'platine', ducats: 'ducats', topPlat: 'Top platine', topDucats: 'Top ducats',
    owned: n => `Possédé ×${n}`, notOwned: 'Non possédé', unmastered: 'Non maîtrisé', completes: 'Complète l’ensemble',
    reading: 'Lecture de l’écran de récompenses…', priced: 'Prix des joueurs en jeu en ce moment', waiting: 'En attente de l’écran de récompenses',
    forWindows: 'Télécharger pour Windows', forLinux: 'Télécharger pour Linux', download: 'Télécharger',
    latest: v => `Dernière version ${v}`, copied: 'Copié', copy: 'Copier la commande',
    pick: 'Choisissez les pièces à vendre',
  },
}[lang]

const icon = name => `/assets/parts/${name}.png`
const metal = kind => `<img class="metal-mark" src="/assets/${kind === 'p' ? 'platinum' : 'ducats'}.png" alt="" width="20" height="20">`

// ------------------------------------------------------------------ header

const head = document.querySelector('.site-head')
const onScroll = () => head?.toggleAttribute('data-scrolled', scrollY > 8)
addEventListener('scroll', onScroll, { passive: true })
onScroll()

// ------------------------------------------------------------------ reveal

const revealer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.setAttribute('data-shown', ''); revealer.unobserve(entry.target) }
}, { rootMargin: '0px 0px -10% 0px' })
document.querySelectorAll('[data-reveal]').forEach(el => revealer.observe(el))

// ------------------------------------------------------------------ the reward screen

// Real item names; the figures are illustrative. Two winners on purpose: the best platinum and the
// best ducats are rarely the same card, which is why both are shown at equal weight.
const rounds = [
  [
    { name: 'Braton Prime Receiver', art: 'gun-receiver', p: 4, d: 15, foot: ['owned', 1] },
    { name: 'Nekros Prime Systems Blueprint', art: 'warframe-system', p: 18, d: 45, foot: ['unmastered'], ruled: true },
    { name: 'Forma Blueprint', art: 'component-latch', p: null, d: 0, foot: ['owned', 2], plain: true },
    { name: 'Akstiletto Prime Barrel', art: 'gun-barrel', p: 9, d: 100, foot: ['notOwned'] },
  ],
  [
    { name: 'Kronen Prime Blade', art: 'weapon-blade', p: 6, d: 100, foot: ['owned', 1] },
    { name: 'Lex Prime Receiver', art: 'gun-receiver', p: 3, d: 15, foot: ['owned', 3] },
    { name: 'Khora Prime Neuroptics Blueprint', art: 'warframe-helmet', p: 31, d: 45, foot: ['completes'], ruled: true },
    { name: 'Orokin Cell', art: 'component-latch', p: null, d: 0, foot: ['owned', 7], plain: true },
  ],
]

function footHtml([kind, n]) {
  if (kind === 'owned') return `<span class="hallmark owned">${words.owned(n)}</span>`
  if (kind === 'notOwned') return `<span class="hallmark absent">${words.notOwned}</span>`
  if (kind === 'completes') return `<span class="hallmark loud">${words.completes}</span>`
  return `<span class="hallmark loud">${words.unmastered}</span>`
}

function renderRound(stage, round) {
  const cards = stage.querySelector('.game-cards')
  const slips = stage.querySelector('.slips')
  cards.innerHTML = round.map(r => `
    <div class="game-card" aria-hidden="true">
      <i class="game-art${r.plain ? ' plain' : ''}" style="--art:url(${icon(r.art)})"></i>
      <span class="game-name">${r.name}</span>
    </div>`).join('')
  const bestP = round.reduce((b, r, i) => (r.p ?? -1) > (round[b].p ?? -1) ? i : b, 0)
  const bestD = round.reduce((b, r, i) => r.d > round[b].d ? i : b, 0)
  slips.innerHTML = round.map((r, i) => `
    <article class="slip${r.ruled ? ' ruled' : ''}" style="--i:${i}" aria-label="${r.name}">
      <div class="slip-name">${r.name}</div>
      <div class="metals">
        <span class="metal plat">
          <span class="metal-value">${metal('p')}<span class="metal-figure${r.p == null ? ' none' : ''}" data-to="${r.p ?? ''}">${r.p == null ? '—' : r.p}</span></span>
          <span class="metal-label" data-crown="${i === bestP ? words.topPlat : ''}">${words.plat}</span>
        </span>
        <span class="metal ducat">
          <span class="metal-value">${metal('d')}<span class="metal-figure" data-to="${r.d}">${r.d}</span></span>
          <span class="metal-label" data-crown="${i === bestD ? words.topDucats : ''}">${words.ducats}</span>
        </span>
      </div>
      <div class="slip-foot">${footHtml(r.foot)}</div>
    </article>`).join('')
}

function countUp(el, to, ms) {
  if (reduced) { el.textContent = to; return }
  const start = performance.now()
  const step = now => {
    const t = Math.min(1, (now - start) / ms)
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)))
    if (t < 1) requestAnimationFrame(step)
  }
  el.textContent = '0'
  requestAnimationFrame(step)
}

function crown(stage) {
  stage.querySelectorAll('[data-crown]').forEach(label => {
    if (!label.dataset.crown) return
    label.className = 'metal-crown'
    label.textContent = label.dataset.crown
  })
}

const stage = document.querySelector('.stage[data-demo]')
if (stage) {
  const status = stage.querySelector('.reader-text')
  const timerText = stage.querySelector('.game-timer b')
  const timerRun = stage.querySelector('.game-timer .run')
  let round = 0
  let timers = []
  let visible = true
  const later = (ms, fn) => timers.push(setTimeout(fn, ms))

  const setTimer = s => {
    timerText.textContent = s
    timerRun.style.strokeDashoffset = String(113.1 * (1 - s / 15))
  }

  function play() {
    timers.forEach(clearTimeout)
    timers = []
    renderRound(stage, rounds[round % rounds.length])
    if (reduced) {
      stage.dataset.phase = 'priced'
      status.textContent = words.priced
      crown(stage)
      setTimer(12)
      return
    }
    stage.dataset.phase = 'idle'
    status.textContent = words.waiting
    let s = 15
    setTimer(s)
    for (let k = 1; k <= 14; k++) later(k * 1000, () => setTimer(--s))
    later(500, () => {
      stage.dataset.phase = 'read'
      status.textContent = words.reading
      stage.querySelectorAll('.game-card').forEach((card, i) => later(260 + i * 300, () => card.setAttribute('data-read', '')))
    })
    later(2100, () => {
      stage.dataset.phase = 'priced'
      status.textContent = words.priced
      stage.querySelectorAll('.metal-figure[data-to]').forEach(el => { if (el.dataset.to !== '') countUp(el, Number(el.dataset.to), 900) })
    })
    later(3200, () => crown(stage))
    later(9200, () => { round++; if (visible && !document.hidden) play(); else timers = [] })
  }

  new IntersectionObserver(([entry]) => {
    const was = visible
    visible = entry.isIntersecting
    if (visible && !was && timers.length === 0) play()
  }).observe(stage)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && timers.length === 0) play() })
  play()
}

// ------------------------------------------------------------------ the app tour

const views = [...document.querySelectorAll('.window .view')]
const railItems = [...document.querySelectorAll('.win-rail [data-view]')]
const mobileTabs = [...document.querySelectorAll('.tour-mobile [data-view]')]
const mobileText = document.querySelector('.tour-mobile p')

function showView(name) {
  views.forEach(v => v.toggleAttribute('data-current', v.dataset.view === name))
  railItems.forEach(r => r.toggleAttribute('data-current', r.dataset.view === name))
  mobileTabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)))
  document.querySelectorAll('.tour-step').forEach(s => s.toggleAttribute('data-active', s.dataset.view === name))
  const step = document.querySelector(`.tour-step[data-view="${name}"] p`)
  if (mobileText && step) mobileText.textContent = step.textContent
}

if (views.length) {
  const steps = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) showView(entry.target.dataset.view)
  }, { rootMargin: '-45% 0px -45% 0px' })
  document.querySelectorAll('.tour-step').forEach(s => steps.observe(s))
  mobileTabs.forEach(t => t.addEventListener('click', () => showView(t.dataset.view)))
  showView(views[0].dataset.view)
}

// ------------------------------------------------------------------ the kiosk

const kiosk = document.querySelector('.kiosk')
if (kiosk) {
  const list = kiosk.querySelector('.kiosk-list ol')
  const totalP = kiosk.querySelector('[data-total="p"]')
  const totalD = kiosk.querySelector('[data-total="d"]')
  const tiles = [...kiosk.querySelectorAll('.kiosk-tile')]
  const draw = () => {
    const picked = tiles.filter(t => t.getAttribute('aria-pressed') === 'true')
    list.innerHTML = picked.length
      ? picked.map(t => `<li><span>${t.dataset.name}</span><span class="plate">${metal('p')}${t.dataset.p}</span><span class="d-fig">${t.dataset.d}</span></li>`).join('')
      : `<li class="kiosk-empty">${words.pick}</li>`
    totalP.textContent = picked.reduce((s, t) => s + Number(t.dataset.p), 0)
    totalD.textContent = picked.reduce((s, t) => s + Number(t.dataset.d), 0)
  }
  tiles.forEach(t => t.addEventListener('click', () => {
    t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'))
    draw()
  }))
  draw()
  new IntersectionObserver(([entry], obs) => {
    if (entry.isIntersecting) { kiosk.setAttribute('data-on', ''); obs.disconnect() }
  }, { threshold: .3 }).observe(kiosk)
}

// ------------------------------------------------------------------ access levels

const levels = [...document.querySelectorAll('.level')]
const levelRows = [...document.querySelectorAll('.access-rows[data-level]')]
function chooseLevel(button, focus) {
  levels.forEach(l => {
    const on = l === button
    l.setAttribute('aria-checked', String(on))
    l.tabIndex = on ? 0 : -1
  })
  levelRows.forEach(r => { r.hidden = r.dataset.level !== button.dataset.level })
  if (focus) button.focus()
}
levels.forEach((l, i) => {
  l.addEventListener('click', () => chooseLevel(l))
  l.addEventListener('keydown', e => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!move) return
    e.preventDefault()
    chooseLevel(levels[(i + move + levels.length) % levels.length], true)
  })
})

// ------------------------------------------------------------------ downloads

const tabs = [...document.querySelectorAll('.dl-tabs [role="tab"]')]
function chooseTab(tab, focus) {
  tabs.forEach(t => {
    const on = t === tab
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on
  })
  if (focus) tab.focus()
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => chooseTab(t))
  t.addEventListener('keydown', e => {
    const move = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!move) return
    e.preventDefault()
    chooseTab(tabs[(i + move + tabs.length) % tabs.length], true)
  })
})

const platform = (navigator.userAgentData?.platform || navigator.userAgent || '').toLowerCase()
const os = /win/.test(platform) ? 'windows'
  : /android|iphone|ipad|mac/.test(platform) ? 'other'
  : /linux|x11|cros/.test(platform) ? 'linux' : 'other'
const linuxTab = /fedora/.test(navigator.userAgent.toLowerCase()) ? 'fedora'
  : /ubuntu|debian/.test(navigator.userAgent.toLowerCase()) ? 'debian' : 'fedora'
if (tabs.length) {
  const want = os === 'windows' ? 'windows' : os === 'linux' ? linuxTab : 'windows'
  chooseTab(tabs.find(t => t.dataset.tab === want) ?? tabs[0])
}

const primary = document.querySelectorAll('[data-cta="primary"]')
function labelPrimary(assets) {
  primary.forEach(a => {
    const label = a.querySelector('span')
    if (os === 'windows') {
      label.textContent = words.forWindows
      if (assets?.windows) a.href = assets.windows.url
    } else if (os === 'linux') {
      label.textContent = words.forLinux
    } else {
      label.textContent = words.download
    }
  })
}
labelPrimary(null)

const patterns = {
  windows: /x64-setup\.exe$/i,
  fedora: /\.x86_64\.rpm$/i,
  debian: /_amd64\.deb$/i,
  appimage: /\.AppImage$/,
}

async function latestRelease() {
  const key = `fs-release-${REPO}`
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.release
  } catch {}
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  const json = await response.json()
  const release = { tag: json.tag_name, assets: json.assets.map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) }
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), release })) } catch {}
  return release
}

latestRelease().then(release => {
  const assets = {}
  for (const [kind, re] of Object.entries(patterns)) assets[kind] = release.assets.find(a => re.test(a.name))
  document.querySelectorAll('[data-asset]').forEach(a => {
    const asset = assets[a.dataset.asset]
    if (asset) a.href = asset.url
  })
  document.querySelectorAll('[data-file]').forEach(el => {
    const asset = assets[el.dataset.file]
    if (asset) el.textContent = `${asset.name} · ${(asset.size / 1048576).toFixed(0)} MB`
  })
  document.querySelectorAll('[data-filename]').forEach(el => {
    const asset = assets[el.dataset.filename]
    if (asset) el.textContent = el.textContent.replace(/\S+\.(rpm|deb|AppImage)\b/, asset.name)
  })
  document.querySelectorAll('[data-version]').forEach(el => { el.textContent = words.latest(release.tag) })
  labelPrimary(assets)
}).catch(() => {
  // No release reachable: every link already points at the releases page.
  document.querySelectorAll('[data-asset]').forEach(a => { a.href = RELEASES })
})

// ------------------------------------------------------------------ copy

document.querySelectorAll('.copy').forEach(button => {
  button.setAttribute('aria-label', words.copy)
  button.addEventListener('click', async () => {
    const text = button.parentElement.querySelector('code').textContent
    try {
      await navigator.clipboard.writeText(text)
      button.setAttribute('data-done', '')
      button.setAttribute('aria-label', words.copied)
      setTimeout(() => { button.removeAttribute('data-done'); button.setAttribute('aria-label', words.copy) }, 1600)
    } catch {}
  })
})
