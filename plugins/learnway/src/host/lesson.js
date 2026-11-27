/**
 * The lesson contract and its validator.
 *
 * A lesson is the unit the paper calls a transformed textbook section: the
 * personalised text ("Immersive Text", §2.2.1) plus every generative view of it
 * (Slides & Narration, Audio Lesson, Mind map — §2.2) plus the two assessment
 * components (§3: embedded questions and a section quiz with Glows/Grows).
 *
 * Validation is deliberately asymmetric: a structurally unusable lesson is
 * rejected, while every *quality* problem becomes a diagnostic the agent can
 * read and fix. The paper's own claim is that the material must stay faithful
 * to the source, so coverage and grade distance are measured here rather than
 * asserted in prose.
 *
 * @module host/lesson
 */

import { analyzeText, compareToGrade, coverage, round } from './readability.js'

/** Contract version, bumped when a field changes meaning. */
export const LESSON_VERSION = 1

/** Slide layouts the readers, exporters and the panel all understand. */
export const SLIDE_LAYOUTS = [
  'title',
  'section',
  'bullets',
  'quote',
  'two-column',
  'cards',
  'steps',
  'comparison',
  'stats',
]

/** Curated presentation themes shared by the panel and all deck exporters. */
export const DECK_THEMES = ['editorial', 'keynote', 'swiss', 'notebook', 'botanical']

/** Quiz size the paper reports: 5–10 multiple-choice questions per section. */
export const QUIZ_MIN = 5
export const QUIZ_MAX = 10

/** Tolerance around the learner's FKG target, in grade levels. */
export const GRADE_TOLERANCE = 1

const DIFFICULTIES = ['easy', 'medium', 'hard']

/** Structural failure; the lesson cannot be rendered. */
function failure(code, message, path) {
  return { code, message, path }
}

/** Pedagogical observation; the lesson renders, but the agent should fix it. */
function diagnostic(level, code, message, path) {
  return { level, code, message, path }
}

/** Trim a value to a string, or return the fallback. */
function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

/** Coerce to a finite number, or null. */
function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Keep only plain strings from an unknown array. */
function strings(value, limit = 40) {
  if (!Array.isArray(value)) return []
  return value.map((item) => text(item)).filter((item) => item.length > 0).slice(0, limit)
}

/**
 * Normalise one content block of the immersive text.
 *
 * @param {unknown} block
 * @param {string} path
 * @param {Array} diagnostics
 * @returns {object | null}
 */
function normalizeBlock(block, path, diagnostics) {
  if (typeof block === 'string') return { type: 'paragraph', text: block.trim() }
  if (!block || typeof block !== 'object') {
    diagnostics.push(diagnostic('warn', 'block-dropped', '不是文本块或对象，已丢弃。', path))
    return null
  }
  const type = text(block.type, 'paragraph')
  if (type === 'list') {
    const items = strings(block.items)
    if (items.length === 0) {
      diagnostics.push(diagnostic('warn', 'block-dropped', '列表没有条目，已丢弃。', path))
      return null
    }
    return { type: 'list', items }
  }
  const body = text(block.text)
  if (body.length === 0) {
    diagnostics.push(diagnostic('warn', 'block-dropped', '空文本块已丢弃。', path))
    return null
  }
  if (type === 'callout') {
    const tone = ['insight', 'caution', 'note'].includes(text(block.tone)) ? text(block.tone) : 'insight'
    return { type: 'callout', tone, text: body, ...(text(block.title) ? { title: text(block.title) } : {}) }
  }
  return {
    type: 'paragraph',
    text: body,
    ...(text(block.original) ? { original: text(block.original), personalized: block.personalized !== false } : {}),
  }
}

/**
 * Normalise one multiple-choice question (embedded or quiz).
 *
 * @returns {object | null} null when the question is unusable
 */
