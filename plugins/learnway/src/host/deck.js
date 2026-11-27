/**
 * Deck export: PowerPoint, Marp markdown, and a self-contained HTML deck.
 *
 * Design architecture informed by four open-source projects / agent skills:
 *
 * - **PptxGenJS 4** (MIT, github.com/gitbrent/PptxGenJS) + **anthropics/skills (`pptx`)**:
 *   generates native, editable `.pptx` decks using real graphic primitives
 *   (rounded cards, kicker pills, accent rules, numbered step badges, KPI stat
 *   cards, comparison panels) rather than bare text dumps.
 * - **zarazhangrui/frontend-slides**: curated, non-generic aesthetic theme
 *   presets (Editorial, Obsidian Keynote, Swiss Grid, Warm Notebook, Botanical),
 *   strict 16:9 framing, editorial typography, and smooth reveal transitions.
 * - **Marp** (MIT, github.com/marp-team/marp-cli): `marp: true` front-matter,
 *   `---` slide separators, and speaker notes as HTML comments.
 * - **reveal.js / Slidev**: `<section class="slide">`, `<aside class="notes">`,
 *   fragment reveals, keyboard shortcuts, and an overview grid (`G`).
 *
 * Everything here is 100% offline: no CDN, no network, no external assets.
 *
 * @module host/deck
 */

import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DECK_THEMES, SLIDE_LAYOUTS } from './lesson.js'

/** Re-exported from the lesson contract for convenience. */
export { DECK_THEMES, SLIDE_LAYOUTS }

/**
 * Five curated presentation themes shared by PPTX, HTML, and Marp exports.
 * Hex values carry no leading `#` so PptxGenJS consumes them directly.
 */
export const THEMES = {
  editorial: {
    id: 'editorial',
    label: '学术杂志',
    labelEn: 'Editorial',
    dark: false,
    paper: 'FAF9F6',
    surface: 'FFFFFF',
    wash: 'F1EFEA',
    ink: '141619',
    muted: '5C6370',
    accent: '1D4ED8',
    accentSoft: 'E8EEFC',
    warm: 'D97706',
    warmSoft: 'FEF3C7',
    line: 'E4E2DC',
    sectionBg: '141923',
    sectionInk: 'F8FAFC',
    sectionMuted: 'B8C4D9',
  },
  keynote: {
    id: 'keynote',
    label: '深色 Keynote',
    labelEn: 'Keynote Dark',
    dark: true,
    paper: '0D1117',
    surface: '161C26',
    wash: '1E2736',
    ink: 'F3F6FC',
    muted: '98A4B8',
    accent: '5B93FF',
    accentSoft: '1B2B4B',
    warm: 'F59E0B',
    warmSoft: '362712',
    line: '283244',
    sectionBg: '070A10',
    sectionInk: 'FFFFFF',
    sectionMuted: '9FB4D6',
  },
  swiss: {
    id: 'swiss',
    label: '瑞士网格',
    labelEn: 'Swiss Grid',
    dark: false,
    paper: 'FFFFFF',
    surface: 'F7F7F4',
    wash: 'EFEFEA',
    ink: '111111',
    muted: '575757',
    accent: 'DC2626',
    accentSoft: 'FEE2E2',
    warm: '111111',
    warmSoft: 'E7E7E2',
    line: 'E0E0DA',
    sectionBg: '111111',
    sectionInk: 'FFFFFF',
    sectionMuted: 'C7C7C7',
  },
  notebook: {
    id: 'notebook',
    label: '暖色手账',
    labelEn: 'Warm Notebook',
    dark: false,
    paper: 'FDF8F0',
    surface: 'FFFDF9',
    wash: 'F5EAD8',
    ink: '292118',
    muted: '6F6152',
    accent: 'C2591A',
    accentSoft: 'FBECE1',
    warm: '2A7B6F',
    warmSoft: 'E1F2EE',
    line: 'E8DAC6',
    sectionBg: '2E231A',
    sectionInk: 'FDF8F0',
    sectionMuted: 'D7C5B2',
  },
  botanical: {
    id: 'botanical',
    label: '清新教材',
    labelEn: 'Botanical',
    dark: false,
    paper: 'F5FAF7',
    surface: 'FFFFFF',
    wash: 'E7F3EC',
    ink: '15261E',
    muted: '4F665B',
    accent: '157F5C',
    accentSoft: 'E1F4EC',
    warm: 'C27803',
    warmSoft: 'FEF3C7',
    line: 'D4E5DC',
    sectionBg: '123428',
    sectionInk: 'F4FBF7',
    sectionMuted: 'B2D4C5',
  },
}

/** Resolve a theme id, falling back to `editorial`. */
export function resolveTheme(name) {
  const key = String(name ?? '').trim().toLowerCase()
  return THEMES[key] ?? THEMES.editorial
}

/** Escape text for HTML, attributes included. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Text usable as a plain slide title. */
function titleOf(slide, index) {
  return String(slide?.title ?? '').trim() || `幻灯片 ${index + 1}`
}

/** Speaker notes for a slide: `notes` wins over the narration alias. */
export function notesOf(slide) {
  const notes = String(slide?.notes ?? '').trim()
  return notes.length > 0 ? notes : String(slide?.narration ?? '').trim()
}

/** Bullets for a slide, ignoring blanks. */
function bulletsOf(slide) {
  return (Array.isArray(slide?.bullets) ? slide.bullets : []).map((bullet) => String(bullet).trim()).filter(Boolean)
}

/** The two columns of a `two-column` slide, falling back to a split bullet list. */
function columnsOf(slide) {
  const columns = Array.isArray(slide?.columns) ? slide.columns : []
  const normalised = columns
    .map((column) => (Array.isArray(column) ? column.map((item) => String(item).trim()).filter(Boolean) : []))
    .filter((column) => column.length > 0)
  if (normalised.length >= 2) return [normalised[0], normalised[1]]
  const bullets = bulletsOf(slide)
  const half = Math.ceil(bullets.length / 2)
  return [bullets.slice(0, half), bullets.slice(half)]
}

/** Cards of a `cards` slide, degrading gracefully from bullets when omitted. */
function cardsOf(slide) {
  const raw = Array.isArray(slide?.cards) ? slide.cards : []
  const parsed = raw
    .map((card) => {
      if (typeof card === 'string') return { title: card.trim(), body: '' }
      if (!card || typeof card !== 'object') return null
      const title = String(card.title ?? card.label ?? '').trim()
      const body = String(card.body ?? card.detail ?? card.text ?? '').trim()
      const tag = String(card.tag ?? '').trim()
      if (!title && !body) return null
      return { title: title || body.slice(0, 24), body, tag }
    })
    .filter(Boolean)
    .slice(0, 4)
  if (parsed.length > 0) return parsed
  return bulletsOf(slide).slice(0, 4).map((bullet, idx) => {
    const parts = bullet.split(/[：:]/u)
    if (parts.length >= 2) return { title: parts[0].trim(), body: parts.slice(1).join('：').trim(), tag: `0${idx + 1}` }
    return { title: `要点 0${idx + 1}`, body: bullet, tag: '' }
  })
}

