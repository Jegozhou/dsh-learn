/**
 * Durable cross-lesson learner profile.
 *
 * Implements the persistent Learner Model behind 1-on-1 personalised tutoring:
 * remembers grade, interest anchors, preferred explanation style, learning goal,
 * and recurring misconceptions discovered across quizzes and reflections.
 *
 * Stored at `<dataDir>/profile.json`.
 *
 * @module host/profile
 */

import { readFile, writeFile } from 'node:fs/promises'

/** Supported tutoring explanation styles. */
export const TUTOR_STYLES = ['analogy', 'rigorous', 'socratic', 'practical']

const MAX_INTERESTS = 10
const MAX_MISCONCEPTIONS = 12

/** Default profile before the learner customises anything. */
export function defaultProfile() {
  return {
    grade: 8,
    stage: '',
    interests: ['篮球'],
    style: 'analogy',
    goal: '',
    customInstructions: '',
    misconceptions: [],
    updatedAt: null,
  }
}

/** Normalise a list of non-empty trimmed strings, deduplicated. */
function cleanList(value, limit) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、;\n]+/u)
      : []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const clean = String(item ?? '').trim().slice(0, 120)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= limit) break
  }
  return out
}

/** Normalise a full or partial profile object. */
export function normalizeProfile(raw, base = defaultProfile()) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const gradeNum = input.grade === undefined ? base.grade : Number(input.grade)
  const grade = Number.isFinite(gradeNum) && gradeNum >= 1 && gradeNum <= 20 ? Math.round(gradeNum) : base.grade
  const stage = input.stage === undefined ? (base.stage ?? '') : String(input.stage ?? '').trim().slice(0, 60)
  const interests = input.interests === undefined ? base.interests : cleanList(input.interests, MAX_INTERESTS)
  const style = TUTOR_STYLES.includes(String(input.style ?? '')) ? String(input.style) : base.style
  const goal = input.goal === undefined ? base.goal : String(input.goal ?? '').trim().slice(0, 240)
  const customInstructions = input.customInstructions === undefined
    ? (base.customInstructions ?? '')
    : String(input.customInstructions ?? '').trim().slice(0, 1200)
  const misconceptions = input.misconceptions === undefined
    ? base.misconceptions
    : cleanList(input.misconceptions, MAX_MISCONCEPTIONS)
  return {
    grade,
    stage,
    interests,
    style,
    goal,
    customInstructions,
    misconceptions,
    updatedAt: input.updatedAt ?? base.updatedAt ?? null,
  }
}

/**
 * Create a durable learner profile store.
 *
 * @param {{file: string, log?: (message: string) => void}} options
 */
export function createProfileStore(options) {
  const file = options.file
  const log = options.log ?? (() => {})
  let cached = null

  async function load() {
    if (cached) return cached
    try {
      const raw = await readFile(file, 'utf8')
      cached = normalizeProfile(JSON.parse(raw))
      return cached
    } catch {
      cached = defaultProfile()
      return cached
    }
  }

  async function persist(profile) {
    profile.updatedAt = new Date().toISOString()
    cached = profile
    try {
      await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
    } catch (error) {
      log(`profile persist failed: ${error?.message ?? error}`)
      throw error
    }
    return profile
  }

  return {
    file,

    /** Read the current learner profile. */
    async get() {
      return load()
    },

    /** Merge and persist learner profile updates. */
    async update(patch = {}) {
      const current = await load()
      const next = normalizeProfile(patch, current)
      return persist(next)
    },

    /** Record a newly surfaced misconception (deduplicated, newest first). */
    async recordMisconception(note) {
      const clean = String(note ?? '').trim().slice(0, 140)
      if (!clean) return load()
      const current = await load()
      const merged = [clean, ...(current.misconceptions ?? []).filter((item) => item !== clean)].slice(0, MAX_MISCONCEPTIONS)
      return persist({ ...current, misconceptions: merged })
    },
  }
}
