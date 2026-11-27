import assert from 'node:assert/strict'
import test from 'node:test'

import { gradeQuiz, sanitizeSvg, validateLesson } from '../src/host/lesson.js'
import { DEMO_EN, DEMO_ZH } from '../src/host/demo.js'

/** The smallest lesson the contract accepts. */
function minimalLesson(overrides = {}) {
  return {
    title: '测试课时',
    learner: { grade: 8, interest: '篮球', language: 'zh' },
    objectives: ['能说出这一节的核心概念'],
    immersion: {
      sections: [
        {
          heading: '第一节',
          blocks: [
            { type: 'paragraph', text: '这是一段个性化改写后的正文。' },
            { type: 'paragraph', text: '这是替换句。', original: '这是原文句子。' },
          ],
        },
      ],
    },
    quiz: {
      questions: [
        { stem: '问一', choices: ['甲', '乙'], answerIndex: 0, rationale: '因为甲。', difficulty: 'easy' },
        { stem: '问二', choices: ['甲', '乙'], answerIndex: 1, rationale: '因为乙。', difficulty: 'hard' },
      ],
      glows: ['你分清了两个物体'],
      grows: ['再看一次向量方向'],
    },
    ...overrides,
  }
}

test('a minimal lesson validates and keeps its personalisation', () => {
  const result = validateLesson(minimalLesson())
  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.lesson.immersion.sections[0].blocks[1].original, '这是原文句子。')
  assert.equal(result.measurement.stats.personalizedBlocks, 1)
  assert.equal(result.measurement.stats.quizQuestions, 2)
})

test('structural problems are rejected with a path', () => {
  const noTitle = validateLesson(minimalLesson({ title: '   ' }))
  assert.equal(noTitle.ok, false)
  assert.equal(noTitle.errors[0].code, 'missing-title')

  const noSections = validateLesson(minimalLesson({ immersion: { sections: [] } }))
  assert.equal(noSections.ok, false)
  assert.equal(noSections.errors[0].code, 'missing-sections')
})

test('pedagogical problems become diagnostics, not rejections', () => {
  const result = validateLesson(minimalLesson())
  const codes = result.diagnostics.map((item) => item.code)
  assert.ok(codes.includes('quiz-size'), 'two questions is under the 5–10 the paper describes')
  assert.ok(codes.includes('missing-slides'))
  assert.ok(codes.includes('missing-audio'))
  assert.ok(codes.includes('missing-mindmap'))
})

test('a rewrite without its source sentence is reported', () => {
  const lesson = minimalLesson()
  delete lesson.immersion.sections[0].blocks[1].original
  const result = validateLesson(lesson)
  assert.equal(result.ok, true)
  assert.ok(result.diagnostics.some((item) => item.code === 'no-personalization'))
})

test('malformed questions are dropped instead of failing the lesson', () => {
  const lesson = minimalLesson()
  lesson.quiz.questions.push({ stem: '坏题', choices: ['只有一个'], answerIndex: 5 })
  const result = validateLesson(lesson)
  assert.equal(result.ok, true)
  assert.equal(result.lesson.quiz.questions.length, 2)
  assert.ok(result.diagnostics.some((item) => item.code === 'question-dropped'))
})

test('a timeline needs at least two items and survives normalisation', () => {
  const lesson = minimalLesson()
  lesson.immersion.sections[0].timeline = { title: '步骤', items: ['第一步', { label: '第二步', detail: '细节' }] }
  lesson.immersion.sections[0].memoryAid = { items: ['等大', '反向'], sentence: '等大反向一起走', gloss: '四要素之两' }
  const result = validateLesson(lesson)
  assert.equal(result.lesson.immersion.sections[0].timeline.items.length, 2)
  assert.equal(result.lesson.immersion.sections[0].memoryAid.sentence, '等大反向一起走')

  const short = validateLesson(minimalLesson({
    immersion: { sections: [{ heading: 's', blocks: [{ type: 'paragraph', text: 't' }], timeline: { items: ['只有一个'] } }] },
  }))
  assert.equal(short.lesson.immersion.sections[0].timeline, undefined)
  assert.ok(short.diagnostics.some((item) => item.code === 'timeline-dropped'))
})

test('quiz grading scores, marks and produces Glows/Grows', () => {
  const { lesson } = validateLesson(minimalLesson())
  const allRight = gradeQuiz(lesson, [{ index: 0, choice: 0 }, { index: 1, choice: 1 }])
  assert.equal(allRight.score, 100)
  assert.equal(allRight.correct, 2)
  assert.ok(allRight.feedback.glows.some((line) => line.includes('100')))
  assert.ok(allRight.feedback.glows.includes('你分清了两个物体'))

  const oneWrong = gradeQuiz(lesson, [{ index: 0, choice: 1 }, { index: 1, choice: 1 }])
  assert.equal(oneWrong.score, 50)
  assert.equal(oneWrong.results[0].correct, false)
  assert.ok(oneWrong.feedback.grows.some((line) => line.includes('第 1 题')))

  const empty = gradeQuiz(lesson, [])
  assert.equal(empty.score, 0)
  assert.equal(empty.unanswered, 2)
  assert.ok(empty.feedback.grows.some((line) => line.includes('未作答')))
})

test('both seed lessons validate and carry their measurements', () => {
  for (const [name, raw] of [['zh', DEMO_ZH], ['en', DEMO_EN]]) {
    const result = validateLesson(raw)
    assert.equal(result.ok, true, `${name} demo must validate: ${JSON.stringify(result.errors)}`)
    assert.ok(result.measurement.stats.sections >= 2)
    assert.ok(result.measurement.stats.quizQuestions >= 5, `${name} demo needs a real quiz`)
    assert.ok(result.measurement.stats.personalizedBlocks >= 1)
    assert.ok(result.measurement.stats.audioTurns >= 4)
  }
  const english = validateLesson(DEMO_EN)
  assert.equal(typeof english.measurement.text.fleschKincaidGrade, 'number', 'the English demo must exercise FKG')
  assert.ok(english.measurement.coverage.ratio > 0.2)
  const chinese = validateLesson(DEMO_ZH)
  assert.equal(chinese.measurement.text.fleschKincaidGrade, null, 'the Chinese demo must not fake an FKG value')
  const demoIllus = chinese.lesson.immersion.sections[2].illustration
  assert.ok(demoIllus.dataUrl?.startsWith('data:image/svg+xml;charset=utf-8,'), 'demo inline SVG becomes a safe image dataUrl')
})

test('sanitizeSvg strips scripts and event handlers while preserving static vector diagrams', () => {
  const dirty = '<svg viewBox="0 0 100 100" onload="alert(1)"><script>alert(2)</script><circle cx="50" cy="50" r="20" onclick="evil()"/></svg>'
  const clean = sanitizeSvg(dirty)
  assert.ok(clean.includes('<circle'))
  assert.ok(clean.includes('xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(!clean.includes('<script') && !clean.includes('onload') && !clean.includes('onclick'))
  assert.equal(sanitizeSvg('<div>not svg</div>'), '')
})
