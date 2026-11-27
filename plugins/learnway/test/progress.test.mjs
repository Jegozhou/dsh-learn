import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LEITNER_DAYS, classifyOutcome, createProgressStore, nextSchedule, summarizeProgress } from '../src/host/progress.js'
import { createLearnwayService } from '../src/host/service.js'
import { DEMO_EN, DEMO_ZH } from '../src/host/demo.js'

test('classifyOutcome maps Accuracy × Confidence into 4 quadrants', () => {
  assert.equal(classifyOutcome(true, 'high'), 'mastered')
  assert.equal(classifyOutcome(true, 'low'), 'fragile')
  assert.equal(classifyOutcome(false, 'high'), 'misconception')
  assert.equal(classifyOutcome(false, 'low'), 'gap')
})

test('nextSchedule promotes mastered items and resets wrong items to box 0', () => {
  const now = Date.UTC(2026, 10, 27, 12, 0, 0)
  const promoted = nextSchedule(0, 'mastered', now)
  assert.equal(promoted.box, 1)
  assert.equal(promoted.intervalDays, LEITNER_DAYS[1])

  const capped = nextSchedule(4, 'mastered', now)
  assert.equal(capped.box, 4)
  assert.equal(capped.intervalDays, 14)

  const fragile = nextSchedule(3, 'fragile', now)
  assert.equal(fragile.box, 1)

  const reset = nextSchedule(3, 'misconception', now)
  assert.equal(reset.box, 0)
  assert.equal(reset.intervalDays, 0)
})

test('progress store persists attempts, targeted drills, and Feynman reflections', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'learnway-progress-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const service = createLearnwayService({ config: { dataDir: dir, seedDemoLessons: 0 }, log: () => {} })
  await service.ready()
  const saved = await service.save(DEMO_ZH, { id: 'lw-p1' })
  assert.equal(saved.ok, true)

  // First full attempt: Q0 mastered, Q1 fragile, Q2 misconception, Q3 gap
  const first = await service.grade('lw-p1', [
    { index: 0, choice: 1, confidence: 'high' },
    { index: 1, choice: 2, confidence: 'low' },
    { index: 2, choice: 0, confidence: 'high' },
    { index: 3, choice: 0, confidence: 'low' },
  ], { mode: 'full' })
  assert.equal(first.quadrants.mastered, 1)
  assert.equal(first.quadrants.fragile, 1)
  assert.equal(first.quadrants.misconception, 1)
  assert.ok(first.quadrants.gap >= 1)
  assert.equal(first.progress.items['0'].box, 1)
  assert.equal(first.progress.items['2'].box, 0)
  assert.ok(first.feedback.grows.some((line) => line.includes('高危误解')))
  assert.ok(first.feedback.grows.some((line) => line.includes('蒙对')))

  // Save a Feynman reflection on Q2
  const reflected = await service.saveReflection('lw-p1', 2, '人向上跳是因为地面给脚的反作用力，作用在人身上。')
  assert.equal(reflected.items['2'].reflection, '人向上跳是因为地面给脚的反作用力，作用在人身上。')

  // Targeted drill on Q2 only — must promote Q2 without wiping Q0's mastered state
  const drill = await service.grade('lw-p1', [
    { index: 2, choice: 1, confidence: 'high' },
  ], { mode: 'drill' })
  assert.equal(drill.mode, 'drill')
  assert.equal(drill.progress.items['0'].quadrant, 'mastered')
  assert.equal(drill.progress.items['2'].quadrant, 'mastered')
  assert.equal(drill.progress.items['2'].box, 1)
  assert.equal(drill.progress.items['2'].reflection, '人向上跳是因为地面给脚的反作用力，作用在人身上。')
  assert.equal(drill.progress.summary.masteredCount, 2)

  // Fresh store instance reads persisted JSON from disk
  const freshStore = createProgressStore({ dir: join(dir, 'progress'), log: () => {} })
  const persisted = await freshStore.get('lw-p1')
  const summary = summarizeProgress(persisted, DEMO_ZH.quiz.questions.length)
  assert.equal(summary.attemptCount, 2)
  assert.equal(summary.masteredCount, 2)
  assert.equal(persisted.items['2'].reflection, '人向上跳是因为地面给脚的反作用力，作用在人身上。')
})

