// FrameSight landing page: the intro, the Void behind the hero, the reward screen demo, the app
// tour, the kiosk, the access rail, the terminal and the download links resolved from the latest
// GitHub release. Everything here enhances markup that already reads and links without it.

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
    latest: v => `FrameSight ${v}`, copied: 'Copied', copy: 'Copy command', pick: 'Pick parts to sell',
  },
  fr: {
    plat: 'platine', ducats: 'ducats', topPlat: 'Top platine', topDucats: 'Top ducats',
    owned: n => `Possédé ×${n}`, notOwned: 'Non possédé', unmastered: 'Non maîtrisé', completes: 'Complète l’ensemble',
    reading: 'Lecture de l’écran de récompenses…', priced: 'Prix des joueurs en jeu en ce moment', waiting: 'En attente de l’écran de récompenses',
    forWindows: 'Télécharger pour Windows', forLinux: 'Télécharger pour Linux', download: 'Télécharger',
    latest: v => `FrameSight ${v}`, copied: 'Copié', copy: 'Copier la commande', pick: 'Choisissez les pièces à vendre',
  },
}[lang]

const metal = kind => `<img class="metal-mark" src="/assets/${kind === 'p' ? 'platinum' : 'ducats'}.png" alt="" width="20" height="20">`
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const onView = (el, fn, options = { rootMargin: '0px 0px -12% 0px' }) => {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { fn(entry.target); io.unobserve(entry.target) }
  }, options)
  io.observe(el)
}

// ------------------------------------------------------------------ header

const head = document.querySelector('.site-head')
const onScrollHead = () => head?.toggleAttribute('data-scrolled', scrollY > 12)
addEventListener('scroll', onScrollHead, { passive: true })
onScrollHead()

// ------------------------------------------------------------------ words in, one by one

// Split a heading into words so each can arrive on its own; text stays one readable string for
// assistive tech through the original element's text.
function split(el) {
  const label = el.textContent
  const nodes = [...el.childNodes]
  el.textContent = ''
  let i = 0
  for (const node of nodes) {
    const host = node.nodeType === 3 ? el : el.appendChild(node.cloneNode(false))
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) { host.append(part); continue }
      const w = document.createElement('span')
      w.className = 'w'
      w.style.setProperty('--d', String(i++ * 70))
      w.textContent = part
      host.append(w)
    }
  }
  el.setAttribute('aria-label', label)
  for (const w of el.querySelectorAll('.w')) w.setAttribute('aria-hidden', 'true')
  return i
}

const intro = document.querySelector('[data-split="intro"]')
const introWords = intro ? split(intro) : 0
document.querySelectorAll('[data-intro]').forEach(el => {
  const step = Number(el.dataset.intro)
  el.style.setProperty('--d', String(step === 0 ? 100 : 200 + introWords * 70 + step * 110))
})
requestAnimationFrame(() => {
  root.classList.add('intro-go')
  intro?.setAttribute('data-shown', '')
})

document.querySelectorAll('[data-split]:not([data-split="intro"])').forEach(el => {
  split(el)
  onView(el, t => t.setAttribute('data-shown', ''))
})
document.querySelectorAll('[data-reveal]').forEach(el => onView(el, t => t.setAttribute('data-shown', '')))

// ------------------------------------------------------------------ scroll-linked: the screen lies flat, the manifesto lights up

const scene = document.querySelector('.scene')
const manifesto = document.querySelector('[data-scrub]')
let manifestoWords = []
if (manifesto) {
  split(manifesto)
  manifestoWords = [...manifesto.querySelectorAll('.w')]
  manifesto.querySelectorAll('.w').forEach(w => w.removeAttribute('style'))
}

let ticking = false
function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    const vh = innerHeight
    if (scene && !reduced) {
      const r = scene.getBoundingClientRect()
      scene.style.setProperty('--p', clamp((vh - r.top) / (vh * 1.15), 0, 1).toFixed(3))
    }
    if (manifestoWords.length) {
      const r = manifesto.getBoundingClientRect()
      const progress = reduced ? 1 : clamp((vh * .85 - r.top) / (r.height + vh * .35), 0, 1)
      const lit = progress * manifestoWords.length
      manifestoWords.forEach((w, i) => w.style.setProperty('--o', (0.16 + 0.84 * clamp(lit - i, 0, 1)).toFixed(2)))
    }
  })
}
addEventListener('scroll', onScroll, { passive: true })
addEventListener('resize', onScroll)
onScroll()

