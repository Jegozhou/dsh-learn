/**
 * Learn Your Way service.
 *
 * One object owns the pipeline the paper describes:
 *
 *   1. personalise   — measure the rewrite against the learner's grade band
 *                      (`readability.js`), report coverage against the source;
 *   2. transform     — hold the multi-view lesson the views are generated from;
 *   3. assess        — grade the section quiz and produce Glows/Grows.
 *
 * The agent tools and the browser panel are both thin adapters over this object,
 * so a lesson saved from chat and a lesson read from the panel can never disagree.
 *
 * @module host/service
 */

import { join } from 'node:path'
import { ensurePaths, resolvePaths } from './paths.js'
import { createLessonStore } from './store.js'
import { createProgressStore, summarizeProgress } from './progress.js'
import { createProfileStore } from './profile.js'
import { analyzeText, compareToGrade, coverage } from './readability.js'
import { gradeQuiz, validateLesson } from './lesson.js'
import { deckStats, exportDeck as writeDeck } from './deck.js'
import { API_PREFIX } from './api.js'
import { DEMO_EN, DEMO_ZH } from './demo.js'

/** Fixed ids so re-seeding never duplicates the demos. */
const DEMO_IDS = { zh: 'lw-demo-zh', en: 'lw-demo-en' }

/**
 * Create the service.
 *
 * @param {{config?: object, log?: (message: string) => void}} [options]
 */