test('reviewQueue interleaves weak and due items across multiple lessons by priority', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'learnway-queue-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const service = createLearnwayService({ config: { dataDir: dir, seedDemoLessons: 0 }, log: () => {} })
  await service.ready()
  await service.save(DEMO_ZH, { id: 'lw-zh' })
  await service.save(DEMO_EN, { id: 'lw-en' })

  // Create misconceptions in both lessons
  await service.grade('lw-zh', [
    { index: 0, choice: 0, confidence: 'high' }, // misconception
    { index: 1, choice: 0, confidence: 'high' }, // misconception
    { index: 2, choice: 1, confidence: 'high' }, // mastered
  ])
  await service.grade('lw-en', [
    { index: 0, choice: 0, confidence: 'high' }, // misconception
    { index: 1, choice: 2, confidence: 'low' }, // fragile
  ])

  const queue = await service.reviewQueue()
  assert.ok(queue.totalDue >= 4)
  assert.equal(queue.byQuadrant.misconception, 3)
  // First two items must both be misconceptions AND come from two different lessons (interleaved!)
  assert.equal(queue.items[0].quadrant, 'misconception')
  assert.equal(queue.items[1].quadrant, 'misconception')
  assert.notEqual(queue.items[0].lessonId, queue.items[1].lessonId, 'misconceptions should interleave across lessons')
})

test('evaluateAudioReply branches on aligned answers, misconceptions, partial answers, and quick choices', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'learnway-audio-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const service = createLearnwayService({ config: { dataDir: dir, seedDemoLessons: 0 }, log: () => {} })
  await service.ready()
  await service.save(DEMO_ZH, { id: 'lw-audio' })

  // Turn 0 misconception free-text -> does not advance, gives Socratic counter-question
  const misc = await service.evaluateAudioReply('lw-audio', { turnIndex: 0, answer: '我觉得只有手在用力，球不动' })
  assert.equal(misc.ok, true)
  assert.equal(misc.verdict, 'misconception')
  assert.equal(misc.advance, false)
  assert.ok(misc.teacherReply.includes('手掌'))

  // Turn 0 aligned free-text -> advances to next step
  const aligned = await service.evaluateAudioReply('lw-audio', { turnIndex: 0, answer: '手压球的时候球也会同时顶回来' })
  assert.equal(aligned.ok, true)
  assert.equal(aligned.verdict, 'aligned')
  assert.equal(aligned.advance, true)

  // Turn 2 quick-choice misconception -> does not advance
  const choiceMisc = await service.evaluateAudioReply('lw-audio', { turnIndex: 2, choiceIndex: 1 })
  assert.equal(choiceMisc.verdict, 'misconception')
  assert.equal(choiceMisc.advance, false)

  // Turn 2 quick-choice aligned -> advances
  const choiceOk = await service.evaluateAudioReply('lw-audio', { turnIndex: 2, choiceIndex: 0 })
  assert.equal(choiceOk.verdict, 'aligned')
  assert.equal(choiceOk.advance, true)
})

test('evaluateAudioReply uses live host ctx.llm streaming when available', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'learnway-llm-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  let capturedOptions = null
  const mockLlm = {
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* (opts) {
        capturedOptions = opts
        yield { type: 'text-delta', index: 0, text: '{"verdict":"aligned","advance":true,' }
        yield { type: 'text-delta', index: 0, text: '"teacherReply":"在太空失重环境下，牛顿第三定律依然成立，你推飞船，飞船也会同样把你推开！"}' }
      },
    }),
  }
  const service = createLearnwayService({
    config: { dataDir: dir, seedDemoLessons: 0 },
    log: () => {},
    llmOf: () => mockLlm,
    defaultModelOf: () => ({ currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) }),
  })
  await service.ready()
  await service.save(DEMO_ZH, { id: 'lw-live' })

  const res = await service.evaluateAudioReply('lw-live', {
    turnIndex: 0,
    answer: '那在太空失重环境下，这个规律还成立吗？',
    history: [{ role: 'teacher', text: '你运球的时候发生了什么？' }],
  })
  assert.equal(res.ok, true)
  assert.equal(res.source, 'llm')
  assert.equal(res.model, 'deepseek-chat')
  assert.equal(res.verdict, 'aligned')
  assert.equal(res.advance, true)
  assert.ok(res.teacherReply.includes('太空失重'))
  assert.equal(capturedOptions.sessionId, 'learnway-audio-lw-live')
  assert.ok(capturedOptions.messages[0].content[0].text.includes('太空失重'))
})