// ------------------------------------------------------------------ the Void: far stars, near motes

function voidLayer(canvas, near) {
  const ctx = canvas.getContext('2d')
  let w = 0, h = 0, dpr = 1, motes = [], running = false, frame = 0
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }

  function seed() {
    dpr = Math.min(2, devicePixelRatio || 1)
    w = canvas.clientWidth; h = canvas.clientHeight
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const count = near ? Math.round(w / 40) : Math.round((w * h) / 5200)
    motes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: near ? h * (.45 + Math.random() * .55) : Math.random() * h,
      r: near ? 0.8 + Math.random() * 1.8 : Math.random() * 1.1 + .2,
      z: Math.random(),
      gold: Math.random() < (near ? .55 : .18),
      vy: near ? -(0.08 + Math.random() * .22) : -(0.01 + Math.random() * .04),
      phase: Math.random() * Math.PI * 2,
    }))
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h)
    pointer.x += (pointer.tx - pointer.x) * .04
    pointer.y += (pointer.ty - pointer.y) * .04
    for (const m of motes) {
      if (running) {
        m.y += m.vy
        if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w }
      }
      const twinkle = .55 + .45 * Math.sin(t / (near ? 900 : 1400) + m.phase)
      const depth = near ? 18 : 6 * m.z
      const x = m.x + pointer.x * depth
      const y = m.y + pointer.y * depth
      const alpha = (near ? .5 : .28 + m.z * .5) * twinkle * (near ? clamp((h - m.y) / (h * .5), 0, 1) : 1)
      const color = m.gold ? `rgba(236, 217, 166, ${alpha})` : `rgba(190, 215, 255, ${alpha})`
      if (near || m.r > .9) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, m.r * 4)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, m.r * 4, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.fillStyle = color
        ctx.fillRect(x, y, m.r, m.r)
      }
    }
    if (running) frame = requestAnimationFrame(draw)
  }

  seed()
  draw(0)
  if (reduced) return
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) { running = true; frame = requestAnimationFrame(draw) }
    else if (!entry.isIntersecting) { running = false; cancelAnimationFrame(frame) }
  }).observe(canvas)
  addEventListener('resize', () => { seed(); if (!running) draw(0) })
  addEventListener('pointermove', e => {
    pointer.tx = (e.clientX / innerWidth - .5) * 2
    pointer.ty = (e.clientY / innerHeight - .5) * 2
  }, { passive: true })
}

