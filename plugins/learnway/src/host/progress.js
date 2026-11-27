/**
 * Durable learner progress & spaced repetition store.
 *
 * Implements first-principles learning telemetry per lesson:
 * - Confidence × Accuracy 2×2 metacognitive quadrants:
 *     mastered      (correct + high confidence)
 *     fragile       (correct + low confidence — lucky guess)
 *     misconception (wrong   + high confidence — hypercorrection priority)
 *     gap           (wrong   + low confidence — knowledge gap)
 * - Leitner spaced repetition schedule (boxes 0–4: 0d / 1d / 3d / 7d / 14d).
 * - Persistent Feynman self-explanation reflections per question.
 *
 * Stored under `<dataDir>/progress/<lessonId>.json`, decoupled from lesson JSON.
 *
 * @module host/progress
 */

import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Review intervals in days for Leitner boxes 0..4. */
export const LEITNER_DAYS = [0, 1, 3, 7, 14]

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_ATTEMPTS = 20

/**
 * Classify one graded answer into the 2×2 Confidence × Accuracy quadrant.
 *
 * @param {boolean} correct
 * @param {'high' | 'low'} [confidence]
 * @returns {'mastered' | 'fragile' | 'misconception' | 'gap'}
 */
export function classifyOutcome(correct, confidence = 'high') {
  const high = confidence !== 'low'
  if (correct) return high ? 'mastered' : 'fragile'
  return high ? 'misconception' : 'gap'
}

/**
 * Compute the next Leitner box and review timestamp.
 *
 * @param {number} prevBox
 * @param {'mastered' | 'fragile' | 'misconception' | 'gap'} quadrant
 * @param {number} [nowMs]
 * @returns {{ box: number, intervalDays: number, nextReviewAt: string }}
 */
export function nextSchedule(prevBox, quadrant, nowMs = Date.now()) {
  const current = Number.isFinite(Number(prevBox)) ? Math.max(0, Math.min(4, Math.round(Number(prevBox)))) : 0
  let box = current
  if (quadrant === 'mastered') box = Math.min(4, current + 1)
  else if (quadrant === 'fragile') box = Math.min(1, Math.max(0, current))
  else box = 0
  const intervalDays = LEITNER_DAYS[box] ?? 0
  return {
    box,
    intervalDays,
    nextReviewAt: new Date(nowMs + intervalDays * DAY_MS).toISOString(),
  }
}

/** Build a fresh empty progress record for a lesson. */
function emptyProgress(lessonId) {
  return {
    lessonId: String(lessonId),
    updatedAt: null,
    attempts: [],
    items: {},
  }
}

/**
 * Compute compact mastery summary from a progress record and question count.
 *
 * @param {object | null} record
 * @param {number} totalQuestions
 * @param {number} [nowMs]
 */
export function summarizeProgress(record, totalQuestions, nowMs = Date.now()) {
  const items = record?.items ?? {}
  const attempts = Array.isArray(record?.attempts) ? record.attempts : []
  const quadrants = { mastered: 0, fragile: 0, misconception: 0, gap: 0 }
  const weakIndices = []
  const dueIndices = []

  for (let index = 0; index < totalQuestions; index += 1) {
    const entry = items[String(index)]
    if (!entry) continue
    if (entry.quadrant in quadrants) quadrants[entry.quadrant] += 1
    if (entry.quadrant !== 'mastered') weakIndices.push(index)
    if (entry.nextReviewAt && Date.parse(entry.nextReviewAt) <= nowMs) {
      dueIndices.push(index)
    }
  }

  return {
    totalQuestions,
    attemptCount: attempts.length,
    lastScore: attempts.length > 0 ? attempts[attempts.length - 1].score : null,
    bestScore: attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : null,
    quadrants,
    masteredCount: quadrants.mastered,
    weakIndices,
    dueIndices,
    recentScores: attempts.slice(-6).map((a) => ({ at: a.at, score: a.score, mode: a.mode })),
  }
}

/**
 * Create a durable per-lesson progress store.
 *
 * @param {{dir: string, log?: (message: string) => void}} options
 */