test('profile persistence, AI Feynman grading, live variant generation, and paragraph re-explain work end-to-end', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'learnway-tutor-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  let modeCounter = 0
  const mockLlm = {
    prepareCall: async (cfg, _signal, configure) => {
      const resolved = configure ? { ...cfg, ...configure({ maxTokens: cfg.maxTokens }, { reasoningEfforts: ['off', 'high'] }) } : cfg
      return {
        config: resolved,
        stream: async function* (opts) {
          modeCounter += 1
          assert.ok(typeof opts.sessionId === 'string' && opts.sessionId.length > 0, 'every live LLM call must pass sessionId')
          if (opts.sessionId.includes('feynman')) {
            yield { type: 'text-delta', index: 0, text: JSON.stringify({ verdict: 'misconception', praise: '你提到了两个力', gap: '作用在不同物体上不能抵消', followUp: '如果一个力在球上、一个力在手上，能相加吗？', misconceptionTag: '误以为作用力与反作用力可抵消' }) }
          } else if (opts.sessionId.includes('variant')) {
            yield { type: 'text-delta', index: 0, text: JSON.stringify({ scenarioTag: '滑板场景', stem: '小明站在滑板上用力向前推墙，结果小明向后滑去。这是因为？', choices: ['墙对小明施加了向后的反作用力', '小明推墙的力大于墙推小明的力', '两个力互相抵消了', '滑板没有重力'], answerIndex: 0, rationale: '推墙时墙同时给小明等大反向的力，作用在小明身上使其向后加速。' }) }
          } else {
            yield { type: 'text-delta', index: 0, text: '打篮球传球时，你推球出去，球同一瞬间也把你往后推了一点，这就是力的相互性。' }
          }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }

  const service = createLearnwayService({
    config: { dataDir: dir, seedDemoLessons: 0 },
    log: () => {},
    llmOf: () => mockLlm,
    defaultModelOf: () => ({ currentSelection: () => ({ provider: 'opencode', model: 'deepseek-chat' }) }),
  })
  await service.ready()
  await service.save(DEMO_ZH, { id: 'lw-tutor' })

  const updatedProfile = await service.updateProfile({
    grade: 9,
    stage: '考研工科',
    interests: ['滑板', '编程'],
    style: 'socratic',
    customInstructions: '严禁客套，先给第一性原理再推导。',
  })
  assert.equal(updatedProfile.grade, 9)
  assert.equal(updatedProfile.stage, '考研工科')
  assert.equal(updatedProfile.customInstructions, '严禁客套，先给第一性原理再推导。')
  assert.deepEqual(updatedProfile.interests, ['滑板', '编程'])
  assert.equal(updatedProfile.style, 'socratic')

  // Quiz high-confidence misconception auto-precipitates into profile
  await service.grade('lw-tutor', [{ index: 0, choice: 0, confidence: 'high' }])
  const afterQuizProfile = await service.getProfile()
  assert.ok(afterQuizProfile.misconceptions.some((m) => m.includes('作用力与反作用力')))

  // AI Feynman grading + automatic misconception memory into profile
  const gradedRef = await service.evaluateReflection('lw-tutor', 0, '我觉得两个力大小一样所以会互相抵消')
  assert.equal(gradedRef.evaluation.source, 'llm')
  assert.equal(gradedRef.evaluation.verdict, 'misconception')
  assert.ok(gradedRef.evaluation.gap.includes('不能抵消'))
  const afterProfile = await service.getProfile()
  assert.ok(afterProfile.misconceptions.includes('误以为作用力与反作用力可抵消'))

  // Live transfer variant generation
  const variant = await service.generateVariantQuestion('lw-tutor', 0)
  assert.equal(variant.ok, true)
  assert.equal(variant.source, 'llm')
  assert.equal(variant.question.scenarioTag, '滑板场景')
  assert.equal(variant.question.choices.length, 4)

  // Live paragraph re-explain
  const reex = await service.reexplainBlock('lw-tutor', { text: '两个物体相互作用时力成对出现。', mode: 'analogy' })
  assert.equal(reex.ok, true)
  assert.equal(reex.source, 'llm')
  assert.ok(reex.explanation.includes('传球'))
  assert.equal(modeCounter, 3)
})
