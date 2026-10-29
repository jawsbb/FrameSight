// FrameSight landing page: the intro, the hills at dusk behind the hero, the reward screen demo, the app
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

// ------------------------------------------------------------------ scroll-linked: the screen leaves the canopy, the manifesto lights up

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
    if (scene && !reduced && scrollY < vh * 2) scene.style.setProperty('--s', clamp(scrollY / vh, 0, 1.4).toFixed(3))
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

// ------------------------------------------------------------------ hills at dusk

const TAU = Math.PI * 2
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const rgb = c => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`

// Seeded, so the same hills come back on every visit and every resize.
function seeded(seed) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Value noise summed over [wavelength in px, weight] octaves, normalised to 0..1: the line of a hill.
function contour(rand, octaves) {
  const tables = octaves.map(() => Array.from({ length: 256 }, rand))
  const total = octaves.reduce((sum, [, weight]) => sum + weight, 0)
  return x => octaves.reduce((sum, [length, weight], k) => {
    const p = x / length + k * 17, i = Math.floor(p), f = p - i, e = f * f * (3 - 2 * f)
    return sum + weight * (tables[k][i & 255] * (1 - e) + tables[k][(i + 1) & 255] * e)
  }, 0) / total
}

// Shade, body and lit edge of each kind of tree. Blossom and rust catch the last light; the leaf
// green keeps the forest from turning into a flower bed.
const TREES = [
  [.3, [[34, 16, 24], [116, 58, 76], [222, 156, 166]]],
  [.25, [[24, 12, 18], [92, 40, 56], [196, 118, 134]]],
  [.35, [[12, 16, 11], [42, 52, 34], [128, 134, 90]]],
  [.1, [[32, 18, 13], [100, 56, 40], [204, 140, 100]]],
]
const GROUND = [9, 9, 8]
const HAZE = [122, 88, 86]
const pickTree = rand => { let r = rand(); return TREES.find(([w]) => (r -= w) < 0)?.[1] ?? TREES[0][1] }

// One crown: lumps of foliage scattered in an ellipse, lit from above, drawn dark to light so the
// lit tops sit over the shade.
function paintCrown(ctx, rand, x, y, R, tree, haze) {
  const lumps = []
  for (let i = Math.round(clamp(R * 1.3, 8, 72)); i > 0; i--) {
    const a = rand() * TAU, d = Math.sqrt(rand())
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d * .8
    lumps.push([x + dx * R, y + dy * R, R * (.12 + rand() * .12), clamp(.32 - dy * .75 + dx * .1 + (rand() - .5) * .25, 0, 1)])
  }
  lumps.sort((p, q) => p[3] - q[3])
  for (const [lx, ly, lr, light] of lumps) {
    const color = light < .5 ? mix(tree[0], tree[1], light * 2) : mix(tree[1], tree[2], (light - .5) * 2)
    ctx.fillStyle = rgb(mix(color, HAZE, haze))
    ctx.beginPath()
    ctx.arc(lx, ly, lr, 0, TAU)
    for (let k = 0; k < 3; k++) {
      const a = rand() * TAU, cx = lx + Math.cos(a) * lr * .8, cy = ly + Math.sin(a) * lr * .8
      ctx.moveTo(cx + lr * .45, cy)
      ctx.arc(cx, cy, lr * .45, 0, TAU)
    }
    ctx.fill()
  }
}

// A far ridge: one silhouette with a warm rim where the sky still lights it.
function paintRidge(ctx, w, h, band, rand) {
  const line = contour(rand, [[420, 1], [140, .35], [38, .08], [9, .03]])
  const yAt = x => band.y - (line(x) - .5) * 2 * band.amp
  const fill = ctx.createLinearGradient(0, band.y - band.amp, 0, band.y + band.amp * 4)
  fill.addColorStop(0, rgb(band.color))
  fill.addColorStop(1, rgb(mix(band.color, GROUND, .5)))
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w + 3; x += 3) ctx.lineTo(x, yAt(x))
  ctx.lineTo(w, h)
  ctx.fill()
  ctx.strokeStyle = 'rgb(255 200 160 / 18%)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= w + 3; x += 3) ctx.lineTo(x, yAt(x) + .5)
  ctx.stroke()
}

// Rows of crowns from the back of the band to the front, each row bigger and clearer than the one
// behind it, with ground under every row so no sky shows through.
function paintTrees(ctx, w, h, band, rand) {
  const line = contour(rand, [[260, 1], [90, .45], [30, .15]])
  let y = band.y, R = band.size, row = 0
  while (y < Math.min(h + R * .3, band.until ?? h)) {
    const haze = band.haze[0] + (band.haze[1] - band.haze[0]) * clamp(row / 6, 0, 1)
    const shade = clamp((row - 1) * band.shade, 0, .7)
    const offset = row * 300
    // Sides a little higher than the middle, like a valley the screen sits in.
    const yAt = x => y + (line(x + offset) - .6) * band.amp - band.bowl * ((x - w / 2) / (w / 2)) ** 2
    ctx.fillStyle = rgb(mix(GROUND, HAZE, haze * .8))
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, yAt(x) + R * .35)
    ctx.lineTo(w, h)
    ctx.fill()
    for (let x = -R * rand(); x < w + R; x += R * (.75 + rand() * .5)) {
      const r = R * (.75 + rand() * .5)
      const tree = pickTree(rand).map(c => mix(c, GROUND, shade))
      paintCrown(ctx, rand, x, yAt(x) - r * .1 + (rand() - .5) * R * .3, r, tree, haze)
    }
    row++
    y += R * .62
    R *= band.grow ?? 1.06
  }
}

// The canvas keeps the size CSS gives it; this only paints it.
function paintLand(canvas, bands, seed) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = canvas.clientWidth, h = canvas.clientHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const rand = seeded(seed)
  for (const band of bands) (band.ridge ? paintRidge : paintTrees)(ctx, w, h, band, rand)
}

// Paints at once, then again once the elements have stopped changing size.
function onResize(targets, paint) {
  let pending = 0, first = true
  const observer = new ResizeObserver(() => {
    if (first) { first = false; paint(); return }
    clearTimeout(pending)
    pending = setTimeout(paint, 200)
  })
  targets.forEach(t => observer.observe(t))
}

// The canopy's line crosses the screen low, under the slips; its crowns and its higher sides reach
// above that line, so its canvas starts that much earlier. CSS places both canvases from --canopy-top.
function paintHero(wrap) {
  const w = scene.clientWidth
  const rise = wrap.offsetTop, tall = wrap.offsetHeight
  const size = clamp(w * .042, 20, 64)
  const top = rise + tall * (w < 700 ? .84 : .8)
  const reach = size * 3.4
  scene.style.setProperty('--canopy-top', `${top - reach}px`)
  paintLand(scene.querySelector('.land'), [
    { ridge: true, y: rise * .5, amp: rise * .2, color: [104, 76, 80] },
    { ridge: true, y: rise * .72, amp: rise * .16, color: [70, 54, 58] },
    // The valley floor, filling down to where the canopy takes over.
    { y: rise * .95, amp: size * .8, size: size * .3, grow: 1.13, bowl: rise * .35, until: top, haze: [.62, .15], shade: .05 },
  ], 11)
  paintLand(scene.querySelector('.canopy'), [
    { y: reach, amp: size * 1.1, size, bowl: size * 1.6, haze: [.25, 0], shade: .14 },
  ], 23)
  return top
}

function paintHills(canvas, seed) {
  const h = canvas.clientHeight, size = clamp(canvas.clientWidth * .03, 16, 44)
  paintLand(canvas, [
    { ridge: true, y: h * .3, amp: h * .12, color: [92, 66, 70] },
    { ridge: true, y: h * .42, amp: h * .1, color: [62, 46, 50] },
    { y: h * .58, amp: size, size, bowl: h * .12, haze: [.4, .05], shade: .14 },
  ], seed)
}

// Fireflies over the canopy and a few blossom petals carried across on the wind. Returns the
// function that lays them out again, given where the canopy starts.
function motes(canvas) {
  const ctx = canvas.getContext('2d')
  let w = 0, h = 0, from = 0, flies = [], petals = [], running = false, frame = 0
  const glow = document.createElement('canvas')
  glow.width = glow.height = 32
  const g = glow.getContext('2d'), light = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  light.addColorStop(0, 'rgb(255 220 160)')
  light.addColorStop(1, 'rgb(255 220 160 / 0)')
  g.fillStyle = light
  g.fillRect(0, 0, 32, 32)
  const petal = anywhere => ({
    x: Math.random() * w * 1.2 - w * .2, y: anywhere ? Math.random() * h : -12,
    size: 2.4 + Math.random() * 3, vx: .25 + Math.random() * .35, vy: .3 + Math.random() * .4,
    turn: Math.random() * TAU, spin: (Math.random() - .5) * .04, sway: Math.random() * TAU,
  })
  function seed() {
    w = canvas.clientWidth; h = canvas.clientHeight
    canvas.width = w; canvas.height = h
    flies = Array.from({ length: Math.round(w / 36) }, () => ({
      x: Math.random() * w, y: from + Math.random() * (h - from), r: 1 + Math.random() * 1.5,
      heading: Math.random() * TAU, speed: .12 + Math.random() * .25, phase: Math.random() * TAU,
    }))
    petals = Array.from({ length: Math.round(w / 110) }, () => petal(true))
  }
  function draw(t) {
    ctx.clearRect(0, 0, w, h)
    for (const f of flies) {
      if (running) {
        f.heading += (Math.random() - .5) * .3
        f.x = (f.x + Math.cos(f.heading) * f.speed + w + 20) % (w + 20)
        f.y = clamp(f.y + Math.sin(f.heading) * f.speed * .6, from - 40, h)
      }
      ctx.globalAlpha = .25 + .75 * Math.max(0, Math.sin(t / 1100 + f.phase))
      ctx.drawImage(glow, f.x - f.r * 5, f.y - f.r * 5, f.r * 10, f.r * 10)
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgb(242 182 196 / 78%)'
    for (const p of petals) {
      if (running) {
        p.sway += .02; p.turn += p.spin
        p.x += p.vx + Math.sin(p.sway) * .4; p.y += p.vy
        if (p.y > h + 12 || p.x > w + 12) Object.assign(p, petal(false))
      }
      ctx.setTransform(1, 0, 0, 1, p.x, p.y)
      ctx.rotate(p.turn)
      ctx.scale(1, .5 + .5 * Math.sin(p.sway * 1.3))
      ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * .6, 0, 0, TAU); ctx.fill()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (running) frame = requestAnimationFrame(draw)
  }
  if (!reduced) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; frame = requestAnimationFrame(draw) }
      else if (!entry.isIntersecting) { running = false; cancelAnimationFrame(frame) }
    }).observe(canvas)
  }
  return top => { from = top; seed(); if (!running) draw(0) }
}

if (scene) {
  const wrap = scene.querySelector('.screen-wrap')
  const lay = motes(scene.querySelector('.motes'))
  // The first call comes once this module has run, after the reward screen below has filled its
  // slips; a font swap or a new width paints again.
  onResize([scene, wrap], () => lay(paintHero(wrap)))
  if (!reduced && matchMedia('(hover: hover)').matches) {
    let queued = false, mx = 0
    addEventListener('pointermove', e => {
      mx = (e.clientX / innerWidth - .5) * 2
      if (queued) return
      queued = true
      requestAnimationFrame(() => { queued = false; scene.style.setProperty('--mx', mx.toFixed(3)) })
    }, { passive: true })
  }
}

// The closer, and the head of every other page: hills painted once they come near.
document.querySelectorAll('.hills .land').forEach((canvas, i) => {
  onView(canvas, c => onResize([c], () => paintHills(c, 37 + i * 12)), { rootMargin: '800px 0px' })
})

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
  document.querySelectorAll('[data-filename]').forEach(el => { const asset = assets[el.dataset.filename]; if (asset) el.textContent = el.textContent.replace(/[^\s/]+\.(rpm|deb|AppImage)\b/g, asset.name) })
  document.querySelectorAll('[data-version]').forEach(el => { el.textContent = words.latest(release.tag) })
  labelPrimary(assets)
}).catch(() => {
  document.querySelectorAll('[data-asset]').forEach(a => { a.href = RELEASES })
})

// ------------------------------------------------------------------ copy

// Every command gets its copy button here: without the script there is nothing to copy with.
document.querySelectorAll('.cmd').forEach(cmd => {
  cmd.insertAdjacentHTML('beforeend', '<button type="button" class="copy"><svg class="icon"><use href="#i-copy"/></svg></button>')
})
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