function normalizeQuestion(question, path, diagnostics, { requireRationale }) {
  if (!question || typeof question !== 'object') {
    diagnostics.push(diagnostic('warn', 'question-dropped', '题目不是对象，已丢弃。', path))
    return null
  }
  const stem = text(question.stem)
  const choices = strings(question.choices, 6)
  const answerIndex = num(question.answerIndex)
  if (stem.length === 0 || choices.length < 2 || answerIndex === null || answerIndex < 0 || answerIndex >= choices.length) {
    diagnostics.push(diagnostic(
      'warn',
      'question-dropped',
      `题目需要 stem、至少 2 个 choices 和落在范围内的 answerIndex（收到 choices=${choices.length}, answerIndex=${question.answerIndex}）。`,
      path,
    ))
    return null
  }
  const rationale = text(question.rationale)
  if (requireRationale && rationale.length === 0) {
    diagnostics.push(diagnostic('info', 'question-no-rationale', '没有 rationale：答错时无法解释原因，形成性反馈会变弱。', path))
  }
  const difficulty = DIFFICULTIES.includes(text(question.difficulty)) ? text(question.difficulty) : undefined
  const bloom = text(question.bloom)
  const sectionId = text(question.sectionId)
  const concept = text(question.concept)
  return {
    stem,
    choices,
    answerIndex: Math.round(answerIndex),
    ...(rationale ? { rationale } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(bloom ? { bloom } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(concept ? { concept } : {}),
  }
}

/**
 * Normalise a timeline: the source order is the correct order, so the UI can
 * run the paper's drag-and-drop practice without a second answer key.
 */
function normalizeTimeline(timeline, path, diagnostics) {
  if (!timeline || typeof timeline !== 'object') return null
  const items = Array.isArray(timeline.items) ? timeline.items : []
  const normalized = items
    .map((item) => {
      if (typeof item === 'string') return { label: item.trim() }
      if (!item || typeof item !== 'object') return null
      const label = text(item.label)
      if (label.length === 0) return null
      return { label, ...(text(item.detail) ? { detail: text(item.detail) } : {}) }
    })
    .filter(Boolean)
  if (normalized.length < 2) {
    if (items.length > 0) diagnostics.push(diagnostic('warn', 'timeline-dropped', '时间轴少于 2 项，无法排序练习，已丢弃。', path))
    return null
  }
  return { title: text(timeline.title, '时间轴'), items: normalized.slice(0, 12) }
}

/** Normalise a mnemonic: the items, the sentence that encodes them, and a gloss. */
function normalizeMemoryAid(aid, path, diagnostics) {
  if (!aid || typeof aid !== 'object') return null
  const items = strings(aid.items, 12)
  const sentence = text(aid.sentence)
  if (items.length < 2 || sentence.length === 0) {
    if (items.length > 0 || sentence.length > 0) {
      diagnostics.push(diagnostic('warn', 'memory-aid-dropped', '记忆助记需要至少 2 个 items 和一句 sentence。', path))
    }
    return null
  }
  return { items, sentence, ...(text(aid.gloss) ? { gloss: text(aid.gloss) } : {}) }
}

/**
 * Strictly sanitize an inline SVG string so it contains only static vector
 * graphics (no scripts, foreignObject, event handlers, or javascript: URIs).
 */
export function sanitizeSvg(raw) {
  const value = text(raw)
  if (!value || !/^<svg[\s>]/iu.test(value) || !/<\/svg>\s*$/iu.test(value)) return ''
  let clean = value
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/giu, '')
    .replace(/<(?:iframe|object|embed|link|meta)[^>]*\/?>/giu, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '')
    .replace(/(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/giu, '')
  if (!/\bxmlns\s*=/iu.test(clean)) {
    clean = clean.replace(/^<svg/iu, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return clean.length <= 32_000 ? clean : ''
}

/** Normalise a visual-illustration brief (§2.2.1: the frame plus how to draw it). */
function normalizeIllustration(illustration, path, diagnostics) {
  if (!illustration || typeof illustration !== 'object') return null
  const caption = text(illustration.caption) || text(illustration.brief)
  if (caption.length === 0) return null
  const dataUrl = text(illustration.dataUrl)
  if (dataUrl && !/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/u.test(dataUrl) && !dataUrl.startsWith('data:image/svg+xml,')) {
    diagnostics.push(diagnostic('warn', 'illustration-image', 'dataUrl 不是受支持的图片数据，只显示插图说明。', path))
  }
  const cleanSvg = sanitizeSvg(illustration.svg)
  if (text(illustration.svg) && !cleanSvg) {
    diagnostics.push(diagnostic('warn', 'illustration-svg', 'svg 不是合法的静态 <svg> 片段或超过 32KB，已忽略。', path))
  }
  const svgDataUrl = cleanSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}` : undefined
  const usable = /^data:image\//u.test(dataUrl) ? dataUrl : svgDataUrl
  return {
    caption,
    ...(text(illustration.brief) ? { brief: text(illustration.brief) } : {}),
    ...(cleanSvg ? { svg: cleanSvg } : {}),
    ...(usable ? { dataUrl: usable } : {}),
  }
}

/**
 * Normalise one slide.
 *
 * A slide carries the paper's deck content plus the layout vocabulary the
 * reader and the exporters share (`SLIDE_LAYOUTS`). `notes` is accepted as a
 * synonym for the paper's `narration`, and both mean what reveal.js calls a
 * speaker note and Marp writes as an HTML comment.
 */
function normalizeSlide(slide, index, diagnostics) {
  const path = `slides[${index}]`
  if (!slide || typeof slide !== 'object') {
    diagnostics.push(diagnostic('warn', 'slide-dropped', '幻灯片不是对象，已丢弃。', path))
    return null
  }
  const slideTitle = text(slide.title)
  const bullets = strings(slide.bullets, 8)
  const declared = text(slide.layout)
  const quoteIn = slide.quote
  const quoteText = typeof quoteIn === 'string' ? text(quoteIn) : text(quoteIn?.text)
  const quote = quoteText
    ? { text: quoteText, ...(text(quoteIn?.attribution) ? { attribution: text(quoteIn.attribution) } : {}) }
    : null
  const columns = (Array.isArray(slide.columns) ? slide.columns : [])
    .map((column) => strings(column, 6))
    .filter((column) => column.length > 0)
    .slice(0, 2)
  const cards = (Array.isArray(slide.cards) ? slide.cards : [])
    .map((card) => {
      if (typeof card === 'string') return { title: card.trim(), body: '' }
      if (!card || typeof card !== 'object') return null
      const cardTitle = text(card.title) || text(card.label)
      const body = text(card.body) || text(card.detail) || text(card.text)
      const tag = text(card.tag)
      if (!cardTitle && !body) return null
      return { title: cardTitle || body.slice(0, 24), body, ...(tag ? { tag } : {}) }
    })
    .filter(Boolean)
    .slice(0, 4)
  const steps = (Array.isArray(slide.steps) ? slide.steps : [])
    .map((step) => {
      if (typeof step === 'string') return { label: step.trim() }
      if (!step || typeof step !== 'object') return null
      const label = text(step.label) || text(step.title)
      const detail = text(step.detail) || text(step.body) || text(step.text)
      if (!label) return null
      return { label, ...(detail ? { detail } : {}) }
    })
    .filter(Boolean)
    .slice(0, 5)
  const stats = (Array.isArray(slide.stats) ? slide.stats : [])
    .map((stat) => {
      if (!stat || typeof stat !== 'object') return null
      const value = text(stat.value) || (stat.value !== undefined && stat.value !== null ? String(stat.value).trim() : '')
      const label = text(stat.label) || text(stat.title)
      const detail = text(stat.detail) || text(stat.note)
      if (!value && !label) return null
      return { value: value || '—', label: label || value, ...(detail ? { detail } : {}) }
    })
    .filter(Boolean)
    .slice(0, 4)
  const compIn = slide.comparison && typeof slide.comparison === 'object' ? slide.comparison : null
  const compLeft = compIn ? strings(compIn.left, 6) : []
  const compRight = compIn ? strings(compIn.right, 6) : []
  const comparison = compLeft.length > 0 || compRight.length > 0
    ? {
        leftTitle: text(compIn.leftTitle, '对比 A'),
        rightTitle: text(compIn.rightTitle, '对比 B'),
        left: compLeft,
        right: compRight,
      }
    : null
  const hasRichContent = cards.length > 0 || steps.length > 0 || stats.length > 0 || Boolean(comparison)
  if (slideTitle.length === 0 && bullets.length === 0 && !quote && columns.length === 0 && !hasRichContent) {
    diagnostics.push(diagnostic('warn', 'slide-dropped', '幻灯片没有标题、要点、引文、分栏或视觉组件，已丢弃。', path))
    return null
  }

  let layout
  if (declared.length === 0) {
    // Infer the richest layout from provided fields, otherwise default to title/bullets.
    if (cards.length > 0) layout = 'cards'
    else if (steps.length > 0) layout = 'steps'
    else if (stats.length > 0) layout = 'stats'
    else if (comparison) layout = 'comparison'
    else layout = index === 0 && bullets.length === 0 && !quote && columns.length === 0 ? 'title' : 'bullets'
  } else if (SLIDE_LAYOUTS.includes(declared)) {
    layout = declared
  } else {
    layout = 'bullets'
    diagnostics.push(diagnostic('warn', 'slide-layout', `未知 layout "${declared}"，已按 bullets 渲染（可选：${SLIDE_LAYOUTS.join(' / ')}）。`, path))
  }
  if (layout === 'two-column' && columns.length < 2) {
    diagnostics.push(diagnostic('info', 'slide-columns', 'two-column 需要 columns 两组内容，否则要点会被对半拆分。', path))
  }
  if (layout === 'quote' && !quote) {
    diagnostics.push(diagnostic('warn', 'slide-quote', 'layout 为 quote 但没有 quote 内容。', path))
  }

  const notes = text(slide.notes) || text(slide.narration)
  return {
    title: slideTitle || `幻灯片 ${index + 1}`,
    layout,
    bullets,
    ...(columns.length > 0 ? { columns } : {}),
    ...(quote ? { quote } : {}),
    ...(cards.length > 0 ? { cards } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(stats.length > 0 ? { stats } : {}),
    ...(comparison ? { comparison } : {}),
    ...(text(slide.kicker) ? { kicker: text(slide.kicker) } : {}),
    ...(text(slide.subtitle) ? { subtitle: text(slide.subtitle) } : {}),
    ...(notes ? { narration: notes } : {}),
  }
}

/** Normalise one immersive-text section. */
function normalizeSection(section, index, diagnostics) {
  const path = `sections[${index}]`
  if (!section || typeof section !== 'object') {
    diagnostics.push(diagnostic('warn', 'section-dropped', '章节不是对象，已丢弃。', path))
    return null
  }
  const heading = text(section.heading) || text(section.title)
  const blocks = (Array.isArray(section.blocks) ? section.blocks : [])
    .map((block, blockIndex) => normalizeBlock(block, `${path}.blocks[${blockIndex}]`, diagnostics))
    .filter(Boolean)
  // A section written as one paragraph string is accepted.
  if (blocks.length === 0 && text(section.text)) blocks.push({ type: 'paragraph', text: text(section.text) })
  if (heading.length === 0 && blocks.length === 0) {
    diagnostics.push(diagnostic('warn', 'section-dropped', '章节既没有标题也没有正文，已丢弃。', path))
    return null
  }
  // A section without an embedded question is normal, not a defect.
  const question = section.question
    ? normalizeQuestion(section.question, `${path}.question`, diagnostics, { requireRationale: true })
    : null
  // Normalise each add-on exactly once: these helpers push diagnostics, so
  // calling one twice would report every problem twice.
  const timeline = normalizeTimeline(section.timeline, `${path}.timeline`, diagnostics)
  const memoryAid = normalizeMemoryAid(section.memoryAid, `${path}.memoryAid`, diagnostics)
  const illustration = normalizeIllustration(section.illustration, `${path}.illustration`, diagnostics)
  return {
    id: text(section.id) || `s${index + 1}`,
    heading: heading || `第 ${index + 1} 节`,
    blocks,
    ...(question ? { question } : {}),
    ...(timeline ? { timeline } : {}),
    ...(memoryAid ? { memoryAid } : {}),
    ...(illustration ? { illustration } : {}),
  }
}

/** Normalise the mind map into a bounded tree. */
function normalizeMindmap(node, depth, path, diagnostics) {
  if (!node || typeof node !== 'object') return null
  if (depth > 4) {
    diagnostics.push(diagnostic('info', 'mindmap-depth', '思维导图超过 5 层，已截断。', path))
    return null
  }
  const label = text(node.label) || text(node.title)
  if (label.length === 0) return null
  const children = (Array.isArray(node.children) ? node.children : [])
    .map((child, index) => normalizeMindmap(child, depth + 1, `${path}.children[${index}]`, diagnostics))
    .filter(Boolean)
    .slice(0, 12)
  return {
    label,
    ...(text(node.note) ? { note: text(node.note) } : {}),
    ...(children.length > 0 ? { children } : {}),
  }
}

/**
 * Validate and normalise a lesson.
 *
 * @param {unknown} input
 * @returns {{ ok: boolean, errors: Array<{code: string, message: string, path: string}>, diagnostics: Array<{level: string, code: string, message: string, path: string}>, lesson: object }}
 */
export function validateLesson(input) {
  const errors = []
  const diagnostics = []
  const raw = input && typeof input === 'object' ? input : {}

  const title = text(raw.title)
  if (title.length === 0) errors.push(failure('missing-title', 'lesson.title 不能为空。', 'title'))

  const source = raw.source && typeof raw.source === 'object' ? raw.source : {}
  const learnerIn = raw.learner && typeof raw.learner === 'object' ? raw.learner : {}
  const grade = num(learnerIn.grade)
  if (grade !== null && (grade < 1 || grade > 20)) {
    diagnostics.push(diagnostic('warn', 'grade-range', `年级 ${grade} 超出 1–20，重分级目标可能无意义。`, 'learner.grade'))
  }

  const sections = (Array.isArray(raw.immersion?.sections) ? raw.immersion.sections : Array.isArray(raw.sections) ? raw.sections : [])
    .map((section, index) => normalizeSection(section, index, diagnostics))
    .filter(Boolean)
  if (sections.length === 0) {
    errors.push(failure('missing-sections', '至少需要一个沉浸式文本章节（immersion.sections，或兼容的 sections）。', 'immersion.sections'))
  }

  const slides = (Array.isArray(raw.slides) ? raw.slides : [])
    .map((slide, index) => normalizeSlide(slide, index, diagnostics))
    .filter(Boolean)

  const audioIn = raw.audioLesson && typeof raw.audioLesson === 'object' ? raw.audioLesson : {}
  const turns = (Array.isArray(audioIn.turns) ? audioIn.turns : [])
    .map((turn) => {
      if (!turn || typeof turn !== 'object') return null
      const body = text(turn.text)
      if (body.length === 0) return null
      const speaker = text(turn.speaker).toLowerCase() === 'student' ? 'student' : 'teacher'
      const interIn = turn.interactive && typeof turn.interactive === 'object' ? turn.interactive : null
      let interactive
      if (interIn) {
        const expected = strings(interIn.expected, 12)
        const misconceptions = (Array.isArray(interIn.misconceptions) ? interIn.misconceptions : [])
          .map((m) => (m && typeof m === 'object' && text(m.reply) ? { keywords: strings(m.keywords, 10), reply: text(m.reply) } : null))
          .filter((m) => m && m.keywords.length > 0)
        const quickChoices = (Array.isArray(interIn.quickChoices) ? interIn.quickChoices : [])
          .map((c) => {
            if (!c || typeof c !== 'object' || !text(c.label) || !text(c.reply)) return null
            const verdict = ['aligned', 'partial', 'misconception'].includes(text(c.verdict)) ? text(c.verdict) : 'aligned'
            return { label: text(c.label), verdict, reply: text(c.reply) }
          })
          .filter(Boolean)
          .slice(0, 4)
        const prompt = text(interIn.prompt)
        const alignedReply = text(interIn.alignedReply)
        const hintReply = text(interIn.hintReply)
        if (expected.length > 0 || misconceptions.length > 0 || quickChoices.length > 0 || prompt) {
          interactive = {
            ...(prompt ? { prompt } : {}),
            ...(expected.length > 0 ? { expected } : {}),
            ...(misconceptions.length > 0 ? { misconceptions } : {}),
            ...(quickChoices.length > 0 ? { quickChoices } : {}),
            ...(alignedReply ? { alignedReply } : {}),
            ...(hintReply ? { hintReply } : {}),
          }
        }
      }
      return {
        speaker,
        text: body,
        ...(text(turn.concept) ? { concept: text(turn.concept) } : {}),
        ...(interactive ? { interactive } : {}),
      }
    })
    .filter(Boolean)
  const audioLesson = turns.length > 0
    ? {
        title: text(audioIn.title, '音频课'),
        turns,
        keyConcepts: strings(audioIn.keyConcepts, 12),
      }
    : null

  const mindmap = normalizeMindmap(raw.mindmap, 0, 'mindmap', diagnostics)

  const quizIn = raw.quiz && typeof raw.quiz === 'object' ? raw.quiz : {}
  const quizQuestions = (Array.isArray(quizIn.questions) ? quizIn.questions : [])
    .map((question, index) => normalizeQuestion(question, `quiz.questions[${index}]`, diagnostics, { requireRationale: true }))
    .filter(Boolean)

  const lesson = {
    version: LESSON_VERSION,
    title,
    source: {
      title: text(source.title, '未命名原文'),
      attribution: text(source.attribution),
      ...(text(source.url) ? { url: text(source.url) } : {}),
      text: typeof source.text === 'string' ? source.text : '',
    },
    learner: {
      grade,
      interest: text(learnerIn.interest),
      language: ['zh', 'en'].includes(text(learnerIn.language)) ? text(learnerIn.language) : 'zh',
    },
    objectives: strings(raw.objectives ?? raw.meta?.learningObjectives, 8),
    immersion: { sections },
    slides,
    audioLesson,
    mindmap,
    quiz: {
      questions: quizQuestions,
      glows: strings(quizIn.glows, 8),
      grows: strings(quizIn.grows, 8),
    },
  }

  // ---- pedagogical diagnostics (paper §4 rubric axes that are machine-checkable) ----
  if (lesson.objectives.length === 0) {
    diagnostics.push(diagnostic('warn', 'missing-objectives', '没有学习目标（objectives）：评分类里「Clarity of learning intentions」会失分，用户也看不出学完该会什么。', 'objectives'))
  }
  if (slides.length === 0) diagnostics.push(diagnostic('warn', 'missing-slides', '没有幻灯片视图（§2.2 Slides & Narration）。', 'slides'))
  if (!audioLesson) diagnostics.push(diagnostic('warn', 'missing-audio', '没有音频课（§2.2 Audio Lesson）。', 'audioLesson'))
  if (!mindmap) diagnostics.push(diagnostic('warn', 'missing-mindmap', '没有思维导图（§2.2 Mind maps）。', 'mindmap'))
  if (quizQuestions.length === 0) {
    diagnostics.push(diagnostic('warn', 'missing-quiz', '没有章末测验（§3 Quizzes）：形成性评估是学习效果的主要驱动之一。', 'quiz.questions'))
  } else if (quizQuestions.length < QUIZ_MIN || quizQuestions.length > QUIZ_MAX) {
    diagnostics.push(diagnostic('warn', 'quiz-size', `测验应含 ${QUIZ_MIN}–${QUIZ_MAX} 题（论文设定），当前 ${quizQuestions.length} 题。`, 'quiz.questions'))
  }
  if (quizQuestions.length > 0) {
    const seen = new Set(quizQuestions.map((question) => question.difficulty).filter(Boolean))
    if (seen.size < 2) {
      diagnostics.push(diagnostic('warn', 'quiz-difficulty', '题目难度单一：论文要求「various difficulties」，请标出 easy / medium / hard 并覆盖至少两档。', 'quiz.questions'))
    }
    if (quizQuestions.some((question) => !question.rationale)) {
      diagnostics.push(diagnostic('warn', 'quiz-rationale', '部分测验题缺 rationale：答错时没有针对性解释。', 'quiz.questions'))
    }
    if (lesson.quiz.glows.length === 0 && lesson.quiz.grows.length === 0) {
      diagnostics.push(diagnostic('info', 'quiz-feedback', '没有 glows / grows：章末总评只能给分数，无法给出「强在哪、弱在哪」。', 'quiz'))
    }
  }
  if (audioLesson) {
    const speakers = new Set(audioLesson.turns.map((turn) => turn.speaker))
    if (!speakers.has('teacher') || !speakers.has('student')) {
      diagnostics.push(diagnostic('warn', 'audio-personas', '音频课应像师生对话：需要 teacher 和 student 两种发言（论文用两个独立人格迭代生成）。', 'audioLesson.turns'))
    }
    if (audioLesson.turns.length < 6) {
      diagnostics.push(diagnostic('info', 'audio-length', `音频课只有 ${audioLesson.turns.length} 轮，覆盖度可能不足。`, 'audioLesson.turns'))
    }
  }

  const personalizedBlocks = sections.flatMap((section) => section.blocks).filter((block) => block.original)
  if (personalizedBlocks.length === 0) {
    diagnostics.push(diagnostic('warn', 'no-personalization', '没有任何被标记的个性化替换（block.original）：兴趣个性化（§2.1）在界面上无法高亮对照，等于没做。', 'immersion.sections'))
  }

  // ---- measurement: grade distance + coverage ----
  // Headings are labels, not reading prose: including them would merge a title
  // into the first sentence and inflate the measured sentence length.
  const personalizedProse = sections
    .flatMap((section) => section.blocks.map((block) => (block.type === 'list' ? block.items.join('；') : block.text)))
    .join('\n')
  const analysis = analyzeText(personalizedProse)
  const gradeCheck = grade === null ? null : compareToGrade(analysis, grade, GRADE_TOLERANCE)
  if (gradeCheck && gradeCheck.verdict === 'off') {
    diagnostics.push(diagnostic('warn', 'grade-distance', gradeCheck.message, 'learner.grade'))
  }
  const sourceText = lesson.source.text
  const cover = sourceText.trim().length > 0 ? coverage(sourceText, personalizedProse) : null
  if (cover && cover.ratio !== null && cover.ratio < 0.35) {
    diagnostics.push(diagnostic('warn', 'low-coverage', `与原文的术语覆盖率只有 ${Math.round(cover.ratio * 100)}%（${cover.method}）：可能丢概念，而非只换说法。`, 'source.text'))
  }
  if (sourceText.trim().length === 0) {
    diagnostics.push(diagnostic('info', 'no-source-text', '没有 source.text：无法测量覆盖率与原文对照，Accuracy / Coverage 两项只能人工判断。', 'source.text'))
  }

  const stats = {
    sections: sections.length,
    blocks: sections.reduce((total, section) => total + section.blocks.length, 0),
    personalizedBlocks: personalizedBlocks.length,
    embeddedQuestions: sections.filter((section) => section.question).length,
    timelines: sections.filter((section) => section.timeline).length,
    memoryAids: sections.filter((section) => section.memoryAid).length,
    illustrations: sections.filter((section) => section.illustration).length,
    slides: slides.length,
    narratedSlides: slides.filter((slide) => slide.narration).length,
    audioTurns: audioLesson?.turns.length ?? 0,
    quizQuestions: quizQuestions.length,
    quizDifficulties: [...new Set(quizQuestions.map((question) => question.difficulty).filter(Boolean))],
    words: analysis.words,
  }

  const checks = [
    { id: 'active-learning', label: '主动学习（内嵌题）', ok: stats.embeddedQuestions > 0, detail: `${stats.embeddedQuestions} 个内嵌题` },
    { id: 'metacognition', label: '元认知（Glows/Grows）', ok: lesson.quiz.glows.length + lesson.quiz.grows.length > 0, detail: `${lesson.quiz.glows.length + lesson.quiz.grows.length} 条总评` },
    { id: 'adaptability', label: '适应性与个性化', ok: stats.personalizedBlocks > 0 && grade !== null, detail: `${stats.personalizedBlocks} 处个性化替换 · 目标 ${grade ?? '未设'} 年级` },
    { id: 'coverage', label: '覆盖度', ok: cover === null || cover.ratio === null ? null : cover.ratio >= 0.35, detail: cover === null || cover.ratio === null ? '无原文可比' : `术语覆盖 ${Math.round(cover.ratio * 100)}%` },
    { id: 'grade', label: '年级贴合（FKG）', ok: gradeCheck === null ? null : gradeCheck.verdict === 'unmeasurable' ? null : gradeCheck.verdict !== 'off', detail: gradeCheck?.message ?? '未设目标年级' },
    { id: 'clarity', label: '学习目标清晰', ok: lesson.objectives.length > 0, detail: `${lesson.objectives.length} 条目标` },
  ]

  return {
    ok: errors.length === 0,
    errors,
    diagnostics,
    lesson,
    measurement: {
      text: analysis,
      grade: gradeCheck,
      coverage: cover,
      stats,
      checks,
    },
  }
}

/**
 * Grade quiz answers and produce the paper's end-of-quiz assessment: a score
 * plus targeted Glows (strengths) and Grows (areas to improve).
 *
 * @param {object} lesson - a validated lesson
 * @param {Array<{index: number, choice: number}>} answers
 * @returns {object}
 */
export function gradeQuiz(lesson, answers) {
  const questions = lesson?.quiz?.questions ?? []
  const byIndex = new Map()
  for (const answer of Array.isArray(answers) ? answers : []) {
    const index = num(answer?.index)
    const choice = num(answer?.choice)
    if (index === null || choice === null) continue
    const confidence = String(answer?.confidence ?? '').toLowerCase() === 'low' ? 'low' : 'high'
    byIndex.set(Math.round(index), { choice: Math.round(choice), confidence })
  }

  const quadrants = { mastered: 0, fragile: 0, misconception: 0, gap: 0 }
  const results = questions.map((question, index) => {
    const submitted = byIndex.has(index) ? byIndex.get(index) : null
    const choice = submitted ? submitted.choice : null
    const confidence = submitted ? submitted.confidence : 'low'
    const correct = choice === question.answerIndex
    const quadrant = correct
      ? (confidence === 'high' ? 'mastered' : 'fragile')
      : (confidence === 'high' ? 'misconception' : 'gap')
    quadrants[quadrant] += 1
    return {
      index,
      choice,
      confidence,
      correct,
      answered: choice !== null,
      quadrant,
      correctIndex: question.answerIndex,
      difficulty: question.difficulty ?? 'medium',
      stem: question.stem,
      ...(question.rationale ? { rationale: question.rationale } : {}),
      ...(question.sectionId ? { sectionId: question.sectionId } : {}),
      ...(question.concept ? { concept: question.concept } : {}),
    }
  })

  const total = results.length
  const correct = results.filter((result) => result.correct).length
  const unanswered = results.filter((result) => !result.answered).length
  const score = total > 0 ? Math.round((correct / total) * 100) : 0

  const byDifficulty = {}
  for (const result of results) {
    const bucket = byDifficulty[result.difficulty] ?? { total: 0, correct: 0 }
    bucket.total += 1
    if (result.correct) bucket.correct += 1
    byDifficulty[result.difficulty] = bucket
  }

  const generated = { glows: [], grows: [] }
  if (total === 0) {
    generated.grows.push('这份课时还没有章末测验，无法评估掌握情况。')
  } else {
    if (score >= 80) generated.glows.push(`得分 ${score} 分（${correct}/${total}）：本节主要概念已经建立，可以进入下一节。`)
    else if (score >= 60) generated.glows.push(`得分 ${score} 分（${correct}/${total}）：基础概念基本到位。`)
    else generated.glows.push(`得分 ${score} 分（${correct}/${total}）：这是第一次接触，先看清下面的错题解释。`)

    if (quadrants.mastered > 0) {
      generated.glows.push(`真正掌握 ${quadrants.mastered} 题（高置信答对），已晋升间隔重复复习计划。`)
    }
    if (quadrants.misconception > 0) {
      generated.grows.push(`发现 ${quadrants.misconception} 道「高危误解」（很确定但答错）——超纠错效应下，优先修正这几题提分最快。`)
    }
    if (quadrants.fragile > 0) {
      generated.grows.push(`有 ${quadrants.fragile} 道题属于「蒙对 / 脆弱掌握」（答对但不太确定），建议用一句话复述理由并加入回炉巩固。`)
    }

    for (const difficulty of DIFFICULTIES) {
      const bucket = byDifficulty[difficulty]
      if (!bucket) continue
      if (bucket.correct === bucket.total && bucket.total > 0) {
        generated.glows.push(`${difficulty} 档 ${bucket.correct}/${bucket.total} 全对。`)
      } else if (bucket.correct === 0) {
        generated.grows.push(`${difficulty} 档 ${bucket.correct}/${bucket.total}：这一档还完全没通，建议回看对应小节再测一次。`)
      } else {
        generated.grows.push(`${difficulty} 档 ${bucket.correct}/${bucket.total}：部分掌握，错题的解释值得重读。`)
      }
    }
    const wrong = results.filter((result) => !result.correct)
    if (wrong.length > 0) {
      generated.grows.push(`需要重看的题目：第 ${wrong.map((result) => result.index + 1).join('、')} 题。`)
    }
    if (unanswered > 0) {
      generated.grows.push(`有 ${unanswered} 题未作答，未作答不计对。`)
    }
  }

  return {
    total,
    correct,
    unanswered,
    score,
    quadrants,
    byDifficulty,
    results,
    feedback: {
      glows: [...generated.glows, ...(lesson?.quiz?.glows ?? [])],
      grows: [...generated.grows, ...(lesson?.quiz?.grows ?? [])],
    },
  }
}

/** Count questions whose answer key the client can rely on. */
export function quizSummary(lesson) {
  const questions = lesson?.quiz?.questions ?? []
  return { total: questions.length, difficulties: [...new Set(questions.map((question) => question.difficulty).filter(Boolean))] }
}

/** Round export so callers do not import readability directly for one number. */
export { round }
