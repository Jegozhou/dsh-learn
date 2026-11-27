/**
 * Learn Your Way — browser half.
 *
 * Self-registering module (loaded through window.__ModuleLoader__; no top-level import/export): the host page loads it
 * through `window.__ModuleLoader__.load`. React comes from the page's module
 * table, theme colours from the `--dsw-alias-*` tokens.
 *
 * Slots:
 *   main (keyed, key=learnway)     — the full lesson reader
 *   sidebar.panellist (list)       — sidebar icon; clicking it opens the reader
 *
 * A lesson is authored by the agent (`learnway_lesson_save`) and stored by the
 * Host; this module collects answers, renders the views and asks the Host to
 * grade the quiz, so chat and panel can never disagree about a score.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-learnway',
  factory(require) {
    /**
     * Tell the Host what this module reached. It runs before anything can throw,
     * so `learnway_client_status` can tell "never delivered" apart from
     * "delivered but failed", and it carries the failure text when there is one.
     * @param {string} phase
     * @param {object} [extra]
     */
    const report = (phase, extra) => {
      try {
        if (typeof fetch !== 'function') return
        fetch('/api/learnway/ping', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            phase,
            moduleId: '@local/dsh-learnway',
            href: typeof location !== 'undefined' ? String(location.href) : '',
            userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent) : '',
            ...(extra ?? {}),
          }),
        }).catch(() => {})
      } catch {
        // reporting must never break the module
      }
    }
    report('factory-entered')
    try {
      return buildModule(require, report)
    } catch (error) {
      report('factory-failed', { detail: String((error && error.stack) || error).slice(0, 1000) })
      throw error
    }
  },
})