export function createLearnwayService(options = {}) {
  const config = options.config ?? {}
  const log = options.log ?? (() => {})
  const llmOf = typeof options.llmOf === 'function' ? options.llmOf : () => undefined
  const defaultModelOf = typeof options.defaultModelOf === 'function' ? options.defaultModelOf : () => undefined
  const paths = resolvePaths(config)
  const store = createLessonStore({ dir: paths.lessonsDir, limit: Number(config.keepLessons ?? 60), log })
  const progress = createProgressStore({ dir: paths.progressDir, log })
  const profile = createProfileStore({ file: join(paths.dataDir, 'profile.json'), log })
  const gradeTolerance = Number(config.gradeTolerance ?? 1)

  const STYLE_DESC = {
    analogy: '直觉类比型（优先用贴近学习者兴趣的生活类比讲清概念）',
    rigorous: '公式本质型（重视定义严谨、逻辑推导与定量关系）',
    socratic: '苏格拉底追问型（多反问引导自己发现结论，少直接灌输）',
    practical: '案例实战型（优先给典型应用场景与解题拆解）',
  }

  /**
   * Shared live LLM runner backed by DeepSeek Harness `ctx.llm`.
   * Always supplies `sessionId` and disables deep reasoning when supported so
   * short tutoring turns stay fast and never starve `text-delta`.
   */
  async function runLiveLlm({ system, prompt, sessionId, maxTokens = 1500, timeoutMs = 25_000 }) {
    const llm = llmOf()
    const defaultModel = defaultModelOf()
    if (!llm || typeof llm.prepareCall !== 'function') return { ok: false, reason: 'ctx.llm 不可用' }
    if (!defaultModel || typeof defaultModel.currentSelection !== 'function') return { ok: false, reason: 'ctx.agentDefaultModel 不可用' }
    let sel
    try {
      sel = defaultModel.currentSelection()
    } catch (error) {
      return { ok: false, reason: String(error?.message ?? error).slice(0, 120) }
    }
    if (!sel?.provider || !sel?.model) return { ok: false, reason: '未配置默认模型' }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const call = await llm.prepareCall(
        { provider: sel.provider, model: sel.model, maxTokens },
        controller.signal,
        (controls, modelInfo) => {
          const supported = modelInfo?.reasoningEfforts ?? modelInfo?.reasoning?.efforts
          const canOff = !Array.isArray(supported) || supported.includes('off')
          return { ...controls, ...(canOff ? { reasoningEffort: 'off' } : {}) }
        },
      )
      let rawText = ''
      let streamError = ''
      for await (const chunk of call.stream({
        ...call.config,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        sessionId: String(sessionId || 'learnway-tutor'),
        signal: controller.signal,
      })) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') rawText += chunk.text
        else if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
          streamError = chunk.reason?.failure?.message || chunk.reason?.failure?.code || 'stream error'
        }
      }
      if (streamError && !rawText.trim()) {
        log(`live llm stream error (${sessionId}): ${streamError}`)
        return { ok: false, reason: `模型流报错: ${streamError}` }
      }
      const text = rawText.trim()
      if (!text) return { ok: false, reason: '模型返回空文本' }
      return { ok: true, text, model: sel.model, provider: sel.provider }
    } catch (error) {
      const msg = String(error?.message ?? error).slice(0, 140)
      log(`live llm call failed (${sessionId}): ${msg}`)
      return { ok: false, reason: msg }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Build a compact profile directive injected into every live AI tutor system prompt. */
  function formatProfileDirective(learnerProfile) {
    const lines = []
    const stageText = learnerProfile.stage ? `${learnerProfile.stage}（参考年级 ${learnerProfile.grade}）` : `${learnerProfile.grade} 年级`
    lines.push(`学习者画像：${stageText}；兴趣：${learnerProfile.interests.join('、') || '生活案例'}；偏好风格：${STYLE_DESC[learnerProfile.style] ?? STYLE_DESC.analogy}。`)
    if (learnerProfile.goal) lines.push(`当前学习目标：${learnerProfile.goal}。`)
    if (learnerProfile.misconceptions?.length > 0) lines.push(`历史高频误区（优先帮其避坑）：${learnerProfile.misconceptions.slice(0, 5).join('；')}。`)
    if (learnerProfile.customInstructions) lines.push(`【学习者自定义导师指令（最高优先级遵守）】：${learnerProfile.customInstructions}`)
    return lines.join('\n')
  }

  /** Parse a JSON object out of a model reply (tolerating fenced code blocks). */
  function extractJson(text) {
    const trimmed = String(text ?? '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
    const match = /\{[\s\S]*\}/u.exec(trimmed)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }

  /** One initialisation per process, shared by every caller. */
  let readyPromise = null
  /**
   * Browser check-ins. The client half posts once when it activates and once
   * when the panel first renders, which is the only way the Host can tell
   * "the module never loaded" apart from "the panel is open but empty".
   */
  const pings = []

  /** Create directories and seed the demos on an empty store. */
  async function initialise() {
    await ensurePaths(paths)
    if (Number(config.seedDemoLessons ?? 1) === 0) return
    if ((await store.count()) > 0) return
    const seeds = [
      [DEMO_IDS.zh, DEMO_ZH],
      [DEMO_IDS.en, DEMO_EN],
    ]
    for (const [id, raw] of seeds) {
      const result = validateLesson(raw)
      if (!result.ok) {
        log(`demo lesson ${id} failed validation: ${result.errors.map((error) => error.message).join('; ')}`)
        continue
      }
      await store.seed({
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        demo: true,
        createdBy: 'seed',
        lesson: result.lesson,
        measurement: result.measurement,
      })
    }
    log(`seeded ${await store.count()} demo lesson(s) in ${paths.dataDir}`)
  }

  /** Await initialisation once. */
  function ready() {
    if (!readyPromise) readyPromise = initialise().catch((error) => {
      log(`initialisation failed: ${error?.stack ?? error}`)
      throw error
    })
    return readyPromise
  }

  return {
    paths,

    ready,

    /**
     * Measure one text and compare it against a target grade.
     *
     * @param {{text: string, targetGrade?: number, tolerance?: number}} input
     */
    async measure(input) {
      const analysis = analyzeText(input.text)
      const target = Number(input.targetGrade)
      const verdict = Number.isFinite(target)
        ? compareToGrade(analysis, target, Number.isFinite(Number(input.tolerance)) ? Number(input.tolerance) : gradeTolerance)
        : null
      return { text: analysis, ...(verdict ? { grade: verdict } : {}) }
    },

    /**
     * Validate and store a lesson.
     *
     * @param {unknown} raw - the lesson as the agent wrote it
     * @param {{id?: string, createdBy?: string}} [meta]
     */
    async save(raw, meta = {}) {
      await ready()
      const result = validateLesson(raw)
      if (!result.ok) {
        return { ok: false, errors: result.errors, diagnostics: result.diagnostics, measurement: result.measurement }
      }
      const { record, file } = await store.save(result.lesson, result.measurement, {
        id: meta.id,
        createdBy: meta.createdBy ?? 'agent',
      })
      return {
        ok: true,
        errors: [],
        id: record.id,
        file,
        title: record.lesson.title,
        lesson: record.lesson,
        diagnostics: result.diagnostics,
        measurement: result.measurement,
        panel: { lessonId: record.id, tab: 'immersive' },
      }
    },

    /** Lesson summaries, newest first, enriched with lightweight mastery stats. */
    async list() {
      await ready()
      const items = await store.list()
      return Promise.all(items.map(async (item) => {
        const record = await progress.get(item.id)
        const totalQuestions = item.stats?.quizQuestions ?? 0
        const summary = summarizeProgress(record, totalQuestions)
        return { ...item, mastery: summary.attemptCount > 0 ? summary : null }
      }))
    },

    /** One stored lesson plus its measurement and durable learning progress. */
    async get(id) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const progressRecord = await progress.get(id)
      const totalQuestions = record.lesson?.quiz?.questions?.length ?? 0
      return {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        demo: record.demo === true,
        lesson: record.lesson,
        measurement: record.measurement,
        progress: {
          ...progressRecord,
          summary: summarizeProgress(progressRecord, totalQuestions),
        },
      }
    },

    /** Remove one lesson and its progress file. */
    async remove(id) {
      await ready()
      const removed = await store.remove(id)
      if (removed) await progress.remove(id)
      return removed
    },

    /**
     * Grade a quiz or targeted drill submission and persist progress.
     *
     * @param {string} id
     * @param {Array<{index: number, choice: number, confidence?: 'high' | 'low'}>} answers
     * @param {{mode?: 'full' | 'drill'}} [options]
     */
    async grade(id, answers, options = {}) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const graded = gradeQuiz(record.lesson, answers)
      const updated = await progress.recordAttempt(id, graded, { mode: options.mode })
      // Auto-precipitate high-confidence wrong answers (misconceptions) into persistent profile
      for (const item of graded.results ?? []) {
        if (item.quadrant === 'misconception' && item.answered) {
          const label = item.concept
            ? `${item.concept}（高危误解）`
            : `${record.lesson.title}·第${item.index + 1}题误区`
          await profile.recordMisconception(label)
        }
      }
      const totalQuestions = record.lesson?.quiz?.questions?.length ?? 0
      return {
        ...graded,
        mode: options.mode === 'drill' ? 'drill' : 'full',
        progress: {
          ...updated,
          summary: summarizeProgress(updated, totalQuestions),
        },
      }
    },

    /** Read durable learning progress for one lesson. */
    async getProgress(id) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const progressRecord = await progress.get(id)
      const totalQuestions = record.lesson?.quiz?.questions?.length ?? 0
      return {
        id: record.id,
        title: record.lesson.title,
        ...progressRecord,
        summary: summarizeProgress(progressRecord, totalQuestions),
      }
    },

    /** Read the persistent cross-lesson learner profile. */
    async getProfile() {
      await ready()
      return profile.get()
    },

    /** Update the persistent cross-lesson learner profile. */
    async updateProfile(patch) {
      await ready()
      return profile.update(patch)
    },

    /**
     * Save the learner's Feynman self-explanation AND evaluate it live with the
     * host LLM, surfacing strengths, logic gaps, and a targeted follow-up.
     */
    async evaluateReflection(id, questionIndex, text) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const idx = Math.round(Number(questionIndex))
      const question = record.lesson?.quiz?.questions?.[idx]
      if (!question) return null

      const updated = await progress.saveReflection(id, idx, text)
      const totalQuestions = record.lesson?.quiz?.questions?.length ?? 0
      const clean = String(text ?? '').trim()
      const learnerProfile = await profile.get()
      const lang = record.lesson?.learner?.language === 'en' ? 'en' : 'zh'

      if (!clean) {
        return {
          id: record.id,
          ...updated,
          summary: summarizeProgress(updated, totalQuestions),
          evaluation: null,
        }
      }

      const profileDirective = formatProfileDirective(learnerProfile)
      const system = lang === 'en'
        ? `You are a 1-on-1 Socratic tutor evaluating a learner's Feynman self-explanation.\n${profileDirective}\n`
          + `Return ONLY valid JSON: {"verdict":"solid"|"partial"|"misconception","praise":"...","gap":"...","followUp":"...","misconceptionTag":""}.`
        : `你是一位 1 对 1 个性化学习导师，正在批改学生写的费曼自我解释。\n${profileDirective}\n`
          + `请精准指出：① 哪部分说透了（praise）；② 还遗漏或隐含了什么逻辑漏洞（gap，若完全准确可留空）；③ 一句启发追问或巩固建议（followUp）；④ 若暴露明显思维误区，用 15 字以内概括到 misconceptionTag（否则留空）。`
          + `只输出合法 JSON，不要 markdown：{"verdict":"solid"|"partial"|"misconception","praise":"...","gap":"...","followUp":"...","misconceptionTag":""}`

      const prompt = [
        `课时：《${record.lesson.title}》`,
        `题干：${question.stem}`,
        `正确答案：${question.choices?.[question.answerIndex] ?? ''}`,
        question.rationale ? `标准解析：${question.rationale}` : '',
        `学生的费曼自我解释：${clean}`,
      ].filter(Boolean).join('\n')

      const llmRes = await runLiveLlm({ system, prompt, sessionId: `learnway-feynman-${id}-${idx}`, maxTokens: 900 })
      let evaluation
      if (llmRes.ok) {
        const parsed = extractJson(llmRes.text)
        if (parsed && (parsed.praise || parsed.gap || parsed.followUp)) {
          const verdict = ['solid', 'partial', 'misconception'].includes(parsed.verdict) ? parsed.verdict : 'partial'
          const tag = String(parsed.misconceptionTag ?? '').trim()
          if (verdict === 'misconception' && tag) {
            await profile.recordMisconception(tag)
          }
          evaluation = {
            source: 'llm',
            model: llmRes.model,
            verdict,
            praise: String(parsed.praise ?? '').trim(),
            gap: String(parsed.gap ?? '').trim(),
            followUp: String(parsed.followUp ?? '').trim(),
            ...(tag ? { misconceptionTag: tag } : {}),
          }
        }
      }

      if (!evaluation) {
        const keyTerms = [question.concept, ...(record.lesson?.audioLesson?.keyConcepts ?? [])].filter(Boolean)
        const hit = keyTerms.filter((term) => clean.toLowerCase().includes(String(term).toLowerCase()))
        evaluation = {
          source: 'offline',
          ...(llmRes.reason ? { fallbackReason: llmRes.reason } : {}),
          verdict: hit.length > 0 && clean.length >= 12 ? 'solid' : 'partial',
          praise: hit.length > 0
            ? `你主动用到了核心概念「${hit.join('、')}」，这说明因果链条已经开始建立。`
            : '你已经迈出了用自己的话复述的第一步。',
          gap: hit.length === 0 && question.concept
            ? `试着把核心概念「${question.concept}」明确融进你的解释里，并与标准解析对照一下关键条件。`
            : '',
          followUp: '试着合上解析，换一个你喜欢的日常场景再讲一遍这个原理！',
        }
      }

      return {
        id: record.id,
        ...updated,
        summary: summarizeProgress(updated, totalQuestions),
        evaluation,
      }
    },

    /**
     * Generate a brand-new transfer variant MCQ for a missed/fragile question,
     * tailored to the learner's persistent interest profile.
     */
    async generateVariantQuestion(id, questionIndex) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const idx = Math.round(Number(questionIndex))
      const original = record.lesson?.quiz?.questions?.[idx]
      if (!original) return null

      const learnerProfile = await profile.get()
      const lang = record.lesson?.learner?.language === 'en' ? 'en' : 'zh'
      const interests = learnerProfile.interests.length > 0
        ? learnerProfile.interests.join('、')
        : (record.lesson?.learner?.interest || '日常生活')

      const profileDirective = formatProfileDirective(learnerProfile)
      const system = lang === 'en'
        ? `You are a 1-on-1 tutor creating a brand-new transfer multiple-choice question testing the EXACT same concept in a fresh scenario.\n${profileDirective}\n`
          + `Do NOT copy the original stem. Return ONLY valid JSON: {"scenarioTag":"...","stem":"...","choices":["A","B","C","D"],"answerIndex":0,"rationale":"..."}.`
        : `你是一位 1 对 1 个性化导师。请围绕原题考查的【同一个核心概念】，结合下方学习者画像与自定义指令，现编一道【全新情境】的四选一迁移变式题。\n${profileDirective}\n`
          + `严格要求：4 个选项里只有一个正确答案，干扰项要针对常见误解；不要照抄原题题干。`
          + `只输出合法 JSON，不要 markdown：{"scenarioTag":"情境标签","stem":"新题干","choices":["选项1","选项2","选项3","选项4"],"answerIndex":0,"rationale":"简明解析"}`

      const prompt = [
        `课时：《${record.lesson.title}》`,
        original.concept ? `核心概念：${original.concept}` : '',
        `原题题干：${original.stem}`,
        `原题正确答案：${original.choices?.[original.answerIndex] ?? ''}`,
        original.rationale ? `原题解析：${original.rationale}` : '',
        learnerProfile.misconceptions.length > 0 ? `学生历史易错点：${learnerProfile.misconceptions.slice(0, 4).join('；')}` : '',
      ].filter(Boolean).join('\n')

      const llmRes = await runLiveLlm({ system, prompt, sessionId: `learnway-variant-${id}-${idx}`, maxTokens: 1200 })
      if (llmRes.ok) {
        const parsed = extractJson(llmRes.text)
        const choices = Array.isArray(parsed?.choices) ? parsed.choices.map((c) => String(c ?? '').trim()).filter(Boolean) : []
        const answerIndex = Number(parsed?.answerIndex)
        if (parsed?.stem && choices.length >= 2 && Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choices.length) {
          return {
            ok: true,
            source: 'llm',
            model: llmRes.model,
            question: {
              scenarioTag: String(parsed.scenarioTag ?? interests).trim(),
              stem: String(parsed.stem).trim(),
              choices: choices.slice(0, 4),
              answerIndex,
              rationale: String(parsed.rationale ?? '').trim(),
              concept: original.concept ?? '',
            },
          }
        }
      }

      return {
        ok: false,
        source: 'offline',
        reason: llmRes.reason || '当前无法连接实时大模型生成新变式题，请先使用「仅重练薄弱题」功能。',
      }
    },

    /**
     * Dynamically re-explain one immersive-text paragraph on demand in the
     * learner's chosen scaffolding mode (`analogy` | `rigorous` | `counterexample`).
     */
    async reexplainBlock(id, input = {}) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const blockText = String(input.text ?? '').trim()
      if (!blockText) return { ok: false, reason: '缺少需要重讲的段落文本' }

      const mode = ['analogy', 'rigorous', 'counterexample'].includes(String(input.mode)) ? String(input.mode) : 'analogy'
      const learnerProfile = await profile.get()
      const lang = record.lesson?.learner?.language === 'en' ? 'en' : 'zh'
      const interests = learnerProfile.interests.length > 0
        ? learnerProfile.interests.join('、')
        : (record.lesson?.learner?.interest || '日常生活')

      const modeInstructions = {
        analogy: lang === 'en'
          ? `Explain using a fresh, vivid everyday analogy tied to ${interests}, avoiding jargon.`
          : `用贴近「${interests}」的生动生活类比，把这段话讲得像聊天一样通俗易懂（2–4 句）。`,
        rigorous: lang === 'en'
          ? 'Explain from first principles: state the exact definition, causal chain, and formula/boundary conditions concisely.'
          : '从第一性原理出发，提炼这段话的底层定义、因果逻辑与适用边界（2–4 句，清晰硬核）。',
        counterexample: lang === 'en'
          ? 'Expose the #1 misconception students have about this paragraph using a concrete counter-example.'
          : '针对学生读这段话时最容易踩的 1 个直觉陷阱，举一个具体反例帮他避坑（2–4 句）。',
      }

      const profileDirective = formatProfileDirective(learnerProfile)
      const system = lang === 'en'
        ? `You are a 1-on-1 tutor.\n${profileDirective}\nTask: ${modeInstructions[mode]} Keep it under 120 words, plain text.`
        : `你是一位 1 对 1 学习导师。\n${profileDirective}\n本次重讲任务：${modeInstructions[mode]} 直接输出纯文本讲解，控制在 180 字以内。`

      const prompt = `课时：《${record.lesson.title}》\n学生卡住的段落：\n${blockText}`
      const llmRes = await runLiveLlm({ system, prompt, sessionId: `learnway-reexplain-${id}-${mode}`, maxTokens: 900 })
      if (llmRes.ok) {
        return { ok: true, source: 'llm', model: llmRes.model, mode, explanation: llmRes.text }
      }
      return { ok: false, source: 'offline', mode, reason: llmRes.reason || '当前无法连接实时大模型' }
    },

    /** Save the learner's Feynman self-explanation for one quiz question. */
    async saveReflection(id, questionIndex, text) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const updated = await progress.saveReflection(id, questionIndex, text)
      const totalQuestions = record.lesson?.quiz?.questions?.length ?? 0
      return {
        id: record.id,
        ...updated,
        summary: summarizeProgress(updated, totalQuestions),
      }
    },

    /**
     * Evaluate a learner's interactive reply during an Audio Lesson turn.
     *
     * Prefers calling DeepSeek Harness's live `ctx.llm` runtime (with the user's
     * active default model) so the dialogue responds genuinely to any free-form
     * answer or follow-up question; falls back cleanly to the offline branching
     * evaluator when `ctx.llm` is absent (headless / unit tests).
     *
     * @param {string} id
     * @param {{turnIndex: number, answer?: string, choiceIndex?: number, history?: Array<{role: string, text: string}>}} input
     */
    async evaluateAudioReply(id, input = {}) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const turns = record.lesson?.audioLesson?.turns ?? []
      const turnIndex = Math.round(Number(input.turnIndex ?? 0))
      const turn = turns[turnIndex]
      if (!turn) return { ok: false, error: 'invalid-turn' }

      const inter = turn.interactive ?? {}
      const lang = record.lesson?.learner?.language === 'en' ? 'en' : 'zh'
      const nextTeacherTurn = turns.slice(turnIndex + 1).find((t) => t.speaker === 'teacher')
      const nextTeacherIndex = turns.findIndex((t, i) => i > turnIndex && t.speaker === 'teacher')

      // 1. Live LLM Socratic evaluation via DeepSeek Harness `ctx.llm`
      const rawAnswer = typeof input.choiceIndex === 'number' && inter.quickChoices?.[input.choiceIndex]
        ? inter.quickChoices[input.choiceIndex].label
        : String(input.answer ?? '').trim()
      let fallbackReason = ''

      if (rawAnswer) {
        const lesson = record.lesson
        const learnerProfile = await profile.get()
        const profileDirective = formatProfileDirective(learnerProfile)
        const keyConcepts = (lesson.audioLesson?.keyConcepts ?? []).join('、')
        const historyLines = (Array.isArray(input.history) ? input.history.slice(-10) : [])
          .map((m) => `${m.role === 'learner' ? '学生' : '老师'}：${String(m.text ?? '').slice(0, 300)}`)
          .join('\n')
        const system = lang === 'en'
          ? `You are a Socratic tutor teaching "${lesson.title}".\n${profileDirective}\n`
            + `Respond concisely in 2–3 spoken sentences (for TTS). React directly to what the learner just said. `
            + `Return ONLY valid JSON: {"verdict":"aligned"|"misconception"|"partial","advance":true|false,"teacherReply":"...","misconceptionTag":""}.`
          : `你是一位善于苏格拉底式启发教学的老师，正在上互动音频课《${lesson.title}》。\n${profileDirective}\n`
            + `本节核心概念：${keyConcepts || turn.concept || '本节核心概念'}。`
            + `要求：口语化、简洁自然（2–3 句话，适合语音朗读），直接针对学生刚才的真实回答或追问互动。`
            + `若答对关键逻辑则设为 aligned + advance=true；若踩中误解则用反例启发纠偏并设为 misconception + advance=false，同时用 15 字内概括到 misconceptionTag；若答漏或延伸追问则认真解答并引导（partial）。`
            + `只输出合法 JSON，不要 markdown：{"verdict":"aligned"|"misconception"|"partial","advance":true|false,"teacherReply":"...","misconceptionTag":""}`

        const prompt = [
          `当前教学节点：${turn.text}`,
          nextTeacherTurn ? `下一教学节点预告：${nextTeacherTurn.text}` : '（已是最后一个教学节点）',
          historyLines ? `历史对话：\n${historyLines}` : '',
          `学生最新回答：${rawAnswer}`,
        ].filter(Boolean).join('\n\n')

        const llmRes = await runLiveLlm({ system, prompt, sessionId: `learnway-audio-${id}`, maxTokens: 1500 })
        if (llmRes.ok) {
          const parsed = extractJson(llmRes.text)
          if (parsed && String(parsed.teacherReply ?? '').trim()) {
            const verdict = ['aligned', 'misconception', 'partial'].includes(parsed.verdict) ? parsed.verdict : 'aligned'
            const tag = String(parsed.misconceptionTag ?? '').trim()
            if (verdict === 'misconception') {
              await profile.recordMisconception(tag || `${turn.concept || lesson.title}（对话误区）`)
            }
            return {
              ok: true,
              source: 'llm',
              model: llmRes.model,
              turnIndex,
              verdict,
              advance: Boolean(parsed.advance),
              teacherReply: String(parsed.teacherReply).trim(),
              nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
            }
          }
          return {
            ok: true,
            source: 'llm',
            model: llmRes.model,
            turnIndex,
            verdict: 'aligned',
            advance: true,
            teacherReply: llmRes.text.slice(0, 400),
            nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
          }
        }
        fallbackReason = llmRes.reason || ''
      }

      // 2. Offline fallback: authored quick-choice branch
      if (typeof input.choiceIndex === 'number' && Array.isArray(inter.quickChoices) && inter.quickChoices[input.choiceIndex]) {
        const picked = inter.quickChoices[input.choiceIndex]
        const advance = picked.verdict === 'aligned'
        return {
          ok: true,
          source: 'offline',
          ...(fallbackReason ? { fallbackReason } : {}),
          turnIndex,
          verdict: picked.verdict,
          advance,
          teacherReply: picked.reply,
          nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
        }
      }

      // 3. Offline fallback: free-text keyword evaluation
      const answer = String(input.answer ?? '').trim()
      const lower = answer.toLowerCase()
      if (!answer) {
        return {
          ok: true,
          source: 'offline',
          ...(fallbackReason ? { fallbackReason } : {}),
          turnIndex,
          verdict: 'partial',
          advance: false,
          teacherReply: inter.hintReply || (lang === 'en'
            ? 'Give it a quick try in your own words — even a rough guess helps your brain lock it in!'
            : '试着用自己的话说一句——哪怕只是一个初步猜测，也能帮大脑激活思考！'),
          nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
        }
      }

      for (const item of inter.misconceptions ?? []) {
        if ((item.keywords ?? []).some((kw) => kw && lower.includes(String(kw).toLowerCase()))) {
          return {
            ok: true,
            source: 'offline',
            ...(fallbackReason ? { fallbackReason } : {}),
            turnIndex,
            verdict: 'misconception',
            advance: false,
            teacherReply: item.reply,
            nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
          }
        }
      }

      const expected = Array.isArray(inter.expected) && inter.expected.length > 0
        ? inter.expected
        : [turn.concept, ...(record.lesson?.audioLesson?.keyConcepts ?? [])].filter(Boolean)
      const matched = expected.filter((kw) => kw && lower.includes(String(kw).toLowerCase()))

      if (matched.length > 0) {
        const reply = inter.alignedReply
          || (lang === 'en'
            ? `Nice catch on "${matched[0]}"! ${nextTeacherTurn?.text ?? 'Let’s move to the next idea.'}`
            : `抓得很准，提到了「${matched[0]}」！${nextTeacherTurn ? '我们顺着这个思路往下看。' : '这一段你已经吃透了。'}`)
        return {
          ok: true,
          source: 'offline',
          ...(fallbackReason ? { fallbackReason } : {}),
          turnIndex,
          verdict: 'aligned',
          advance: true,
          matchedConcepts: matched,
          teacherReply: reply,
          nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
        }
      }

      const hint = inter.hintReply
        || (lang === 'en'
          ? `Interesting thought! Think specifically about "${turn.concept || 'the core rule'}" — want to refine your answer or continue?`
          : `有意思的想法！提示一下，试着往「${turn.concept || '本节核心规律'}」的方向再想一步，或者点下方直接听老师拆解。`)
      return {
        ok: true,
        source: 'offline',
        ...(fallbackReason ? { fallbackReason } : {}),
        turnIndex,
        verdict: 'partial',
        advance: false,
        matchedConcepts: [],
        teacherReply: hint,
        nextTurnIndex: nextTeacherIndex >= 0 ? nextTeacherIndex : turns.length,
      }
    },

    /**
     * Build a cross-lesson interleaved daily review queue.
     *
     * Collects all weak items (misconception / gap / fragile) and due mastered
     * items across every saved lesson, then interleaves them round-robin by
     * lesson within each priority tier so the learner benefits from interleaved
     * practice rather than blocked single-lesson drilling.
     *
     * @param {{limit?: number, nowMs?: number}} [options]
     */
    async reviewQueue(options = {}) {
      await ready()
      const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Math.min(50, Number(options.limit))) : 20
      const nowMs = options.nowMs ?? Date.now()
      const summaries = await store.list()
      const buckets = { misconception: new Map(), gap: new Map(), fragile: new Map(), mastered: new Map() }
      const byQuadrant = { misconception: 0, gap: 0, fragile: 0, mastered: 0 }

      for (const summary of summaries) {
        const record = await store.get(summary.id)
        if (!record) continue
        const questions = record.lesson?.quiz?.questions ?? []
        if (questions.length === 0) continue
        const prog = await progress.get(summary.id)
        const items = prog?.items ?? {}

        for (let index = 0; index < questions.length; index += 1) {
          const state = items[String(index)]
          if (!state) continue
          const isWeak = state.quadrant !== 'mastered'
          const isDue = Boolean(state.nextReviewAt && Date.parse(state.nextReviewAt) <= nowMs)
          if (!isWeak && !isDue) continue

          const bucketKey = state.quadrant in buckets ? state.quadrant : 'gap'
          byQuadrant[bucketKey] += 1
          const perLesson = buckets[bucketKey]
          if (!perLesson.has(summary.id)) perLesson.set(summary.id, [])
          perLesson.get(summary.id).push({
            lessonId: summary.id,
            lessonTitle: record.lesson.title,
            index,
            quadrant: state.quadrant,
            box: state.box ?? 0,
            intervalDays: state.intervalDays ?? 0,
            nextReviewAt: state.nextReviewAt ?? null,
            reflection: state.reflection ?? '',
            question: questions[index],
          })
        }
      }

      // Interleave round-robin across lessons within each priority tier
      const interleaved = []
      for (const tier of ['misconception', 'gap', 'fragile', 'mastered']) {
        const queues = [...buckets[tier].values()]
        let active = true
        while (active && interleaved.length < limit) {
          active = false
          for (const queue of queues) {
            if (queue.length > 0 && interleaved.length < limit) {
              interleaved.push(queue.shift())
              active = true
            }
          }
        }
      }

      const totalDue = byQuadrant.misconception + byQuadrant.gap + byQuadrant.fragile + byQuadrant.mastered
      return { totalDue, byQuadrant, items: interleaved }
    },

    /**
     * Record one browser check-in.
     *
     * @param {{phase?: string, moduleId?: string, registrations?: string[], href?: string, userAgent?: string}} info
     */
    recordPing(info = {}) {
      const entry = {
        at: new Date().toISOString(),
        phase: typeof info.phase === 'string' ? info.phase.slice(0, 40) : 'activate',
        moduleId: typeof info.moduleId === 'string' ? info.moduleId.slice(0, 120) : '',
        registrations: Array.isArray(info.registrations) ? info.registrations.map(String).slice(0, 8) : [],
        href: typeof info.href === 'string' ? info.href.slice(0, 200) : '',
        userAgent: typeof info.userAgent === 'string' ? info.userAgent.slice(0, 200) : '',
        detail: typeof info.detail === 'string' ? info.detail.slice(0, 1200) : '',
      }
      pings.push(entry)
      if (pings.length > 20) pings.shift()
      log(`client ${entry.phase} · ${entry.registrations.join(',') || 'no registrations'}`)
      return entry
    },

    /** What the browser told us last, for `learnway_client_status`. */
    clientStatus() {
      const latest = pings.length > 0 ? pings[pings.length - 1] : null
      return {
        seen: pings.length > 0,
        count: pings.length,
        latest,
        history: pings.slice(-5),
        hint: pings.length > 0
          ? '浏览器已加载客户端模块；面板入口是侧栏「面板」列表中的「教材改造台」。'
          : '宿主从未收到浏览器上报：客户端模块没有被加载，问题在模块投递/激活，不在面板代码。刷新页面后仍未上报时，重启 DeepSeek Harness。',
      }
    },

    /** Environment and inventory facts for the panel header and the health tool. */
    async health() {
      await ready()
      const lessons = await store.list()
      return {
        ok: true,
        plugin: '@local/dsh-learnway',
        dataDir: paths.dataDir,
        lessons: lessons.length,
        demoLessons: lessons.filter((lesson) => lesson.demo).length,
        seeded: Number(config.seedDemoLessons ?? 1) !== 0,
        gradeTolerance,
        client: this.clientStatus().seen,
        paper: {
          id: 'arXiv:2509.13348v4',
          title: 'Towards an AI-Augmented Textbook (Learn Your Way, LearnLM Team, Google)',
          stages: ['text personalisation (grade level + interests)', 'content transformations (slides, audio lesson, mind map, immersive text)', 'assessment (embedded questions, section quiz with Glows/Grows)'],
        },
      }
    },

    /**
     * Export the deck of one lesson.
     *
     * Every format is independent: a missing PptxGenJS leaves the markdown and
     * the HTML deck intact, and the caller receives a per-format reason.
     *
     * @param {string} id
     * @param {string[]} [formats]
     */
    async exportDeck(id, formats, options = {}) {
      await ready()
      const record = await store.get(id)
      if (!record) return null
      const dir = join(paths.exportsDir, String(id))
      const theme = typeof options.theme === 'string' ? options.theme : undefined
      const written = await writeDeck(record.lesson, { dir, formats, theme })
      return {
        id,
        title: record.lesson.title,
        dir,
        theme: theme ?? 'editorial',
        stats: deckStats(record.lesson),
        files: written.map((item) => (item.ok
          ? {
              format: item.format,
              // `ok` is part of the shape on both branches: readers switch on it.
              ok: true,
              name: item.name,
              bytes: item.bytes,
              path: item.file,
              url: `${API_PREFIX}/export?id=${encodeURIComponent(String(id))}&file=${encodeURIComponent(item.name)}`,
            }
          : { format: item.format, ok: false, reason: item.reason })),
      }
    },

    /** Where exported decks live, for the panel footer and the tools. */
    exportDir(id) {
      return join(paths.exportsDir, String(id))
    },

    /** Coverage of a generated text against a source text, for parity with the validator. */
    async coverage(sourceText, generatedText) {
      return coverage(sourceText, generatedText)
    },
  }
}