/** Steps of a `steps` slide, degrading gracefully from bullets. */
function stepsOf(slide) {
  const raw = Array.isArray(slide?.steps) ? slide.steps : []
  const parsed = raw
    .map((step) => {
      if (typeof step === 'string') return { label: step.trim(), detail: '' }
      if (!step || typeof step !== 'object') return null
      const label = String(step.label ?? step.title ?? '').trim()
      const detail = String(step.detail ?? step.body ?? step.text ?? '').trim()
      return label ? { label, detail } : null
    })
    .filter(Boolean)
    .slice(0, 5)
  if (parsed.length > 0) return parsed
  return bulletsOf(slide).slice(0, 5).map((bullet) => {
    const parts = bullet.split(/[：:]/u)
    return parts.length >= 2
      ? { label: parts[0].trim(), detail: parts.slice(1).join('：').trim() }
      : { label: bullet, detail: '' }
  })
}

/** Stat callouts of a `stats` slide, degrading gracefully from bullets. */
function statsOf(slide) {
  const raw = Array.isArray(slide?.stats) ? slide.stats : []
  const parsed = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const value = String(item.value ?? '').trim()
      const label = String(item.label ?? item.title ?? '').trim()
      const detail = String(item.detail ?? item.note ?? '').trim()
      if (!value && !label) return null
      return { value: value || '—', label: label || value, detail }
    })
    .filter(Boolean)
    .slice(0, 4)
  if (parsed.length > 0) return parsed
  return bulletsOf(slide).slice(0, 4).map((bullet, idx) => ({ value: `0${idx + 1}`, label: bullet, detail: '' }))
}

/** Comparison pair of a `comparison` slide, degrading from `columns` or `bullets`. */
function comparisonOf(slide) {
  const comp = slide?.comparison && typeof slide.comparison === 'object' ? slide.comparison : null
  if (comp && (Array.isArray(comp.left) || Array.isArray(comp.right))) {
    return {
      leftTitle: String(comp.leftTitle ?? '对比 A').trim() || '对比 A',
      rightTitle: String(comp.rightTitle ?? '对比 B').trim() || '对比 B',
      left: (Array.isArray(comp.left) ? comp.left : []).map((x) => String(x).trim()).filter(Boolean),
      right: (Array.isArray(comp.right) ? comp.right : []).map((x) => String(x).trim()).filter(Boolean),
    }
  }
  const [left, right] = columnsOf(slide)
  return { leftTitle: '维度一', rightTitle: '维度二', left, right }
}

/** The layout a slide renders with, defaulting sensibly. */
export function layoutOf(slide, index) {
  const declared = String(slide?.layout ?? '').trim()
  if (SLIDE_LAYOUTS.includes(declared)) return declared
  if (Array.isArray(slide?.cards) && slide.cards.length > 0) return 'cards'
  if (Array.isArray(slide?.steps) && slide.steps.length > 0) return 'steps'
  if (Array.isArray(slide?.stats) && slide.stats.length > 0) return 'stats'
  if (slide?.comparison && typeof slide.comparison === 'object') return 'comparison'
  const hasBody = bulletsOf(slide).length > 0 || Boolean(slide?.quote) || Array.isArray(slide?.columns)
  return index === 0 && !hasBody ? 'title' : 'bullets'
}

/** Deck-level facts shared by every exporter. */
export function deckStats(lesson) {
  const slides = Array.isArray(lesson?.slides) ? lesson.slides : []
  const layouts = {}
  slides.forEach((slide, index) => {
    const layout = layoutOf(slide, index)
    layouts[layout] = (layouts[layout] ?? 0) + 1
  })
  return {
    slides: slides.length,
    layouts,
    withNotes: slides.filter((slide) => notesOf(slide).length > 0).length,
    bullets: slides.reduce((total, slide) => total + bulletsOf(slide).length, 0),
  }
}

// --------------------------------------------------------------------- Marp

