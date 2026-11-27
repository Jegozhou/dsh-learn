/**
 * Agent tools for the Learn Your Way pipeline.
 *
 * Each tool is a thin adapter over the service, so a lesson an agent saves is
 * exactly what the panel renders. Everything the tools accept is described in
 * the parameter schema rather than in prose the model has to remember.
 *
 * @module host/tools
 */

/**
 * Ask the host's client-module service whether this package made it into the
 * page boot graph. This is the fact that separates "the panel is missing" from
 * "the bundle was never delivered".
 *
 * @param {(() => unknown) | undefined} clientModulesOf
 * @returns {object}
 */
function readBootGraph(clientModulesOf) {
  const service = typeof clientModulesOf === 'function' ? clientModulesOf() : undefined
  if (!service) return { available: false, note: 'clientModules 服务不在本 profile 中' }
  const id = '@local/dsh-learnway'
  try {
    const graph = service.graph()
    const entries = Array.isArray(graph?.entries) ? graph.entries : []
    const entry = entries.find((candidate) => candidate?.id === id)
    return {
      available: true,
      graphRev: graph?.rev ?? '',
      entryCount: entries.length,
      entry: entry ?? null,
      clientPath: typeof service.clientPath === 'function' ? service.clientPath(id) ?? null : null,
      baseline: typeof service.artifactBaseline === 'function' ? (service.artifactBaseline(id) ?? null) : null,
      release: graph?.release ?? null,
      peerIds: entries.map((candidate) => candidate?.id).filter(Boolean),
      thirdParty: entries.map((candidate) => candidate?.id).filter((id) => id && !String(id).startsWith('@deepseek-ai/')),
    }
  } catch (error) {
    return { available: true, error: String(error?.message ?? error).slice(0, 300) }
  }
}

/** Strip values JSON cannot carry, so one bad field never fails a whole call. */
export function toLosslessJson(value, depth = 0) {
  if (value === null) return null
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (type === 'undefined' || type === 'function' || type === 'symbol') return undefined
  if (depth > 24) return null
  if (Array.isArray(value)) {
    return value.map((item) => {
      const converted = toLosslessJson(item, depth + 1)
      return converted === undefined ? null : converted
    })
  }
  if (value instanceof Date) return value.toISOString()
  if (type === 'object') {
    const output = {}
    for (const key of Object.keys(value)) {
      const converted = toLosslessJson(value[key], depth + 1)
      if (converted !== undefined) output[key] = converted
    }
    return output
  }
  return null
}

/** Render one text block from an array of lines. */
const renderLines = (lines) => [{ type: 'text', text: lines.filter(Boolean).join('\n') }]

/** A block of the immersive text. */
const blockSchema = {
  type: 'object',
  description: 'One block of the immersive text. A paragraph with `original` is a personalised replacement and is highlighted in the panel.',
  properties: {
    type: { type: 'string', enum: ['paragraph', 'callout', 'list'], description: 'Block kind (default paragraph).' },
    text: { type: 'string', description: 'The wording shown to the learner (for a list block, use items instead).' },
    original: { type: 'string', description: 'For a personalised paragraph: the source sentence this replaced. Required for the highlight-and-compare view.' },
    tone: { type: 'string', enum: ['insight', 'caution', 'note'], description: 'Callout tone.' },
    title: { type: 'string', description: 'Optional callout title.' },
    items: { type: 'array', items: { type: 'string' }, description: 'List items for a list block.' },
  },
  additionalProperties: false,
}

/** A multiple-choice question, embedded or in the quiz. */
const questionSchema = {
  type: 'object',
  properties: {
    stem: { type: 'string', description: 'The question.' },
    choices: { type: 'array', items: { type: 'string' }, description: '2–6 answer options. Use plausible distractors, including the misconception you expect.' },
    answerIndex: { type: 'integer', description: '0-based index of the correct choice.' },
    rationale: { type: 'string', description: 'Why the right answer is right, and the misconception behind the main distractor. Shown after answering.' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: 'Quiz only: the paper calls for various difficulties, so spread them.' },
    bloom: { type: 'string', description: 'Optional Bloom level: remember / comprehension / apply / analysis / evaluate / create.' },
    sectionId: { type: 'string', description: 'Optional section id (e.g. s1, s2) in immersion.sections so wrong answers link straight back to the source section.' },
    concept: { type: 'string', description: 'Optional core concept tag tested by this question.' },
  },
  required: ['stem', 'choices', 'answerIndex'],
  additionalProperties: false,
}