if (scene) {
  const far = scene.querySelector('canvas.void')
  const near = far.cloneNode()
  near.classList.add('near')
  scene.querySelector('.mist').after(near)
  voidLayer(far, false)
  voidLayer(near, true)
}

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
  stage.querySelector('.game-cards').innerHTML = round.map(r => `
    <div class="game-card"><i class="game-art${r.plain ? ' plain' : ''}" style="--art:url(/assets/parts/${r.art}.png)"></i><span class="game-name">${r.name}</span></div>`).join('')
  const bestP = round.reduce((b, r, i) => (r.p ?? -1) > (round[b].p ?? -1) ? i : b, 0)
  const bestD = round.reduce((b, r, i) => r.d > round[b].d ? i : b, 0)
  stage.querySelector('.slips').innerHTML = round.map((r, i) => `
    <article class="slip${r.ruled ? ' ruled' : ''}" style="--i:${i}" aria-label="${r.name}">
      <div class="slip-name">${r.name}</div>
      <div class="metals">
        <span class="metal plat">
          <span class="metal-value">${metal('p')}<span class="metal-figure${r.p == null ? ' none' : ''}" data-to="${r.p ?? ''}">${r.p ?? '—'}</span></span>
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
  let round = 0, timers = [], visible = true
  const later = (ms, fn) => timers.push(setTimeout(fn, ms))
  const setTimer = s => { timerText.textContent = s; timerRun.style.strokeDashoffset = String(113.1 * (1 - s / 15)) }

  function play() {
    timers.forEach(clearTimeout)
    timers = []
    renderRound(stage, rounds[round % rounds.length])
    if (reduced) { stage.dataset.phase = 'priced'; status.textContent = words.priced; crown(stage); setTimer(12); return }
    stage.dataset.phase = 'idle'
    status.textContent = words.waiting
    let s = 15
    setTimer(s)
    for (let k = 1; k <= 14; k++) later(k * 1000, () => setTimer(--s))
    later(600, () => {
      stage.dataset.phase = 'read'
      status.textContent = words.reading
      stage.querySelectorAll('.game-card').forEach((card, i) => later(260 + i * 300, () => card.setAttribute('data-read', '')))
    })
    later(2200, () => {
      stage.dataset.phase = 'priced'
      status.textContent = words.priced
      stage.querySelectorAll('.metal-figure[data-to]').forEach(el => { if (el.dataset.to !== '') countUp(el, Number(el.dataset.to), 1000) })
    })
    later(3400, () => crown(stage))
    later(10000, () => { round++; if (visible && !document.hidden) play(); else timers = [] })
  }

  new IntersectionObserver(([entry]) => {
    const was = visible
    visible = entry.isIntersecting
    if (visible && !was && timers.length === 0) play()
  }).observe(stage)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && timers.length === 0) play() })
  // Let the window rise before the first round starts.
  setTimeout(play, reduced ? 0 : 1400)
  renderRound(stage, rounds[0])
}

// ------------------------------------------------------------------ the app tour, advancing on its own

const tourTabs = [...document.querySelectorAll('.tour-tabs [data-view]')]
if (tourTabs.length) {
  const views = [...document.querySelectorAll('.window .view')]
  const rail = [...document.querySelectorAll('.win-rail [data-view]')]
  const DWELL = 6000
  let current = 0, started = 0, paused = false, raf = 0

  function show(i) {
    current = i
    started = performance.now()
    const name = tourTabs[i].dataset.view
    tourTabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; t.style.setProperty('--prog', '0') })
    views.forEach(v => v.toggleAttribute('data-current', v.dataset.view === name))
    rail.forEach(r => r.toggleAttribute('data-current', r.dataset.view === name))
  }
  function tick(now) {
    if (!paused) {
      const t = (now - started) / DWELL
      tourTabs[current].style.setProperty('--prog', clamp(t, 0, 1).toFixed(3))
      if (t >= 1) show((current + 1) % tourTabs.length)
    } else {
      started = now - Number(tourTabs[current].style.getPropertyValue('--prog') || 0) * DWELL
    }
    raf = requestAnimationFrame(tick)
  }
  tourTabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i))
    t.addEventListener('keydown', e => {
      const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
      if (!move) return
      e.preventDefault()
      const next = (i + move + tourTabs.length) % tourTabs.length
      show(next); tourTabs[next].focus()
    })
  })
  const card = tourTabs[0].closest('.feature')
  card.addEventListener('pointerenter', () => { paused = true })
  card.addEventListener('pointerleave', () => { paused = false })
  card.addEventListener('focusin', () => { paused = true })
  card.addEventListener('focusout', () => { paused = false })
  show(0)
  if (!reduced) {
    new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf)
      if (entry.isIntersecting) { started = performance.now() - Number(tourTabs[current].style.getPropertyValue('--prog') || 0) * DWELL; raf = requestAnimationFrame(tick) }
    }).observe(card)
  }
}

// ------------------------------------------------------------------ the kiosk

const kiosk = document.querySelector('.kiosk')
if (kiosk) {
  const list = kiosk.querySelector('.kiosk-list ol')
  const totalP = kiosk.querySelector('[data-total="p"]')
  const totalD = kiosk.querySelector('[data-total="d"]')
  const tiles = [...kiosk.querySelectorAll('.kiosk-tile')]
  const bump = el => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump') }
  const draw = animate => {
    const picked = tiles.filter(t => t.getAttribute('aria-pressed') === 'true')
    list.innerHTML = picked.length
      ? picked.map(t => `<li><span>${t.dataset.name}</span><span class="plate">${metal('p')}${t.dataset.p}</span><span class="d-fig">${t.dataset.d}</span></li>`).join('')
      : `<li class="kiosk-empty">${words.pick}</li>`
    totalP.textContent = picked.reduce((s, t) => s + Number(t.dataset.p), 0)
    totalD.textContent = picked.reduce((s, t) => s + Number(t.dataset.d), 0)
    if (animate) { bump(totalP); bump(totalD) }
  }
  tiles.forEach(t => t.addEventListener('click', () => {
    t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'))
    draw(true)
  }))
  draw(false)
  onView(kiosk, k => k.setAttribute('data-on', ''), { threshold: .3 })
}

// ------------------------------------------------------------------ the terminal types itself

const term = document.querySelector('.term')
if (term) {
  const lines = [...term.querySelectorAll('.term-line')]
  const outs = [...term.querySelectorAll('.term-out')]
  if (reduced) {
    lines.forEach(l => { l.textContent = l.dataset.type })
    outs.forEach(o => o.setAttribute('data-on', ''))
  } else {
    onView(term, async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms))
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        line.setAttribute('data-typing', '')
        await wait(400)
        for (const ch of line.dataset.type) { line.textContent += ch; await wait(26 + Math.random() * 40) }
        await wait(500)
        line.removeAttribute('data-typing')
        outs[i]?.setAttribute('data-on', '')
        await wait(700)
      }
    }, { threshold: .5 })
  }
}

// ------------------------------------------------------------------ access levels

const levels = [...document.querySelectorAll('.level')]
const levelRows = [...document.querySelectorAll('.access-rows[data-level]')]
const levelsBox = document.querySelector('.levels')
function chooseLevel(button, focus) {
  const step = Number(button.dataset.step)
  levels.forEach(l => {
    const on = l === button
    l.setAttribute('aria-checked', String(on))
    l.tabIndex = on ? 0 : -1
    l.toggleAttribute('data-lit', Number(l.dataset.step) <= step)
  })
  levelsBox?.style.setProperty('--step', String(step))
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
const checked = levels.find(l => l.getAttribute('aria-checked') === 'true')
if (checked) chooseLevel(checked)

// ------------------------------------------------------------------ the light follows the pointer on cards

if (!reduced && matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    }, { passive: true })
  })
}

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

const ua = navigator.userAgent.toLowerCase()
const platform = (navigator.userAgentData?.platform || navigator.userAgent || '').toLowerCase()
const os = /win/.test(platform) ? 'windows'
  : /android|iphone|ipad|mac/.test(platform) ? 'other'
  : /linux|x11|cros/.test(platform) ? 'linux' : 'other'
if (tabs.length) {
  const want = os === 'linux' ? (/ubuntu|debian/.test(ua) ? 'debian' : 'fedora') : 'windows'
  chooseTab(tabs.find(t => t.dataset.tab === want) ?? tabs[0])
}

const primary = document.querySelectorAll('[data-cta="primary"]')
function labelPrimary(assets) {
  primary.forEach(a => {
    const label = a.querySelector('span')
    if (os === 'windows') {
      label.textContent = words.forWindows
      if (assets?.windows) a.href = assets.windows.url
    } else {
      label.textContent = os === 'linux' ? words.forLinux : words.download
    }
  })
}
labelPrimary(null)

const patterns = { windows: /x64-setup\.exe$/i, fedora: /\.x86_64\.rpm$/i, debian: /_amd64\.deb$/i, appimage: /\.AppImage$/ }

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
  const assets = Object.fromEntries(Object.entries(patterns).map(([kind, re]) => [kind, release.assets.find(a => re.test(a.name))]))
  document.querySelectorAll('[data-asset]').forEach(a => { const asset = assets[a.dataset.asset]; if (asset) a.href = asset.url })
  document.querySelectorAll('[data-file]').forEach(el => { const asset = assets[el.dataset.file]; if (asset) el.textContent = `${asset.name} · ${(asset.size / 1048576).toFixed(0)} MB` })
  document.querySelectorAll('[data-filename]').forEach(el => { const asset = assets[el.dataset.filename]; if (asset) el.textContent = el.textContent.replace(/\S+\.(rpm|deb|AppImage)\b/, asset.name) })
  document.querySelectorAll('[data-version]').forEach(el => { el.textContent = words.latest(release.tag) })
  labelPrimary(assets)
}).catch(() => {
  document.querySelectorAll('[data-asset]').forEach(a => { a.href = RELEASES })
})

// ------------------------------------------------------------------ copy

document.querySelectorAll('.copy').forEach(button => {
  button.setAttribute('aria-label', words.copy)
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.parentElement.querySelector('code').textContent)
      button.setAttribute('data-done', '')
      button.setAttribute('aria-label', words.copied)
      setTimeout(() => { button.removeAttribute('data-done'); button.setAttribute('aria-label', words.copy) }, 1600)
    } catch {}
  })
})
