import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { THEMES, buildMarpMarkdown, buildStandaloneHtml, deckStats, layoutOf, notesOf, resolveTheme } from '../src/host/deck.js'
import { validateLesson } from '../src/host/lesson.js'
import { createLearnwayService } from '../src/host/service.js'
import { DEMO_ZH } from '../src/host/demo.js'

/** A deck with one slide of every layout. */
const DECK_LESSON = {
  title: '滑片测试',
  learner: { grade: 8, interest: '篮球', language: 'zh' },
  immersion: { sections: [{ heading: '一', blocks: [{ type: 'paragraph', text: '正文。' }] }] },
  slides: [
    { layout: 'title', kicker: '开篇', title: '标题页', subtitle: '8 年级 · 篮球', narration: '开场白' },
    { layout: 'bullets', title: '要点页', bullets: ['甲', '乙'], narration: '要点讲解' },
    { layout: 'section', kicker: '第 1 节', title: '章节页', bullets: ['过渡'] },
    { layout: 'quote', title: '引文页', quote: { text: '力总是成对出现', attribution: '第三定律' } },
    { layout: 'two-column', title: '分栏页', columns: [['左一', '左二'], ['右一']] },
  ],
}

test('slide layouts are normalised and notes alias the narration', () => {
  const lesson = {
    ...DECK_LESSON,
    slides: [
      { layout: 'title', title: 't' },
      { title: 'n', bullets: ['a'], notes: '用 notes 写的讲解' },
      { layout: 'nonsense', title: 'x', bullets: ['b'] },
      { layout: 'two-column', title: 'c', columns: [['l1', 'l2'], ['r1']] },
      {},
    ],
  }
  const result = validateLesson(lesson)
  assert.equal(result.ok, true)
  const [title, aliased, unknown, columns, empty] = result.lesson.slides
  assert.equal(title.layout, 'title')
  assert.equal(aliased.narration, '用 notes 写的讲解')
  assert.equal(unknown.layout, 'bullets', 'an unknown layout degrades to bullets')
  assert.ok(result.diagnostics.some((item) => item.code === 'slide-layout'))
  assert.deepEqual(columns.columns, [['l1', 'l2'], ['r1']])
  assert.equal(empty, undefined, 'a slide with no content is dropped')
  assert.ok(result.diagnostics.some((item) => item.code === 'slide-dropped'))
})

test('layoutOf mirrors the contract defaults', () => {
  assert.equal(layoutOf({ title: 'only a title' }, 0), 'title')
  assert.equal(layoutOf({ title: 'first', bullets: ['a'] }, 0), 'bullets')
  assert.equal(layoutOf({ title: 'later' }, 3), 'bullets')
  assert.equal(notesOf({ narration: 'n' }), 'n')
  assert.equal(notesOf({ narration: 'n', notes: 'x' }), 'x')
})

test('the Marp deck declares its front-matter, separators and notes', () => {
  const markdown = buildMarpMarkdown(DECK_LESSON)
  assert.ok(markdown.startsWith('---\nmarp: true\npaginate: true\n'), 'Marp front-matter first')
  assert.ok(markdown.includes('size: 16:9'))
  const separators = markdown.split('\n---\n').length - 1
  assert.ok(separators >= DECK_LESSON.slides.length - 1, 'one separator between slides')
  assert.ok(markdown.includes('# 标题页'), 'a title slide becomes an H1')
  assert.ok(markdown.includes('## 要点页'))
  assert.ok(markdown.includes('- 甲'))
  assert.ok(markdown.includes('> 力总是成对出现'), 'a quote slide becomes a blockquote')
  assert.ok(markdown.includes('— <cite>第三定律</cite>'))
  assert.ok(markdown.includes('class="columns"'), 'two-column uses a columns block')
  assert.ok(markdown.includes('<!--\n  开场白\n-->'), 'notes are an HTML comment')
})

test('the standalone deck is offline, semantic and escaped', () => {
  const lesson = {
    ...DECK_LESSON,
    title: 'A <script>alert(1)</script> title',
    slides: [{ layout: 'bullets', title: '<img onerror=x>', bullets: ['a & b', '</li>'] }],
  }
  const html = buildStandaloneHtml(lesson)
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.includes('<section class="slide" data-layout="bullets"'), 'reveal.js-style sections')
  assert.ok(html.includes('data-notes="'), 'speaker notes travel with the slide')
  assert.ok(html.includes('id="notes"'), 'the notes pane exists')
  assert.ok(html.includes('class="fragment"'), 'progressive reveal uses fragments')
  assert.ok(!/src="https?:\/\//u.test(html) && !/href="https?:\/\//u.test(html), 'no external asset')
  assert.ok(!html.includes('<script>alert(1)</script>'), 'the title is escaped')
  assert.ok(html.includes('&lt;img onerror=x&gt;'), 'the slide title is escaped')
  assert.ok(html.includes('a &amp; b'), 'bullet text is escaped')
})