export function createProgressStore(options) {
  const dir = options.dir
  const log = options.log ?? (() => {})
  /** @type {Map<string, object>} */
  const cache = new Map()

  function fileOf(lessonId) {
    return join(dir, `${String(lessonId)}.json`)
  }

  async function readRecord(lessonId) {
    const key = String(lessonId)
    if (cache.has(key)) return cache.get(key)
    try {
      const raw = await readFile(fileOf(key), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        cache.set(key, parsed)
        return parsed
      }
    } catch {
      // Missing file is normal before the first quiz attempt.
    }
    const fresh = emptyProgress(key)
    cache.set(key, fresh)
    return fresh
  }

  async function persist(record) {
    record.updatedAt = new Date().toISOString()
    cache.set(record.lessonId, record)
    try {
      await writeFile(fileOf(record.lessonId), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    } catch (error) {
      log(`progress persist failed for ${record.lessonId}: ${error?.message ?? error}`)
      throw error
    }
    return record
  }

  return {
    dir,

    /** Read one lesson's progress record (never null). */
    async get(lessonId) {
      return readRecord(lessonId)
    },

    /**
     * Record a graded quiz or targeted drill attempt and update Leitner boxes.
     *
     * @param {string} lessonId
     * @param {object} graded - result from gradeQuiz()
     * @param {{mode?: 'full' | 'drill', nowMs?: number}} [meta]
     */
    async recordAttempt(lessonId, graded, meta = {}) {
      const nowMs = meta.nowMs ?? Date.now()
      const nowIso = new Date(nowMs).toISOString()
      const mode = meta.mode === 'drill' ? 'drill' : 'full'
      const record = await readRecord(lessonId)
      const items = { ...(record.items ?? {}) }

      for (const item of graded.results ?? []) {
        // In drill mode, skip untouched questions so we don't overwrite their box.
        if (mode === 'drill' && !item.answered) continue
        const key = String(item.index)
        const prev = items[key] ?? { box: 0, streak: 0, attempts: 0, reflection: '' }
        const quadrant = item.quadrant ?? classifyOutcome(item.correct, item.confidence)
        const schedule = nextSchedule(prev.box, quadrant, nowMs)
        items[key] = {
          index: item.index,
          quadrant,
          confidence: item.confidence ?? 'high',
          correct: item.correct === true,
          lastChoice: item.choice,
          correctIndex: item.correctIndex,
          box: schedule.box,
          intervalDays: schedule.intervalDays,
          nextReviewAt: schedule.nextReviewAt,
          streak: item.correct ? (prev.streak ?? 0) + 1 : 0,
          attempts: (prev.attempts ?? 0) + 1,
          lastAnsweredAt: nowIso,
          reflection: prev.reflection ?? '',
          ...(item.sectionId ? { sectionId: item.sectionId } : {}),
          ...(item.concept ? { concept: item.concept } : {}),
        }
      }

      const attempts = [...(record.attempts ?? []), {
        at: nowIso,
        mode,
        score: graded.score,
        correct: graded.correct,
        total: graded.total,
        quadrants: graded.quadrants,
      }].slice(-MAX_ATTEMPTS)

      const next = { ...record, attempts, items }
      return persist(next)
    },

    /** Save or update the learner's Feynman self-explanation for one question. */
    async saveReflection(lessonId, questionIndex, text) {
      const index = Math.round(Number(questionIndex))
      if (!Number.isFinite(index) || index < 0) throw Object.assign(new Error('题目序号不合法'), { code: 'invalid-index' })
      const clean = String(text ?? '').trim().slice(0, 600)
      const record = await readRecord(lessonId)
      const key = String(index)
      const prev = record.items?.[key] ?? { index, box: 0, streak: 0, attempts: 0 }
      const items = {
        ...(record.items ?? {}),
        [key]: {
          ...prev,
          index,
          reflection: clean,
          reflectedAt: new Date().toISOString(),
        },
      }
      return persist({ ...record, items })
    },

    /** Remove stored progress when a lesson is deleted. */
    async remove(lessonId) {
      const key = String(lessonId)
      cache.delete(key)
      await rm(fileOf(key), { force: true })
    },
  }
}