/** One immersive-text section with its optional add-ons. */
const sectionSchema = {
  type: 'object',
  description: 'One section of the immersive text: the personalised body plus at most one embedded question and the optional Timeline / Memory aid / Visual illustration add-ons.',
  properties: {
    id: { type: 'string', description: 'Stable id, e.g. s1.' },
    heading: { type: 'string' },
    blocks: { type: 'array', items: blockSchema, description: 'Body blocks, in reading order.' },
    question: questionSchema,
    timeline: {
      type: 'object',
      description: 'For material that is a sequence. Items are listed in the CORRECT order; the panel shuffles them for the drag-and-drop practice.',
      properties: {
        title: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, detail: { type: 'string' } },
            required: ['label'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    memoryAid: {
      type: 'object',
      description: 'A mnemonic for material that is hard to memorise.',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'The items to remember, in order.' },
        sentence: { type: 'string', description: 'A memorable sentence whose words start with (or encode) the items, and that is semantically tied to the material.' },
        gloss: { type: 'string', description: 'How to read the mnemonic.' },
      },
      required: ['items', 'sentence'],
      additionalProperties: false,
    },
    illustration: {
      type: 'object',
      description: 'A visual illustration of this section. Prefer authoring a clean static `<svg viewBox="0 0 640 240">...</svg>` vector diagram in `svg` (dual coding), plus caption and brief.',
      properties: {
        caption: { type: 'string', description: 'Caption shown under the image.' },
        brief: { type: 'string', description: 'What to draw, in one or two sentences.' },
        svg: { type: 'string', description: 'Clean static inline <svg> diagram (no scripts/events, <=32KB). Automatically sanitized and rendered.' },
        dataUrl: { type: 'string', description: 'Optional image data URL (png/jpeg/webp/gif/svg).' },
      },
      required: ['caption'],
      additionalProperties: false,
    },
  },
  required: ['heading', 'blocks'],
  additionalProperties: false,
}

