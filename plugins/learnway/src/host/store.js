/**
 * Durable lesson storage.
 *
 * One JSON file per lesson under `<dataDir>/lessons`, loaded once at startup and
 * kept in memory afterwards; every mutation writes through. The store keeps the
 * validated lesson next to the measurement the validator produced, so the panel
 * can render the grade/coverage evidence without recomputing it.
 *
 * @module host/store
 */

import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Compact summary used by lists and the panel header. */
export function summarizeRecord(record) {
  const measurement = record.measurement ?? {}
  return {
    id: record.id,
    title: record.lesson?.title ?? '未命名课时',
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    grade: record.lesson?.learner?.grade ?? null,
    interest: record.lesson?.learner?.interest ?? '',
    language: record.lesson?.learner?.language ?? 'zh',
    demo: record.demo === true,
    stats: measurement.stats ?? null,
    checks: measurement.checks ?? null,
    gradeLabel: record.lesson?.source?.title ?? '',
  }
}

/**
 * Create the lesson store.
 *
 * @param {{dir: string, limit?: number, log?: (message: string) => void}} options
 */
export function createLessonStore(options) {
  const dir = options.dir
  const limit = Number(options.limit ?? 60)
  const log = options.log ?? (() => {})
  /** @type {Map<string, object>} */
  const records = new Map()
  let loaded = false

  /** Read every readable record once. */
  async function load() {
    if (loaded) return
    loaded = true
    let entries = []
    try {
      entries = await readdir(dir)
    } catch (error) {
      log(`lesson directory is not readable yet: ${error?.message ?? error}`)
      return
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = await readFile(join(dir, entry), 'utf8')
        const record = JSON.parse(raw)
        if (record && typeof record.id === 'string' && record.lesson) records.set(record.id, record)
      } catch (error) {
        log(`skipping unreadable lesson file ${entry}: ${error?.message ?? error}`)
      }
    }
  }

  /** Persist one record, replacing the file atomically enough for a single writer. */
  async function persist(record) {
    const file = join(dir, `${record.id}.json`)
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return file
  }

  /** Drop the oldest records past the retention limit. */
  async function trim() {
    const all = [...records.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    for (const record of all.slice(limit)) {
      records.delete(record.id)
      await rm(join(dir, `${record.id}.json`), { force: true })
    }
  }

  return {
    dir,

    /** All summaries, newest first. */
    async list() {
      await load()
      return [...records.values()]
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map(summarizeRecord)
    },

    /** One full record, or undefined. */
    async get(id) {
      await load()
      return records.get(String(id))
    },

    /** Number of stored lessons, loading from disk on first use. */
    async count() {
      await load()
      return records.size
    },

    /**
     * Save a validated lesson.
     *
     * @param {object} lesson
     * @param {object} measurement
     * @param {{id?: string, demo?: boolean, createdBy?: string}} [meta]
     * @returns {Promise<{record: object, file: string}>}
     */
    async save(lesson, measurement, meta = {}) {
      await load()
      const now = new Date().toISOString()
      // A caller-supplied id is honoured whether or not it already exists, so a
      // replacement keeps its identity and a pinned id stays pinned.
      const requested = meta.id ? String(meta.id) : null
      const existing = requested ? records.get(requested) : undefined
      const id = requested ?? `lw-${randomUUID().slice(0, 8)}`
      const record = {
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        demo: meta.demo === true ? true : (existing?.demo ?? false),
        createdBy: meta.createdBy ?? existing?.createdBy ?? 'agent',
        lesson,
        measurement,
      }
      records.set(id, record)
      const file = await persist(record)
      await trim()
      return { record, file }
    },

    /** Remove one lesson; returns true when something was removed. */
    async remove(id) {
      await load()
      const existed = records.delete(String(id))
      if (existed) await rm(join(dir, `${String(id)}.json`), { force: true })
      return existed
    },

    /** Persist an already-built record without re-deriving ids (used by demo seeding). */
    async seed(record) {
      await load()
      if (records.has(record.id)) return records.get(record.id)
      records.set(record.id, record)
      await persist(record)
      return record
    },
  }
}