/** Render one Marp slide body. */
function marpSlide(slide, index, lesson) {
  const layout = layoutOf(slide, index)
  const title = escapeHtml(titleOf(slide, index))
  const kicker = String(slide?.kicker ?? '').trim()
  const notes = notesOf(slide)
  const lines = []

  if (layout === 'title') {
    lines.push('<!-- _class: lead -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`# ${title}`, '')
    const subtitle = String(slide?.subtitle ?? '').trim() || `${lesson?.learner?.grade ?? ''} ${lesson?.learner?.interest ?? ''}`.trim()
    if (subtitle) lines.push(escapeHtml(subtitle), '')
    for (const bullet of bulletsOf(slide)) lines.push(`- ${escapeHtml(bullet)}`)
    if (bulletsOf(slide).length > 0) lines.push('')
  } else if (layout === 'section') {
    lines.push('<!-- _class: section -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    for (const bullet of bulletsOf(slide)) lines.push(`- ${escapeHtml(bullet)}`)
    if (bulletsOf(slide).length > 0) lines.push('')
  } else if (layout === 'quote') {
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    const quote = slide?.quote
    const text = typeof quote === 'string' ? quote : quote?.text
    const attribution = typeof quote === 'object' ? quote?.attribution : undefined
    if (text) lines.push(`> ${escapeHtml(text)}`, '')
    if (attribution) lines.push(`— <cite>${escapeHtml(attribution)}</cite>`, '')
  } else if (layout === 'two-column') {
    const [left, right] = columnsOf(slide)
    lines.push('<!-- _class: columns -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    lines.push('<div class="columns">', '<div class="card">', '')
    for (const item of left) lines.push(`- ${escapeHtml(item)}`)
    lines.push('', '</div>', '<div class="card">', '')
    for (const item of right) lines.push(`- ${escapeHtml(item)}`)
    lines.push('', '</div>', '</div>', '')
  } else if (layout === 'cards') {
    const cards = cardsOf(slide)
    lines.push('<!-- _class: cards -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    lines.push('<div class="cards">')
    for (const card of cards) {
      lines.push(`<div class="card">${card.tag ? `<span class="tag">${escapeHtml(card.tag)}</span>` : ''}<h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.body)}</p></div>`)
    }
    lines.push('</div>', '')
  } else if (layout === 'steps') {
    const steps = stepsOf(slide)
    lines.push('<!-- _class: steps -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    lines.push('<div class="steps">')
    steps.forEach((step, idx) => {
      lines.push(`<div class="step"><span class="num">${idx + 1}</span><h3>${escapeHtml(step.label)}</h3>${step.detail ? `<p>${escapeHtml(step.detail)}</p>` : ''}</div>`)
    })
    lines.push('</div>', '')
  } else if (layout === 'comparison') {
    const comp = comparisonOf(slide)
    lines.push('<!-- _class: columns -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    lines.push('<div class="columns">', `<div class="card"><h3>${escapeHtml(comp.leftTitle)}</h3>`, '')
    for (const item of comp.left) lines.push(`- ${escapeHtml(item)}`)
    lines.push('', '</div>', `<div class="card warm"><h3>${escapeHtml(comp.rightTitle)}</h3>`, '')
    for (const item of comp.right) lines.push(`- ${escapeHtml(item)}`)
    lines.push('', '</div>', '</div>', '')
  } else if (layout === 'stats') {
    const stats = statsOf(slide)
    lines.push('<!-- _class: stats -->', '')
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    lines.push('<div class="stats">')
    for (const item of stats) {
      lines.push(`<div class="stat"><div class="val">${escapeHtml(item.value)}</div><div class="lbl">${escapeHtml(item.label)}</div>${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ''}</div>`)
    }
    lines.push('</div>', '')
  } else {
    if (kicker) lines.push(`<p class="kicker">${escapeHtml(kicker)}</p>`, '')
    lines.push(`## ${title}`, '')
    for (const bullet of bulletsOf(slide)) lines.push(`- ${escapeHtml(bullet)}`)
    if (bulletsOf(slide).length > 0) lines.push('')
  }

  if (notes) lines.push('<!--', notes.split('\n').map((line) => `  ${line}`).join('\n'), '-->', '')
  return lines.join('\n')
}

/**
 * Build a Marp-compatible markdown deck.
 *
 * @param {object} lesson
 * @param {{theme?: string}} [options]
 * @returns {string}
 */
export function buildMarpMarkdown(lesson, options = {}) {
  const theme = resolveTheme(options.theme)
  const slides = Array.isArray(lesson?.slides) ? lesson.slides : []
  const title = String(lesson?.title ?? 'Lesson').replace(/\n/g, ' ')
  const front = [
    '---',
    'marp: true',
    'paginate: true',
    'size: 16:9',
    `title: ${JSON.stringify(title)}`,
    '---',
    '',
  ]
  const style = [
    '<style>',
    `:root { --lw-paper: #${theme.paper}; --lw-surface: #${theme.surface}; --lw-accent: #${theme.accent}; --lw-accent-soft: #${theme.accentSoft}; --lw-warm: #${theme.warm}; --lw-ink: #${theme.ink}; --lw-muted: #${theme.muted}; --lw-line: #${theme.line}; }`,
    'section { background: var(--lw-paper); font-family: -apple-system, "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif; color: var(--lw-ink); padding: 48px 60px; }',
    `section.section { background: #${theme.sectionBg}; color: #${theme.sectionInk}; }`,
    'section.lead h1, section h1 { font-size: 46px; letter-spacing: -0.02em; line-height: 1.15; }',
    'section h2 { font-size: 32px; letter-spacing: -0.01em; margin-bottom: 22px; }',
    'section .kicker { display: inline-block; background: var(--lw-accent-soft); color: var(--lw-accent); font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 999px; margin: 0 0 12px; }',
    'section blockquote { border-left: 4px solid var(--lw-accent); padding: 14px 22px; background: var(--lw-surface); border-radius: 0 12px 12px 0; font-size: 26px; }',
    'section cite { color: var(--lw-muted); font-style: normal; font-size: 16px; }',
    'section .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }',
    'section .cards, section .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }',
    'section .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }',
    'section .card, section .step, section .stat { background: var(--lw-surface); border: 1px solid var(--lw-line); border-top: 3px solid var(--lw-accent); border-radius: 12px; padding: 18px 20px; }',
    'section .card.warm { border-top-color: var(--lw-warm); }',
    'section .stat .val { font-size: 36px; font-weight: 700; color: var(--lw-accent); line-height: 1.15; margin-bottom: 6px; }',
    'section .stat .lbl { font-weight: 600; font-size: 18px; }',
    'section .step .num { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 999px; background: var(--lw-accent); color: #fff; font-weight: 700; font-size: 14px; margin-bottom: 10px; }',
    '</style>',
    '',
  ].join('\n')

  const body = slides.map((slide, index) => marpSlide(slide, index, lesson)).join('\n---\n\n')
  return `${front.join('\n')}\n${style}\n${body}\n`
}

// ---------------------------------------------------------------- HTML deck

/** Build CSS variables for all 5 themes so the offline HTML deck supports live theme switching. */
function buildThemeCss() {
  return Object.values(THEMES).map((theme) => (
    `html[data-theme="${theme.id}"]{`
    + `--paper:#${theme.paper};--surface:#${theme.surface};--wash:#${theme.wash};`
    + `--ink:#${theme.ink};--muted:#${theme.muted};--accent:#${theme.accent};`
    + `--accent-soft:#${theme.accentSoft};--warm:#${theme.warm};--warm-soft:#${theme.warmSoft};`
    + `--line:#${theme.line};--sec-bg:#${theme.sectionBg};--sec-ink:#${theme.sectionInk};--sec-muted:#${theme.sectionMuted}}`
  )).join('\n')
}

/** Shared CSS of the standalone offline deck. */
const DECK_CSS = `
${buildThemeCss()}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--wash);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Noto Sans CJK SC","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
#stage{position:relative;display:flex;align-items:center;justify-content:center;height:100vh;padding:3.5vh 4vw 6.5vh}
.slide{position:relative;display:none;width:100%;max-width:1180px;aspect-ratio:16/9;padding:5.4% 6.4% 4.6%;border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 24px 64px rgba(15,23,42,.14),0 2px 6px rgba(15,23,42,.05);flex-direction:column;justify-content:center;overflow:hidden;animation:slideIn .26s cubic-bezier(.22,1,.36,1)}
.slide.active{display:flex}
@keyframes slideIn{from{opacity:0;transform:translateY(8px) scale(.992)}to{opacity:1;transform:none}}
.slide::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--accent),var(--warm));opacity:.9}
.slide[data-layout="title"]{background:radial-gradient(circle at 92% 14%,var(--accent-soft) 0%,transparent 48%),linear-gradient(145deg,var(--paper) 55%,var(--wash));align-items:flex-start}
.slide[data-layout="section"]{background:radial-gradient(circle at 88% 20%,rgba(255,255,255,.08),transparent 45%),var(--sec-bg);color:var(--sec-ink);border-color:transparent}
.slide[data-layout="section"] .kicker{background:rgba(255,255,255,.12);color:var(--sec-ink)}
.slide[data-layout="section"] .subtitle,.slide[data-layout="section"] li{color:var(--sec-muted)}
.slide[data-layout="section"]::before{height:100%;width:6px;right:auto;background:var(--accent)}
.kicker{display:inline-flex;align-items:center;align-self:flex-start;margin:0 0 14px;padding:4px 12px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:.78rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
h1{margin:0 0 14px;font-size:clamp(28px,3.8vw,48px);font-weight:700;line-height:1.15;letter-spacing:-.025em;max-width:18ch}
h2{margin:0 0 22px;font-size:clamp(22px,2.7vw,34px);font-weight:700;line-height:1.22;letter-spacing:-.02em}
p{margin:0 0 10px;font-size:clamp(14px,1.35vw,18px);line-height:1.68}
.subtitle{color:var(--muted);font-size:clamp(15px,1.55vw,20px);margin:0 0 14px}
.rule{width:56px;height:3px;border-radius:99px;background:var(--accent);margin:6px 0 18px}
ul{margin:0;padding:0;list-style:none}
.bullets-box{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 26px}
li{position:relative;margin:0 0 .65em;padding-left:1.35em;font-size:clamp(14px,1.38vw,19px);line-height:1.62}
li:last-child{margin-bottom:0}
li::before{content:"";position:absolute;left:0;top:.62em;width:7px;height:7px;border-radius:99px;background:var(--accent)}
li.fragment,.card.fragment,.step.fragment,.stat.fragment{opacity:0;transform:translateY(8px);transition:opacity .22s ease,transform .22s ease}
li.fragment.shown,.card.fragment.shown,.step.fragment.shown,.stat.fragment.shown{opacity:1;transform:none}
.quote-wrap{position:relative;background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:0 16px 16px 0;padding:26px 32px}
.quote-mark{font-family:Georgia,serif;font-size:64px;line-height:.6;color:var(--accent);opacity:.28;margin-bottom:8px;display:block}
blockquote{margin:0;font-size:clamp(19px,2.2vw,28px);font-weight:500;line-height:1.5;letter-spacing:-.01em}
cite{display:block;margin-top:16px;color:var(--muted);font-style:normal;font-size:.95rem}
.columns,.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.col-card,.comp-card{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:14px;padding:20px 22px}
.comp-card.right{border-top-color:var(--warm)}
.comp-card h3{margin:0 0 12px;font-size:clamp(15px,1.4vw,19px);color:var(--accent)}
.comp-card.right h3{color:var(--warm)}
.cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:8px}
.card-tag{align-self:flex-start;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
.card h3{margin:0;font-size:clamp(15px,1.4vw,19px);line-height:1.35}
.card p{margin:0;font-size:clamp(13px,1.15vw,15.5px);color:var(--muted);line-height:1.6}
.steps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px}
.step{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 16px;display:flex;flex-direction:column;gap:8px}
.step-num{width:30px;height:30px;border-radius:999px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.step h3{margin:0;font-size:clamp(14px,1.3vw,17.5px);line-height:1.35}
.step p{margin:0;font-size:clamp(12.5px,1.08vw,14.5px);color:var(--muted);line-height:1.55}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px 22px;display:flex;flex-direction:column;gap:6px}
.stat-val{font-size:clamp(28px,3.2vw,44px);font-weight:750;color:var(--accent);line-height:1.1;letter-spacing:-.03em}
.stat-lbl{font-size:clamp(14px,1.3vw,17px);font-weight:600}
.stat-det{font-size:clamp(12.5px,1.05vw,14px);color:var(--muted);line-height:1.5}
.slide-foot{position:absolute;left:6.4%;right:6.4%;bottom:3.4%;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px}
.slide[data-layout="section"] .slide-foot{border-top-color:rgba(255,255,255,.14);color:var(--sec-muted)}
#bar{position:fixed;left:0;bottom:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--warm));transition:width .24s ease;z-index:20}
#hud{position:fixed;left:0;right:0;bottom:10px;display:flex;justify-content:center;align-items:center;gap:8px;z-index:15;pointer-events:none}
#hud-inner{pointer-events:auto;display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--surface);border:1px solid var(--line);box-shadow:0 8px 24px rgba(15,23,42,.10);font-size:12px;color:var(--muted)}
#hud button{appearance:none;border:none;background:transparent;color:var(--ink);font:inherit;font-size:12px;padding:3px 8px;border-radius:999px;cursor:pointer}
#hud button:hover,#hud button.on{background:var(--accent-soft);color:var(--accent)}
#notes{position:fixed;left:0;right:0;bottom:0;max-height:36vh;overflow:auto;padding:18px 28px 54px;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -12px 32px rgba(15,23,42,.12);font-size:14.5px;line-height:1.75;display:none;z-index:12}
#notes.open{display:block}
#notes h3{margin:0 0 6px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.notes-body{white-space:pre-wrap;max-width:860px}
body.overview #stage{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;align-content:start;height:auto;min-height:100vh;padding:28px 32px 72px;overflow:auto}
body.overview .slide{display:flex;max-width:none;cursor:pointer;padding:18px 20px;border-radius:12px}
body.overview .slide.active{outline:3px solid var(--accent)}
body.overview .slide h1,body.overview .slide h2{font-size:18px;margin-bottom:8px}
body.overview .slide li,body.overview .slide p,body.overview .slide blockquote{font-size:12px}
body.overview .slide .fragment{opacity:1;transform:none}
body.overview .slide-foot{display:none}
@media print{
  body{background:#fff}
  #stage{display:block;height:auto;padding:0}
  .slide{display:flex!important;page-break-after:always;border:none;border-radius:0;box-shadow:none;max-width:none;aspect-ratio:16/9}
  .fragment{opacity:1!important;transform:none!important}
  #bar,#hud,#notes{display:none!important}
}
`

/** The standalone deck's behaviour: navigation, fragments, notes, overview (`G`), theme switcher. */
const DECK_JS = `
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var index=0, step=0;
  var notes=document.getElementById('notes');
  var notesBody=notes.querySelector('.notes-body');
  var bar=document.getElementById('bar');
  var counter=document.getElementById('counter');
  var themeBtns=[].slice.call(document.querySelectorAll('[data-set-theme]'));
  function fragments(slide){ return [].slice.call(slide.querySelectorAll('.fragment')); }
  function paint(){
    slides.forEach(function(slide,i){ slide.classList.toggle('active', i===index); });
    var slide=slides[index];
    var frags=fragments(slide);
    frags.forEach(function(f,i){ f.classList.toggle('shown', i<step); });
    if(notesBody) notesBody.textContent=(slide.getAttribute('data-notes')||'—');
    bar.style.width=(((index+1)/slides.length)*100)+'%';
    if(counter) counter.textContent=(index+1)+' / '+slides.length;
    if(location.hash!=='#/'+(index+1)) history.replaceState(null,'','#/'+(index+1));
  }
  function next(){
    if(document.body.classList.contains('overview')) return;
    var slide=slides[index], frags=fragments(slide);
    if(step<frags.length){ step++; paint(); return; }
    if(index<slides.length-1){ index++; step=0; paint(); }
  }
  function prev(){
    if(document.body.classList.contains('overview')) return;
    if(step>0){ step--; paint(); return; }
    if(index>0){ index--; step=fragments(slides[index]).length; paint(); }
  }
  function setTheme(name){
    document.documentElement.setAttribute('data-theme', name);
    themeBtns.forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-set-theme')===name); });
  }
  themeBtns.forEach(function(btn){
    btn.addEventListener('click',function(){ setTheme(btn.getAttribute('data-set-theme')); });
  });
  var btnOverview=document.getElementById('btn-overview');
  var btnNotes=document.getElementById('btn-notes');
  if(btnOverview) btnOverview.addEventListener('click',function(){ document.body.classList.toggle('overview'); btnOverview.classList.toggle('on', document.body.classList.contains('overview')); });
  if(btnNotes) btnNotes.addEventListener('click',function(){ notes.classList.toggle('open'); btnNotes.classList.toggle('on', notes.classList.contains('open')); });
  document.addEventListener('keydown',function(event){
    var key=event.key;
    if(key==='ArrowRight'||key==='PageDown'||key===' '||key==='Enter'){ event.preventDefault(); next(); }
    else if(key==='ArrowLeft'||key==='PageUp'){ event.preventDefault(); prev(); }
    else if(key==='Home'){ index=0; step=0; paint(); }
    else if(key==='End'){ index=slides.length-1; step=fragments(slides[index]).length; paint(); }
    else if(key==='n'||key==='N'){ notes.classList.toggle('open'); if(btnNotes) btnNotes.classList.toggle('on', notes.classList.contains('open')); }
    else if(key==='g'||key==='G'){ document.body.classList.toggle('overview'); if(btnOverview) btnOverview.classList.toggle('on', document.body.classList.contains('overview')); }
    else if(key==='Escape'&&document.body.classList.contains('overview')){ document.body.classList.remove('overview'); if(btnOverview) btnOverview.classList.remove('on'); }
    else if(key==='f'||key==='F'){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  });
  document.getElementById('stage').addEventListener('click',function(event){
    var targetSlide=event.target.closest('.slide');
    if(!targetSlide) return;
    if(document.body.classList.contains('overview')){
      index=slides.indexOf(targetSlide); step=fragments(slides[index]).length;
      document.body.classList.remove('overview');
      if(btnOverview) btnOverview.classList.remove('on');
      paint(); return;
    }
    if(event.clientX < window.innerWidth*0.28) prev(); else next();
  });
  var start=parseInt((location.hash||'').replace('#/',''),10);
  if(!isNaN(start)&&start>=1&&start<=slides.length){ index=start-1; step=fragments(slides[index]).length; }
  setTheme(document.documentElement.getAttribute('data-theme')||'editorial');
  paint();
})();
`

/** Render the inner markup of one slide. */
function htmlSlideBody(slide, index, total, lesson) {
  const layout = layoutOf(slide, index)
  const kicker = String(slide?.kicker ?? '').trim()
  const title = escapeHtml(titleOf(slide, index))
  const kickerHtml = kicker ? `<p class="kicker">${escapeHtml(kicker)}</p>` : ''
  const footerMeta = [lesson?.title ?? '', lesson?.learner?.grade ? `${lesson.learner.grade} 年级` : '', lesson?.learner?.interest ?? '']
    .filter(Boolean)
    .join(' · ')
  const footHtml = `<div class="slide-foot"><span>${escapeHtml(footerMeta)}</span><span>${index + 1} / ${total}</span></div>`

  if (layout === 'title') {
    const subtitle = String(slide?.subtitle ?? '').trim()
      || [lesson?.learner?.grade ? `${lesson.learner.grade} 年级` : '', lesson?.learner?.interest ?? ''].filter(Boolean).join(' · ')
    const titleBullets = bulletsOf(slide)
    return `${kickerHtml}<h1>${title}</h1><div class="rule"></div>${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}${titleBullets.length > 0
      ? `<ul>${titleBullets.map((bullet) => `<li class="fragment">${escapeHtml(bullet)}</li>`).join('')}</ul>`
      : ''}${footHtml}`
  }
  if (layout === 'section') {
    const bullets = bulletsOf(slide)
    return `${kickerHtml}<h1>${title}</h1>${bullets.length > 0
      ? `<ul>${bullets.map((bullet) => `<li class="fragment">${escapeHtml(bullet)}</li>`).join('')}</ul>`
      : ''}${footHtml}`
  }
  if (layout === 'quote') {
    const quote = slide?.quote
    const text = typeof quote === 'string' ? quote : quote?.text
    const attribution = typeof quote === 'object' ? quote?.attribution : undefined
    return `${kickerHtml}<h2>${title}</h2><div class="quote-wrap"><span class="quote-mark">“</span><blockquote>${escapeHtml(text ?? '')}${attribution ? `<cite>— ${escapeHtml(attribution)}</cite>` : ''}</blockquote></div>${footHtml}`
  }
  if (layout === 'two-column') {
    const [left, right] = columnsOf(slide)
    const column = (items) => `<div class="col-card"><ul>${items.map((item) => `<li class="fragment">${escapeHtml(item)}</li>`).join('')}</ul></div>`
    return `${kickerHtml}<h2>${title}</h2><div class="columns">${column(left)}${column(right)}</div>${footHtml}`
  }
  if (layout === 'cards') {
    const cards = cardsOf(slide)
    return `${kickerHtml}<h2>${title}</h2><div class="cards-grid">${cards.map((card) => (
      `<div class="card fragment">${card.tag ? `<span class="card-tag">${escapeHtml(card.tag)}</span>` : ''}<h3>${escapeHtml(card.title)}</h3>${card.body ? `<p>${escapeHtml(card.body)}</p>` : ''}</div>`
    )).join('')}</div>${footHtml}`
  }
  if (layout === 'steps') {
    const steps = stepsOf(slide)
    return `${kickerHtml}<h2>${title}</h2><div class="steps-grid">${steps.map((step, idx) => (
      `<div class="step fragment"><span class="step-num">${idx + 1}</span><h3>${escapeHtml(step.label)}</h3>${step.detail ? `<p>${escapeHtml(step.detail)}</p>` : ''}</div>`
    )).join('')}</div>${footHtml}`
  }
  if (layout === 'comparison') {
    const comp = comparisonOf(slide)
    const list = (items) => `<ul>${items.map((item) => `<li class="fragment">${escapeHtml(item)}</li>`).join('')}</ul>`
    return `${kickerHtml}<h2>${title}</h2><div class="comp-grid">`
      + `<div class="comp-card left"><h3>${escapeHtml(comp.leftTitle)}</h3>${list(comp.left)}</div>`
      + `<div class="comp-card right"><h3>${escapeHtml(comp.rightTitle)}</h3>${list(comp.right)}</div>`
      + `</div>${footHtml}`
  }
  if (layout === 'stats') {
    const stats = statsOf(slide)
    return `${kickerHtml}<h2>${title}</h2><div class="stats-grid">${stats.map((item) => (
      `<div class="stat fragment"><div class="stat-val">${escapeHtml(item.value)}</div><div class="stat-lbl">${escapeHtml(item.label)}</div>${item.detail ? `<div class="stat-det">${escapeHtml(item.detail)}</div>` : ''}</div>`
    )).join('')}</div>${footHtml}`
  }
  const bullets = bulletsOf(slide)
  return `${kickerHtml}<h2>${title}</h2>${bullets.length > 0
    ? `<div class="bullets-box"><ul>${bullets.map((bullet) => `<li class="fragment">${escapeHtml(bullet)}</li>`).join('')}</ul></div>`
    : ''}${footHtml}`
}

/**
 * Build a self-contained offline HTML deck.
 *
 * @param {object} lesson
 * @param {{theme?: string}} [options]
 * @returns {string}
 */
export function buildStandaloneHtml(lesson, options = {}) {
  const theme = resolveTheme(options.theme)
  const slides = Array.isArray(lesson?.slides) ? lesson.slides : []
  const title = escapeHtml(lesson?.title ?? 'Lesson')
  const sections = slides.map((slide, index) => {
    const layout = layoutOf(slide, index)
    const notes = notesOf(slide)
    return `<section class="slide" data-layout="${layout}" data-notes="${escapeHtml(notes)}">${htmlSlideBody(slide, index, slides.length, lesson)}</section>`
  }).join('\n')

  const themeButtons = Object.values(THEMES)
    .map((item) => `<button type="button" data-set-theme="${item.id}">${escapeHtml(item.label)}</button>`)
    .join('')

  return `<!doctype html>
<html lang="${escapeHtml(lesson?.learner?.language === 'en' ? 'en' : 'zh-CN')}" data-theme="${theme.id}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${DECK_CSS}</style>
</head>
<body>
<div id="stage">
${sections}
</div>
<div id="bar"></div>
<div id="hud"><div id="hud-inner"><span id="counter"></span><button type="button" id="btn-overview">总览 (G)</button><button type="button" id="btn-notes">讲授稿 (N)</button>${themeButtons}</div></div>
<aside id="notes" class="notes"><h3>讲授稿 · Speaker Notes (N)</h3><div class="notes-body"></div></aside>
<script>${DECK_JS}</script>
</body>
</html>
`
}

// -------------------------------------------------------------------- PPTX

/** Helper: draw a top kicker pill + slide heading in PptxGenJS. */
function addHeader(slide, deck, theme, { kicker, title, dark = false }) {
  // Subtle top accent bar across the canvas
  slide.addShape(deck.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.06,
    fill: { color: theme.accent },
    line: { type: 'none' },
  })
  let titleY = 0.55
  if (kicker) {
    const pillW = Math.min(3.4, Math.max(1.3, kicker.length * 0.16 + 0.5))
    slide.addShape(deck.ShapeType.roundRect, {
      x: 0.65, y: 0.42, w: pillW, h: 0.32,
      rectRadius: 0.16,
      fill: { color: dark ? theme.accent : theme.accentSoft },
      line: { type: 'none' },
    })
    slide.addText(kicker.toUpperCase(), {
      x: 0.65, y: 0.42, w: pillW, h: 0.32,
      fontSize: 10, bold: true,
      color: dark ? 'FFFFFF' : theme.accent,
      align: 'center', valign: 'middle',
      charSpacing: 1.2,
    })
    titleY = 0.86
  }
  slide.addText(title, {
    x: 0.65, y: titleY, w: 8.7, h: 0.72,
    fontSize: 25, bold: true,
    color: dark ? theme.sectionInk : theme.ink,
    valign: 'middle',
  })
  return titleY + 0.86
}

/** Helper: draw a clean hairline footer + slide number badge. */
function addFooter(slide, deck, theme, { footer, index, total, dark = false }) {
  const lineColor = dark ? '334155' : theme.line
  const textColor = dark ? theme.sectionMuted : theme.muted
  slide.addShape(deck.ShapeType.line, {
    x: 0.65, y: 5.08, w: 8.7, h: 0,
    line: { color: lineColor, width: 0.75 },
  })
  if (footer) {
    slide.addText(footer, { x: 0.65, y: 5.14, w: 6.5, h: 0.3, fontSize: 9.5, color: textColor })
  }
  slide.addText(`${index + 1} / ${total}`, {
    x: 8.15, y: 5.14, w: 1.2, h: 0.3,
    fontSize: 9.5, bold: true, color: textColor, align: 'right',
  })
}

/**
 * Build a `.pptx` with PptxGenJS using graphic primitives (cards, badges,
 * accent bars, comparison containers, step flows, and KPI callouts).
 *
 * @param {object} lesson
 * @param {{filePath: string, theme?: string}} options
 * @returns {Promise<{ok: boolean, bytes?: number, slides?: number, reason?: string}>}
 */
export async function buildPptx(lesson, options) {
  let PptxGenJS
  try {
    ({ default: PptxGenJS } = await import('pptxgenjs'))
  } catch (error) {
    return { ok: false, reason: `pptxgenjs 未安装（${error?.code ?? String(error?.message ?? error).slice(0, 120)}）：导出 Markdown（Marp）或 HTML 仍可用。` }
  }

  const slides = Array.isArray(lesson?.slides) ? lesson.slides : []
  if (slides.length === 0) return { ok: false, reason: '这个课时没有幻灯片，无法导出 PPTX。' }

  const theme = resolveTheme(options.theme)
  const deck = new PptxGenJS()
  deck.layout = 'LAYOUT_16x9'
  deck.title = String(lesson?.title ?? 'Lesson')
  deck.subject = [lesson?.source?.title, lesson?.learner?.interest].filter(Boolean).join(' · ')
  deck.author = 'Learn Your Way'
  deck.company = 'DeepSeek Harness'

  const footer = [lesson?.title, lesson?.learner?.grade ? `${lesson.learner.grade} 年级` : '', lesson?.learner?.interest ?? '']
    .filter(Boolean)
    .join(' · ')

  slides.forEach((source, index) => {
    const layout = layoutOf(source, index)
    const slide = deck.addSlide()
    const title = titleOf(source, index)
    const kicker = String(source?.kicker ?? '').trim()
    const notes = notesOf(source)
    const isSection = layout === 'section'

    slide.background = { color: isSection ? theme.sectionBg : theme.paper }

    if (layout === 'title') {
      // Decorative right-side geometric wash + accent strip
      slide.addShape(deck.ShapeType.rect, { x: 7.45, y: 0, w: 2.55, h: 5.625, fill: { color: theme.wash }, line: { type: 'none' } })
      slide.addShape(deck.ShapeType.rect, { x: 7.45, y: 0, w: 0.08, h: 5.625, fill: { color: theme.accent }, line: { type: 'none' } })
      slide.addShape(deck.ShapeType.roundRect, {
        x: 7.9, y: 1.5, w: 1.65, h: 2.5, rectRadius: 0.16,
        fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
      })
      slide.addText(String(slides.length).padStart(2, '0'), {
        x: 7.9, y: 1.75, w: 1.65, h: 0.9,
        fontSize: 38, bold: true, color: theme.accent, align: 'center',
      })
      slide.addText('SLIDES', {
        x: 7.9, y: 2.6, w: 1.65, h: 0.35,
        fontSize: 10, bold: true, color: theme.muted, align: 'center', charSpacing: 2,
      })
      if (lesson?.learner?.grade) {
        slide.addText(`${lesson.learner.grade} 年级`, {
          x: 7.9, y: 3.15, w: 1.65, h: 0.4,
          fontSize: 12, color: theme.ink, align: 'center',
        })
      }

      if (kicker) {
        const pillW = Math.min(3.4, Math.max(1.4, kicker.length * 0.16 + 0.5))
        slide.addShape(deck.ShapeType.roundRect, {
          x: 0.7, y: 1.15, w: pillW, h: 0.34, rectRadius: 0.17,
          fill: { color: theme.accentSoft }, line: { type: 'none' },
        })
        slide.addText(kicker.toUpperCase(), {
          x: 0.7, y: 1.15, w: pillW, h: 0.34,
          fontSize: 10.5, bold: true, color: theme.accent, align: 'center', valign: 'middle', charSpacing: 1.5,
        })
      }
      slide.addText(title, {
        x: 0.7, y: 1.65, w: 6.4, h: 1.6,
        fontSize: 36, bold: true, color: theme.ink, lineSpacingMultiple: 1.1, valign: 'top',
      })
      slide.addShape(deck.ShapeType.rect, {
        x: 0.7, y: 3.3, w: 0.85, h: 0.06,
        fill: { color: theme.accent }, line: { type: 'none' },
      })
      const subtitle = String(source?.subtitle ?? '').trim() || footer
      if (subtitle) {
        slide.addText(subtitle, { x: 0.7, y: 3.52, w: 6.4, h: 0.5, fontSize: 15, color: theme.muted })
      }
      const titleBullets = bulletsOf(source)
      if (titleBullets.length > 0) {
        slide.addText(titleBullets.map((bullet) => ({ text: bullet, options: { bullet: { code: '2022' } } })), {
          x: 0.7, y: 4.05, w: 6.4, h: 0.9, fontSize: 13.5, color: theme.ink, lineSpacingMultiple: 1.25,
        })
      }
    } else if (layout === 'section') {
      slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 0.14, h: 5.625, fill: { color: theme.accent }, line: { type: 'none' } })
      if (kicker) {
        const pillW = Math.min(3.2, Math.max(1.3, kicker.length * 0.16 + 0.5))
        slide.addShape(deck.ShapeType.roundRect, {
          x: 0.8, y: 1.35, w: pillW, h: 0.34, rectRadius: 0.17,
          fill: { color: theme.accent }, line: { type: 'none' },
        })
        slide.addText(kicker.toUpperCase(), {
          x: 0.8, y: 1.35, w: pillW, h: 0.34,
          fontSize: 10.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', charSpacing: 1.5,
        })
      }
      slide.addText(title, { x: 0.8, y: 1.85, w: 8.4, h: 1.25, fontSize: 34, bold: true, color: theme.sectionInk })
      const bullets = bulletsOf(source)
      if (bullets.length > 0) {
        slide.addText(bullets.map((bullet) => ({ text: bullet, options: { bullet: { code: '2022' } } })), {
          x: 0.85, y: 3.25, w: 8.2, h: 1.55, fontSize: 15.5, color: theme.sectionMuted, lineSpacingMultiple: 1.3,
        })
      }
    } else if (layout === 'quote') {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const quote = source?.quote
      const text = typeof quote === 'string' ? quote : quote?.text
      const attribution = typeof quote === 'object' ? quote?.attribution : undefined
      slide.addShape(deck.ShapeType.roundRect, {
        x: 0.65, y: top + 0.12, w: 8.7, h: 2.75, rectRadius: 0.14,
        fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
      })
      slide.addShape(deck.ShapeType.rect, {
        x: 0.65, y: top + 0.12, w: 0.1, h: 2.75,
        fill: { color: theme.accent }, line: { type: 'none' },
      })
      slide.addText('“', {
        x: 0.95, y: top + 0.16, w: 0.8, h: 0.7,
        fontSize: 48, bold: true, color: theme.accentSoft,
      })
      slide.addText(String(text ?? ''), {
        x: 1.05, y: top + 0.62, w: 8.0, h: 1.55,
        fontSize: 21, italic: true, color: theme.ink, lineSpacingMultiple: 1.35, valign: 'middle',
      })
      if (attribution) {
        slide.addText(`— ${attribution}`, {
          x: 1.05, y: top + 2.25, w: 8.0, h: 0.42,
          fontSize: 13, bold: true, color: theme.muted,
        })
      }
    } else if (layout === 'two-column') {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const [left, right] = columnsOf(source)
      const cardH = 3.1
      ;[left, right].forEach((items, colIdx) => {
        const x = colIdx === 0 ? 0.65 : 5.15
        slide.addShape(deck.ShapeType.roundRect, {
          x, y: top + 0.05, w: 4.2, h: cardH, rectRadius: 0.12,
          fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
        })
        slide.addShape(deck.ShapeType.rect, {
          x, y: top + 0.05, w: 4.2, h: 0.07,
          fill: { color: colIdx === 0 ? theme.accent : theme.warm }, line: { type: 'none' },
        })
        if (items.length > 0) {
          slide.addText(items.map((item) => ({ text: item, options: { bullet: { code: '2022' } } })), {
            x: x + 0.25, y: top + 0.3, w: 3.7, h: cardH - 0.4,
            fontSize: 15, color: theme.ink, lineSpacingMultiple: 1.32, valign: 'top',
          })
        }
      })
    } else if (layout === 'cards') {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const cards = cardsOf(source)
      const count = Math.max(1, cards.length)
      const gap = 0.22
      const cardW = (8.7 - gap * (count - 1)) / count
      const cardH = 3.1
      cards.forEach((card, idx) => {
        const x = 0.65 + idx * (cardW + gap)
        slide.addShape(deck.ShapeType.roundRect, {
          x, y: top + 0.05, w: cardW, h: cardH, rectRadius: 0.12,
          fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
        })
        slide.addShape(deck.ShapeType.rect, {
          x, y: top + 0.05, w: cardW, h: 0.07,
          fill: { color: idx % 2 === 0 ? theme.accent : theme.warm }, line: { type: 'none' },
        })
        if (card.tag) {
          slide.addShape(deck.ShapeType.roundRect, {
            x: x + 0.2, y: top + 0.28, w: Math.min(cardW - 0.4, 1.35), h: 0.28, rectRadius: 0.14,
            fill: { color: theme.accentSoft }, line: { type: 'none' },
          })
          slide.addText(card.tag, {
            x: x + 0.2, y: top + 0.28, w: Math.min(cardW - 0.4, 1.35), h: 0.28,
            fontSize: 9.5, bold: true, color: theme.accent, align: 'center', valign: 'middle',
          })
        }
        const titleY = card.tag ? top + 0.68 : top + 0.32
        slide.addText(card.title, {
          x: x + 0.2, y: titleY, w: cardW - 0.4, h: 0.62,
          fontSize: count >= 4 ? 14 : 16, bold: true, color: theme.ink, valign: 'top',
        })
        if (card.body) {
          slide.addText(card.body, {
            x: x + 0.2, y: titleY + 0.65, w: cardW - 0.4, h: cardH - (titleY - top) - 0.78,
            fontSize: count >= 4 ? 12 : 13.5, color: theme.muted, lineSpacingMultiple: 1.3, valign: 'top',
          })
        }
      })
    } else if (layout === 'steps') {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const steps = stepsOf(source)
      const count = Math.max(1, steps.length)
      const gap = 0.18
      const stepW = (8.7 - gap * (count - 1)) / count
      const cardH = 2.95
      // Horizontal connecting line behind step badges
      if (count > 1) {
        slide.addShape(deck.ShapeType.line, {
          x: 0.65 + stepW / 2, y: top + 0.45, w: 8.7 - stepW, h: 0,
          line: { color: theme.accent, width: 1.5, dashType: 'sysDot' },
        })
      }
      steps.forEach((step, idx) => {
        const x = 0.65 + idx * (stepW + gap)
        slide.addShape(deck.ShapeType.roundRect, {
          x, y: top + 0.22, w: stepW, h: cardH, rectRadius: 0.12,
          fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
        })
        slide.addShape(deck.ShapeType.ellipse, {
          x: x + 0.2, y: top + 0.42, w: 0.42, h: 0.42,
          fill: { color: theme.accent }, line: { type: 'none' },
        })
        slide.addText(String(idx + 1), {
          x: x + 0.2, y: top + 0.42, w: 0.42, h: 0.42,
          fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
        })
        slide.addText(step.label, {
          x: x + 0.2, y: top + 1.0, w: stepW - 0.4, h: 0.65,
          fontSize: count >= 5 ? 13 : 14.5, bold: true, color: theme.ink, valign: 'top',
        })
        if (step.detail) {
          slide.addText(step.detail, {
            x: x + 0.2, y: top + 1.65, w: stepW - 0.4, h: 1.35,
            fontSize: count >= 5 ? 11.5 : 12.5, color: theme.muted, lineSpacingMultiple: 1.28, valign: 'top',
          })
        }
      })
    } else if (layout === 'comparison') {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const comp = comparisonOf(source)
      const cardH = 3.15
      ;[
        { heading: comp.leftTitle, items: comp.left, x: 0.65, color: theme.accent, bg: theme.accentSoft },
        { heading: comp.rightTitle, items: comp.right, x: 5.15, color: theme.warm, bg: theme.warmSoft },
      ].forEach((side) => {
        slide.addShape(deck.ShapeType.roundRect, {
          x: side.x, y: top + 0.05, w: 4.2, h: cardH, rectRadius: 0.12,
          fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
        })
        slide.addShape(deck.ShapeType.roundRect, {
          x: side.x + 0.18, y: top + 0.22, w: 3.84, h: 0.44, rectRadius: 0.08,
          fill: { color: side.bg }, line: { type: 'none' },
        })
        slide.addText(side.heading, {
          x: side.x + 0.3, y: top + 0.22, w: 3.6, h: 0.44,
          fontSize: 14, bold: true, color: side.color, valign: 'middle',
        })
        if (side.items.length > 0) {
          slide.addText(side.items.map((item) => ({ text: item, options: { bullet: { code: '2022' } } })), {
            x: side.x + 0.25, y: top + 0.82, w: 3.7, h: cardH - 0.96,
            fontSize: 14.5, color: theme.ink, lineSpacingMultiple: 1.32, valign: 'top',
          })
        }
      })
    } else if (layout === 'stats') {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const stats = statsOf(source)
      const count = Math.max(1, stats.length)
      const gap = 0.24
      const cardW = (8.7 - gap * (count - 1)) / count
      const cardH = 2.95
      stats.forEach((item, idx) => {
        const x = 0.65 + idx * (cardW + gap)
        slide.addShape(deck.ShapeType.roundRect, {
          x, y: top + 0.12, w: cardW, h: cardH, rectRadius: 0.14,
          fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
        })
        slide.addText(item.value, {
          x: x + 0.2, y: top + 0.42, w: cardW - 0.4, h: 0.95,
          fontSize: count >= 4 ? 26 : 34, bold: true, color: theme.accent, valign: 'middle',
        })
        slide.addText(item.label, {
          x: x + 0.2, y: top + 1.42, w: cardW - 0.4, h: 0.55,
          fontSize: 15, bold: true, color: theme.ink, valign: 'top',
        })
        if (item.detail) {
          slide.addText(item.detail, {
            x: x + 0.2, y: top + 1.98, w: cardW - 0.4, h: 0.9,
            fontSize: 12.5, color: theme.muted, lineSpacingMultiple: 1.25, valign: 'top',
          })
        }
      })
    } else {
      const top = addHeader(slide, deck, theme, { kicker, title })
      const bullets = bulletsOf(source)
      slide.addShape(deck.ShapeType.roundRect, {
        x: 0.65, y: top + 0.05, w: 8.7, h: 3.1, rectRadius: 0.14,
        fill: { color: theme.surface }, line: { color: theme.line, width: 1 },
      })
      if (bullets.length > 0) {
        slide.addText(bullets.map((bullet) => ({ text: bullet, options: { bullet: { code: '2022' } } })), {
          x: 0.95, y: top + 0.28, w: 8.1, h: 2.65,
          fontSize: 16.5, color: theme.ink, lineSpacingMultiple: 1.38, valign: 'top',
        })
      }
    }

    addFooter(slide, deck, theme, { footer, index, total: slides.length, dark: isSection })
    if (notes) slide.addNotes(notes)
  })

  await mkdir(dirname(options.filePath), { recursive: true })
  await deck.writeFile({ fileName: options.filePath })
  const { size } = await stat(options.filePath)
  return { ok: true, bytes: size, slides: slides.length }
}

/**
 * Write every requested artifact for one lesson.
 *
 * Each format is independent: a missing PptxGenJS never blocks the markdown or
 * the HTML deck, and the caller gets a per-format reason.
 *
 * @param {object} lesson
 * @param {{dir: string, formats?: string[], theme?: string}} options
 * @returns {Promise<Array<{format: string, ok: boolean, file?: string, name?: string, bytes?: number, reason?: string}>>}
 */
export async function exportDeck(lesson, options) {
  const formats = Array.isArray(options.formats) && options.formats.length > 0
    ? options.formats.filter((format) => ['pptx', 'html', 'md'].includes(format))
    : ['pptx', 'html', 'md']
  const theme = resolveTheme(options.theme).id
  const dir = options.dir
  await mkdir(dir, { recursive: true })
  const results = []

  for (const format of formats) {
    if (format === 'pptx') {
      const file = join(dir, 'deck.pptx')
      const result = await buildPptx(lesson, { filePath: file, theme })
      results.push(result.ok
        ? { format: 'pptx', ok: true, file, name: 'deck.pptx', bytes: result.bytes, slides: result.slides }
        : { format: 'pptx', ok: false, reason: result.reason })
      continue
    }
    if (format === 'html') {
      const file = join(dir, 'deck.html')
      const html = buildStandaloneHtml(lesson, { theme })
      await writeFile(file, html, 'utf8')
      results.push({ format: 'html', ok: true, file, name: 'deck.html', bytes: Buffer.byteLength(html) })
      continue
    }
    const file = join(dir, 'deck.md')
    const markdown = buildMarpMarkdown(lesson, { theme })
    await writeFile(file, markdown, 'utf8')
    results.push({ format: 'md', ok: true, file, name: 'deck.md', bytes: Buffer.byteLength(markdown) })
  }

  return results
}