/** Build the plugin exports; separate so the factory reports its own failure. */
function buildModule(require, report) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'learnway'
    const PANEL_KEY = 'learnway'
    const API = '/api/learnway'
    const LANG = String((typeof navigator !== 'undefined' && navigator.language) || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'

    const DICT = {
      zh: {
        panel: '教材改造台',
        subtitle: '个性化 · 多表达 · 形成性测评 —— 按 arXiv:2509.13348 的两阶段流程实现',
        tabImmersive: '沉浸式文本',
        tabSlides: '幻灯片',
        tabAudio: '音频课',
        tabMindmap: '思维导图',
        tabSource: '原文',
        tabQuiz: '测验',
        refresh: '刷新',
        loading: '加载中…',
        empty: '还没有课时',
        emptyHint: '在对话里让 DeepSeek 把一节教材改造成课时：给它一段教材（PDF、网页或粘贴的正文），说「改造成 8 年级、喜欢篮球的课时」。生成后这里就会出现。',
        howTo: '怎么用',
        howToTitle: '三步上手',
        howToSteps: [
          '把教材交给 DeepSeek：粘贴正文、拖入 PDF，或指向一个章节。',
          '说清两件事：学习者年级，以及一个兴趣（篮球、做饭、音乐……）。这两项就是论文里的个性化维度。',
          '生成完成后在这里读：正文里高亮的句子是兴趣改写的部分，点「看原文」可以对照；读完做章末测验，拿到 Glows / Grows。',
        ],
        lessons: '课时',
        grade: '年级',
        interest: '兴趣',
        demo: '示例',
        delete: '删除',
        deleteConfirm: '确定删除这个课时？',
        objectives: '学习目标',
        personalized: '个性化',
        showOriginal: '看原文',
        showPersonalized: '看改写',
        embedded: '边读边问',
        correct: '答对了',
        incorrect: '再想想',
        correctAnswerIs: '正确答案',
        tryAgain: '重试',
        timeline: '时间轴',
        timelineHint: '拖动条目，或点 ↑ ↓ 调序，然后校验。',
        timelineCheck: '校验顺序',
        timelineOk: '顺序正确',
        timelineWrong: '顺序还不对，再调一次',
        reset: '重置',
        memoryAid: '记忆助记',
        illustration: '插图',
        brief: '绘制要点',
        slideOf: '第 %s / %s 张',
        prev: '上一张',
        next: '下一张',
        narrate: '朗读讲解',
        stop: '停止',
        keyConcepts: '关键概念',
        teacher: '老师',
        student: '学生',
        play: '播放对话',
        quizHint: '全部答完后提交，看分数与 Glows / Grows。',
        submit: '提交测验',
        submitting: '批改中…',
        score: '得分',
        glows: 'Glows · 已经做到',
        grows: 'Grows · 下一步',
        retake: '再做一次',
        yourChoice: '你的选择',
        unanswered: '未作答',
        coverage: '术语覆盖',
        gradeCheck: '年级贴合',
        sentenceLoad: '句长负荷',
        stats: '构成',
        dataDir: '数据目录',
        attribution: '出处',
        checkOk: '通过',
        checkWarn: '待改进',
        checkUnknown: '不可测',
        noSource: '这个课时没有附原文，无法做覆盖度与原文对照。',
        chapters: '节',
        blocks: '块',
        questions: '题',
        turns: '轮',
        slides: '张',
        difficulty: { easy: '易', medium: '中', hard: '难' },
        fragments: '逐步显示',
        fragmentsHint: '开启后要点逐条出现（reveal.js 的 fragment 语义）：空格/→ 揭示下一条，走完再翻页。',
        notes: '讲授稿',
        fullscreen: '全屏',
        exportTitle: '导出这份幻灯片',
        export: '导出',
        exporting: '导出中…',
        exportHint: '将按当前所选主题同步导出：PPTX 由 PptxGenJS 绘制图形卡片与备注页；HTML 为离线单文件（内置主题切换与总览）；Markdown 为 Marp 格式。',
        theme: '主题',
        overview: '总览',
        presenter: '分屏讲稿',
        exitOverview: '返回放映',
        layoutLabel: '版式',
        confHigh: '很确定',
        confLow: '不太确定',
        quadMastered: '真正掌握',
        quadFragile: '蒙对待固',
        quadMisconception: '高危误解',
        quadGap: '知识盲区',
        filterAll: '全部题目',
        drillWeak: '仅重练薄弱题',
        drillBadge: '薄弱题专项回炉 · 选项已随机打乱',
        jumpSection: '回看正文对应小节',
        feynmanTitle: '费曼微输出 · 用一句话写出你的理解或错因',
        feynmanPlaceholder: '例：我刚才把平衡力和相互作用力混了，其实一对相互作用力必须作用在两个不同物体上…',
        feynmanSave: '保存笔记',
        feynmanSaved: '已保存反思',
        revealRationale: '先自己复述一遍理由，再点此展开解析',
        copyForCoach: '复制诊断给 DeepSeek 辅导',
        copiedCoach: '已复制，粘贴到对话即可',
        reviewNow: '建议立即回炉',
        reviewInDays: '%s 天后复习',
        masteryBar: '累计掌握',
        startFullQuiz: '完整重测',
        dailyReview: '今日复习',
        dailyReviewEmpty: '今日复习已清空，做得不错！',
        dailyReviewHint: '跨课时交错提取练习：按高危误解 → 盲区 → 蒙对 → 到期复习的顺序混合出题，选项已随机打乱。',
        backToLessons: '返回课时',
        mindRecall: '遮罩自测',
        mindRevealAll: '全部揭晓',
        mindRecallHint: '已遮罩叶子节点：先在脑中回想答案，再点击模糊胶囊核对。',
        mindHeatmapLegend: '节点色点对应测验掌握度',
        clozeMode: '遮罩完形',
        clozeHint: '已遮罩 %s 个核心概念词：阅读时先在脑中补全，再点击模糊胶囊验证。',
        clozeRevealAll: '全部揭晓',
        socraticPause: '提问处暂停思考',
        thinkPrompt: '思考时刻：先自己想 5 秒，如果让你来回答，你会怎么解释？',
        continueTeacher: '继续听老师解答 →',
        audioInteractive: '互动对话',
        audioPodcast: '示范播客',
        audioMe: '你',
        audioInputPlaceholder: '用自己的话回答老师的问题（回车发送）…',
        audioSend: '发送回答',
        audioMic: '语音回答',
        audioMicListening: '聆听中…',
        audioNextStep: '进入下一步 →',
        audioSkipStep: '跳过，进入下一步 →',
        audioRestart: '重新开始',
        audioDone: '互动对话已完成！你用自己的话走完了这一节的核心推演。',
        audioAutoVoice: '自动朗读',
        verdictAligned: '答到点了',
        verdictMisconception: '纠偏追问',
        verdictPartial: '再进一步',
        profileBtn: '学习画像',
        profileTitle: '我的个性化学习画像（跨课时持久化）',
        profileInterests: '兴趣锚点（逗号分隔）',
        profileStyle: '偏好讲解风格',
        profileSave: '保存画像',
        profileSaved: '画像已保存',
        profileMisconceptions: '高频误区记忆（测验高危误解 / 费曼批改 / 音频互动自动沉淀，也可手动增删）',
        profileStage: '学习身份 / 阶段',
        profileStagePlaceholder: '如：初二 / 高三物理冲刺 / 大三计算机 / 在职转 AI',
        profileGoal: '当前学习目标',
        profileGoalPlaceholder: '如：两周内吃透牛顿力学与受力分析',
        profileCustom: '自定义导师指令（最高优先级注入所有实时 AI 对话、重讲、批改与变式题）',
        profileCustomPlaceholder: '例：先给结论再拆解原理，别过度夸奖；我答错时直接指出哪个前提假设错了，多举编程或篮球反例。',
        profilePresets: '一键套用人设模板',
        profileAddMiscPlaceholder: '手动添加一条你容易踩的思维误区，回车添加…',
        reexplain: '换个讲法',
        reexplainAnalogy: '通俗类比',
        reexplainRigorous: '硬核本质',
        reexplainCounter: '反例防坑',
        reexplainLoading: 'AI 导师正在按你的画像重讲…',
        feynmanGradeBtn: '提交给 AI 导师批改',
        feynmanGrading: 'AI 批改中…',
        variantBtn: '出 1 道变式题考我',
        variantLoading: '正在结合你的兴趣编新题…',
        variantTitle: 'AI 实时迁移变式题',
        tutorNext: 'AI 导师建议',
        metaDetails: '目标与体检',
        close: '关闭',
        aiThinking: 'AI 导师正在思考…',
        quizProgress: '作答进度',
      },
      en: {
        panel: 'Learn Your Way',
        subtitle: 'Personalisation · multiple representations · formative assessment — the two-stage pipeline of arXiv:2509.13348',
        tabImmersive: 'Immersive text',
        tabSlides: 'Slides',
        tabAudio: 'Audio lesson',
        tabMindmap: 'Mind map',
        tabSource: 'Source',
        tabQuiz: 'Quiz',
        refresh: 'Refresh',
        loading: 'Loading…',
        empty: 'No lessons yet',
        emptyHint: 'Ask DeepSeek to turn a textbook section into a lesson: give it the text (PDF, page, or pasted passage) and say "make this a lesson for an 8th grader who likes basketball". It appears here when it is saved.',
        howTo: 'How to use',
        howToTitle: 'Three steps',
        howToSteps: [
          'Hand the source to DeepSeek: paste the text, drop a PDF, or point at a chapter.',
          'State the two personalisation axes: the learner grade and one interest (basketball, cooking, music…).',
          'Read the result here: highlighted sentences are the interest rewrites — "See original" compares them. Finish with the quiz to get Glows / Grows.',
        ],
        lessons: 'Lessons',
        grade: 'Grade',
        interest: 'Interest',
        demo: 'Demo',
        delete: 'Delete',
        deleteConfirm: 'Delete this lesson?',
        objectives: 'Learning objectives',
        personalized: 'Personalised',
        showOriginal: 'See original',
        showPersonalized: 'See rewrite',
        embedded: 'Check while reading',
        correct: 'Correct',
        incorrect: 'Not quite',
        correctAnswerIs: 'Correct answer',
        tryAgain: 'Try again',
        timeline: 'Timeline',
        timelineHint: 'Drag the items, or use ↑ ↓, then check the order.',
        timelineCheck: 'Check order',
        timelineOk: 'Order is correct',
        timelineWrong: 'Not the right order yet',
        reset: 'Reset',
        memoryAid: 'Memory aid',
        illustration: 'Illustration',
        brief: 'Drawing brief',
        slideOf: 'Slide %s of %s',
        prev: 'Previous',
        next: 'Next',
        narrate: 'Read narration',
        stop: 'Stop',
        keyConcepts: 'Key concepts',
        teacher: 'Teacher',
        student: 'Student',
        play: 'Play conversation',
        quizHint: 'Answer everything, then submit to see the score and the Glows / Grows.',
        submit: 'Submit quiz',
        submitting: 'Grading…',
        score: 'Score',
        glows: 'Glows · what worked',
        grows: 'Grows · what to improve',
        retake: 'Try again',
        yourChoice: 'Your choice',
        unanswered: 'Not answered',
        coverage: 'Term coverage',
        gradeCheck: 'Grade fit',
        sentenceLoad: 'Sentence load',
        stats: 'Composition',
        dataDir: 'Data directory',
        attribution: 'Source',
        checkOk: 'Pass',
        checkWarn: 'Improve',
        checkUnknown: 'Unmeasurable',
        noSource: 'This lesson carries no source text, so coverage and comparison cannot be measured.',
        chapters: 'sections',
        blocks: 'blocks',
        questions: 'questions',
        turns: 'turns',
        slides: 'slides',
        difficulty: { easy: 'easy', medium: 'medium', hard: 'hard' },
        fragments: 'Reveal step by step',
        fragmentsHint: 'Progressive bullets (reveal.js fragments): space/→ reveals the next one, then the next slide.',
        notes: 'Speaker notes',
        fullscreen: 'Fullscreen',
        exportTitle: 'Export this deck',
        export: 'Export',
        exporting: 'Exporting…',
        exportHint: 'Exports with the active theme: PPTX rendered by PptxGenJS with cards, shapes and speaker notes; offline HTML with built-in theme switcher & overview; Marp Markdown.',
        theme: 'Theme',
        overview: 'Overview',
        presenter: 'Presenter',
        exitOverview: 'Back to stage',
        layoutLabel: 'Layout',
        confHigh: 'Confident',
        confLow: 'Unsure',
        quadMastered: 'Mastered',
        quadFragile: 'Fragile / Lucky',
        quadMisconception: 'Misconception',
        quadGap: 'Knowledge gap',
        filterAll: 'All items',
        drillWeak: 'Drill weak items',
        drillBadge: 'Targeted drill · choices shuffled',
        jumpSection: 'Review source section',
        feynmanTitle: 'Feynman self-explanation · summarize in one sentence',
        feynmanPlaceholder: 'e.g. I confused balanced forces with a force pair; a force pair acts on two different objects…',
        feynmanSave: 'Save note',
        feynmanSaved: 'Reflection saved',
        revealRationale: 'Try explaining why first, then reveal rationale',
        copyForCoach: 'Copy report for DeepSeek',
        copiedCoach: 'Copied! Paste in chat',
        reviewNow: 'Review now',
        reviewInDays: 'Review in %s d',
        masteryBar: 'Mastery',
        startFullQuiz: 'Full quiz',
        dailyReview: 'Daily review',
        dailyReviewEmpty: 'All caught up for today!',
        dailyReviewHint: 'Interleaved practice across lessons: misconceptions first, then gaps, fragile and due items — choices shuffled.',
        backToLessons: 'Back to lessons',
        mindRecall: 'Recall mode',
        mindRevealAll: 'Reveal all',
        mindRecallHint: 'Leaf nodes hidden: recall from memory first, then click any blurred pill to check.',
        mindHeatmapLegend: 'Dots reflect quiz mastery',
        clozeMode: 'Cloze mode',
        clozeHint: '%s key concepts masked: recall while reading, then click any pill to reveal.',
        clozeRevealAll: 'Reveal all',
        socraticPause: 'Pause on questions',
        thinkPrompt: 'Pause & predict: take 5 seconds — how would you explain this?',
        continueTeacher: 'Hear teacher explain →',
        audioInteractive: 'Interactive',
        audioPodcast: 'Podcast demo',
        audioMe: 'You',
        audioInputPlaceholder: 'Answer in your own words (Enter to send)…',
        audioSend: 'Send reply',
        audioMic: 'Voice reply',
        audioMicListening: 'Listening…',
        audioNextStep: 'Next step →',
        audioSkipStep: 'Skip to next →',
        audioRestart: 'Restart',
        audioDone: 'Interactive session complete! You reasoned through every checkpoint in your own words.',
        audioAutoVoice: 'Auto-read',
        verdictAligned: 'Spot on',
        verdictMisconception: 'Misconception check',
        verdictPartial: 'Almost there',
        profileBtn: 'My profile',
        profileTitle: 'My learner profile (persisted across lessons)',
        profileInterests: 'Interests (comma-separated)',
        profileStyle: 'Preferred style',
        profileSave: 'Save profile',
        profileSaved: 'Profile saved',
        profileMisconceptions: 'Recurring misconceptions (auto-recorded from quiz, Feynman & audio, or add manually)',
        profileStage: 'Learner stage / role',
        profileStagePlaceholder: 'e.g. Grade 8 / AP Physics / CS undergrad / Engineer',
        profileGoal: 'Current learning goal',
        profileGoalPlaceholder: 'e.g. Master Newton’s laws in two weeks',
        profileCustom: 'Custom tutor instructions (injected with top priority into all live AI features)',
        profileCustomPlaceholder: 'e.g. Lead with the core principle, skip fluff, directly expose flawed assumptions with counter-examples.',
        profilePresets: 'Quick persona presets',
        profileAddMiscPlaceholder: 'Manually add a recurring misconception and press Enter…',
        reexplain: 'Re-explain',
        reexplainAnalogy: 'Analogy',
        reexplainRigorous: 'First principles',
        reexplainCounter: 'Counter-example',
        reexplainLoading: 'Tutor is re-explaining for your profile…',
        feynmanGradeBtn: 'Ask AI tutor to grade',
        feynmanGrading: 'Grading…',
        variantBtn: 'Generate transfer variant',
        variantLoading: 'Crafting a fresh variant…',
        variantTitle: 'Live transfer variant',
        tutorNext: 'Tutor next step',
        metaDetails: 'Goals & checks',
        close: 'Close',
        aiThinking: 'AI tutor is thinking…',
        quizProgress: 'Progress',
      },
    }

    /** Translate one key, with `%s` placeholders. */
    function t(key, ...args) {
      const table = DICT[LANG] ?? DICT.zh
      let value = table[key] ?? DICT.zh[key] ?? key
      if (typeof value === 'string') {
        for (const arg of args) value = value.replace('%s', String(arg))
      }
      return value
    }

    // ---------------------------------------------------------------- styles

    const styles = {
      page: {
        minHeight: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
      },
      inner: { maxWidth: 1060, margin: '0 auto', padding: '26px 30px 64px' },
      header: { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
      title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.2 },
      subtitle: { margin: '5px 0 0', fontSize: 13, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.55 },
      spacer: { flex: 1 },
      button: {
        appearance: 'none',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 9,
        padding: '6px 12px',
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        font: 'inherit',
        lineHeight: 1.4,
        transition: 'background .15s ease, border-color .15s ease',
      },
      buttonPrimary: {
        appearance: 'none',
        border: '0.5px solid transparent',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        borderRadius: 9,
        padding: '8px 16px',
        fontSize: 13,
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: 600,
        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.22)',
      },
      buttonGhost: {
        appearance: 'none',
        border: '0.5px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 8,
        padding: '4px 9px',
        fontSize: 12,
        cursor: 'pointer',
        font: 'inherit',
      },
      card: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 14,
        padding: '18px 20px',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
      },
      softCard: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 12,
        padding: '14px 16px',
      },
      chips: { display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
      chip: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11.5,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      },
      chipOk: { color: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-primary)' },
      chipWarn: { color: 'var(--dsw-alias-state-warn-primary)', borderColor: 'var(--dsw-alias-state-warn-primary)' },
      chipBad: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
      rail: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 18 },
      railItem: {
        textAlign: 'left',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 12,
        padding: '10px 14px',
        minWidth: 186,
        maxWidth: 260,
        cursor: 'pointer',
        font: 'inherit',
        flex: '0 0 auto',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
      },
      railItemActive: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        boxShadow: 'inset 0 0 0 1px var(--dsw-alias-brand-primary), 0 6px 18px rgba(37, 99, 235, 0.10)',
      },
      railTitle: { display: 'block', fontSize: 13.2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      railMeta: { display: 'block', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 },
      tabs: {
        display: 'inline-flex',
        gap: 4,
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 11,
        padding: 4,
        marginBottom: 18,
        flexWrap: 'wrap',
      },
      tab: {
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        padding: '6px 13px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        font: 'inherit',
      },
      tabActive: {
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontWeight: 600,
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.08)',
      },
      prose: { fontSize: 15, lineHeight: 1.78, maxWidth: 680 },
      heading2: { fontSize: 15.5, fontWeight: 600, margin: '22px 0 8px' },
      paragraph: { margin: '0 0 12px', whiteSpace: 'pre-wrap' },
      personalized: {
        borderLeft: '3px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        padding: '10px 12px 10px 13px',
        borderRadius: '0 8px 8px 0',
        margin: '0 0 12px',
      },
      badgeRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
      badge: {
        fontSize: 10.5,
        letterSpacing: '0.02em',
        color: 'var(--dsw-alias-brand-primary)',
        background: 'transparent',
        textTransform: 'uppercase',
      },
      callout: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderLeft: '3px solid var(--dsw-alias-state-warn-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: '0 8px 8px 0',
        padding: '10px 12px',
        margin: '6px 0 14px',
        fontSize: 14,
        lineHeight: 1.7,
      },
      calloutInsight: { borderLeftColor: 'var(--dsw-alias-brand-primary)' },
      list: { margin: '0 0 12px', paddingLeft: 22, fontSize: 14.5, lineHeight: 1.75 },
      choice: {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '8px 11px',
        fontSize: 13.5,
        lineHeight: 1.55,
        cursor: 'pointer',
        font: 'inherit',
        marginBottom: 6,
      },
      choicePicked: { borderColor: 'var(--dsw-alias-brand-primary)', boxShadow: 'inset 0 0 0 1px var(--dsw-alias-brand-primary)' },
      choiceRight: { borderColor: 'var(--dsw-alias-state-success-primary)', color: 'var(--dsw-alias-state-success-primary)' },
      choiceWrong: { borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
      hint: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6, margin: '6px 0 0' },
      ok: { color: 'var(--dsw-alias-state-success-primary)' },
      bad: { color: 'var(--dsw-alias-state-error-primary)' },
      warn: { color: 'var(--dsw-alias-state-warn-primary)' },
      timelineItem: {
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: 6,
        cursor: 'grab',
        fontSize: 13.5,
      },
      timelineItemOk: { borderColor: 'var(--dsw-alias-state-success-primary)' },
      timelineItemBad: { borderColor: 'var(--dsw-alias-state-error-primary)' },
      index: {
        flex: '0 0 auto',
        width: 20,
        height: 20,
        borderRadius: 999,
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      bubble: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        padding: '9px 12px',
        marginBottom: 8,
        maxWidth: '86%',
        fontSize: 14,
        lineHeight: 1.68,
      },
      bubbleTeacher: { background: 'var(--dsw-alias-bg-layer-1)', marginRight: 'auto', borderTopLeftRadius: 4 },
      bubbleStudent: {
        background: 'var(--dsw-alias-bg-layer-2)',
        marginLeft: 'auto',
        borderTopRightRadius: 4,
        borderColor: 'var(--dsw-alias-border-l2)',
      },
      speaker: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 3, display: 'block' },
      mindNode: { marginLeft: 0 },
      mindChildren: { marginLeft: 16, paddingLeft: 12, borderLeft: '0.5px solid var(--dsw-alias-border-l1)' },
      mindRow: {
        display: 'flex',
        gap: 6,
        alignItems: 'baseline',
        padding: '3px 0',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
      },
      mindLabel: { fontSize: 13.8, lineHeight: 1.6 },
      mindRootLabel: { fontSize: 15, fontWeight: 600 },
      mindNote: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 },
      slide: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 12,
        padding: '20px 22px',
        minHeight: 210,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      },
      slideTitle: { margin: '0 0 12px', fontSize: 17, fontWeight: 600, lineHeight: 1.4 },
      bullet: { margin: '0 0 7px', fontSize: 14.5, lineHeight: 1.65, paddingLeft: 16, position: 'relative' },
      narration: {
        marginTop: 14,
        paddingTop: 12,
        borderTop: '0.5px dashed var(--dsw-alias-border-l2)',
        fontSize: 13.5,
        lineHeight: 1.72,
        color: 'var(--dsw-alias-label-secondary)',
      },
      buttonOn: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-brand-primary)',
        boxShadow: 'inset 0 0 0 1px var(--dsw-alias-brand-primary)',
      },
      deckStage: {
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        aspectRatio: '16 / 9',
        maxHeight: '62vh',
        overflow: 'hidden',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 16,
        background: '#FAF9F6',
        padding: '4.6% 5.8% 5.4%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        cursor: 'pointer',
        outline: 'none',
        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.05)',
        transition: 'background .22s ease, color .22s ease',
      },
      deckStageLead: {
        justifyContent: 'center',
      },
      deckStageSection: {
        borderLeft: '5px solid #1D4ED8',
      },
      deckStudioBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        padding: '10px 12px',
        borderRadius: 12,
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      themePill: {
        appearance: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11.5,
        fontWeight: 500,
        cursor: 'pointer',
        font: 'inherit',
      },
      themeDot: {
        width: 9,
        height: 9,
        borderRadius: 999,
        display: 'inline-block',
        flex: '0 0 auto',
      },
      presenterGrid: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.65fr) minmax(240px, 1fr)',
        gap: 16,
        alignItems: 'start',
        width: '100%',
        boxSizing: 'border-box',
      },
      presenterNotes: {
        boxSizing: 'border-box',
        minWidth: 0,
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'auto',
        minHeight: 240,
        maxHeight: '62vh',
      },
      filmstrip: {
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '10px 2px 4px',
      },
      filmThumb: {
        appearance: 'none',
        flex: '0 0 156px',
        textAlign: 'left',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        padding: '9px 11px',
        cursor: 'pointer',
        font: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'transform .14s ease, border-color .14s ease',
      },
      overviewGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
        gap: 12,
        marginBottom: 8,
      },
      overviewCard: {
        appearance: 'none',
        textAlign: 'left',
        aspectRatio: '16 / 9',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        font: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        position: 'relative',
      },
      deckKicker: {
        display: 'inline-flex',
        alignSelf: 'flex-start',
        margin: '0 0 12px',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      },
      deckTitle: { margin: '0 0 10px', fontSize: 28, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.025em' },
      deckHeading: { margin: '0 0 16px', fontSize: 21, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.015em' },
      deckSubtitle: { margin: '0 0 10px', fontSize: 14, lineHeight: 1.5 },
      deckList: { margin: 0, paddingLeft: 0, listStyle: 'none' },
      deckBullet: { fontSize: 14.5, lineHeight: 1.68, marginBottom: 7, display: 'flex', gap: 9, alignItems: 'flex-start' },
      deckQuote: {
        margin: 0,
        padding: '18px 22px',
        borderLeft: '4px solid currentColor',
        borderRadius: '0 12px 12px 0',
        fontSize: 18,
        fontWeight: 500,
        lineHeight: 1.55,
      },
      deckCite: { display: 'block', marginTop: 10, fontSize: 12.5, fontStyle: 'normal' },
      deckColumns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
      deckCardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
      deckStepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 },
      deckStatsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 },
      deckFooter: {
        position: 'absolute',
        left: '5.8%',
        right: '5.8%',
        bottom: '3.6%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10.5,
        paddingTop: 7,
      },
      empty: { textAlign: 'center', padding: '48px 24px', color: 'var(--dsw-alias-label-secondary)' },
      footer: { marginTop: 28, paddingTop: 12, borderTop: '0.5px solid var(--dsw-alias-border-l1)', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.7 },
      quadGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 },
      quadCard: {
        appearance: 'none',
        textAlign: 'left',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        font: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      },
      confToggle: {
        appearance: 'none',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11.5,
        cursor: 'pointer',
        font: 'inherit',
      },
      feynmanBox: {
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      feynmanInput: {
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 54,
        resize: 'vertical',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 13,
        lineHeight: 1.55,
        font: 'inherit',
      },
      sectionFocus: {
        border: '1px solid var(--dsw-alias-brand-primary)',
        borderRadius: 12,
        padding: '8px 14px 12px',
        margin: '8px -14px 12px',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      mindBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
      },
      mindDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        display: 'inline-block',
        marginRight: 6,
        flex: '0 0 auto',
      },
      mindMasked: {
        appearance: 'none',
        border: '0.5px dashed var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'transparent',
        textShadow: '0 0 8px var(--dsw-alias-label-secondary)',
        borderRadius: 7,
        padding: '2px 10px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 13.5,
        userSelect: 'none',
      },
      clozePill: {
        appearance: 'none',
        display: 'inline',
        border: '0.5px dashed var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'transparent',
        textShadow: '0 0 7px var(--dsw-alias-label-secondary)',
        borderRadius: 6,
        padding: '0 6px',
        margin: '0 2px',
        cursor: 'pointer',
        font: 'inherit',
        userSelect: 'none',
      },
      clozeRevealed: {
        display: 'inline',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-brand-primary)',
        borderRadius: 5,
        padding: '0 4px',
        fontWeight: 600,
      },
      thinkBanner: {
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 12,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      audioComposer: {
        marginTop: 14,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      audioInput: {
        flex: 1,
        minWidth: 180,
        boxSizing: 'border-box',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 9,
        padding: '8px 12px',
        fontSize: 13.5,
        font: 'inherit',
      },
      tutorBar: {
        marginBottom: 14,
        padding: '11px 14px',
        borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l2)',
        borderLeft: '4px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      reexplainCard: {
        marginTop: 8,
        padding: '10px 13px',
        borderRadius: 10,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderLeft: '3px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        fontSize: 13.5,
        lineHeight: 1.68,
      },
      variantCard: {
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      profileGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 12,
      },
      progressTrack: {
        width: '100%',
        height: 4,
        borderRadius: 99,
        background: 'var(--dsw-alias-bg-layer-2)',
        overflow: 'hidden',
        marginTop: 6,
      },
      progressFill: {
        height: '100%',
        borderRadius: 99,
        background: 'var(--dsw-alias-brand-primary)',
        transition: 'width .24s ease',
      },
    }

    /** Inject scoped micro-interaction CSS once into document.head (hover, active, focus rings, fade). */
    function ensureUiStyles() {
      if (typeof document === 'undefined' || !document.head) return
      if (document.getElementById('lw-ui-styles')) return
      const el = document.createElement('style')
      el.id = 'lw-ui-styles'
      el.textContent = `
        .lw-root button { transition: transform .12s ease, background-color .15s ease, border-color .15s ease, box-shadow .15s ease, opacity .15s ease; }
        .lw-root button:not(:disabled):hover { filter: brightness(0.97); }
        .lw-root button:not(:disabled):active { transform: scale(0.985); }
        .lw-root button:focus-visible, .lw-root input:focus-visible, .lw-root textarea:focus-visible {
          outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
        }
        .lw-root .lw-rail-item:hover { transform: translateY(-1px); border-color: var(--dsw-alias-brand-primary); }
        .lw-root .lw-fade { animation: lwFadeIn .2s cubic-bezier(.22,1,.36,1); }
        @keyframes lwFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes lwPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
        .lw-root .lw-thinking { animation: lwPulse 1.3s ease-in-out infinite; }
      `
      document.head.appendChild(el)
    }

    // ------------------------------------------------------------------- api

    /** Parse a response body without throwing on a non-JSON body. */
    async function readPayload(response) {
      const text = await response.text()
      try {
        return text ? JSON.parse(text) : {}
      } catch {
        return { ok: false, error: { code: 'bad-response', message: text.slice(0, 300) || `HTTP ${response.status}` } }
      }
    }

    /** GET one endpoint with optional query parameters. */
    async function apiGet(path, params) {
      const url = new URL(`${API}${path}`, document.baseURI)
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
      }
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      return readPayload(response)
    }

    /** POST JSON to one endpoint. */
    async function apiPost(path, body) {
      const response = await fetch(new URL(`${API}${path}`, document.baseURI), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      return readPayload(response)
    }

    // ---------------------------------------------------------------- speech

    /** Speech synthesis is optional: without it, everything still renders. */
    const speech = {
      get available() {
        return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
          && typeof window.SpeechSynthesisUtterance === 'function'
      },
      cancel() {
        if (speech.available) window.speechSynthesis.cancel()
      },
      speak(text, language, onEnd) {
        if (!speech.available || !text) return false
        const utterance = new window.SpeechSynthesisUtterance(String(text))
        utterance.lang = language === 'en' ? 'en-US' : 'zh-CN'
        utterance.rate = 1
        if (typeof onEnd === 'function') {
          // `onerror` and `onend` can both fire; the caller advances one turn
          // per utterance, so only the first callback is allowed through.
          let finished = false
          const finish = () => {
            if (finished) return
            finished = true
            onEnd()
          }
          utterance.onend = finish
          utterance.onerror = finish
        }
        window.speechSynthesis.speak(utterance)
        return true
      },
    }

    // ------------------------------------------------------------ components

    /** One inline metric chip. */
    function Chip({ children, tone }) {
      const toneStyle = tone === 'ok' ? styles.chipOk : tone === 'warn' ? styles.chipWarn : tone === 'bad' ? styles.chipBad : null
      return h('span', { style: { ...styles.chip, ...(toneStyle ?? {}) } }, children)
    }

    /** Chip for one validator check. */
    function CheckChip({ check }) {
      const tone = check.ok === true ? 'ok' : check.ok === false ? 'warn' : undefined
      const mark = check.ok === true ? '✓' : check.ok === false ? '!' : '·'
      return h(Chip, { tone }, `${mark} ${check.label}${check.detail ? ` · ${check.detail}` : ''}`)
    }

    /** Compact header strip with progressive disclosure for objectives & rubric checks. */
    function LessonMeta({ lesson, measurement }) {
      const [expanded, setExpanded] = useState(false)
      const checks = measurement?.checks ?? []
      const grade = measurement?.grade
      const cover = measurement?.coverage
      const text = measurement?.text
      const stats = measurement?.stats
      const passedChecks = checks.filter((c) => c.ok === true).length
      const hasDetails = (lesson.objectives?.length ?? 0) > 0 || checks.length > 0

      return h('div', { style: { marginBottom: 12 } },
        h('div', { style: { ...styles.chips, justifyContent: 'space-between' } },
          h('div', { style: styles.chips },
            h(Chip, null, `${t('grade')} ${lesson.learner?.grade ?? '—'}`),
            lesson.learner?.interest ? h(Chip, null, `${t('interest')} ${lesson.learner.interest}`) : null,
            text && typeof text.fleschKincaidGrade === 'number'
              ? h(Chip, { tone: grade?.verdict === 'within' ? 'ok' : grade?.verdict === 'off' ? 'bad' : 'warn' }, `FKG ${text.fleschKincaidGrade}${grade?.target ? ` / ${grade.target}` : ''}`)
              : text ? h(Chip, null, `${t('sentenceLoad')} ${text.avgSentenceLength ?? '—'}`) : null,
            cover && typeof cover.ratio === 'number'
              ? h(Chip, { tone: cover.ratio >= 0.35 ? 'ok' : 'warn' }, `${t('coverage')} ${Math.round(cover.ratio * 100)}%`)
              : null,
            stats
              ? h(Chip, null, `${stats.sections}${t('chapters')} · ${stats.slides}${t('slides')} · ${stats.quizQuestions}${t('questions')}`)
              : null),
          hasDetails
            ? h('button', {
              type: 'button',
              style: { ...styles.buttonGhost, ...(expanded ? styles.buttonOn : {}) },
              onClick: () => setExpanded((v) => !v),
            }, `${t('metaDetails')}${checks.length > 0 ? ` · ${passedChecks}/${checks.length} ✓` : ''} ${expanded ? '▴' : '▾'}`)
            : null),
        expanded
          ? h('div', { className: 'lw-fade', style: { ...styles.softCard, marginTop: 10 } },
            lesson.objectives?.length > 0
              ? h('div', { style: { marginBottom: checks.length > 0 ? 10 : 0 } },
                h('div', { style: { fontSize: 11.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, t('objectives')),
                h('ul', { style: { ...styles.list, margin: 0, fontSize: 13.2 } },
                  lesson.objectives.map((objective, index) => h('li', { key: index }, objective))))
              : null,
            checks.length > 0
              ? h('div', { style: styles.chips }, checks.map((check) => h(CheckChip, { key: check.id, check })))
              : null)
          : null)
    }

    /** Split a string into plain text and interactive cloze pills for key terms. */
    function renderClozeText(rawText, terms, revealed, onReveal, prefix) {
      if (!rawText || !terms || terms.length === 0) return rawText
      const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
      const pattern = new RegExp(`(${escaped.join('|')})`, 'giu')
      const parts = String(rawText).split(pattern)
      if (parts.length <= 1) return rawText
      return parts.map((part, idx) => {
        if (idx % 2 === 0) return part
        const key = `${prefix}-${idx}`
        if (revealed[key]) return h('span', { key, style: styles.clozeRevealed }, part)
        return h('button', {
          key,
          type: 'button',
          style: styles.clozePill,
          onClick: () => onReveal(key),
          title: part.length > 0 ? t('clozeMode') : undefined,
        }, part)
      })
    }

    /** One paragraph of the immersive text, with source toggle, cloze masking, and on-demand AI re-explain. */
    function ParagraphBlock({ block, lessonId, clozeTerms, clozeRevealed, onClozeReveal, clozeKey }) {
      const [showOriginal, setShowOriginal] = useState(false)
      const [reOpen, setReOpen] = useState(false)
      const [reLoading, setReLoading] = useState(false)
      const [reResult, setReResult] = useState(null)

      const renderBody = (content) => (clozeTerms && clozeTerms.length > 0
        ? renderClozeText(content, clozeTerms, clozeRevealed, onClozeReveal, clozeKey)
        : content)

      const runReexplain = async (mode) => {
        if (!lessonId || reLoading) return
        setReLoading(true)
        setReResult(null)
        try {
          const payload = await apiPost('/reexplain', { id: lessonId, text: block.text, mode })
          setReResult(payload)
        } catch (cause) {
          setReResult({ ok: false, reason: String(cause?.message ?? cause) })
        } finally {
          setReLoading(false)
        }
      }

      const reexplainPanel = reOpen
        ? h('div', { style: styles.reexplainCard },
          h('div', { style: { ...styles.chips, marginBottom: reResult || reLoading ? 8 : 0 } },
            h('button', { type: 'button', style: styles.button, disabled: reLoading, onClick: () => runReexplain('analogy') }, t('reexplainAnalogy')),
            h('button', { type: 'button', style: styles.button, disabled: reLoading, onClick: () => runReexplain('rigorous') }, t('reexplainRigorous')),
            h('button', { type: 'button', style: styles.button, disabled: reLoading, onClick: () => runReexplain('counterexample') }, t('reexplainCounter'))),
          reLoading ? h('div', { style: styles.hint }, t('reexplainLoading')) : null,
          reResult
            ? (reResult.ok
              ? h('div', null,
                reResult.model ? h('div', { style: { ...styles.hint, marginTop: 0, marginBottom: 4 } }, `⚡ ${reResult.model}`) : null,
                h('div', { style: { whiteSpace: 'pre-wrap' } }, reResult.explanation))
              : h('div', { style: { ...styles.hint, ...styles.warn } }, reResult.reason))
            : null)
        : null

      if (!block.original) {
        return h('div', { style: { maxWidth: 680, marginBottom: 12 } },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
            h('p', { style: { ...styles.prose, ...styles.paragraph, margin: 0, flex: 1 } }, renderBody(block.text)),
            lessonId
              ? h('button', { type: 'button', style: { ...styles.buttonGhost, flex: '0 0 auto' }, onClick: () => setReOpen((v) => !v) }, t('reexplain'))
              : null),
          reexplainPanel)
      }
      return h('div', { style: { ...styles.personalized, maxWidth: 680 } },
        h('div', { style: { ...styles.badgeRow, justifyContent: 'space-between' } },
          h('span', { style: styles.badge }, t('personalized')),
          h('div', { style: styles.chips },
            lessonId
              ? h('button', { type: 'button', style: styles.buttonGhost, onClick: () => setReOpen((v) => !v) }, t('reexplain'))
              : null,
            h('button', {
              type: 'button',
              style: styles.buttonGhost,
              onClick: () => setShowOriginal((value) => !value),
            }, showOriginal ? t('showPersonalized') : t('showOriginal')))),
        h('p', {
          style: { ...styles.prose, margin: 0, fontSize: showOriginal ? 13.5 : 15, color: showOriginal ? 'var(--dsw-alias-label-secondary)' : undefined },
        }, showOriginal ? block.original : renderBody(block.text)),
        reexplainPanel)
    }

    /** One block of the immersive text. */
    function Block({ block, lessonId, clozeTerms, clozeRevealed, onClozeReveal, clozeKey }) {
      if (block.type === 'list') {
        return h('ul', { style: styles.list }, block.items.map((item, index) => h('li', { key: index },
          clozeTerms && clozeTerms.length > 0
            ? renderClozeText(item, clozeTerms, clozeRevealed, onClozeReveal, `${clozeKey}-li-${index}`)
            : item)))
      }
      if (block.type === 'callout') {
        return h('div', { style: { ...styles.callout, ...(block.tone === 'insight' ? styles.calloutInsight : {}) } },
          block.title ? h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 13.5 } }, block.title) : null,
          h('div', null, clozeTerms && clozeTerms.length > 0
            ? renderClozeText(block.text, clozeTerms, clozeRevealed, onClozeReveal, `${clozeKey}-co`)
            : block.text))
      }
      return h(ParagraphBlock, { block, lessonId, clozeTerms, clozeRevealed, onClozeReveal, clozeKey })
    }

    /** A multiple-choice question with immediate feedback (embedded or quiz). */
    function QuestionCard({ question, chosen, onChoose, compact, difficultyLabel }) {
      const answered = typeof chosen === 'number'
      const isRight = answered && chosen === question.answerIndex
      return h('div', { style: { ...styles.softCard, margin: '14px 0' } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 } },
          h('span', { style: { ...styles.index, flex: '0 0 auto' } }, '?'),
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 13.8, fontWeight: 500, lineHeight: 1.6 } }, question.stem),
            difficultyLabel
              ? h('div', { style: { ...styles.hint, marginTop: 2 } }, difficultyLabel)
              : null)),
        question.choices.map((choice, index) => {
          const picked = answered && chosen === index
          const reveal = answered && index === question.answerIndex
          const style = {
            ...styles.choice,
            ...(picked && !reveal ? styles.choiceWrong : {}),
            ...(reveal && (answered) ? styles.choiceRight : {}),
            ...(picked && reveal ? styles.choiceRight : {}),
          }
          return h('button', {
            key: index,
            type: 'button',
            style,
            disabled: answered && compact,
            onClick: () => onChoose(index),
          }, `${String.fromCharCode(65 + index)}. ${choice}`)
        }),
        answered
          ? h('div', { style: { marginTop: 4 } },
            h('div', { style: { fontSize: 12.5, fontWeight: 500, marginBottom: 3, ...(isRight ? styles.ok : styles.bad) } },
              isRight ? t('correct') : `${t('incorrect')} · ${t('correctAnswerIs')} ${String.fromCharCode(65 + question.answerIndex)}`),
            question.rationale ? h('p', { style: { ...styles.hint, margin: 0 } }, question.rationale) : null)
          : null)
    }

    /** Shuffle deterministically so the practice order is stable per mount. */
    function shuffleItems(items) {
      const copy = items.slice()
      let seed = 20250913
      for (let index = copy.length - 1; index > 0; index -= 1) {
        seed = (seed * 1103515245 + 12345) % 2147483648
        const swap = seed % (index + 1)
        const hold = copy[index]
        copy[index] = copy[swap]
        copy[swap] = hold
      }
      // A shuffle that happens to return the answer is not a practice.
      if (copy.every((item, index) => item === items[index]) && copy.length > 1) {
        copy.push(copy.shift())
      }
      return copy
    }

    /** Timeline: order the source sequence, then check (the paper's drag-and-drop practice). */
    function TimelinePractice({ timeline }) {
      const original = useMemo(() => timeline.items.map((item) => item.label), [timeline])
      const [order, setOrder] = useState(() => shuffleItems(original.map((_, index) => index)))
      const [checked, setChecked] = useState(false)
      const dragFrom = useRef(null)

      const move = useCallback((from, to) => {
        setOrder((current) => {
          if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current
          const next = current.slice()
          const [held] = next.splice(from, 1)
          next.splice(to, 0, held)
          return next
        })
        setChecked(false)
      }, [])

      const correct = order.every((value, index) => value === index)

      return h('div', { style: { ...styles.softCard, margin: '14px 0' } },
        h('div', { style: { fontSize: 12.5, fontWeight: 500, marginBottom: 6 } }, `${t('timeline')} · ${timeline.title}`),
        order.map((itemIndex, position) => {
          const item = timeline.items[itemIndex]
          const stateStyle = checked ? (itemIndex === position ? styles.timelineItemOk : styles.timelineItemBad) : {}
          return h('div', {
            key: `${itemIndex}-${position}`,
            draggable: true,
            style: { ...styles.timelineItem, ...stateStyle },
            onDragStart: () => { dragFrom.current = position },
            onDragOver: (event) => event.preventDefault(),
            onDrop: () => move(dragFrom.current, position),
          },
            h('span', { style: styles.index }, String(position + 1)),
            h('span', { style: { flex: 1 } },
              h('span', { style: { display: 'block' } }, item.label),
              item.detail ? h('span', { style: { ...styles.mindNote, display: 'block' } }, item.detail) : null),
            h('span', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
              h('button', { type: 'button', style: styles.buttonGhost, onClick: () => move(position, position - 1), 'aria-label': 'up' }, '↑'),
              h('button', { type: 'button', style: styles.buttonGhost, onClick: () => move(position, position + 1), 'aria-label': 'down' }, '↓')))
        }),
        h('div', { style: { ...styles.chips, marginTop: 8 } },
          h('button', { type: 'button', style: styles.button, onClick: () => setChecked(true) }, t('timelineCheck')),
          h('button', {
            type: 'button',
            style: styles.buttonGhost,
            onClick: () => { setOrder(shuffleItems(original.map((_, index) => index))); setChecked(false) },
          }, t('reset')),
          checked ? h('span', { style: { fontSize: 12, ...(correct ? styles.ok : styles.bad) } }, correct ? t('timelineOk') : t('timelineWrong')) : null),
        h('p', { style: styles.hint }, t('timelineHint')))
    }

    /** Mnemonic card. */
    function MemoryAid({ aid }) {
      return h('div', { style: { ...styles.softCard, margin: '14px 0', borderLeft: '3px solid var(--dsw-alias-state-warn-primary)', borderRadius: '0 10px 10px 0' } },
        h('div', { style: { fontSize: 12.5, fontWeight: 500, marginBottom: 6 } }, `${t('memoryAid')} · ${aid.items.join(' / ')}`),
        h('div', { style: { fontSize: 15, lineHeight: 1.7, marginBottom: aid.gloss ? 6 : 0 } }, aid.sentence),
        aid.gloss ? h('p', { style: { ...styles.hint, margin: 0 } }, aid.gloss) : null)
    }

    /** Illustration: the image when present, otherwise the drawing brief. */
    function Illustration({ illustration }) {
      return h('figure', { style: { ...styles.softCard, margin: '14px 0' } },
        illustration.dataUrl
          ? h('img', { src: illustration.dataUrl, alt: illustration.caption, style: { width: '100%', borderRadius: 8, display: 'block', marginBottom: 8 } })
          : null,
        h('figcaption', null,
          h('div', { style: { fontSize: 12.8, lineHeight: 1.65 } }, illustration.caption),
          !illustration.dataUrl && illustration.brief
            ? h('p', { style: { ...styles.hint, margin: '6px 0 0' } }, `${t('brief')}：${illustration.brief}`)
            : null))
    }

    /** Collect key terms from the lesson for active Cloze Deletion reading. */
    function extractClozeTerms(lesson) {
      const set = new Set()
      for (const term of lesson?.audioLesson?.keyConcepts ?? []) {
        const clean = String(term ?? '').trim()
        if (clean.length >= 2) set.add(clean)
      }
      for (const section of lesson?.immersion?.sections ?? []) {
        for (const item of section?.memoryAid?.items ?? []) {
          const clean = String(item ?? '').trim()
          if (clean.length >= 2) set.add(clean)
        }
      }
      for (const q of lesson?.quiz?.questions ?? []) {
        const clean = String(q?.concept ?? '').trim()
        if (clean.length >= 2) set.add(clean)
      }
      return [...set].sort((a, b) => b.length - a.length).slice(0, 16)
    }

    /** The personalised material with its add-ons, embedded questions, and Cloze Deletion mode. */
    function ImmersiveView({ lesson, lessonId, answers, onAnswer, focusSectionId }) {
      const sections = lesson.immersion?.sections ?? []
      const [clozeOn, setClozeOn] = useState(false)
      const [clozeRevealed, setClozeRevealed] = useState({})
      const clozeTerms = useMemo(() => extractClozeTerms(lesson), [lesson])

      useEffect(() => {
        if (!focusSectionId || typeof document === 'undefined') return
        const el = document.getElementById(`lw-sec-${focusSectionId}`)
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, [focusSectionId])

      const activeTerms = clozeOn ? clozeTerms : null

      return h('div', null,
        clozeTerms.length > 0
          ? h('div', { style: { ...styles.chips, marginBottom: 12, justifyContent: 'space-between' } },
            h('div', { style: styles.chips },
              h('button', {
                type: 'button',
                style: { ...styles.button, ...(clozeOn ? styles.buttonOn : {}) },
                onClick: () => { setClozeOn((v) => !v); setClozeRevealed({}) },
              }, t('clozeMode')),
              clozeOn
                ? h('button', { type: 'button', style: styles.buttonGhost, onClick: () => setClozeOn(false) }, t('clozeRevealAll'))
                : null),
            clozeOn ? h('span', { style: styles.hint }, t('clozeHint', clozeTerms.length)) : null)
          : null,
        sections.map((section, index) => {
          const secId = section.id ?? `s${index + 1}`
          const focused = Boolean(focusSectionId && focusSectionId === secId)
          return h('section', { key: secId, id: `lw-sec-${secId}`, style: focused ? styles.sectionFocus : undefined },
            h('h2', { style: styles.heading2 }, section.heading),
            (section.blocks ?? []).map((block, blockIndex) => h(Block, {
              key: blockIndex,
              block,
              lessonId,
              clozeTerms: activeTerms,
              clozeRevealed,
              onClozeReveal: (key) => setClozeRevealed((cur) => ({ ...cur, [key]: true })),
              clozeKey: `${secId}-b${blockIndex}`,
            })),
            section.illustration ? h(Illustration, { illustration: section.illustration }) : null,
            section.timeline ? h(TimelinePractice, { timeline: section.timeline }) : null,
            section.memoryAid ? h(MemoryAid, { aid: section.memoryAid }) : null,
            section.question
              ? h('div', null,
                h('div', { style: { ...styles.badge, marginTop: 12 } }, t('embedded')),
                h(QuestionCard, {
                  question: section.question,
                  chosen: answers[section.id ?? index],
                  onChoose: (choice) => onAnswer(section.id ?? index, choice),
                  compact: true,
                }))
              : null)
        }))
    }

    /** Five curated themes mirroring src/host/deck.js so stage and export match 1:1. */
    const STAGE_THEMES = [
      { id: 'editorial', label: '学术杂志', labelEn: 'Editorial', paper: '#FAF9F6', surface: '#FFFFFF', wash: '#F1EFEA', ink: '#141619', muted: '#5C6370', accent: '#1D4ED8', accentSoft: '#E8EEFC', warm: '#D97706', warmSoft: '#FEF3C7', line: '#E4E2DC', sectionBg: '#141923', sectionInk: '#F8FAFC', sectionMuted: '#B8C4D9' },
      { id: 'keynote', label: '深色 Keynote', labelEn: 'Keynote', paper: '#0D1117', surface: '#161C26', wash: '#1E2736', ink: '#F3F6FC', muted: '#98A4B8', accent: '#5B93FF', accentSoft: '#1B2B4B', warm: '#F59E0B', warmSoft: '#362712', line: '#283244', sectionBg: '#070A10', sectionInk: '#FFFFFF', sectionMuted: '#9FB4D6' },
      { id: 'swiss', label: '瑞士网格', labelEn: 'Swiss', paper: '#FFFFFF', surface: '#F7F7F4', wash: '#EFEFEA', ink: '#111111', muted: '#575757', accent: '#DC2626', accentSoft: '#FEE2E2', warm: '#111111', warmSoft: '#E7E7E2', line: '#E0E0DA', sectionBg: '#111111', sectionInk: '#FFFFFF', sectionMuted: '#C7C7C7' },
      { id: 'notebook', label: '暖色手账', labelEn: 'Notebook', paper: '#FDF8F0', surface: '#FFFDF9', wash: '#F5EAD8', ink: '#292118', muted: '#6F6152', accent: '#C2591A', accentSoft: '#FBECE1', warm: '#2A7B6F', warmSoft: '#E1F2EE', line: '#E8DAC6', sectionBg: '#2E231A', sectionInk: '#FDF8F0', sectionMuted: '#D7C5B2' },
      { id: 'botanical', label: '清新教材', labelEn: 'Botanical', paper: '#F5FAF7', surface: '#FFFFFF', wash: '#E7F3EC', ink: '#15261E', muted: '#4F665B', accent: '#157F5C', accentSoft: '#E1F4EC', warm: '#C27803', warmSoft: '#FEF3C7', line: '#D4E5DC', sectionBg: '#123428', sectionInk: '#F4FBF7', sectionMuted: '#B2D4C5' },
    ]

    const LAYOUT_NAMES = {
      title: '封面', section: '章节', bullets: '要点', quote: '金句', 'two-column': '双栏',
      cards: '卡片', steps: '步骤', comparison: '对比', stats: '指标',
    }

    /** The layout a slide renders with, mirroring the lesson contract. */
    function slideLayout(slide, index) {
      const declared = String(slide?.layout ?? '')
      if (['title', 'section', 'bullets', 'quote', 'two-column', 'cards', 'steps', 'comparison', 'stats'].includes(declared)) return declared
      if (Array.isArray(slide?.cards) && slide.cards.length > 0) return 'cards'
      if (Array.isArray(slide?.steps) && slide.steps.length > 0) return 'steps'
      if (Array.isArray(slide?.stats) && slide.stats.length > 0) return 'stats'
      if (slide?.comparison && typeof slide.comparison === 'object') return 'comparison'
      const hasBody = (slide?.bullets ?? []).length > 0 || Boolean(slide?.quote) || Array.isArray(slide?.columns)
      return index === 0 && !hasBody ? 'title' : 'bullets'
    }

    /** The two columns of a two-column slide, falling back to a split bullet list. */
    function slideColumns(slide) {
      const columns = (slide?.columns ?? []).filter((column) => Array.isArray(column) && column.length > 0)
      if (columns.length >= 2) return [columns[0], columns[1]]
      const bullets = slide?.bullets ?? []
      const half = Math.ceil(bullets.length / 2)
      return [bullets.slice(0, half), bullets.slice(half)]
    }

    /** Cards of a cards slide, falling back to bullets. */
    function slideCards(slide) {
      if (Array.isArray(slide?.cards) && slide.cards.length > 0) return slide.cards.slice(0, 4)
      return (slide?.bullets ?? []).slice(0, 4).map((bullet, idx) => {
        const parts = String(bullet).split(/[：:]/u)
        return parts.length >= 2
          ? { title: parts[0].trim(), body: parts.slice(1).join('：').trim(), tag: `0${idx + 1}` }
          : { title: `要点 0${idx + 1}`, body: String(bullet), tag: '' }
      })
    }

    /** Steps of a steps slide, falling back to bullets. */
    function slideSteps(slide) {
      if (Array.isArray(slide?.steps) && slide.steps.length > 0) return slide.steps.slice(0, 5)
      return (slide?.bullets ?? []).slice(0, 5).map((bullet) => {
        const parts = String(bullet).split(/[：:]/u)
        return parts.length >= 2 ? { label: parts[0].trim(), detail: parts.slice(1).join('：').trim() } : { label: String(bullet), detail: '' }
      })
    }

    /** Stats of a stats slide, falling back to bullets. */
    function slideStats(slide) {
      if (Array.isArray(slide?.stats) && slide.stats.length > 0) return slide.stats.slice(0, 4)
      return (slide?.bullets ?? []).slice(0, 4).map((bullet, idx) => ({ value: `0${idx + 1}`, label: String(bullet), detail: '' }))
    }

    /** Comparison of a comparison slide, falling back to columns. */
    function slideComparison(slide) {
      if (slide?.comparison && typeof slide.comparison === 'object') {
        return {
          leftTitle: slide.comparison.leftTitle || '对比 A',
          rightTitle: slide.comparison.rightTitle || '对比 B',
          left: slide.comparison.left ?? [],
          right: slide.comparison.right ?? [],
        }
      }
      const [left, right] = slideColumns(slide)
      return { leftTitle: '维度一', rightTitle: '维度二', left, right }
    }

    /**
     * Slides & Narration — Keynote / Editorial Presenter Studio.
     *
     * Features 5 curated themes (matching PPTX/HTML/Marp export 1:1), 9 visual
     * layouts, filmstrip thumbnail rail, overview grid (`G`), presenter split
     * view (stage + live speaker notes), progressive fragments, and fullscreen.
     */
    function SlidesView({ lesson, lessonId }) {
      const slides = lesson.slides ?? []
      const [index, setIndex] = useState(0)
      const [step, setStep] = useState(0)
      const [themeId, setThemeId] = useState('editorial')
      const [fragmentsOn, setFragmentsOn] = useState(false)
      const [notesOpen, setNotesOpen] = useState(false)
      const [presenterMode, setPresenterMode] = useState(false)
      const [overviewOpen, setOverviewOpen] = useState(false)
      const [speaking, setSpeaking] = useState(false)
      const [exporting, setExporting] = useState(false)
      const [exported, setExported] = useState(null)
      const stageRef = useRef(null)

      const theme = STAGE_THEMES.find((item) => item.id === themeId) ?? STAGE_THEMES[0]

      const stopSpeech = useCallback(() => {
        speech.cancel()
        setSpeaking(false)
      }, [])

      useEffect(() => () => speech.cancel(), [])

      if (slides.length === 0) return h('p', { style: styles.hint }, '这个课时没有幻灯片视图。')
      const total = slides.length
      const safeIndex = Math.min(index, total - 1)
      const slide = slides[safeIndex]
      const layout = slideLayout(slide, safeIndex)
      const isSection = layout === 'section'
      const bullets = slide.bullets ?? []
      const fragmentCount = fragmentsOn
        ? (layout === 'two-column' ? slideColumns(slide).flat().length
          : layout === 'cards' ? slideCards(slide).length
            : layout === 'steps' ? slideSteps(slide).length
              : layout === 'stats' ? slideStats(slide).length
                : layout === 'comparison' ? (slideComparison(slide).left.length + slideComparison(slide).right.length)
                  : bullets.length)
        : 0

      const goto = (next) => {
        stopSpeech()
        setIndex(Math.max(0, Math.min(total - 1, next)))
        setStep(0)
      }
      const advance = () => {
        if (fragmentsOn && step < fragmentCount) { setStep(step + 1); return }
        goto(safeIndex + 1)
      }
      const back = () => {
        if (fragmentsOn && step > 0) { setStep(step - 1); return }
        goto(safeIndex - 1)
      }

      const toggleFullscreen = () => {
        const stage = stageRef.current
        if (!stage || typeof stage.requestFullscreen !== 'function') return
        if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen()
        else stage.requestFullscreen().catch(() => {})
      }

      const runExport = async () => {
        setExporting(true)
        try {
          const payload = await apiPost('/export', { id: lessonId, theme: theme.id })
          setExported(payload?.ok === false ? { error: payload.error?.message ?? '导出失败', files: [] } : payload)
        } catch (cause) {
          setExported({ error: String(cause?.message ?? cause), files: [] })
        } finally {
          setExporting(false)
        }
      }

      /** Bullet list styled with theme accent dots and optional fragment reveal. */
      const bulletList = (items, keyPrefix, offset = 0, darkMode = false) => h('ul', { style: styles.deckList },
        items.map((item, itemIndex) => {
          const visible = !fragmentsOn || (offset + itemIndex) < step
          return h('li', {
            key: `${keyPrefix}-${itemIndex}`,
            style: {
              ...styles.deckBullet,
              color: darkMode ? theme.sectionMuted : theme.ink,
              opacity: visible ? 1 : 0.08,
              transition: 'opacity .2s ease',
            },
          },
            h('span', { style: { width: 6, height: 6, borderRadius: 99, background: theme.accent, marginTop: 9, flex: '0 0 auto' } }),
            h('span', null, item))
        }))

      const kickerPill = slide.kicker
        ? h('span', {
          style: {
            ...styles.deckKicker,
            background: isSection ? theme.accent : theme.accentSoft,
            color: isSection ? '#FFFFFF' : theme.accent,
          },
        }, slide.kicker)
        : null

      const body = (() => {
        if (layout === 'title') {
          const subtitle = slide.subtitle
            || [lesson.learner?.grade ? `${lesson.learner.grade} 年级` : '', lesson.learner?.interest ?? ''].filter(Boolean).join(' · ')
          return h('div', { style: { display: 'grid', gridTemplateColumns: presenterMode ? 'minmax(0, 1.7fr) 112px' : 'minmax(0, 1.8fr) 150px', gap: presenterMode ? 14 : 24, alignItems: 'center' } },
            h('div', { style: { minWidth: 0 } },
              kickerPill,
              h('h2', { style: { ...styles.deckTitle, fontSize: presenterMode ? 22 : 28, color: theme.ink } }, slide.title),
              h('div', { style: { width: 48, height: 3, borderRadius: 99, background: theme.accent, margin: '8px 0 14px' } }),
              subtitle ? h('p', { style: { ...styles.deckSubtitle, color: theme.muted } }, subtitle) : null,
              bullets.length > 0 ? bulletList(bullets, 'title') : null),
            h('div', {
              style: {
                background: theme.surface,
                border: `1px solid ${theme.line}`,
                borderRadius: 14,
                padding: presenterMode ? '12px 10px' : '18px 14px',
                textAlign: 'center',
              },
            },
              h('div', { style: { fontSize: presenterMode ? 26 : 32, fontWeight: 700, color: theme.accent, lineHeight: 1.1 } }, String(total).padStart(2, '0')),
              h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: theme.muted, marginTop: 4 } }, 'SLIDES'),
              lesson.learner?.grade ? h('div', { style: { fontSize: 11.5, color: theme.ink, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${theme.line}` } }, `${lesson.learner.grade} 年级`) : null))
        }
        if (layout === 'section') {
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckTitle, color: theme.sectionInk } }, slide.title),
            bullets.length > 0 ? bulletList(bullets, 'section', 0, true) : null)
        }
        if (layout === 'quote') {
          const quote = slide.quote
          const text = typeof quote === 'string' ? quote : quote?.text
          const attribution = typeof quote === 'object' ? quote?.attribution : undefined
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
            h('blockquote', {
              style: {
                ...styles.deckQuote,
                background: theme.surface,
                border: `1px solid ${theme.line}`,
                borderLeft: `4px solid ${theme.accent}`,
                color: theme.ink,
              },
            },
              h('span', { style: { display: 'block', fontFamily: 'Georgia, serif', fontSize: 42, lineHeight: 0.65, color: theme.accent, opacity: 0.35, marginBottom: 6 } }, '“'),
              text ?? '',
              attribution ? h('cite', { style: { ...styles.deckCite, color: theme.muted } }, `— ${attribution}`) : null))
        }
        if (layout === 'two-column') {
          const [left, right] = slideColumns(slide)
          const colStyle = (accentColor) => ({
            background: theme.surface,
            border: `1px solid ${theme.line}`,
            borderTop: `3px solid ${accentColor}`,
            borderRadius: 12,
            padding: '16px 18px',
          })
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
            h('div', { style: styles.deckColumns },
              h('div', { style: colStyle(theme.accent) }, bulletList(left, 'left', 0)),
              h('div', { style: colStyle(theme.warm) }, bulletList(right, 'right', left.length))))
        }
        if (layout === 'cards') {
          const cards = slideCards(slide)
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
            h('div', { style: styles.deckCardsGrid },
              cards.map((card, idx) => {
                const visible = !fragmentsOn || idx < step
                return h('div', {
                  key: idx,
                  style: {
                    background: theme.surface,
                    border: `1px solid ${theme.line}`,
                    borderTop: `3px solid ${idx % 2 === 0 ? theme.accent : theme.warm}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    opacity: visible ? 1 : 0.08,
                    transition: 'opacity .2s ease',
                  },
                },
                  card.tag ? h('span', { style: { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: theme.accentSoft, color: theme.accent, marginBottom: 6 } }, card.tag) : null,
                  h('div', { style: { fontSize: 14.5, fontWeight: 600, color: theme.ink, marginBottom: 5, lineHeight: 1.35 } }, card.title),
                  card.body ? h('div', { style: { fontSize: 12.5, color: theme.muted, lineHeight: 1.55 } }, card.body) : null)
              })))
        }
        if (layout === 'steps') {
          const steps = slideSteps(slide)
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
            h('div', { style: styles.deckStepsGrid },
              steps.map((item, idx) => {
                const visible = !fragmentsOn || idx < step
                return h('div', {
                  key: idx,
                  style: {
                    background: theme.surface,
                    border: `1px solid ${theme.line}`,
                    borderRadius: 12,
                    padding: '14px 13px',
                    opacity: visible ? 1 : 0.08,
                    transition: 'opacity .2s ease',
                  },
                },
                  h('span', { style: { display: 'inline-flex', width: 24, height: 24, borderRadius: 99, background: theme.accent, color: '#fff', fontSize: 11.5, fontWeight: 700, alignItems: 'center', justifyContent: 'center', marginBottom: 8 } }, String(idx + 1)),
                  h('div', { style: { fontSize: 13.5, fontWeight: 600, color: theme.ink, marginBottom: 4, lineHeight: 1.35 } }, item.label),
                  item.detail ? h('div', { style: { fontSize: 12, color: theme.muted, lineHeight: 1.5 } }, item.detail) : null)
              })))
        }
        if (layout === 'comparison') {
          const comp = slideComparison(slide)
          const sideCard = (heading, items, color, softBg, offset) => h('div', {
            style: {
              background: theme.surface,
              border: `1px solid ${theme.line}`,
              borderTop: `3px solid ${color}`,
              borderRadius: 12,
              padding: '14px 16px',
            },
          },
            h('div', { style: { display: 'inline-block', padding: '3px 10px', borderRadius: 8, background: softBg, color, fontSize: 12.5, fontWeight: 600, marginBottom: 10 } }, heading),
            bulletList(items, heading, offset))
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
            h('div', { style: styles.deckColumns },
              sideCard(comp.leftTitle, comp.left, theme.accent, theme.accentSoft, 0),
              sideCard(comp.rightTitle, comp.right, theme.warm, theme.warmSoft, comp.left.length)))
        }
        if (layout === 'stats') {
          const stats = slideStats(slide)
          return h('div', null,
            kickerPill,
            h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
            h('div', { style: styles.deckStatsGrid },
              stats.map((item, idx) => {
                const visible = !fragmentsOn || idx < step
                return h('div', {
                  key: idx,
                  style: {
                    background: theme.surface,
                    border: `1px solid ${theme.line}`,
                    borderRadius: 14,
                    padding: '18px 16px',
                    opacity: visible ? 1 : 0.08,
                    transition: 'opacity .2s ease',
                  },
                },
                  h('div', { style: { fontSize: 28, fontWeight: 700, color: theme.accent, letterSpacing: '-0.03em', lineHeight: 1.12, marginBottom: 6 } }, item.value),
                  h('div', { style: { fontSize: 13.5, fontWeight: 600, color: theme.ink, marginBottom: 4 } }, item.label),
                  item.detail ? h('div', { style: { fontSize: 12, color: theme.muted, lineHeight: 1.5 } }, item.detail) : null)
              })))
        }
        return h('div', null,
          kickerPill,
          h('h2', { style: { ...styles.deckHeading, color: theme.ink } }, slide.title),
          bullets.length > 0
            ? h('div', { style: { background: theme.surface, border: `1px solid ${theme.line}`, borderRadius: 12, padding: '16px 20px' } }, bulletList(bullets, 'bullets'))
            : null)
      })()

      const stageBackground = isSection
        ? theme.sectionBg
        : layout === 'title'
          ? `linear-gradient(145deg, ${theme.paper} 60%, ${theme.wash})`
          : theme.paper

      const stageElement = h('div', {
        ref: stageRef,
        tabIndex: 0,
        role: 'group',
        'aria-label': 'slides',
        style: {
          ...styles.deckStage,
          background: stageBackground,
          color: isSection ? theme.sectionInk : theme.ink,
          borderColor: isSection ? 'transparent' : theme.line,
          ...(isSection ? { borderLeft: `5px solid ${theme.accent}` } : {}),
        },
        onClick: (event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (event.clientX - rect.left < rect.width * 0.28) back()
          else advance()
        },
        onKeyDown: (event) => {
          const key = event.key
          if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') { event.preventDefault(); advance() }
          else if (key === 'ArrowLeft' || key === 'PageUp') { event.preventDefault(); back() }
          else if (key === 'Home') { event.preventDefault(); goto(0) }
          else if (key === 'End') { event.preventDefault(); goto(total - 1) }
          else if (key === 'n' || key === 'N') { event.preventDefault(); setNotesOpen((value) => !value) }
          else if (key === 'g' || key === 'G') { event.preventDefault(); setOverviewOpen((value) => !value) }
          else if (key === 'f' || key === 'F') { event.preventDefault(); toggleFullscreen() }
        },
      },
        !isSection ? h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${theme.accent}, ${theme.warm})` } }) : null,
        body,
        h('div', {
          style: {
            ...styles.deckFooter,
            borderTop: `1px solid ${isSection ? 'rgba(255,255,255,0.14)' : theme.line}`,
            color: isSection ? theme.sectionMuted : theme.muted,
          },
        },
          h('span', null, `${lesson.title}${lesson.learner?.grade ? ` · ${lesson.learner.grade} 年级` : ''}`),
          h('span', null, `${safeIndex + 1} / ${total}`)),
        h('div', {
          style: {
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 3,
            width: `${((safeIndex + 1) / total) * 100}%`,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.warm})`,
            transition: 'width .22s ease',
          },
        }))

      const files = exported?.files ?? []

      return h('div', null,
        // Studio top bar: theme swatches + presenter controls
        h('div', { style: styles.deckStudioBar },
          h('div', { style: styles.chips },
            h('span', { style: { fontSize: 11.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginRight: 2 } }, t('theme')),
            STAGE_THEMES.map((item) => h('button', {
              key: item.id,
              type: 'button',
              style: {
                ...styles.themePill,
                ...(item.id === theme.id ? styles.buttonOn : {}),
              },
              onClick: () => setThemeId(item.id),
            },
              h('span', { style: { ...styles.themeDot, background: item.paper, border: `2px solid ${item.accent}` } }),
              LANG === 'en' ? item.labelEn : item.label))),
          h('div', { style: styles.chips },
            h('button', {
              type: 'button',
              style: { ...styles.button, ...(overviewOpen ? styles.buttonOn : {}) },
              onClick: () => setOverviewOpen((value) => !value),
            }, overviewOpen ? t('exitOverview') : `${t('overview')} (G)`),
            h('button', {
              type: 'button',
              style: { ...styles.button, ...(presenterMode ? styles.buttonOn : {}) },
              onClick: () => { setPresenterMode((value) => !value); setOverviewOpen(false) },
            }, t('presenter')),
            h('button', {
              type: 'button',
              style: { ...styles.button, ...(fragmentsOn ? styles.buttonOn : {}) },
              onClick: () => { setFragmentsOn((value) => !value); setStep(0) },
              title: t('fragmentsHint'),
            }, t('fragments')),
            h('button', { type: 'button', style: styles.button, onClick: toggleFullscreen }, t('fullscreen')),
            slide.narration
              ? h('button', {
                type: 'button',
                style: { ...styles.button, ...(speaking ? styles.buttonOn : {}) },
                onClick: () => {
                  if (speaking) { stopSpeech(); return }
                  const started = speech.speak(slide.narration, lesson.learner?.language, () => setSpeaking(false))
                  setSpeaking(started)
                },
              }, speaking ? t('stop') : t('narrate'))
              : null)),

        // Main stage OR Overview grid OR Presenter split
        overviewOpen
          ? h('div', { style: styles.overviewGrid }, slides.map((item, idx) => {
            const itemLayout = slideLayout(item, idx)
            const darkCard = itemLayout === 'section'
            return h('button', {
              key: idx,
              type: 'button',
              style: {
                ...styles.overviewCard,
                background: darkCard ? theme.sectionBg : theme.paper,
                color: darkCard ? theme.sectionInk : theme.ink,
                border: idx === safeIndex ? `2px solid ${theme.accent}` : `1px solid ${darkCard ? 'transparent' : theme.line}`,
              },
              onClick: () => { goto(idx); setOverviewOpen(false) },
            },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } },
                h('span', { style: { fontSize: 10.5, fontWeight: 700, color: darkCard ? theme.sectionMuted : theme.accent } }, String(idx + 1).padStart(2, '0')),
                h('span', { style: { fontSize: 10, padding: '1px 7px', borderRadius: 99, background: darkCard ? 'rgba(255,255,255,0.12)' : theme.accentSoft, color: darkCard ? theme.sectionInk : theme.accent } }, LAYOUT_NAMES[itemLayout] ?? itemLayout)),
              h('div', { style: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } }, item.title),
              h('div', { style: { fontSize: 11, color: darkCard ? theme.sectionMuted : theme.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' } }, item.kicker || item.subtitle || (item.bullets?.[0] ?? '')))
          }))
          : presenterMode
            ? h('div', { style: styles.presenterGrid },
              h('div', { style: { minWidth: 0, width: '100%' } }, stageElement),
              h('div', { style: styles.presenterNotes },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dsw-alias-brand-primary)' } }, t('notes')),
                  h('span', { style: styles.chip }, `${t('layoutLabel')} · ${LAYOUT_NAMES[layout] ?? layout}`)),
                h('div', { style: { fontSize: 14, lineHeight: 1.78, whiteSpace: 'pre-wrap', flex: 1 } }, slide.narration || '—')))
            : stageElement,

        // Navigation + quick notes bar
        h('div', { style: { ...styles.chips, marginTop: 10, justifyContent: 'space-between' } },
          h('div', { style: styles.chips },
            h('button', { type: 'button', style: styles.button, disabled: safeIndex === 0, onClick: back }, t('prev')),
            h('button', { type: 'button', style: styles.button, disabled: safeIndex >= total - 1, onClick: () => goto(safeIndex + 1) }, t('next')),
            h('span', { style: styles.chip }, t('slideOf', safeIndex + 1, total)),
            h('span', { style: styles.chip }, `${t('layoutLabel')} · ${LAYOUT_NAMES[layout] ?? layout}`)),
          !presenterMode
            ? h('button', {
              type: 'button',
              style: { ...styles.button, ...(notesOpen ? styles.buttonOn : {}) },
              onClick: () => setNotesOpen((value) => !value),
            }, `${t('notes')}${slide.narration ? '' : ' · —'}`)
            : null),

        // Filmstrip thumbnail rail
        !overviewOpen
          ? h('div', { style: styles.filmstrip }, slides.map((item, idx) => {
            const itemLayout = slideLayout(item, idx)
            const darkThumb = itemLayout === 'section'
            return h('button', {
              key: idx,
              type: 'button',
              style: {
                ...styles.filmThumb,
                background: darkThumb ? theme.sectionBg : theme.paper,
                color: darkThumb ? theme.sectionInk : theme.ink,
                borderColor: idx === safeIndex ? theme.accent : (darkThumb ? 'transparent' : theme.line),
                boxShadow: idx === safeIndex ? `0 0 0 1px ${theme.accent}` : 'none',
              },
              onClick: () => goto(idx),
            },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 } },
                h('span', { style: { fontWeight: 700, color: darkThumb ? theme.sectionMuted : theme.accent } }, String(idx + 1).padStart(2, '0')),
                h('span', { style: { opacity: 0.7 } }, LAYOUT_NAMES[itemLayout] ?? itemLayout)),
              h('div', { style: { fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.title))
          }))
          : null,

        notesOpen && !presenterMode
          ? h('div', { style: { ...styles.softCard, marginTop: 10 } },
            h('div', { style: { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, t('notes')),
            h('div', { style: { fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' } }, slide.narration || '—'))
          : null,

        h('div', { style: { ...styles.softCard, marginTop: 14 } },
          h('div', { style: { ...styles.chips, justifyContent: 'space-between' } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, `${t('exportTitle')} · ${LANG === 'en' ? theme.labelEn : theme.label}`),
            h('div', { style: styles.chips },
              h('button', { type: 'button', style: styles.buttonPrimary, disabled: exporting, onClick: runExport },
                exporting ? t('exporting') : t('export'))),
          ),
          h('p', { style: { ...styles.hint, margin: '6px 0 0' } }, t('exportHint')),
          exported
            ? h('div', { style: { marginTop: 10 } },
              exported.error ? h('div', { style: { ...styles.hint, ...styles.bad } }, exported.error) : null,
              files.length > 0
                ? h('div', { style: styles.chips }, files.map((file) => (file.ok
                  ? h('a', {
                    key: file.format,
                    href: file.url,
                    download: file.name,
                    style: { ...styles.button, textDecoration: 'none', display: 'inline-block' },
                  }, `${file.format.toUpperCase()} · ${(file.bytes / 1024).toFixed(0)} KB`)
                  : h('span', { key: file.format, style: { ...styles.chip, ...styles.chipWarn } }, `${file.format.toUpperCase()}：${file.reason}`))))
                : null)
            : null))
    }

    /** Audio-graphic lesson: interactive branching dialogue (default) + podcast demo mode. */
    function AudioView({ lesson, lessonId }) {
      const audio = lesson.audioLesson
      const turns = audio?.turns ?? []
      const teacherIndices = useMemo(
        () => turns.map((turn, idx) => (turn.speaker === 'teacher' ? idx : -1)).filter((idx) => idx >= 0),
        [turns],
      )

      const [mode, setMode] = useState('interactive')
      const [autoVoice, setAutoVoice] = useState(true)
      // Interactive dialogue state
      const [stepPos, setStepPos] = useState(0)
      const [messages, setMessages] = useState(() => (
        teacherIndices.length > 0
          ? [{ role: 'teacher', text: turns[teacherIndices[0]].text, concept: turns[teacherIndices[0]].concept, turnIndex: teacherIndices[0] }]
          : []
      ))
      const [draft, setDraft] = useState('')
      const [sending, setSending] = useState(false)
      const [canAdvance, setCanAdvance] = useState(false)
      const [listening, setListening] = useState(false)
      const [finished, setFinished] = useState(false)
      const [liveModel, setLiveModel] = useState(null)
      const [fallbackNote, setFallbackNote] = useState(null)
      const endRef = useRef(null)

      useEffect(() => {
        if (mode === 'interactive' && endRef.current && typeof endRef.current.scrollIntoView === 'function') {
          endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }, [messages.length, sending, mode])

      // Podcast demo state
      const [playing, setPlaying] = useState(false)
      const [current, setCurrent] = useState(-1)
      const [socraticPause, setSocraticPause] = useState(true)
      const [waitingThink, setWaitingThink] = useState(false)

      const stop = useCallback(() => {
        speech.cancel()
        setPlaying(false)
        setWaitingThink(false)
        setCurrent(-1)
      }, [])

      useEffect(() => () => speech.cancel(), [])

      // Reset interactive dialogue when lesson changes
      useEffect(() => {
        speech.cancel()
        setStepPos(0)
        setDraft('')
        setCanAdvance(false)
        setFinished(false)
        setMessages(teacherIndices.length > 0
          ? [{ role: 'teacher', text: turns[teacherIndices[0]].text, concept: turns[teacherIndices[0]].concept, turnIndex: teacherIndices[0] }]
          : [])
      }, [lessonId, teacherIndices, turns])

      // Podcast demo playback loop
      useEffect(() => {
        if (mode !== 'podcast' || !playing || waitingThink) return undefined
        if (current < 0 || current >= turns.length) { setPlaying(false); return undefined }
        const turn = turns[current]
        const nextTurn = turns[current + 1]
        const started = speech.speak(turn.text, lesson.learner?.language, () => {
          if (socraticPause && turn.speaker === 'student' && nextTurn && nextTurn.speaker === 'teacher') {
            setWaitingThink(true)
            return
          }
          setCurrent((value) => value + 1)
        })
        if (!started) { setPlaying(false); setWaitingThink(false); setCurrent(-1) }
        return undefined
      }, [mode, playing, waitingThink, current, turns, socraticPause, lesson.learner?.language])

      if (!audio) return h('p', { style: styles.hint }, '这个课时没有音频课视图。')

      const currentTurnIndex = teacherIndices[stepPos] ?? -1
      const currentTurn = currentTurnIndex >= 0 ? turns[currentTurnIndex] : null
      const needsReply = Boolean(
        currentTurn && (
          currentTurn.interactive
          || /[?？]\s*$/u.test(currentTurn.text)
          || (turns[currentTurnIndex + 1]?.speaker === 'student')
        ),
      )

      const speakIfAuto = (text) => {
        if (!autoVoice || !text) return
        speech.cancel()
        speech.speak(text, lesson.learner?.language)
      }

      const advanceStep = () => {
        const nextPos = stepPos + 1
        if (nextPos >= teacherIndices.length) {
          setFinished(true)
          setCanAdvance(false)
          return
        }
        const nextTurnIdx = teacherIndices[nextPos]
        const nextTurn = turns[nextTurnIdx]
        setStepPos(nextPos)
        setCanAdvance(false)
        setDraft('')
        setMessages((prev) => [...prev, { role: 'teacher', text: nextTurn.text, concept: nextTurn.concept, turnIndex: nextTurnIdx }])
        speakIfAuto(nextTurn.text)
      }

      const submitReply = async ({ answer, choiceIndex, displayLabel }) => {
        if (!currentTurn || sending) return
        const learnerText = displayLabel ?? String(answer ?? '').trim()
        if (!learnerText) return
        setSending(true)
        const historySnapshot = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }))
        setMessages((prev) => [...prev, { role: 'learner', text: learnerText }])
        setDraft('')
        try {
          const payload = await apiPost('/audio-reply', {
            id: lessonId,
            turnIndex: currentTurnIndex,
            answer: choiceIndex === undefined ? learnerText : undefined,
            choiceIndex,
            history: historySnapshot,
          })
          if (payload?.source === 'llm' && payload.model) {
            setLiveModel(payload.model)
            setFallbackNote(null)
          } else if (payload?.fallbackReason) {
            setFallbackNote(payload.fallbackReason)
          }
          const replyText = payload?.teacherReply || '很好的思考！我们继续往下看。'
          const verdict = payload?.verdict || 'aligned'
          setMessages((prev) => [...prev, { role: 'teacher', text: replyText, verdict }])
          speakIfAuto(replyText)
          if (payload?.advance) setCanAdvance(true)
        } catch {
          setMessages((prev) => [...prev, { role: 'teacher', text: '收到你的回答，我们可以进入下一步。', verdict: 'aligned' }])
          setCanAdvance(true)
        } finally {
          setSending(false)
        }
      }

      const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
      const startMic = () => {
        if (!SpeechRec || listening) return
        try {
          const rec = new SpeechRec()
          rec.lang = lesson.learner?.language === 'en' ? 'en-US' : 'zh-CN'
          rec.interimResults = false
          rec.maxAlternatives = 1
          setListening(true)
          rec.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript ?? ''
            if (transcript) setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript))
          }
          rec.onerror = () => setListening(false)
          rec.onend = () => setListening(false)
          rec.start()
        } catch {
          setListening(false)
        }
      }

      const restartInteractive = () => {
        speech.cancel()
        setStepPos(0)
        setDraft('')
        setCanAdvance(false)
        setFinished(false)
        const first = teacherIndices.length > 0 ? turns[teacherIndices[0]] : null
        setMessages(first ? [{ role: 'teacher', text: first.text, concept: first.concept, turnIndex: teacherIndices[0] }] : [])
        if (first) speakIfAuto(first.text)
      }

      const VERDICT_BADGE = {
        aligned: { text: `✓ ${t('verdictAligned')}`, tone: 'ok' },
        misconception: { text: `⚡ ${t('verdictMisconception')}`, tone: 'bad' },
        partial: { text: `💡 ${t('verdictPartial')}`, tone: 'warn' },
      }

      return h('div', null,
        // Top mode & voice controls
        h('div', { style: { ...styles.chips, marginBottom: 12, justifyContent: 'space-between' } },
          h('div', { style: styles.chips },
            h('button', {
              type: 'button',
              style: { ...styles.button, ...(mode === 'interactive' ? styles.buttonOn : {}) },
              onClick: () => { stop(); setMode('interactive') },
            }, t('audioInteractive')),
            h('button', {
              type: 'button',
              style: { ...styles.button, ...(mode === 'podcast' ? styles.buttonOn : {}) },
              onClick: () => { speech.cancel(); setMode('podcast') },
            }, t('audioPodcast')),
            audio.title ? h('span', { style: styles.chip }, audio.title) : null,
            liveModel ? h(Chip, { tone: 'ok' }, `⚡ ${liveModel}`) : null,
            !liveModel && fallbackNote ? h(Chip, { tone: 'warn' }, `离线模式：${fallbackNote}`) : null),
          h('div', { style: styles.chips },
            mode === 'interactive' && speech.available
              ? h('button', {
                type: 'button',
                style: { ...styles.button, ...(autoVoice ? styles.buttonOn : {}) },
                onClick: () => setAutoVoice((v) => !v),
              }, t('audioAutoVoice'))
              : null,
            mode === 'interactive'
              ? h('button', { type: 'button', style: styles.buttonGhost, onClick: restartInteractive }, t('audioRestart'))
              : null)),

        audio.keyConcepts?.length > 0
          ? h('div', { style: { ...styles.chips, marginBottom: 12 } },
            h('span', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } }, `${t('keyConcepts')}：`),
            audio.keyConcepts.map((concept, index) => h(Chip, { key: index }, concept)))
          : null,

        mode === 'interactive'
          ? h('div', null,
            // Live adaptive dialogue bubbles
            messages.map((msg, idx) => {
              const isLearner = msg.role === 'learner'
              const badge = msg.verdict ? VERDICT_BADGE[msg.verdict] : null
              return h('div', {
                key: idx,
                style: {
                  ...styles.bubble,
                  ...(isLearner ? styles.bubbleStudent : styles.bubbleTeacher),
                },
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 } },
                  h('span', { style: { ...styles.speaker, marginBottom: 0 } }, isLearner ? t('audioMe') : t('teacher')),
                  badge ? h(Chip, { tone: badge.tone }, badge.text) : null),
                msg.text,
                msg.concept ? h('div', { style: { ...styles.mindNote, marginTop: 4 } }, `#${msg.concept}`) : null)
            }),

            sending
              ? h('div', { className: 'lw-thinking', style: { ...styles.bubble, ...styles.bubbleTeacher, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } }, t('aiThinking'))
              : null,
            h('div', { ref: endRef }),

            // Interactive composer OR Next-step button OR Completion card
            finished
              ? h('div', { style: { ...styles.softCard, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 } },
                h('span', { style: { fontSize: 13.5, fontWeight: 500 } }, t('audioDone')),
                h('button', { type: 'button', style: styles.buttonPrimary, onClick: restartInteractive }, t('audioRestart')))
              : canAdvance || !needsReply
                ? h('div', { style: { ...styles.chips, marginTop: 12 } },
                  h('button', { type: 'button', style: styles.buttonPrimary, onClick: advanceStep }, t('audioNextStep')))
                : h('div', { style: styles.audioComposer },
                  currentTurn?.interactive?.quickChoices?.length > 0
                    ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                      currentTurn.interactive.quickChoices.map((opt, optIdx) => h('button', {
                        key: optIdx,
                        type: 'button',
                        style: { ...styles.choice, marginBottom: 0 },
                        disabled: sending,
                        onClick: () => submitReply({ choiceIndex: optIdx, displayLabel: opt.label }),
                      }, opt.label)))
                    : null,
                  h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
                    h('input', {
                      type: 'text',
                      value: draft,
                      placeholder: t('audioInputPlaceholder'),
                      style: styles.audioInput,
                      disabled: sending,
                      onChange: (event) => setDraft(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          void submitReply({ answer: draft })
                        }
                      },
                    }),
                    SpeechRec
                      ? h('button', {
                        type: 'button',
                        style: { ...styles.button, ...(listening ? styles.buttonOn : {}) },
                        onClick: startMic,
                      }, listening ? t('audioMicListening') : `🎤 ${t('audioMic')}`)
                      : null,
                    h('button', {
                      type: 'button',
                      style: { ...styles.buttonPrimary, opacity: sending || !draft.trim() ? 0.6 : 1 },
                      disabled: sending || !draft.trim(),
                      onClick: () => submitReply({ answer: draft }),
                    }, t('audioSend')),
                    h('button', { type: 'button', style: styles.buttonGhost, onClick: advanceStep }, t('audioSkipStep')))))
          : h('div', null,
            // Podcast demo mode
            h('div', { style: { ...styles.chips, marginBottom: 10 } },
              h('button', {
                type: 'button',
                style: playing ? styles.buttonPrimary : styles.button,
                onClick: () => {
                  if (playing) { stop(); return }
                  setWaitingThink(false)
                  setCurrent(0)
                  setPlaying(true)
                },
              }, playing ? t('stop') : t('play')),
              h('button', {
                type: 'button',
                style: { ...styles.button, ...(socraticPause ? styles.buttonOn : {}) },
                onClick: () => setSocraticPause((v) => !v),
              }, t('socraticPause'))),
            waitingThink
              ? h('div', { style: styles.thinkBanner },
                h('span', { style: { fontSize: 13.5, fontWeight: 500 } }, t('thinkPrompt')),
                h('button', {
                  type: 'button',
                  style: styles.buttonPrimary,
                  onClick: () => { setWaitingThink(false); setCurrent((value) => value + 1) },
                }, t('continueTeacher')))
              : null,
            turns.map((turn, index) => h('div', {
              key: index,
              style: {
                ...styles.bubble,
                ...(turn.speaker === 'student' ? styles.bubbleStudent : styles.bubbleTeacher),
                ...(index === current ? { boxShadow: 'inset 0 0 0 1px var(--dsw-alias-brand-primary)' } : {}),
              },
            },
              h('span', { style: styles.speaker }, turn.speaker === 'student' ? t('student') : t('teacher')),
              turn.text,
              turn.concept ? h('div', { style: { ...styles.mindNote, marginTop: 4 } }, `#${turn.concept}`) : null))))
    }

    const HEATMAP_COLORS = {
      misconception: '#DC2626',
      gap: '#D97706',
      fragile: '#CA8A04',
      mastered: '#15803D',
    }
    const HEATMAP_RANK = { misconception: 0, gap: 1, fragile: 2, mastered: 3 }

    /** Match a mind-map node to its worst-case quiz mastery quadrant (so red alerts never hide). */
    function matchNodeMastery(node, questionStates) {
      if (!questionStates || questionStates.length === 0) return null
      const hay = `${node.label ?? ''} ${node.note ?? ''}`.toLowerCase()
      if (!hay.trim()) return null
      let best = null
      for (const item of questionStates) {
        const tokens = [item.concept, item.stem].filter(Boolean).map((s) => String(s).toLowerCase())
        const matched = tokens.some((tok) => {
          if (item.concept && (hay.includes(item.concept.toLowerCase()) || item.concept.toLowerCase().includes((node.label ?? '').toLowerCase()))) return true
          return (node.label ?? '').length >= 2 && tok.includes((node.label ?? '').toLowerCase())
        })
        if (matched) {
          if (!best || (HEATMAP_RANK[item.quadrant] ?? 9) < (HEATMAP_RANK[best] ?? 9)) best = item.quadrant
        }
      }
      return best
    }

    /** One mind-map node and its children, with mastery heatmap dot and recall masking. */
    function MindNode({ node, depth, pathKey, questionStates, recallMode, revealed, onReveal }) {
      const [open, setOpen] = useState(depth < 2)
      const children = node.children ?? []
      const isLeaf = children.length === 0
      const masked = recallMode && isLeaf && !revealed[pathKey]
      const quad = matchNodeMastery(node, questionStates)
      const dotColor = quad ? HEATMAP_COLORS[quad] : null

      return h('div', { style: styles.mindNode },
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'flex-start', padding: '2px 0' } },
          children.length > 0
            ? h('button', { type: 'button', style: { ...styles.buttonGhost, padding: '0 4px', fontSize: 11 }, onClick: () => setOpen((value) => !value), 'aria-expanded': open }, open ? '▾' : '▸')
            : h('span', { style: { width: 19, flex: '0 0 auto' } }),
          h('div', { style: { flex: 1 } },
            masked
              ? h('button', {
                type: 'button',
                style: styles.mindMasked,
                onClick: () => onReveal(pathKey),
                title: t('mindRecallHint'),
              }, node.label)
              : h('div', { style: { display: 'inline-flex', alignItems: 'center', ...styles.mindLabel, ...(depth === 0 ? styles.mindRootLabel : {}) } },
                dotColor ? h('span', { style: { ...styles.mindDot, background: dotColor }, title: quad }) : null,
                node.label),
            !masked && node.note ? h('div', { style: styles.mindNote }, node.note) : null)),
        open && children.length > 0
          ? h('div', { style: styles.mindChildren }, children.map((child, index) => h(MindNode, {
            key: index,
            node: child,
            depth: depth + 1,
            pathKey: `${pathKey}.${index}`,
            questionStates,
            recallMode,
            revealed,
            onReveal,
          })))
          : null)
    }

    /** Mind map view with mastery heatmap overlay and active recall masking. */
    function MindMapView({ lesson, progress }) {
      const [recallMode, setRecallMode] = useState(false)
      const [revealed, setRevealed] = useState({})
      const root = lesson?.mindmap
      if (!root) return h('p', { style: styles.hint }, '这个课时没有思维导图。')

      const questions = lesson?.quiz?.questions ?? []
      const items = progress?.items ?? {}
      const questionStates = questions
        .map((q, idx) => {
          const st = items[String(idx)]
          if (!st || !st.quadrant) return null
          return { quadrant: st.quadrant, concept: q.concept ?? '', stem: q.stem ?? '' }
        })
        .filter(Boolean)

      return h('div', { style: styles.card },
        h('div', { style: styles.mindBar },
          h('div', { style: styles.chips },
            h('button', {
              type: 'button',
              style: { ...styles.button, ...(recallMode ? styles.buttonOn : {}) },
              onClick: () => { setRecallMode((v) => !v); setRevealed({}) },
            }, t('mindRecall')),
            recallMode
              ? h('button', { type: 'button', style: styles.buttonGhost, onClick: () => setRecallMode(false) }, t('mindRevealAll'))
              : null),
          h('div', { style: styles.chips },
            h('span', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } },
              `${t('mindHeatmapLegend')}：🔴 ${t('quadMisconception')} · 🟠 ${t('quadGap')} · 🟡 ${t('quadFragile')} · 🟢 ${t('quadMastered')}`))),
        recallMode ? h('p', { style: { ...styles.hint, marginTop: 0, marginBottom: 12 } }, t('mindRecallHint')) : null,
        h(MindNode, {
          node: root,
          depth: 0,
          pathKey: '0',
          questionStates,
          recallMode,
          revealed,
          onReveal: (key) => setRevealed((cur) => ({ ...cur, [key]: true })),
        }))
    }

    /** Cross-lesson interleaved daily review hall. */
    function DailyReviewView({ queue, onBack, onComplete }) {
      const items = queue?.items ?? []
      const [answers, setAnswers] = useState({})
      const [confidences, setConfidences] = useState({})
      const [submitting, setSubmitting] = useState(false)
      const [summary, setSummary] = useState(null)
      const [seed] = useState(() => Math.floor(Date.now() / 1000) % 10000)

      const QUAD_LABEL = {
        misconception: `🔴 ${t('quadMisconception')}`,
        gap: `🟠 ${t('quadGap')}`,
        fragile: `🟡 ${t('quadFragile')}`,
        mastered: `🟢 ${t('quadMastered')}`,
      }

      const submitAll = async () => {
        setSubmitting(true)
        try {
          const byLesson = new Map()
          items.forEach((item, pos) => {
            if (typeof answers[pos] !== 'number') return
            if (!byLesson.has(item.lessonId)) byLesson.set(item.lessonId, [])
            byLesson.get(item.lessonId).push({
              index: item.index,
              choice: answers[pos],
              confidence: confidences[pos] ?? 'high',
            })
          })
          let totalAnswered = 0
          let totalCorrect = 0
          let promoted = 0
          for (const [lessonId, list] of byLesson.entries()) {
            const payload = await apiPost('/grade', { id: lessonId, answers: list, mode: 'drill' })
            if (payload?.ok !== false) {
              for (const ans of list) {
                const outcome = (payload.results ?? []).find((r) => r.index === ans.index)
                totalAnswered += 1
                if (outcome?.correct) totalCorrect += 1
                if (outcome?.quadrant === 'mastered') promoted += 1
              }
            }
          }
          setSummary({
            answered: totalAnswered,
            correct: totalCorrect,
            promoted,
            score: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
          })
          await onComplete()
        } finally {
          setSubmitting(false)
        }
      }

      if (summary) {
        return h('div', { style: styles.card },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            h('h2', { style: { ...styles.heading2, margin: 0 } }, `${t('dailyReview')} · ${summary.score}%`),
            h('button', { type: 'button', style: styles.button, onClick: onBack }, t('backToLessons'))),
          h('div', { style: { ...styles.chips, marginBottom: 12 } },
            h(Chip, { tone: 'ok' }, `${t('correct')} ${summary.correct}/${summary.answered}`),
            h(Chip, { tone: 'ok' }, `🟢 ${t('quadMastered')} +${summary.promoted}`)),
          h('button', { type: 'button', style: styles.buttonPrimary, onClick: onBack }, t('backToLessons')))
      }

      if (items.length === 0) {
        return h('div', { style: styles.card },
          h('div', { style: { ...styles.empty, padding: '32px 16px' } },
            h('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 8 } }, t('dailyReviewEmpty')),
            h('button', { type: 'button', style: styles.button, onClick: onBack }, t('backToLessons'))))
      }

      const answeredCount = items.filter((_, pos) => typeof answers[pos] === 'number').length

      return h('div', null,
        h('div', { style: { ...styles.softCard, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' } },
          h('div', null,
            h('div', { style: { fontSize: 14, fontWeight: 600 } }, `${t('dailyReview')}（${items.length}）`),
            h('div', { style: styles.hint }, t('dailyReviewHint'))),
          h('button', { type: 'button', style: styles.button, onClick: onBack }, t('backToLessons'))),

        items.map((item, pos) => {
          const question = item.question
          const conf = confidences[pos] ?? 'high'
          const choiceOrder = shuffledChoiceOrder(question.choices.length, seed + pos * 29 + item.index * 7)
          return h('div', { key: `${item.lessonId}-${item.index}`, style: { ...styles.card, marginBottom: 14 } },
            h('div', { style: { ...styles.chips, justifyContent: 'space-between', marginBottom: 8 } },
              h('div', { style: styles.chips },
                h(Chip, null, item.lessonTitle),
                h(Chip, { tone: item.quadrant === 'misconception' ? 'bad' : item.quadrant === 'mastered' ? 'ok' : 'warn' }, QUAD_LABEL[item.quadrant] ?? item.quadrant),
                question.concept ? h(Chip, null, question.concept) : null),
              h('div', { style: styles.chips },
                h('button', {
                  type: 'button',
                  style: { ...styles.confToggle, ...(conf === 'high' ? styles.buttonOn : {}) },
                  onClick: () => setConfidences((c) => ({ ...c, [pos]: 'high' })),
                }, `✓ ${t('confHigh')}`),
                h('button', {
                  type: 'button',
                  style: { ...styles.confToggle, ...(conf === 'low' ? styles.buttonOn : {}) },
                  onClick: () => setConfidences((c) => ({ ...c, [pos]: 'low' })),
                }, `? ${t('confLow')}`))),
            h('div', { style: { fontSize: 14, fontWeight: 500, lineHeight: 1.6, marginBottom: 8 } }, `${pos + 1}. ${question.stem}`),
            choiceOrder.map((origIndex, displayPos) => {
              const picked = answers[pos] === origIndex
              return h('button', {
                key: origIndex,
                type: 'button',
                style: { ...styles.choice, ...(picked ? styles.choicePicked : {}) },
                onClick: () => setAnswers((a) => ({ ...a, [pos]: origIndex })),
              }, `${String.fromCharCode(65 + displayPos)}. ${question.choices[origIndex]}`)
            }))
        }),

        h('div', { style: styles.chips },
          h('button', {
            type: 'button',
            style: { ...styles.buttonPrimary, opacity: submitting || answeredCount === 0 ? 0.6 : 1 },
            disabled: submitting || answeredCount === 0,
            onClick: submitAll,
          }, submitting ? t('submitting') : `${t('submit')}（${answeredCount}/${items.length}）`),
          h('button', { type: 'button', style: styles.button, onClick: onBack }, t('backToLessons'))))
    }

    /** Source view: the text of record plus what was measured against it. */
    function SourceView({ lesson, measurement }) {
      const source = lesson.source ?? {}
      const text = measurement?.text
      const cover = measurement?.coverage
      const grade = measurement?.grade
      return h('div', null,
        h('div', { style: { ...styles.softCard, marginBottom: 12 } },
          h('div', { style: { fontSize: 13.5, fontWeight: 500 } }, source.title || '未命名原文'),
          source.attribution ? h('div', { style: styles.hint }, `${t('attribution')}：${source.attribution}`) : null,
          source.url ? h('div', { style: styles.hint }, source.url) : null),
        h('div', { style: { ...styles.chips, marginBottom: 12 } },
          grade ? h(Chip, { tone: grade.verdict === 'within' ? 'ok' : grade.verdict === 'off' ? 'bad' : 'warn' }, `${t('gradeCheck')}：${grade.message}`) : null,
          cover && typeof cover.ratio === 'number' ? h(Chip, null, `${t('coverage')} ${Math.round(cover.ratio * 100)}% · ${cover.method}`) : null,
          text ? h(Chip, null, `${text.words} 词 / ${text.sentences} 句 · ${text.avgSentenceLength ?? '—'}/句`) : null),
        source.text
          ? h('div', { style: { ...styles.prose, fontSize: 14, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap' } }, source.text)
          : h('p', { style: styles.hint }, t('noSource')))
    }

    /** Deterministic choice permutation for targeted drills (defeats position memory). */
    function shuffledChoiceOrder(count, seedKey) {
      const order = Array.from({ length: count }, (_, i) => i)
      let seed = (seedKey * 2654435761) >>> 0
      for (let i = order.length - 1; i > 0; i -= 1) {
        seed = (seed * 1103515245 + 12345) >>> 0
        const swap = seed % (i + 1)
        const hold = order[i]
        order[i] = order[swap]
        order[swap] = hold
      }
      return order
    }

    /** Section quiz with first-principles metacognitive loop: 2×2 calibration, Feynman reflection, targeted drill & spaced repetition. */
    function QuizView({
      lesson, lessonId, progress, answers, confidences, onAnswer, onConfidence,
      result, submitting, drillIndices, drillSeed, onSubmit, onStartDrill, onRetake,
      onJumpSection, onSaveReflection,
    }) {
      const questions = lesson.quiz?.questions ?? []
      const [quadFilter, setQuadFilter] = useState('all')
      const [revealedFragile, setRevealedFragile] = useState({})
      const [drafts, setDrafts] = useState({})
      const [savedMark, setSavedMark] = useState({})
      const [feynmanLoading, setFeynmanLoading] = useState({})
      const [feynmanEval, setFeynmanEval] = useState({})
      const [variantLoading, setVariantLoading] = useState({})
      const [variants, setVariants] = useState({})
      const [variantChosen, setVariantChosen] = useState({})
      const [copied, setCopied] = useState(false)

      if (questions.length === 0) return h('p', { style: styles.hint }, '这个课时没有章末测验。')

      const isDrill = Array.isArray(drillIndices) && drillIndices.length > 0
      const activeIndices = isDrill ? drillIndices : questions.map((_, index) => index)
      const answeredCount = activeIndices.filter((index) => typeof answers[index] === 'number').length
      const summary = progress?.summary ?? null
      const progressItems = progress?.items ?? {}

      const QUAD_META = {
        misconception: { label: t('quadMisconception'), color: '#DC2626', dot: '🔴', desc: LANG === 'en' ? 'Confident but wrong · fix first' : '很确定但错 · 最高提分点' },
        gap: { label: t('quadGap'), color: '#D97706', dot: '🟠', desc: LANG === 'en' ? 'Unsure & wrong · review section' : '不确定且错 · 需回看正文' },
        fragile: { label: t('quadFragile'), color: '#CA8A04', dot: '🟡', desc: LANG === 'en' ? 'Right but unsure · explain it' : '蒙对脆弱 · 复述巩固' },
        mastered: { label: t('quadMastered'), color: '#15803D', dot: '🟢', desc: LANG === 'en' ? 'Confident & right · spaced review' : '确定且对 · 间隔复习' },
      }

      const handleSaveReflection = async (questionIndex) => {
        const text = (drafts[questionIndex] ?? progressItems[String(questionIndex)]?.reflection ?? '').trim()
        setFeynmanLoading((cur) => ({ ...cur, [questionIndex]: true }))
        try {
          const evalRes = await onSaveReflection(questionIndex, text)
          setSavedMark((current) => ({ ...current, [questionIndex]: true }))
          if (evalRes?.evaluation) {
            setFeynmanEval((cur) => ({ ...cur, [questionIndex]: evalRes.evaluation }))
          }
        } finally {
          setFeynmanLoading((cur) => ({ ...cur, [questionIndex]: false }))
        }
      }

      const handleGenerateVariant = async (questionIndex) => {
        if (!lessonId || variantLoading[questionIndex]) return
        setVariantLoading((cur) => ({ ...cur, [questionIndex]: true }))
        setVariantChosen((cur) => ({ ...cur, [questionIndex]: undefined }))
        try {
          const payload = await apiPost('/variant', { id: lessonId, index: questionIndex })
          setVariants((cur) => ({ ...cur, [questionIndex]: payload }))
        } catch (cause) {
          setVariants((cur) => ({ ...cur, [questionIndex]: { ok: false, reason: String(cause?.message ?? cause) } }))
        } finally {
          setVariantLoading((cur) => ({ ...cur, [questionIndex]: false }))
        }
      }

      const copyCoachPrompt = () => {
        const weakList = (result?.results ?? [])
          .filter((item) => item.quadrant !== 'mastered' && (!isDrill || activeIndices.includes(item.index)))
          .map((item) => `#${item.index + 1}[${QUAD_META[item.quadrant]?.label ?? item.quadrant}${item.concept ? `·${item.concept}` : ''}]`)
          .join('、')
        const prompt = LANG === 'en'
          ? `Call learnway_study_report for lesson "${lessonId}" (${lesson.title}). Focus on my weak items (${weakList || 'all'}) — use Socratic questions to fix my misconceptions, then give me 1 transfer challenge.`
          : `请调用 learnway_study_report 读取课时「${lesson.title}」（id: ${lessonId}）的四象限学习诊断与我的费曼笔记，针对薄弱题（${weakList || '全部'}）用苏格拉底式追问帮我纠正误解，再出 1 道跨场景迁移变式题考我。`
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(prompt).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          }).catch(() => {})
        }
      }

      if (result) {
        const shownOutcomes = (result.results ?? []).filter((item) => !isDrill || activeIndices.includes(item.index))
        const quadCounts = { misconception: 0, gap: 0, fragile: 0, mastered: 0 }
        for (const item of shownOutcomes) {
          if (item.quadrant in quadCounts) quadCounts[item.quadrant] += 1
        }
        const weakNow = shownOutcomes.filter((item) => item.quadrant !== 'mastered').map((item) => item.index)
        const priorityOrder = { misconception: 0, gap: 1, fragile: 2, mastered: 3 }
        const filteredOutcomes = shownOutcomes
          .filter((item) => quadFilter === 'all' || item.quadrant === quadFilter)
          .slice()
          .sort((a, b) => (priorityOrder[a.quadrant] ?? 9) - (priorityOrder[b.quadrant] ?? 9))

        return h('div', null,
          // Hero score + attempt trend
          h('div', { style: { ...styles.card, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between' } },
            h('div', { style: { display: 'flex', gap: 16, alignItems: 'baseline' } },
              h('div', { style: { fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' } }, result.score),
              h('div', null,
                h('div', { style: { fontSize: 13.5, fontWeight: 600 } }, `${t('score')} · ${shownOutcomes.filter((x) => x.correct).length}/${shownOutcomes.length}${isDrill ? ` · ${t('drillWeak')}` : ''}`),
                h('div', { style: styles.hint }, Object.entries(result.byDifficulty ?? {}).map(([difficulty, bucket]) => `${t('difficulty')[difficulty] ?? difficulty} ${bucket.correct}/${bucket.total}`).join(' · ')))),
            summary && summary.recentScores?.length > 1
              ? h('div', { style: styles.chips },
                h(Chip, null, `${t('masteryBar')} ${summary.masteredCount}/${summary.totalQuestions}`),
                h(Chip, null, summary.recentScores.map((s) => `${s.score}`).join(' → ')))
              : null),

          // Interactive 2x2 Confidence × Accuracy Quadrant Dashboard
          h('div', { style: styles.quadGrid },
            ['misconception', 'gap', 'fragile', 'mastered'].map((key) => {
              const meta = QUAD_META[key]
              const count = quadCounts[key]
              const active = quadFilter === key
              return h('button', {
                key,
                type: 'button',
                style: {
                  ...styles.quadCard,
                  borderTop: `3px solid ${meta.color}`,
                  ...(active ? { boxShadow: `0 0 0 1.5px ${meta.color}` } : {}),
                },
                onClick: () => setQuadFilter((cur) => (cur === key ? 'all' : key)),
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } },
                  h('span', { style: { fontSize: 12, fontWeight: 600, color: meta.color } }, `${meta.dot} ${meta.label}`),
                  h('span', { style: { fontSize: 20, fontWeight: 700 } }, String(count))),
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, meta.desc))
            })),

          // Action bar: Targeted drill + DeepSeek Coach + Full retake
          h('div', { style: { ...styles.chips, marginBottom: 14, justifyContent: 'space-between' } },
            h('div', { style: styles.chips },
              weakNow.length > 0
                ? h('button', { type: 'button', style: styles.buttonPrimary, onClick: () => onStartDrill(weakNow) }, `${t('drillWeak')}（${weakNow.length}）`)
                : null,
              h('button', { type: 'button', style: styles.button, onClick: copyCoachPrompt }, copied ? t('copiedCoach') : t('copyForCoach')),
              h('button', { type: 'button', style: styles.button, onClick: onRetake }, t('startFullQuiz'))),
            quadFilter !== 'all'
              ? h('button', { type: 'button', style: styles.buttonGhost, onClick: () => setQuadFilter('all') }, `${t('filterAll')} (${shownOutcomes.length})`)
              : null),

          // Glows / Grows compact strip
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 16 } },
            h('div', { style: { ...styles.softCard, borderLeft: '3px solid var(--dsw-alias-state-success-primary)', borderRadius: '0 10px 10px 0' } },
              h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, t('glows')),
              result.feedback.glows.length > 0
                ? h('ul', { style: { ...styles.list, margin: 0, fontSize: 13 } }, result.feedback.glows.map((line, idx) => h('li', { key: idx }, line)))
                : h('p', { style: styles.hint }, '—')),
            h('div', { style: { ...styles.softCard, borderLeft: '3px solid var(--dsw-alias-state-warn-primary)', borderRadius: '0 10px 10px 0' } },
              h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, t('grows')),
              result.feedback.grows.length > 0
                ? h('ul', { style: { ...styles.list, margin: 0, fontSize: 13 } }, result.feedback.grows.map((line, idx) => h('li', { key: idx }, line)))
                : h('p', { style: styles.hint }, '—'))),

          // Differentiated per-question remediation cards
          filteredOutcomes.map((outcome) => {
            const question = questions[outcome.index]
            if (!question) return null
            const meta = QUAD_META[outcome.quadrant] ?? QUAD_META.gap
            const itemState = progressItems[String(outcome.index)] ?? null
            const isFragile = outcome.quadrant === 'fragile'
            const isMastered = outcome.quadrant === 'mastered'
            const needsFeynman = !isMastered
            const rationaleVisible = !isFragile || Boolean(revealedFragile[outcome.index])
            const draftValue = drafts[outcome.index] !== undefined ? drafts[outcome.index] : (itemState?.reflection ?? '')
            const scheduleText = itemState
              ? (itemState.intervalDays > 0 ? t('reviewInDays', itemState.intervalDays) : t('reviewNow'))
              : null

            return h('div', {
              key: outcome.index,
              style: { ...styles.card, marginBottom: 12, borderLeft: `3px solid ${meta.color}` },
            },
              h('div', { style: { ...styles.chips, justifyContent: 'space-between', marginBottom: 8 } },
                h('div', { style: styles.chips },
                  h('span', { style: { fontSize: 12, fontWeight: 600, color: meta.color } }, `${meta.dot} ${meta.label}`),
                  h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, `#${outcome.index + 1}${question.difficulty ? ` · ${t('difficulty')[question.difficulty] ?? question.difficulty}` : ''}`),
                  question.concept ? h(Chip, null, question.concept) : null),
                h('div', { style: styles.chips },
                  scheduleText ? h(Chip, { tone: isMastered ? 'ok' : 'warn' }, `Box ${itemState?.box ?? 0} · ${scheduleText}`) : null,
                  question.sectionId
                    ? h('button', { type: 'button', style: styles.button, onClick: () => onJumpSection(question.sectionId) }, t('jumpSection'))
                    : null)),

              h('div', { style: { fontSize: 14, fontWeight: 500, lineHeight: 1.6, marginBottom: 8 } }, question.stem),

              question.choices.map((choice, choiceIndex) => {
                const isAnswer = choiceIndex === question.answerIndex
                const isPicked = outcome.choice === choiceIndex
                return h('div', {
                  key: choiceIndex,
                  style: {
                    ...styles.choice,
                    cursor: 'default',
                    ...(isAnswer ? styles.choiceRight : isPicked ? styles.choiceWrong : {}),
                  },
                }, `${String.fromCharCode(65 + choiceIndex)}. ${choice}`)
              }),

              question.rationale
                ? (rationaleVisible
                  ? h('p', { style: { ...styles.hint, marginTop: 8, color: 'var(--dsw-alias-label-primary)' } }, question.rationale)
                  : h('button', {
                    type: 'button',
                    style: { ...styles.button, marginTop: 8 },
                    onClick: () => setRevealedFragile((cur) => ({ ...cur, [outcome.index]: true })),
                  }, t('revealRationale')))
                : null,

              needsFeynman
                ? h('div', { style: styles.feynmanBox },
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                    h('span', { style: { fontSize: 11.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } }, t('feynmanTitle')),
                    savedMark[outcome.index] ? h('span', { style: { fontSize: 11.5, ...styles.ok } }, `✓ ${t('feynmanSaved')}`) : null),
                  h('textarea', {
                    value: draftValue,
                    placeholder: t('feynmanPlaceholder'),
                    style: styles.feynmanInput,
                    onChange: (event) => {
                      const val = event.target.value
                      setDrafts((cur) => ({ ...cur, [outcome.index]: val }))
                      setSavedMark((cur) => ({ ...cur, [outcome.index]: false }))
                    },
                  }),
                  h('div', { style: { ...styles.chips, marginTop: 8, justifyContent: 'space-between' } },
                    h('button', {
                      type: 'button',
                      style: styles.button,
                      disabled: Boolean(variantLoading[outcome.index]),
                      onClick: () => handleGenerateVariant(outcome.index),
                    }, variantLoading[outcome.index] ? t('variantLoading') : t('variantBtn')),
                    h('button', {
                      type: 'button',
                      style: styles.buttonPrimary,
                      disabled: Boolean(feynmanLoading[outcome.index]) || !draftValue.trim(),
                      onClick: () => handleSaveReflection(outcome.index),
                    }, feynmanLoading[outcome.index] ? t('feynmanGrading') : t('feynmanGradeBtn'))),
                  feynmanEval[outcome.index]
                    ? h('div', { style: styles.reexplainCard },
                      h('div', { style: { ...styles.chips, marginBottom: 6 } },
                        h(Chip, { tone: feynmanEval[outcome.index].verdict === 'solid' ? 'ok' : feynmanEval[outcome.index].verdict === 'misconception' ? 'bad' : 'warn' },
                          feynmanEval[outcome.index].verdict === 'solid' ? `✓ ${t('verdictAligned')}` : feynmanEval[outcome.index].verdict === 'misconception' ? `⚡ ${t('verdictMisconception')}` : `💡 ${t('verdictPartial')}`),
                        feynmanEval[outcome.index].model ? h(Chip, null, `⚡ ${feynmanEval[outcome.index].model}`) : null),
                      feynmanEval[outcome.index].praise ? h('div', { style: { marginBottom: 4 } }, `✓ ${feynmanEval[outcome.index].praise}`) : null,
                      feynmanEval[outcome.index].gap ? h('div', { style: { ...styles.warn, marginBottom: 4 } }, `! ${feynmanEval[outcome.index].gap}`) : null,
                      feynmanEval[outcome.index].followUp ? h('div', { style: styles.hint }, `→ ${feynmanEval[outcome.index].followUp}`) : null)
                    : null,
                  variants[outcome.index]
                    ? (variants[outcome.index].ok && variants[outcome.index].question
                      ? h('div', { style: styles.variantCard },
                        h('div', { style: { ...styles.chips, justifyContent: 'space-between', marginBottom: 8 } },
                          h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-brand-primary)' } }, `${t('variantTitle')}${variants[outcome.index].question.scenarioTag ? ` · ${variants[outcome.index].question.scenarioTag}` : ''}`),
                          variants[outcome.index].model ? h(Chip, null, `⚡ ${variants[outcome.index].model}`) : null),
                        h(QuestionCard, {
                          question: variants[outcome.index].question,
                          chosen: variantChosen[outcome.index],
                          onChoose: (choice) => setVariantChosen((cur) => ({ ...cur, [outcome.index]: choice })),
                          compact: true,
                        }))
                      : h('div', { style: { ...styles.hint, ...styles.warn, marginTop: 8 } }, variants[outcome.index].reason))
                    : null)
                : null)
          }))
      }

      // Active retrieval / answering stage
      const existingWeak = summary?.weakIndices ?? []
      return h('div', null,
        summary && summary.attemptCount > 0 && !isDrill
          ? h('div', { style: { ...styles.softCard, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' } },
            h('div', { style: styles.chips },
              h(Chip, { tone: summary.masteredCount === summary.totalQuestions ? 'ok' : undefined }, `${t('masteryBar')} ${summary.masteredCount}/${summary.totalQuestions}`),
              summary.quadrants.misconception > 0 ? h(Chip, { tone: 'bad' }, `🔴 ${t('quadMisconception')} ${summary.quadrants.misconception}`) : null,
              summary.quadrants.fragile > 0 ? h(Chip, { tone: 'warn' }, `🟡 ${t('quadFragile')} ${summary.quadrants.fragile}`) : null),
            existingWeak.length > 0
              ? h('button', { type: 'button', style: styles.buttonPrimary, onClick: () => onStartDrill(existingWeak) }, `${t('drillWeak')}（${existingWeak.length}）`)
              : null)
          : null,

        isDrill
          ? h('div', { style: { ...styles.softCard, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '3px solid var(--dsw-alias-brand-primary)' } },
            h('span', { style: { fontSize: 13, fontWeight: 600 } }, `${t('drillBadge')}（${activeIndices.length}）`),
            h('button', { type: 'button', style: styles.buttonGhost, onClick: onRetake }, t('startFullQuiz')))
          : h('p', { style: styles.hint }, t('quizHint')),

        h('div', { style: { marginBottom: 14 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } },
            h('span', null, t('quizProgress')),
            h('span', null, `${answeredCount} / ${activeIndices.length}`)),
          h('div', { style: styles.progressTrack },
            h('div', { style: { ...styles.progressFill, width: `${activeIndices.length > 0 ? Math.round((answeredCount / activeIndices.length) * 100) : 0}%` } }))),

        activeIndices.map((qIndex, pos) => {
          const question = questions[qIndex]
          if (!question) return null
          const conf = confidences[qIndex] ?? 'high'
          const choiceOrder = isDrill
            ? shuffledChoiceOrder(question.choices.length, drillSeed + qIndex * 31 + 7)
            : question.choices.map((_, idx) => idx)

          return h('div', { key: qIndex, style: { ...styles.softCard, marginBottom: 14 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 } },
              h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
                `${pos + 1}${question.difficulty ? ` · ${t('difficulty')[question.difficulty] ?? question.difficulty}` : ''}${question.concept ? ` · ${question.concept}` : ''}`),
              h('div', { style: styles.chips },
                h('button', {
                  type: 'button',
                  style: { ...styles.confToggle, ...(conf === 'high' ? styles.buttonOn : {}) },
                  onClick: () => onConfidence(qIndex, 'high'),
                }, `✓ ${t('confHigh')}`),
                h('button', {
                  type: 'button',
                  style: { ...styles.confToggle, ...(conf === 'low' ? styles.buttonOn : {}) },
                  onClick: () => onConfidence(qIndex, 'low'),
                }, `? ${t('confLow')}`))),
            h('div', { style: { fontSize: 14, fontWeight: 500, lineHeight: 1.6, marginBottom: 8 } }, question.stem),
            choiceOrder.map((origIndex, displayPos) => {
              const picked = answers[qIndex] === origIndex
              return h('button', {
                key: origIndex,
                type: 'button',
                style: { ...styles.choice, ...(picked ? styles.choicePicked : {}) },
                onClick: () => onAnswer(qIndex, origIndex),
              }, `${String.fromCharCode(65 + displayPos)}. ${question.choices[origIndex]}`)
            }))
        }),

        h('div', { style: styles.chips },
          h('button', {
            type: 'button',
            style: { ...styles.buttonPrimary, opacity: submitting ? 0.6 : 1 },
            disabled: submitting,
            onClick: onSubmit,
          }, submitting ? t('submitting') : `${t('submit')}（${answeredCount}/${activeIndices.length}）`)))
    }

    /** Sidebar panel: the whole reader. */
    function LessonPage() {
      const [lessons, setLessons] = useState(null)
      const [activeId, setActiveId] = useState(null)
      const [record, setRecord] = useState(null)
      const [tab, setTab] = useState('immersive')
      const [error, setError] = useState(null)
      const [howTo, setHowTo] = useState(false)
      const [embedded, setEmbedded] = useState({})
      const [quizAnswers, setQuizAnswers] = useState({})
      const [quizConfidences, setQuizConfidences] = useState({})
      const [quizResult, setQuizResult] = useState(null)
      const [drillIndices, setDrillIndices] = useState(null)
      const [drillSeed, setDrillSeed] = useState(1)
      const [focusSectionId, setFocusSectionId] = useState(null)
      const [reviewOpen, setReviewOpen] = useState(false)
      const [reviewQueue, setReviewQueue] = useState(null)
      const [profileOpen, setProfileOpen] = useState(false)
      const [profile, setProfile] = useState(null)
      const [profileSaved, setProfileSaved] = useState(false)
      const [miscDraft, setMiscDraft] = useState('')
      const [submitting, setSubmitting] = useState(false)
      const [health, setHealth] = useState(null)
      const [loading, setLoading] = useState(true)

      const activeIdRef = useRef(null)
      activeIdRef.current = activeId
      const recordRef = useRef(null)
      recordRef.current = record

      /** Load the list, and keep the selected lesson in sync with its summary. */
      const loadList = useCallback(async () => {
        const payload = await apiGet('/lessons')
        if (payload?.ok === false) throw new Error(payload.error?.message ?? 'lessons 请求失败')
        const list = payload.lessons ?? []
        setLessons(list)
        setActiveId((current) => {
          if (current && list.some((lesson) => lesson.id === current)) return current
          return list[0]?.id ?? null
        })
        return list
      }, [])

      /** Load one lesson in full. */
      const loadLesson = useCallback(async (id) => {
        if (!id) { setRecord(null); return }
        const payload = await apiGet('/lesson', { id })
        if (payload?.ok === false) throw new Error(payload.error?.message ?? 'lesson 请求失败')
        setRecord(payload)
      }, [])

      /** Load persistent cross-lesson learner profile. */
      const loadProfile = useCallback(async () => {
        try {
          const payload = await apiGet('/profile')
          if (payload?.ok !== false && payload.profile) setProfile(payload.profile)
        } catch {
          // Non-fatal
        }
      }, [])

      /** Load cross-lesson daily review queue. */
      const loadReviewQueue = useCallback(async () => {
        try {
          const payload = await apiGet('/review-queue')
          if (payload?.ok !== false) setReviewQueue(payload)
        } catch {
          // Non-fatal: the lesson reader stays usable without the queue.
        }
      }, [])

      // The first successful render is a separate fact from activation.
      useEffect(() => {
        ensureUiStyles()
        void checkIn('render')
      }, [])

      // Boot once: list + health + review queue + profile + the first lesson.
      useEffect(() => {
        let cancelled = false
        const boot = async () => {
          try {
            const [list, healthPayload] = await Promise.all([loadList(), apiGet('/health'), loadReviewQueue(), loadProfile()])
            if (cancelled) return
            if (healthPayload?.ok !== false) setHealth(healthPayload)
            setError(null)
            const first = (list ?? [])[0]?.id
            if (first) await loadLesson(first)
          } catch (cause) {
            if (!cancelled) setError(String(cause?.message ?? cause))
          } finally {
            if (!cancelled) setLoading(false)
          }
        }
        void boot()
        return () => { cancelled = true }
      }, [loadList, loadLesson, loadReviewQueue, loadProfile])

      // Poll while the page is open: the agent may save a lesson, or re-save the
      // one being read. Only a changed `updatedAt` triggers a reload, so
      // reading is never interrupted for nothing.
      useEffect(() => {
        let cancelled = false
        const timer = setInterval(async () => {
          try {
            const payload = await apiGet('/lessons')
            if (cancelled || payload?.ok === false) return
            const list = payload.lessons ?? []
            setLessons(list)
            const current = activeIdRef.current
            const summary = list.find((lesson) => lesson.id === current)
            if (current && summary && recordRef.current && summary.updatedAt !== recordRef.current.updatedAt) {
              await loadLesson(current)
            }
          } catch {
            // A transient refresh failure keeps the page as it is.
          }
        }, 8000)
        return () => { cancelled = true; clearInterval(timer) }
      }, [loadLesson])

      // Switching lessons resets every piece of per-lesson interaction state.
      const selectLesson = useCallback(async (id) => {
        setActiveId(id)
        setEmbedded({})
        setQuizAnswers({})
        setQuizConfidences({})
        setQuizResult(null)
        setDrillIndices(null)
        setFocusSectionId(null)
        try {
          await loadLesson(id)
          setError(null)
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        }
      }, [loadLesson])

      const refresh = useCallback(async () => {
        setLoading(true)
        try {
          await loadList()
          if (activeIdRef.current) await loadLesson(activeIdRef.current)
          setError(null)
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setLoading(false)
        }
      }, [loadList, loadLesson])

      const submitQuiz = useCallback(async () => {
        if (!activeId) return
        setSubmitting(true)
        try {
          const isDrill = Array.isArray(drillIndices) && drillIndices.length > 0
          const answers = Object.entries(quizAnswers).map(([index, choice]) => ({
            index: Number(index),
            choice,
            confidence: quizConfidences[Number(index)] ?? 'high',
          }))
          const payload = await apiPost('/grade', { id: activeId, answers, mode: isDrill ? 'drill' : 'full' })
          if (payload?.ok === false) throw new Error(payload.error?.message ?? '批改失败')
          setQuizResult(payload)
          if (payload.progress) {
            setRecord((current) => (current ? { ...current, progress: payload.progress } : current))
          }
          void loadList()
          void loadReviewQueue()
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        } finally {
          setSubmitting(false)
        }
      }, [activeId, quizAnswers, quizConfidences, drillIndices, loadList, loadReviewQueue])

      const saveReflection = useCallback(async (questionIndex, text) => {
        if (!activeId) return null
        try {
          const payload = await apiPost('/reflect-grade', { id: activeId, index: questionIndex, text })
          if (payload?.ok !== false) {
            setRecord((current) => (current ? { ...current, progress: { ...(current.progress ?? {}), ...payload } } : current))
            void loadProfile()
            return payload
          }
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        }
        return null
      }, [activeId, loadProfile])

      const saveProfile = useCallback(async (patch) => {
        try {
          const payload = await apiPost('/profile', patch)
          if (payload?.ok !== false && payload.profile) {
            setProfile(payload.profile)
            setProfileSaved(true)
            setTimeout(() => setProfileSaved(false), 2000)
          }
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        }
      }, [])

      const startDrill = useCallback((indices) => {
        setDrillIndices(indices)
        setDrillSeed((seed) => seed + 1)
        setQuizAnswers({})
        setQuizConfidences({})
        setQuizResult(null)
      }, [])

      const jumpToSection = useCallback((sectionId) => {
        setFocusSectionId(sectionId)
        setTab('immersive')
      }, [])

      const removeLesson = useCallback(async () => {
        if (!activeId) return
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('deleteConfirm'))) return
        try {
          await apiPost('/delete', { id: activeId })
          setRecord(null)
          setActiveId(null)
          const payload = await apiGet('/lessons')
          const list = payload.lessons ?? []
          setLessons(list)
          if (list.length > 0) await selectLesson(list[0].id)
        } catch (cause) {
          setError(String(cause?.message ?? cause))
        }
      }, [activeId, selectLesson])

      const lesson = record?.lesson
      const measurement = record?.measurement

      const tabs = [
        ['immersive', t('tabImmersive'), Boolean(lesson)],
        ['slides', t('tabSlides'), (lesson?.slides?.length ?? 0) > 0],
        ['audio', t('tabAudio'), Boolean(lesson?.audioLesson)],
        ['mindmap', t('tabMindmap'), Boolean(lesson?.mindmap)],
        ['source', t('tabSource'), Boolean(lesson?.source?.text)],
        ['quiz', t('tabQuiz'), (lesson?.quiz?.questions?.length ?? 0) > 0],
      ].filter(([, , available]) => available)

      return h('div', { className: 'lw-root', style: styles.page },
        h('div', { style: styles.inner },
          h('div', { style: styles.header },
            h('div', null,
              h('h1', { style: styles.title }, t('panel')),
              h('p', { style: styles.subtitle }, t('subtitle'))),
            h('div', { style: styles.spacer }),
            h('div', { style: styles.chips },
              h('button', {
                type: 'button',
                style: (reviewQueue?.totalDue ?? 0) > 0 && !reviewOpen ? styles.buttonPrimary : { ...styles.button, ...(reviewOpen ? styles.buttonOn : {}) },
                onClick: () => { setReviewOpen((v) => !v); void loadReviewQueue() },
              }, `${t('dailyReview')}${reviewQueue ? `（${reviewQueue.totalDue ?? 0}）` : ''}`),
              h('button', {
                type: 'button',
                style: { ...styles.button, ...(profileOpen ? styles.buttonOn : {}) },
                onClick: () => setProfileOpen((v) => !v),
              }, t('profileBtn')),
              h('button', { type: 'button', style: styles.button, onClick: () => setHowTo((value) => !value) }, t('howTo')),
              h('button', { type: 'button', style: styles.button, onClick: refresh }, t('refresh')))),

          profileOpen && profile
            ? h('div', { className: 'lw-fade', style: { ...styles.card, marginBottom: 14 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
                h('div', { style: { fontSize: 13.5, fontWeight: 600 } }, t('profileTitle')),
                h('div', { style: styles.chips },
                  profileSaved ? h('span', { style: { fontSize: 12, ...styles.ok } }, `✓ ${t('profileSaved')}`) : null,
                  h('button', { type: 'button', style: styles.buttonGhost, onClick: () => setProfileOpen(false) }, `✕ ${t('close')}`))),
              h('div', { style: styles.profileGrid },
                h('div', null,
                  h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, t('profileStage')),
                  h('input', {
                    type: 'text',
                    value: profile.stage ?? '',
                    placeholder: t('profileStagePlaceholder'),
                    style: { ...styles.audioInput, width: '100%' },
                    onChange: (e) => setProfile((cur) => ({ ...cur, stage: e.target.value })),
                  })),
                h('div', null,
                  h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, t('grade')),
                  h('input', {
                    type: 'number',
                    min: 1,
                    max: 20,
                    value: profile.grade ?? 8,
                    style: { ...styles.audioInput, width: '100%' },
                    onChange: (e) => setProfile((cur) => ({ ...cur, grade: Number(e.target.value) })),
                  })),
                h('div', null,
                  h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, t('profileInterests')),
                  h('input', {
                    type: 'text',
                    value: Array.isArray(profile.interests) ? profile.interests.join('，') : String(profile.interests ?? ''),
                    style: { ...styles.audioInput, width: '100%' },
                    onChange: (e) => setProfile((cur) => ({ ...cur, interests: e.target.value.split(/[,，、;\n]+/u).map((s) => s.trim()).filter(Boolean) })),
                  })),
                h('div', null,
                  h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, t('profileGoal')),
                  h('input', {
                    type: 'text',
                    value: profile.goal ?? '',
                    placeholder: t('profileGoalPlaceholder'),
                    style: { ...styles.audioInput, width: '100%' },
                    onChange: (e) => setProfile((cur) => ({ ...cur, goal: e.target.value })),
                  }))),
              h('div', { style: { marginBottom: 10 } },
                h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 } }, t('profileStyle')),
                h('div', { style: styles.chips },
                  [
                    ['analogy', t('reexplainAnalogy')],
                    ['rigorous', t('reexplainRigorous')],
                    ['socratic', t('audioInteractive')],
                    ['practical', LANG === 'en' ? 'Practical' : '案例实战'],
                  ].map(([key, label]) => h('button', {
                    key,
                    type: 'button',
                    style: { ...styles.button, ...(profile.style === key ? styles.buttonOn : {}) },
                    onClick: () => setProfile((cur) => ({ ...cur, style: key })),
                  }, label)))),
              h('div', { style: { marginBottom: 12 } },
                h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6 } },
                  h('span', { style: { fontSize: 11.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } }, t('profileCustom')),
                  h('div', { style: styles.chips },
                    h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, `${t('profilePresets')}：`),
                    [
                      ['第一性原理硬核派', '严禁客套和过度夸奖。始终先给第一性原理与边界条件，再做因果推导；我答错时直接指出我哪个前提假设错了，并给一个尖锐反例。'],
                      ['苏格拉底启发派', '不要直接告诉我答案，每次只问一个直击本质的反问引导我自己推出来；用我喜欢的兴趣做类比，语气温和有耐心。'],
                      ['考前避坑冲刺', '直接聚焦高频考点、易混概念对比和典型错题陷阱，回答精炼成 1-2-3 条可记忆判据。'],
                      ['费曼零基础通俗派', '把所有专业术语都翻译成大白话和日常画面，确保初中生也能一眼听懂，最后让我用一句话复述检验。'],
                    ].map(([name, text]) => h('button', {
                      key: name,
                      type: 'button',
                      style: styles.buttonGhost,
                      onClick: () => setProfile((cur) => ({ ...cur, customInstructions: text })),
                    }, name)))),
                h('textarea', {
                  value: profile.customInstructions ?? '',
                  placeholder: t('profileCustomPlaceholder'),
                  style: { ...styles.feynmanInput, minHeight: 74 },
                  onChange: (e) => setProfile((cur) => ({ ...cur, customInstructions: e.target.value })),
                })),
              h('div', { style: { marginBottom: 12 } },
                h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 } }, t('profileMisconceptions')),
                profile.misconceptions?.length > 0
                  ? h('div', { style: { ...styles.chips, marginBottom: 8 } },
                    profile.misconceptions.map((item, idx) => h('button', {
                      key: idx,
                      type: 'button',
                      style: { ...styles.chip, ...styles.chipWarn, cursor: 'pointer' },
                      title: '点击移除',
                      onClick: () => {
                        const next = profile.misconceptions.filter((_, i) => i !== idx)
                        setProfile((cur) => ({ ...cur, misconceptions: next }))
                        void saveProfile({ misconceptions: next })
                      },
                    }, `${item} ×`)))
                  : null,
                h('input', {
                  type: 'text',
                  value: miscDraft,
                  placeholder: t('profileAddMiscPlaceholder'),
                  style: { ...styles.audioInput, width: '100%' },
                  onChange: (e) => setMiscDraft(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' && miscDraft.trim()) {
                      e.preventDefault()
                      const clean = miscDraft.trim()
                      const next = [clean, ...(profile.misconceptions ?? []).filter((x) => x !== clean)].slice(0, 12)
                      setProfile((cur) => ({ ...cur, misconceptions: next }))
                      setMiscDraft('')
                      void saveProfile({ misconceptions: next })
                    }
                  },
                })),
              h('div', { style: { ...styles.chips, justifyContent: 'flex-end' } },
                h('button', { type: 'button', style: styles.buttonPrimary, onClick: () => saveProfile(profile) }, t('profileSave'))))
            : null,

          howTo
            ? h('div', { className: 'lw-fade', style: { ...styles.card, marginBottom: 14 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                h('div', { style: { fontSize: 13, fontWeight: 600 } }, t('howToTitle')),
                h('button', { type: 'button', style: styles.buttonGhost, onClick: () => setHowTo(false) }, `✕ ${t('close')}`)),
              h('ol', { style: { ...styles.list, margin: 0, fontSize: 13.5 } }, t('howToSteps').map((step, index) => h('li', { key: index }, step))))
            : null,

          error ? h('div', { style: { ...styles.softCard, marginBottom: 12, borderColor: 'var(--dsw-alias-state-error-primary)' } }, h('span', { style: styles.bad }, error)) : null,

          loading && !lessons
            ? h('p', { style: styles.hint }, t('loading'))
            : null,

          !loading && lessons && lessons.length === 0
            ? h('div', { style: styles.empty },
              h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: 6 } }, t('empty')),
              h('p', { style: { ...styles.hint, maxWidth: 520, margin: '0 auto' } }, t('emptyHint')))
            : null,

          reviewOpen
            ? h(DailyReviewView, {
              queue: reviewQueue,
              onBack: () => setReviewOpen(false),
              onComplete: async () => {
                await Promise.all([loadList(), loadReviewQueue()])
                if (activeIdRef.current) await loadLesson(activeIdRef.current)
              },
            })
            : null,

          !reviewOpen && lessons && lessons.length > 0
            ? h('div', { style: styles.rail }, lessons.map((item) => {
              const pct = item.mastery && item.mastery.totalQuestions > 0
                ? Math.round((item.mastery.masteredCount / item.mastery.totalQuestions) * 100)
                : 0
              return h('button', {
                key: item.id,
                type: 'button',
                className: 'lw-rail-item',
                style: { ...styles.railItem, ...(item.id === activeId ? styles.railItemActive : {}) },
                onClick: () => selectLesson(item.id),
              },
                h('span', { style: styles.railTitle }, item.title),
                h('span', { style: styles.railMeta },
                  `${t('grade')} ${item.grade ?? '—'} · ${item.interest || '—'}${item.mastery ? ` · ${t('masteryBar')} ${item.mastery.masteredCount}/${item.mastery.totalQuestions}` : ''}${item.demo ? ` · ${t('demo')}` : ''}`),
                item.mastery
                  ? h('div', { style: styles.progressTrack }, h('div', { style: { ...styles.progressFill, width: `${pct}%` } }))
                  : null)
            }))
            : null,

          !reviewOpen && lesson
            ? h('div', null,
              h('div', { style: { ...styles.chips, marginBottom: 10, justifyContent: 'space-between' } },
                h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } }, `${lesson.source?.title ?? ''}${record.demo ? ` · ${t('demo')}` : ''}`),
                h('button', { type: 'button', style: styles.buttonGhost, onClick: removeLesson }, t('delete'))),
              h(LessonMeta, { lesson, measurement }),
              (() => {
                const progSum = record?.progress?.summary
                let advice = ''
                let ctaLabel = ''
                let ctaAction = null
                if (!progSum || progSum.attemptCount === 0) {
                  advice = LANG === 'en'
                    ? 'Start with the Interactive Audio dialogue to test your intuition, then take the Quiz.'
                    : '建议先体验「互动音频课」用自己的话推演核心概念，再做章末测验定位盲区。'
                  ctaLabel = t('tabAudio')
                  ctaAction = () => setTab('audio')
                } else if (progSum.quadrants.misconception > 0) {
                  advice = LANG === 'en'
                    ? `You have ${progSum.quadrants.misconception} high-confidence misconception(s) — fix them first with AI Feynman grading & transfer variants.`
                    : `检测到 ${progSum.quadrants.misconception} 道「高危误解」（确定但错）——最高提分点，建议立刻去测验页做 AI 费曼纠偏与变式题验证。`
                  ctaLabel = t('drillWeak')
                  ctaAction = () => { setTab('quiz'); startDrill(progSum.weakIndices) }
                } else if (progSum.weakIndices.length > 0) {
                  advice = LANG === 'en'
                    ? `${progSum.weakIndices.length} item(s) still need consolidation (${progSum.masteredCount}/${progSum.totalQuestions} mastered).`
                    : `已掌握 ${progSum.masteredCount}/${progSum.totalQuestions} 题，还有 ${progSum.weakIndices.length} 道薄弱题待巩固，来一轮打乱选项回炉吧。`
                  ctaLabel = `${t('drillWeak')}（${progSum.weakIndices.length}）`
                  ctaAction = () => { setTab('quiz'); startDrill(progSum.weakIndices) }
                } else {
                  advice = LANG === 'en'
                    ? `All ${progSum.totalQuestions} items mastered! Try Mind Map Recall mode or export your themed slides.`
                    : `本节 ${progSum.totalQuestions} 题已全部真正掌握！可以切到「思维导图」做遮罩自测，或导出专属主题幻灯片。`
                  ctaLabel = t('tabMindmap')
                  ctaAction = () => setTab('mindmap')
                }
                return h('div', { style: styles.tutorBar },
                  h('div', { style: { fontSize: 13, lineHeight: 1.55 } },
                    h('strong', { style: { color: 'var(--dsw-alias-brand-primary)', marginRight: 6 } }, `${t('tutorNext')}：`),
                    advice),
                  ctaAction ? h('button', { type: 'button', style: styles.buttonPrimary, onClick: ctaAction }, ctaLabel) : null)
              })(),
              h('div', { style: styles.tabs }, tabs.map(([key, label]) => h('button', {
                key,
                type: 'button',
                style: { ...styles.tab, ...(tab === key ? styles.tabActive : {}) },
                onClick: () => { setTab(key); speech.cancel() },
              }, label))),
              tab === 'immersive' || !tabs.some(([key]) => key === tab)
                ? h(ImmersiveView, {
                  lesson,
                  lessonId: activeId,
                  answers: embedded,
                  focusSectionId,
                  onAnswer: (sectionId, choice) => setEmbedded((current) => ({ ...current, [sectionId]: choice })),
                })
                : null,
              tab === 'slides' ? h(SlidesView, { lesson, lessonId: activeId }) : null,
              tab === 'audio' ? h(AudioView, { lesson, lessonId: activeId }) : null,
              tab === 'mindmap' ? h(MindMapView, { lesson, progress: record?.progress ?? null }) : null,
              tab === 'source' ? h(SourceView, { lesson, measurement }) : null,
              tab === 'quiz'
                ? h(QuizView, {
                  lesson,
                  lessonId: activeId,
                  progress: record?.progress ?? null,
                  answers: quizAnswers,
                  confidences: quizConfidences,
                  onAnswer: (index, choice) => setQuizAnswers((current) => ({ ...current, [index]: choice })),
                  onConfidence: (index, conf) => setQuizConfidences((current) => ({ ...current, [index]: conf })),
                  result: quizResult,
                  submitting,
                  drillIndices,
                  drillSeed,
                  onSubmit: submitQuiz,
                  onStartDrill: startDrill,
                  onRetake: () => { setQuizResult(null); setQuizAnswers({}); setQuizConfidences({}); setDrillIndices(null) },
                  onJumpSection: jumpToSection,
                  onSaveReflection: saveReflection,
                })
                : null)
            : null,

          h('div', { style: styles.footer },
            `${t('lessons')}：${lessons?.length ?? 0}${health?.dataDir ? ` · ${t('dataDir')}：${health.dataDir}` : ''}`,
            h('br'),
            'arXiv:2509.13348v4 · Learn Your Way (LearnLM Team, Google) — 本页面是该论文两阶段流程（个性化改写 → 多表达转换 + 形成性测评）的实现。')))
    }

    /** Header button: one click switches the main panel to this plugin. */
    function HeaderAction(props) {
      const open = props?.open
      return h('button', {
        type: 'button',
        title: t('panel'),
        'aria-label': t('panel'),
        onClick: () => { if (typeof open === 'function') open() },
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 5,
          appearance: 'none', border: '0.5px solid var(--dsw-alias-border-l1)',
          background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
          borderRadius: 7, padding: '3px 8px', cursor: 'pointer', font: 'inherit', fontSize: 12,
        },
      }, h(PanelIcon, { size: 14 }), t('panel'))
    }

    /** Sidebar icon: a book with its views fanning out. */
    function PanelIcon(props) {
      const size = props.size ?? 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 64 64',
        'aria-hidden': true,
        style: { display: 'block', opacity: props.active === false ? 0.7 : 1 },
      },
        h('path', { d: 'M8 18.5c4.4-2 8.8-2 13.2 0v27c-4.4-2-8.8-2-13.2 0z', fill: 'currentColor', opacity: 0.34 }),
        h('path', { d: 'M22.6 18.5c4.4-2 8.8-2 13.2 0v27c-4.4-2-8.8-2-13.2 0z', fill: 'currentColor', opacity: 0.58 }),
        h('rect', { x: '38', y: '16', width: '18', height: '6', rx: 3, fill: 'currentColor', opacity: 0.9 }),
        h('rect', { x: '41', y: '25', width: '15', height: '6', rx: 3, fill: 'currentColor', opacity: 0.72 }),
        h('rect', { x: '38', y: '34', width: '18', height: '6', rx: 3, fill: 'currentColor', opacity: 0.52 }),
        h('circle', { cx: '46', cy: '50', r: '5.6', fill: 'currentColor' }),
        h('path', { d: 'M43.6 50.1l1.8 1.9 3.4-3.8', stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }))
    }

    return {
      // The panel owns its dictionaries, so the client locale service is not a
      // dependency: no `locale:` namespace is passed to a slot registration.
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots
        if (!slots || typeof slots.inject !== 'function') {
          console.warn('[learnway] slots service unavailable; panel not registered')
          return
        }
        // Each seat is installed independently: one failing registration must
        // not take the other down with it.
        const install = (slot, register) => {
          try {
            slots.inject(slot, register)
          } catch (error) {
            console.warn('[learnway] could not register into ' + slot + ': ' + (error && error.message ? error.message : error))
          }
        }
        install('main', () => slots.register({
          name: 'main',
          key: PANEL_KEY,
          inject: () => ({}),
        }, LessonPage))
        install('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist',
          id: PANEL_KEY,
          order: 23,
          label: () => t('panel'),
        }, PanelIcon))
        // A second, session-scoped way in: the sidebar list can be crowded, and
        // the layout service is optional, so this seat appears only where it can
        // actually switch panels.
        const layout = typeof ctx.get === 'function' ? ctx.get('layout') : undefined
        if (layout && typeof layout.selectPanel === 'function') {
          install('conversation.session.header.utilities', () => slots.register({
            name: 'conversation.session.header.utilities',
            id: 'learnway-open',
            order: 40,
            label: () => t('panel'),
            inject: () => ({ open: () => layout.selectPanel(PANEL_KEY) }),
          }, HeaderAction))
        }
        void checkIn('activate')
      },
    }

    /** Tell the Host this module is alive; the answer is readable with learnway_client_status. */
    async function checkIn(phase) {
      try {
        await apiPost('/ping', {
          phase,
          moduleId: NS,
          registrations: ['main:' + PANEL_KEY, 'sidebar.panellist:' + PANEL_KEY],
          href: typeof location !== 'undefined' ? String(location.href) : '',
          userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent) : '',
        })
      } catch (error) {
        console.warn('[learnway] check-in failed: ' + (error && error.message ? error.message : error))
      }
    }
}