/** The full lesson contract. */
const lessonSchema = {
  type: 'object',
  description: 'A transformed textbook section: personalised text plus every generative view and the assessment components.',
  properties: {
    title: { type: 'string', description: 'Lesson title.' },
    source: {
      type: 'object',
      description: 'The source of truth. Supplying `text` enables the coverage and grade checks and the 原文 tab.',
      properties: {
        title: { type: 'string' },
        attribution: { type: 'string', description: 'Where the source came from, e.g. "OpenStax College Physics §5.5".' },
        url: { type: 'string' },
        text: { type: 'string', description: 'The source passage verbatim.' },
      },
      additionalProperties: false,
    },
    learner: {
      type: 'object',
      description: 'Who this version is for: the two personalisation axes from the paper.',
      properties: {
        grade: { type: 'number', description: 'Target Flesch-Kincaid grade for English, or the school stage for Chinese (7, 10, 13 ≈ undergraduate).' },
        interest: { type: 'string', description: 'The learner interest the examples are rewritten toward, e.g. 篮球 / music / cooking.' },
        language: { type: 'string', enum: ['zh', 'en'], description: 'Language the lesson is written in (default zh).' },
      },
      additionalProperties: false,
    },
    objectives: { type: 'array', items: { type: 'string' }, description: 'What the learner should be able to do afterwards. The panel shows these above the text.' },
    immersion: {
      type: 'object',
      properties: { sections: { type: 'array', items: sectionSchema } },
      required: ['sections'],
      additionalProperties: false,
    },
    slides: {
      type: 'array',
      description: 'Slides & Narration view. Mix visual layouts (title, section, cards, steps, comparison, stats, quote, two-column, bullets) instead of plain bullet walls. Narration is spoken over the slide and may say more than the on-slide text.',
      items: {
        type: 'object',
        properties: {
          layout: { type: 'string', enum: ['title', 'section', 'bullets', 'quote', 'two-column', 'cards', 'steps', 'comparison', 'stats'], description: 'Visual slide layout.' },
          kicker: { type: 'string', description: 'Short section/topic badge shown above the heading.' },
          title: { type: 'string' },
          subtitle: { type: 'string', description: 'Subtitle for title slides.' },
          bullets: { type: 'array', items: { type: 'string' } },
          columns: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Two columns for two-column layout.' },
          quote: {
            type: 'object',
            properties: { text: { type: 'string' }, attribution: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
          cards: {
            type: 'array',
            description: '2–4 visual cards for the cards layout.',
            items: {
              type: 'object',
              properties: { tag: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } },
              required: ['title'],
              additionalProperties: false,
            },
          },
          steps: {
            type: 'array',
            description: '2–5 numbered process steps for the steps layout.',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, detail: { type: 'string' } },
              required: ['label'],
              additionalProperties: false,
            },
          },
          stats: {
            type: 'array',
            description: '2–4 big-figure KPI / key-formula callout cards for the stats layout.',
            items: {
              type: 'object',
              properties: { value: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' } },
              required: ['value', 'label'],
              additionalProperties: false,
            },
          },
          comparison: {
            type: 'object',
            description: 'Side-by-side VS comparison cards for the comparison layout.',
            properties: {
              leftTitle: { type: 'string' },
              rightTitle: { type: 'string' },
              left: { type: 'array', items: { type: 'string' } },
              right: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
          narration: { type: 'string', description: 'A natural spoken script for this slide, not a copy of the bullets.' },
          notes: { type: 'string', description: 'Alias for narration.' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
    audioLesson: {
      type: 'object',
      description: 'Audio-graphic lesson: a teacher/student conversation. Write the student turn after the teacher turn as someone who has not seen the material, so their questions expose real misconceptions.',
      properties: {
        title: { type: 'string' },
        keyConcepts: { type: 'array', items: { type: 'string' } },
        turns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              speaker: { type: 'string', enum: ['teacher', 'student'] },
              text: { type: 'string' },
              concept: { type: 'string', description: 'The key concept this turn is about; used for the concept chips.' },
              interactive: {
                type: 'object',
                description: 'Optional branching checkpoint on a teacher question turn so the learner can answer and branch.',
                properties: {
                  prompt: { type: 'string', description: 'Optional short prompt cue shown above the reply box.' },
                  expected: { type: 'array', items: { type: 'string' }, description: 'Key concept words expected in a strong answer.' },
                  alignedReply: { type: 'string', description: 'Teacher follow-up when the learner gets it right.' },
                  hintReply: { type: 'string', description: 'Socratic nudge when the learner answer is incomplete.' },
                  misconceptions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        keywords: { type: 'array', items: { type: 'string' } },
                        reply: { type: 'string' },
                      },
                      required: ['keywords', 'reply'],
                      additionalProperties: false,
                    },
                  },
                  quickChoices: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        verdict: { type: 'string', enum: ['aligned', 'partial', 'misconception'] },
                        reply: { type: 'string' },
                      },
                      required: ['label', 'verdict', 'reply'],
                      additionalProperties: false,
                    },
                  },
                },
                additionalProperties: false,
              },
            },
            required: ['speaker', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['turns'],
      additionalProperties: false,
    },
    mindmap: {
      type: 'object',
      description: 'Hierarchical map of the material. Leaves should carry a short note.',
      properties: {
        label: { type: 'string' },
        note: { type: 'string' },
        children: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
      required: ['label'],
      additionalProperties: false,
    },
    quiz: {
      type: 'object',
      description: 'Section quiz: 5–10 questions of varying difficulty, plus the end-of-quiz Glows (strengths) and Grows (areas to improve).',
      properties: {
        questions: { type: 'array', items: questionSchema },
        glows: { type: 'array', items: { type: 'string' }, description: 'Strengths to name in the closing feedback.' },
        grows: { type: 'array', items: { type: 'string' }, description: 'Targeted areas to improve in the closing feedback.' },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  },
  required: ['title', 'immersion'],
  additionalProperties: false,
}

/** Format diagnostics as one indented block. */
function formatDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return '无诊断项（结构、覆盖度、年级贴合、测评配置均通过）。'
  return diagnostics
    .map((item) => `- [${item.level}] ${item.code} @ ${item.path}: ${item.message}`)
    .join('\n')
}

/**
 * Register every tool on a context that already provides `tools`.
 *
 * @param {{tools: {register: Function}}} ctx
 * @param {ReturnType<import('./service.js').createLearnwayService>} service
 * @returns {() => void} disposer
 */
export function registerLearnwayTools(ctx, service, options = {}) {
  const disposers = []
  const register = (definition) => {
    const dispose = ctx.tools.register({
      ...definition,
      async execute(...args) {
        return toLosslessJson(await definition.execute(...args))
      },
    })
    disposers.push(dispose)
  }

  register({
    name: 'learnway_readability',
    description:
      'Measure reading load: Flesch-Kincaid grade and Flesch reading ease for Latin script, a sentence-length band for CJK, plus sentence and word statistics. '
      + 'Use it to check the re-levelling step of a lesson: measure the source before rewriting, then measure your rewrite and compare against the learner grade. '
      + 'FKG is defined on English, so Chinese text returns a band estimate with fleschKincaidGrade = null.',
    parameters: {
      type: 'object',
      properties: {
        texts: {
          type: 'array',
          description: 'One or more texts to measure. Label them (e.g. "原文", "改写稿") so the result is readable.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              text: { type: 'string' },
              targetGrade: { type: 'number', description: 'Optional per-text FKG target to compare against.' },
            },
            required: ['text'],
            additionalProperties: false,
          },
        },
        targetGrade: { type: 'number', description: 'Default target grade for texts that do not set their own.' },
        tolerance: { type: 'number', description: 'Acceptable absolute FKG distance from the target (default 1).' },
      },
      required: ['texts'],
      additionalProperties: false,
    },
    output: { schema: {} , render: (_args, value) => renderLines([
      `阅读负荷（${value.items.length} 段）`,
      ...value.items.map((item) => {
        const measured = item.text
        // Chinese counts characters, Latin counts words; say which.
        const unit = measured.script === 'cjk' ? '汉字' : '词'
        const grade = item.grade ? ` · ${item.grade.verdict}: ${item.grade.message}` : ''
        return `- ${item.label}: ${measured.script} · ${measured.words} ${unit} / ${measured.sentences} 句 · 平均 ${measured.avgSentenceLength ?? '-'} ${unit}每句 · FKG ${measured.fleschKincaidGrade ?? '不适用'} · 负荷带 ${measured.gradeBandLabel}${grade}`
      }),
    ]) },
    presentCall: (args) => ({ card: 'generic', title: `阅读负荷测量（${args.texts?.length ?? 0} 段）`, rawInput: { targetGrade: args.targetGrade } }),
    async execute(args) {
      const texts = Array.isArray(args.texts) ? args.texts : []
      if (texts.length === 0) throw Object.assign(new Error('texts 至少需要一段文本'), { code: 'invalid-input' })
      const items = []
      for (const [index, item] of texts.entries()) {
        const measured = await service.measure({
          text: String(item?.text ?? ''),
          targetGrade: item?.targetGrade ?? args.targetGrade,
          tolerance: args.tolerance,
        })
        items.push({ label: String(item?.label ?? `文本 ${index + 1}`), ...measured })
      }
      return { ok: true, items }
    },
  })

  register({
    name: 'learnway_lesson_save',
    description:
      'Save a transformed textbook section as a lesson, and store it for the 教材改造台 panel (sidebar icon). '
      + 'Write the whole pipeline the paper describes: the personalised text (grade level + interest, with every rewritten sentence keeping its `original` so the panel can highlight it), '
      + 'the Slides & Narration view, the teacher/student Audio Lesson, the Mind map, the Immersive Text add-ons (timeline, memory aid, illustration), '
      + 'and the assessment components (one embedded question per section, plus a 5–10 question quiz with difficulty spread, rationales, Glows and Grows). '
      + 'Structural problems are rejected with a message; pedagogical problems come back as diagnostics you can fix and re-save with the same `id`, which replaces that lesson.',
    parameters: {
      type: 'object',
      properties: {
        lesson: lessonSchema,
        id: { type: 'string', description: 'Existing lesson id to replace. Omit to create a new lesson.' },
      },
      required: ['lesson'],
      additionalProperties: false,
    },
    output: { schema: {}, render: (_args, value) => renderLines(value.ok
      ? [
          `已保存课时「${value.title}」 · id ${value.id}`,
          `面板：侧栏「教材改造台」→ 选中该课时`,
          `统计：${value.measurement.stats.sections} 节 · ${value.measurement.stats.blocks} 块（${value.measurement.stats.personalizedBlocks} 处个性化）· ${value.measurement.stats.slides} 张幻灯片 · ${value.measurement.stats.audioTurns} 轮音频 · 测验 ${value.measurement.stats.quizQuestions} 题`,
          `年级贴合：${value.measurement.grade ? value.measurement.grade.message : '未设目标年级'}`,
          `覆盖度：${value.measurement.coverage && value.measurement.coverage.ratio !== null ? `${Math.round(value.measurement.coverage.ratio * 100)}%（${value.measurement.coverage.method}）` : '无原文可比'}`,
          '诊断：',
          formatDiagnostics(value.diagnostics),
        ]
      : ['课时未保存，存在结构性问题：', ...value.errors.map((error) => `- ${error.code} @ ${error.path}: ${error.message}`)]),
    },
    presentCall: (args) => ({ card: 'generic', title: `保存课时「${args.lesson?.title ?? ''}」`, rawInput: { title: args.lesson?.title, id: args.id } }),
    async execute(args) {
      const result = await service.save(args.lesson, { id: args.id, createdBy: 'agent' })
      if (!result.ok) {
        return { ok: false, errors: result.errors, diagnostics: result.diagnostics, measurement: result.measurement }
      }
      return result
    },
  })

  register({
    name: 'learnway_lesson_list',
    description: 'List the saved lessons with their grade, interest, size and the checks the validator ran. Read-only.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: {}, render: (_args, value) => renderLines(value.lessons.length === 0
      ? ['还没有课时。用 learnway_lesson_save 保存一个。']
      : [
          `${value.lessons.length} 个课时（数据目录 ${value.dataDir}）`,
          ...value.lessons.map((lesson) => `- ${lesson.id} · 「${lesson.title}」 · ${lesson.grade ?? '未设年级'} 年级 / ${lesson.interest || '未设兴趣'} · ${lesson.stats?.sections ?? 0} 节 · 测验 ${lesson.stats?.quizQuestions ?? 0} 题${lesson.demo ? ' · 示例' : ''}`),
        ]),
    },
    presentCall: () => ({ card: 'generic', title: '课时列表' }),
    async execute() {
      const health = await service.health()
      return { ok: true, dataDir: health.dataDir, lessons: await service.list() }
    },
  })

  register({
    name: 'learnway_lesson_get',
    description: 'Read one saved lesson back. Use view=all only when you need the whole record; the per-view options keep the result small.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lesson id from learnway_lesson_save or learnway_lesson_list.' },
        view: { type: 'string', enum: ['all', 'immersive', 'slides', 'audio', 'mindmap', 'quiz', 'measurement'], description: 'Which part to return (default immersive).' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: { schema: {}, render: (_args, value) => renderLines(value.ok
      ? [`课时「${value.lesson.title}」（${value.id}）· view=${value.view}`, JSON.stringify(value.view === 'measurement' ? value.measurement : (value.data ?? {}), null, 2).slice(0, 6000)]
      : [`没有 id 为 ${value.id} 的课时。`]),
    },
    presentCall: (args) => ({ card: 'generic', title: `读取课时 ${args.id}`, rawInput: args }),
    async execute(args) {
      const record = await service.get(args.id)
      if (!record) return { ok: false, id: args.id, error: 'not-found' }
      const view = args.view ?? 'immersive'
      const data = view === 'all' ? record.lesson
        : view === 'immersive' ? { objectives: record.lesson.objectives, ...record.lesson.immersion }
          : view === 'slides' ? record.lesson.slides
            : view === 'audio' ? record.lesson.audioLesson
              : view === 'mindmap' ? record.lesson.mindmap
                : view === 'quiz' ? record.lesson.quiz
                  : undefined
      return {
        ok: true,
        id: record.id,
        view,
        lesson: { title: record.lesson.title },
        ...(data === undefined ? {} : { data }),
        ...(view === 'measurement' ? { measurement: record.measurement } : {}),
      }
    },
  })

  register({
    name: 'learnway_client_status',
    description:
      'Report whether the browser half of this plugin has ever loaded: the last check-in it sent, how many arrived, and which seats it registered. '
      + 'Use it when the 教材改造台 panel cannot be found — an empty answer means the client module never ran, so the problem is delivery, not the panel.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: {}, render: (_args, value) => renderLines([
      ...(value.seen
        ? [
            `浏览器已上报 ${value.count} 次；最近一次 ${value.latest?.at}（${value.latest?.phase}）`,
            `注册的槽位：${(value.latest?.registrations ?? []).join(', ') || '（无）'}`,
            `页面：${value.latest?.href ?? '—'}`,
            ...(value.latest?.detail ? [`失败详情：${value.latest.detail}`] : []),
          ]
        : ['浏览器从未上报。']),
      value.hint,
      '',
      `启动图：${value.boot?.available ? (value.boot.error ? `读取失败 ${value.boot.error}` : `共 ${value.boot.entryCount} 个模块，rev ${String(value.boot.graphRev).slice(0, 12)}`) : (value.boot?.note ?? '不可用')}`,
      ...(value.boot?.available && !value.boot.error
        ? [
            value.boot.entry
              ? `本插件在启动图中：${value.boot.entry.id} → ${value.boot.entry.url}（immediately=${value.boot.entry.immediately === true}, inject=${(value.boot.entry.inject ?? []).join(',') || '无'}）`
              : '本插件不在启动图中：宿主没有把这个包当作 web 客户端模块投递。',
            `clientPath：${value.boot.clientPath ?? '（未解析）'}`,
            `第三方客户端模块（共 ${(value.boot.thirdParty ?? []).length}）：${(value.boot.thirdParty ?? []).join(', ') || '（无）'}`,
          ]
        : []),
    ]),
    },
    presentCall: () => ({ card: 'generic', title: '客户端加载状态' }),
    async execute() {
      const status = service.clientStatus()
      return { ...status, boot: readBootGraph(options.clientModulesOf) }
    },
  })

  register({
    name: 'learnway_deck_export',
    description:
      'Export the slide deck of a saved lesson as real presentation files. '
      + 'pptx: a PowerPoint written by PptxGenJS (the engine Marp CLI uses), with the narration in the speaker-notes pane. '
      + 'html: one self-contained offline deck (reveal.js-style sections, speaker notes, fragment reveal, arrow-key navigation, print to PDF). '
      + 'md: Marp markdown, which any Marp toolchain can render to PDF, PPTX or PNG. '
      + 'Each format is independent — an unavailable PPTX engine still leaves the other two. Paths are returned for retrieval.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lesson id from learnway_lesson_list.' },
        formats: {
          type: 'array',
          description: 'Which files to write (default all three).',
          items: { type: 'string', enum: ['pptx', 'html', 'md'] },
        },
        theme: {
          type: 'string',
          enum: ['editorial', 'keynote', 'swiss', 'notebook', 'botanical'],
          description: 'Presentation theme preset (default editorial).',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: { schema: {}, render: (_args, value) => renderLines(value.ok
      ? [
          `课时「${value.title}」幻灯片导出（主题 ${value.theme ?? 'editorial'} · ${value.stats.slides} 张；布局 ${Object.entries(value.stats.layouts).map(([layout, count]) => `${layout}×${count}`).join(' ') || '无'}；含讲解 ${value.stats.withNotes} 张）`,
          `目录：${value.dir}`,
          ...value.files.map((file) => (file.ok
            ? `- ${file.format}: ${file.name} · ${(file.bytes / 1024).toFixed(1)} KB · ${file.path}`
            : `- ${file.format}: 未生成 — ${file.reason}`)),
        ]
      : [`没有 id 为 ${value.id} 的课时。`]),
    },
    presentCall: (args) => ({ card: 'generic', title: `导出幻灯片 ${args.id}`, rawInput: { formats: args.formats ?? 'all', theme: args.theme ?? 'editorial' } }),
    async execute(args) {
      const result = await service.exportDeck(args.id, args.formats, { theme: args.theme })
      if (!result) return { ok: false, id: args.id, error: 'not-found' }
      return { ok: true, ...result }
    },
  })

  register({
    name: 'learnway_quiz_grade',
    description:
      'Grade a quiz submission for a saved lesson and return the paper’s end-of-quiz assessment: score, per-question correctness, and targeted Glows/Grows. '
      + 'Use it when a learner reports their answers in chat.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lesson id.' },
        answers: {
          type: 'array',
          description: 'One entry per answered question; unanswered questions are scored as wrong.',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer', description: '0-based question index.' },
              choice: { type: 'integer', description: '0-based chosen option.' },
              confidence: { type: 'string', enum: ['high', 'low'], description: 'Optional learner confidence for metacognitive 2×2 calibration (default high).' },
            },
            required: ['index', 'choice'],
            additionalProperties: false,
          },
        },
        mode: { type: 'string', enum: ['full', 'drill'], description: 'full for the whole quiz, drill for a targeted weak-question retry.' },
      },
      required: ['id', 'answers'],
      additionalProperties: false,
    },
    output: { schema: {}, render: (_args, value) => renderLines(value.ok
      ? [
          `得分 ${value.score} 分（${value.correct}/${value.total}，未答 ${value.unanswered}）`,
          ...(value.quadrants ? [`四象限：真懂 ${value.quadrants.mastered} · 蒙对 ${value.quadrants.fragile} · 高危误解 ${value.quadrants.misconception} · 知识盲区 ${value.quadrants.gap}`] : []),
          ...Object.entries(value.byDifficulty).map(([difficulty, bucket]) => `- ${difficulty}: ${bucket.correct}/${bucket.total}`),
          'Glows:',
          ...value.feedback.glows.map((line) => `- ${line}`),
          'Grows:',
          ...value.feedback.grows.map((line) => `- ${line}`),
        ]
      : [`没有 id 为 ${value.id} 的课时。`]),
    },
    presentCall: (args) => ({ card: 'generic', title: `批改测验 ${args.id}`, rawInput: { answers: args.answers?.length ?? 0, mode: args.mode ?? 'full' } }),
    async execute(args) {
      const result = await service.grade(args.id, args.answers, { mode: args.mode })
      if (!result) return { ok: false, id: args.id, error: 'not-found' }
      return { ok: true, id: args.id, ...result }
    },
  })

  register({
    name: 'learnway_study_report',
    description:
      'Read the learner’s persistent metacognitive study report for a lesson: 2×2 Confidence × Accuracy quadrants '
      + '(mastered, fragile/lucky, misconception/hypercorrection, knowledge gap), Leitner spaced-repetition due items, '
      + 'and the learner’s own Feynman self-explanation reflections. Use this to run targeted Socratic coaching or generate transfer questions.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Lesson id from learnway_lesson_list.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: { schema: {}, render: (_args, value) => renderLines(value.ok
      ? [
          `学习档案「${value.title}」（${value.id}）· 测验 ${value.summary.attemptCount} 次 · 最近得分 ${value.summary.lastScore ?? '—'} · 最高 ${value.summary.bestScore ?? '—'}`,
          `四象限：真懂 ${value.summary.quadrants.mastered} · 蒙对 ${value.summary.quadrants.fragile} · 高危误解 ${value.summary.quadrants.misconception} · 知识盲区 ${value.summary.quadrants.gap}`,
          `薄弱题：${value.weakItems.length > 0 ? value.weakItems.map((item) => `#${item.index + 1}(${item.quadrant}${item.concept ? `·${item.concept}` : ''})`).join('、') : '无'}`,
          ...value.weakItems.map((item) => `- 第 ${item.index + 1} 题 [${item.quadrant}] ${item.stem}${item.reflection ? ` ｜ 学习者反思：${item.reflection}` : ''}`),
        ]
      : [`没有 id 为 ${value.id} 的课时。`]),
    },
    presentCall: (args) => ({ card: 'generic', title: `读取学习诊断 ${args.id}`, rawInput: args }),
    async execute(args) {
      const record = await service.get(args.id)
      if (!record) return { ok: false, id: args.id, error: 'not-found' }
      const questions = record.lesson?.quiz?.questions ?? []
      const items = record.progress?.items ?? {}
      const detailed = questions.map((question, index) => {
        const state = items[String(index)] ?? null
        return {
          index,
          stem: question.stem,
          concept: question.concept ?? null,
          sectionId: question.sectionId ?? null,
          difficulty: question.difficulty ?? 'medium',
          correctAnswer: question.choices?.[question.answerIndex] ?? null,
          rationale: question.rationale ?? null,
          quadrant: state?.quadrant ?? 'unseen',
          box: state?.box ?? 0,
          nextReviewAt: state?.nextReviewAt ?? null,
          reflection: state?.reflection ?? '',
          lastChoiceText: typeof state?.lastChoice === 'number' ? (question.choices?.[state.lastChoice] ?? null) : null,
        }
      })
      const weakItems = detailed.filter((item) => item.quadrant !== 'mastered' && item.quadrant !== 'unseen')
      return {
        ok: true,
        id: record.id,
        title: record.lesson.title,
        summary: record.progress.summary,
        attempts: record.progress.attempts ?? [],
        weakItems,
        items: detailed,
      }
    },
  })

  register({
    name: 'learnway_profile_get',
    description:
      'Read the learner’s persistent cross-lesson profile (grade, interests, preferred explanation style, learning goal, and recurring misconceptions). '
      + 'Call this before authoring a new lesson with learnway_lesson_save so you automatically personalise to the learner without asking them to repeat themselves.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: {}, render: (_args, value) => renderLines([
      `学习者画像：${value.profile.stage ? `${value.profile.stage}（${value.profile.grade} 年级）` : `${value.profile.grade} 年级`} · 兴趣 ${value.profile.interests.join('、') || '未设'} · 讲法偏好 ${value.profile.style}`,
      ...(value.profile.goal ? [`学习目标：${value.profile.goal}`] : []),
      ...(value.profile.customInstructions ? [`自定义导师指令：${value.profile.customInstructions}`] : []),
      ...(value.profile.misconceptions?.length > 0 ? [`历史高频误区：${value.profile.misconceptions.join('；')}`] : ['历史高频误区：暂无']),
    ]) },
    presentCall: () => ({ card: 'generic', title: '读取学习者画像' }),
    async execute() {
      return { ok: true, profile: await service.getProfile() }
    },
  })

  return () => {
    while (disposers.length > 0) {
      const dispose = disposers.pop()
      try {
        dispose?.()
      } catch {
        // a failed disposer must not block the rest of the teardown
      }
    }
  }
}