test('pptx, html and marp markdown are written for one lesson', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'learnway-deck-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const service = createLearnwayService({ config: { dataDir: dir, seedDemoLessons: 0 }, log: () => {} })
  await service.ready()
  // Save the demo lesson so the export path runs against a stored record.
  const saved = await service.save(DEMO_ZH, { id: 'lw-test-zh' })
  assert.equal(saved.ok, true)

  const result = await service.exportDeck('lw-test-zh', ['pptx', 'html', 'md'])
  assert.equal(result.stats.slides, DEMO_ZH.slides.length)
  assert.ok(result.stats.layouts.title >= 1, 'the demo deck exercises the title layout')

  const byFormat = Object.fromEntries(result.files.map((file) => [file.format, file]))
  for (const format of ['html', 'md']) {
    assert.equal(byFormat[format].ok, true, `${format} must be written`)
    assert.ok(existsSync(byFormat[format].path))
    assert.ok(byFormat[format].bytes > 200)
    assert.ok(byFormat[format].url.startsWith('/api/learnway/export?id=lw-test-zh&file=deck.'))
  }

  if (byFormat.pptx.ok) {
    const bytes = await readFile(byFormat.pptx.path)
    assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK', 'a pptx is a zip container')
    // Zip entry names sit uncompressed in the central directory.
    const names = bytes.toString('latin1')
    assert.ok(names.includes('ppt/slides/slide1.xml'), 'slides were written')
    assert.ok(names.includes('notesSlide'), 'speaker notes were written')
    assert.ok(bytes.byteLength > 10_000)
  } else {
    assert.ok(byFormat.pptx.reason.includes('pptxgenjs'), 'a missing engine reports why')
  }
})

test('deckStats counts layouts and notes', () => {
  const stats = deckStats(DECK_LESSON)
  assert.equal(stats.slides, 5)
  assert.equal(stats.layouts.title, 1)
  assert.equal(stats.layouts['two-column'], 1)
  assert.equal(stats.withNotes, 2)
})

test('rich visual layouts (cards, steps, comparison, stats) and themes render across all formats', async (t) => {
  const richLesson = {
    title: '高阶版式测试',
    learner: { grade: 8, interest: '篮球', language: 'zh' },
    immersion: { sections: [{ heading: '一', blocks: [{ type: 'paragraph', text: '正文。' }] }] },
    slides: [
      { layout: 'title', kicker: '封面', title: '主标题', subtitle: '副标题' },
      { layout: 'cards', title: '四要素', cards: [{ tag: '01', title: '等大', body: '大小相等' }, { tag: '02', title: '反向', body: '方向相反' }] },
      { layout: 'steps', title: '实验步骤', steps: [{ label: '准备', detail: '测力计归零' }, { label: '对拉', detail: '读数比较' }] },
      { layout: 'comparison', title: '概念对比', comparison: { leftTitle: '第三定律', rightTitle: '第二定律', left: ['力相等'], right: ['加速度不同'] } },
      { layout: 'stats', title: '核心指标', stats: [{ value: 'F1=-F2', label: '等大反向', detail: '同时产生' }, { value: '2', label: '异体', detail: '不抵消' }] },
    ],
  }
  const validated = validateLesson(richLesson)
  assert.equal(validated.ok, true)
  assert.deepEqual(validated.lesson.slides.map((s) => s.layout), ['title', 'cards', 'steps', 'comparison', 'stats'])

  assert.equal(resolveTheme('keynote').id, 'keynote')
  assert.equal(resolveTheme('unknown-theme').id, 'editorial')
  assert.ok(Object.keys(THEMES).length >= 5)

  const html = buildStandaloneHtml(validated.lesson, { theme: 'keynote' })
  assert.ok(html.includes('data-theme="keynote"'))
  assert.ok(html.includes('cards-grid') && html.includes('steps-grid') && html.includes('comp-grid') && html.includes('stats-grid'))
  assert.ok(html.includes('btn-overview'), 'offline HTML includes overview grid toggle')

  const md = buildMarpMarkdown(validated.lesson, { theme: 'swiss' })
  assert.ok(md.includes('class="cards"') && md.includes('class="steps"') && md.includes('class="stats"'))

  const dir = await mkdtemp(join(tmpdir(), 'learnway-rich-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const service = createLearnwayService({ config: { dataDir: dir, seedDemoLessons: 0 }, log: () => {} })
  await service.ready()
  const saved = await service.save(richLesson, { id: 'lw-rich' })
  assert.equal(saved.ok, true)
  const exported = await service.exportDeck('lw-rich', ['pptx', 'html', 'md'], { theme: 'keynote' })
  assert.equal(exported.theme, 'keynote')
  const pptx = exported.files.find((f) => f.format === 'pptx')
  assert.equal(pptx.ok, true)
  assert.ok(pptx.bytes > 10_000)
})
