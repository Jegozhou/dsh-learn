/**
 * Seed lessons.
 *
 * Two lessons ship with the plugin so the panel has something real to show
 * before the agent has produced anything, and so both measurement paths are
 * visible: the Chinese lesson exercises the CJK sentence-load estimate, the
 * English one exercises the Flesch-Kincaid grade distance the paper's
 * re-levelling stage is defined against.
 *
 * The topics and the personalisation axes are the paper's own examples
 * (arXiv:2509.13348v4, Figures 2 and 3: Newton's third law for a basketball
 * interest, economic systems for a sport interest). All wording here is written
 * for this plugin — the source paragraphs are original text on the same topics,
 * not excerpts from OpenStax.
 *
 * @module host/demo
 */

/** Chinese seed: grade 8, basketball interest. */
export const DEMO_ZH = {
  title: '力是互相的：牛顿第三定律',
  source: {
    title: '牛顿第三定律（示例原文）',
    attribution: '为本插件按 OpenStax College Physics「Newton’s Third Law of Motion」同一主题自写，非原文摘录',
    text: '两个物体之间发生相互作用时，一个物体对另一个物体施加了力，另一个物体也同时对它施加了力。这两个力分别作用在两个不同的物体上，大小相等，方向相反，并且作用在同一条直线上。这一规律称为牛顿第三定律。因为两个力作用在不同的物体上，它们不会相互抵消，也不会使物体保持静止。例如人走路时脚向后蹬地，地面同时向前推人，人才能前进。火箭喷出气体，气体同时推动火箭上升。在分析问题时，需要先明确研究对象，再判断它受到哪些力。',
  },
  learner: { grade: 8, interest: '篮球', language: 'zh' },
  objectives: [
    '能用「大小相等、方向相反、同一作用线、作用在两个物体上」完整描述一对作用力与反作用力',
    '能判断日常场景里哪两个力是一对作用力与反作用力，并说出它们各自作用在谁身上',
    '能解释为什么这对力不会相互抵消',
  ],
  immersion: {
    sections: [
      {
        id: 's1',
        heading: '一、你推球，球也推你',
        blocks: [
          {
            type: 'paragraph',
            text: '运球的时候，手掌向下压球，球同时向上顶手掌。这两个力同时出现、同时消失，没有先后。',
          },
          {
            type: 'paragraph',
            personalized: true,
            original: '两个物体之间发生相互作用时，一个物体对另一个物体施加了力，另一个物体也同时对它施加了力。',
            text: '你运球时手掌压向篮球，篮球在同一个瞬间顶回你的手掌。球场上没有只出力、不挨力的动作。你给球多大的推力，球就给你多大的顶力。',
          },
          {
            type: 'callout',
            tone: 'insight',
            title: '关键的一点',
            text: '这两个力分别作用在两个不同的物体上：一个在球上，一个在手上。作用在不同物体上的力，永远不会相互抵消。',
          },
        ],
        question: {
          stem: '运球时手掌向下压球，球向上顶手掌。这一对力作用在谁身上？',
          choices: [
            '都作用在球上',
            '都作用在手掌上',
            '一个作用在球上，一个作用在手掌上',
            '取决于出手的速度',
          ],
          answerIndex: 2,
          rationale: '作用力与反作用力一定作用在两个不同的物体上，这正是它们无法相互抵消的原因。',
          bloom: 'comprehension',
        },
      },
      {
        id: 's2',
        heading: '二、四句话就能说清',
        blocks: [
          {
            type: 'paragraph',
            text: '把牛顿第三定律拆成四句话：大小相等、方向相反、作用在同一条直线上、分别作用在两个物体上。少一句，就会推出错误的结论。',
          },
          {
            type: 'paragraph',
            personalized: true,
            original: '这两个力分别作用在两个不同的物体上，大小相等，方向相反，并且作用在同一条直线上。',
            text: '球场上每一对推来推去都是同规格的。你起跳时脚向后蹬地，地面就用同样大小的力把你向前上方推出去。这两个力方向相反、大小相同，并且在同一条直线上；它们一个在地面上，一个在你身上。',
          },
          {
            type: 'callout',
            tone: 'caution',
            title: '常见误解',
            text: '大卡车撞小汽车，并不是卡车对汽车的力更大。两个力大小相等。差别来自两车质量不同，因此加速度不同（F = ma）。',
          },
        ],
        memoryAid: {
          items: ['等大', '反向', '共线', '异体'],
          sentence: '等同大力气，反着往回推；一条线上走，两边各自疼。',
          gloss: '「等大反向共线异体」四要素：异体指作用在两个不同物体上，是判断一对力是否为一对作用力与反作用力的关键。',
        },
        question: {
          stem: '为什么一对作用力与反作用力不能让物体保持平衡？',
          choices: [
            '因为它们的合力一定为零',
            '因为两个力作用在不同物体上，不会作用在同一物体上相加',
            '因为它们的数值总是不同',
            '因为它们的方向总是相同的',
          ],
          answerIndex: 1,
          rationale: '平衡条件要求作用在同一物体上的合力为零；一对作用力与反作用力分处两个物体，因此谈不上相互抵消。',
          bloom: 'analysis',
        },
      },
      {
        id: 's3',
        heading: '三、从现象到实验',
        blocks: [
          {
            type: 'paragraph',
            text: '要证明两个力大小相等，可以把两个弹簧测力计钩在一起，向相反方向拉。读出两个示数。无论谁主动拉，两个示数总是一样。',
          },
          {
            type: 'paragraph',
            personalized: true,
            original: '因为两个力作用在不同的物体上，它们不会相互抵消，也不会使物体保持静止。',
            text: '就像队友和你对着拉一根弹力带。谁更用力，另一个人就被拉得更狠。但两个测力计上的数字始终相同：你们各自受力，谁也没抵消谁。',
          },
        ],
        timeline: {
          title: '用两个测力计验证第三定律',
          items: [
            { label: '准备器材', detail: '两个量程相同的弹簧测力计、一根细绳' },
            { label: '挂钩相连', detail: '把两个测力计的挂钩钩在一起，记录示数是否归零' },
            { label: '向相反方向拉', detail: '一人先主动拉，另一人只握住不动，读出两个示数' },
            { label: '交换主动方', detail: '让另一边主动拉，重复读数' },
            { label: '比较数据', detail: '两示数始终相等，方向相反，沿同一直线' },
          ],
        },
        illustration: {
          caption: '两名球员在争球瞬间互相推开：两个箭头等长、反向、共线，分别画在两个球员身上（异体作用，绝不抵消）。',
          brief: '教育插画风格，两名篮球运动员空中争球，用两个等长反向箭头标出各自受到的力，箭头起点分别在对方身体上，白色背景，线条清晰。',
          svg: '<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="220" rx="14" fill="#FAF9F6"/><line x1="60" y1="110" x2="580" y2="110" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="6 5"/><circle cx="210" cy="110" r="42" fill="#E8EEFC" stroke="#1D4ED8" stroke-width="2.5"/><text x="210" y="106" text-anchor="middle" font-size="15" font-weight="700" fill="#141619">球员 A</text><text x="210" y="126" text-anchor="middle" font-size="11" fill="#5C6370">物体 1</text><circle cx="430" cy="110" r="42" fill="#FEF3C7" stroke="#D97706" stroke-width="2.5"/><text x="430" y="106" text-anchor="middle" font-size="15" font-weight="700" fill="#141619">球员 B</text><text x="430" y="126" text-anchor="middle" font-size="11" fill="#5C6370">物体 2</text><line x1="168" y1="110" x2="86" y2="110" stroke="#1D4ED8" stroke-width="4" stroke-linecap="round"/><polygon points="78,110 92,102 92,118" fill="#1D4ED8"/><text x="126" y="94" text-anchor="middle" font-size="13" font-weight="700" fill="#1D4ED8">F₂ (B推A)</text><line x1="472" y1="110" x2="554" y2="110" stroke="#D97706" stroke-width="4" stroke-linecap="round"/><polygon points="562,110 548,102 548,118" fill="#D97706"/><text x="514" y="94" text-anchor="middle" font-size="13" font-weight="700" fill="#D97706">F₁ (A推B)</text><rect x="220" y="170" width="200" height="30" rx="15" fill="#FFFFFF" stroke="#E4E2DC"/><text x="320" y="189" text-anchor="middle" font-size="12" font-weight="600" fill="#141619">|F₁| = |F₂| · 反向 · 共线 · 异体</text></svg>',
        },
      },
    ],
  },
  slides: [
    {
      layout: 'title',
      kicker: '牛顿第三定律',
      title: '力是互相的：牛顿第三定律',
      subtitle: '8 年级 · 篮球 · 个性化多表达课时',
      narration: '先看三个你熟悉的动作。每一个动作里都同时存在两个力，而且都发生在两个不同的物体之间。',
    },
    {
      layout: 'section',
      kicker: '第 1 节',
      title: '你推球，球也推你',
      bullets: ['运球：手掌压球，球顶手掌', '起跳：脚蹬地，地推人', '争球：两个球员互相推开'],
      narration: '这一节只做一件事：把「力总是成对出现」变成你的直觉。',
    },
    {
      layout: 'cards',
      kicker: '第 2 节 · 核心定律',
      title: '四要素卡片：缺一不可',
      cards: [
        { tag: '01', title: '大小相等', body: '无论谁更主动、谁质量更大，两个力的数值始终严格相等。' },
        { tag: '02', title: '方向相反', body: '一个向前，另一个必向后；方向完全相反。' },
        { tag: '03', title: '同一直线', body: '两个力沿同一作用线分布，不会偏斜。' },
        { tag: '04', title: '异体作用', body: '分别作用在两个不同物体上，因此永远不会相互抵消。' },
      ],
      narration: '这四句话缺一不可。尤其第四句「异体」，它是判断一对力是否为一对作用力与反作用力的分水岭。',
    },
    {
      layout: 'comparison',
      kicker: '第 3 节 · 易错辨析',
      title: '力相等，为什么运动不相等？',
      comparison: {
        leftTitle: '牛顿第三定律（看力）',
        rightTitle: '牛顿第二定律（看运动）',
        left: ['两个力大小始终相等', '方向相反，沿同一条直线', '谁也不比谁“更主动”'],
        right: ['同一力下质量小，加速度大', '结果：球飞出去，手几乎不动', '看运动差异要找 F = ma'],
      },
      narration: '左边是第三定律给的，右边是第二定律给的。考试里最容易错的，就是把两边混在一起。',
    },
    {
      layout: 'stats',
      kicker: '直觉校准',
      title: '记住这三个核心数字与公式',
      stats: [
        { value: 'F₁ = -F₂', label: '等大反向', detail: '作用力与反作用力同时出现、同时消失' },
        { value: '2 个物体', label: '绝不抵消', detail: '只有作用在同一物体上的力才能谈平衡' },
        { value: 'a = F / m', label: '质量决定加速度', detail: '大车撞小车，力相同但小车加速度更大' },
      ],
      narration: '这三个卡片把整节最容易混淆的物理量一次理清。',
    },
    {
      layout: 'quote',
      kicker: '常见误解',
      title: '“大卡车撞小汽车，卡车对汽车的力更大”',
      quote: {
        text: '两个力大小相等。差别来自两车质量不同，因此加速度不同。',
        attribution: '牛顿第三定律 + 第二定律',
      },
      narration: '这是最常见的一条错误直觉。把这句话记住，比记公式有用。',
    },
    {
      layout: 'steps',
      kicker: '第 4 节 · 动手验证',
      title: '四步弹簧测力计实验',
      steps: [
        { label: '挂钩相连', detail: '两个量程相同的弹簧测力计归零并钩在一起' },
        { label: '单方主动拉', detail: '一人拉、一人握住不动，记录两示数' },
        { label: '交换主动方', detail: '换另一边主动拉，重复读取示数' },
        { label: '得出结论', detail: '无论谁主动，两示数始终严格相等' },
      ],
      narration: '实验的关键不是谁主动拉，而是交换之后读数依然相等——这排除了“主动方力更大”的直觉。',
    },
  ],
  audioLesson: {
    title: '互动师生对话：为什么球会把你顶回来',
    keyConcepts: ['作用力与反作用力', '异体', '不会抵消', 'F = ma'],
    turns: [
      {
        speaker: 'teacher',
        text: '你运球的时候，手掌向下压球，手和球之间到底发生了什么？',
        concept: '作用力与反作用力',
        interactive: {
          expected: ['顶', '推', '反作用', '互相', '两个力', '同时'],
          alignedReply: '抓得非常准！这就是「互相作用」——你给球向下的力，球在同一个瞬间也给你手掌向上的顶力。',
          hintReply: '再感受一下拍球那一瞬间你的手掌：除了手在压球，球有没有对手掌做什么？',
          misconceptions: [
            { keywords: ['只有手', '单向', '球不动', '球没用力'], reply: '停一下想想看：如果球没有顶回你的手，你的手掌怎么会感觉到“拍到实心球”的阻力呢？试试重新描述一下球对手的作用。' },
          ],
          quickChoices: [
            { label: '手压球，球也同时向上顶我的手', verdict: 'aligned', reply: '抓得非常准！这就是「互相作用」——两个力同时出现、同时消失。' },
            { label: '只有我的手在用力压球，球只是被动的', verdict: 'misconception', reply: '很自然的直觉，但停一下感受手掌：拍球瞬间手掌也被顶了一下，那股力正是球施加给你的。' },
          ],
        },
      },
      { speaker: 'student', text: '我压球，球也顶我的手。', concept: '作用力与反作用力' },
      {
        speaker: 'teacher',
        text: '那当我用力把球拍得更高的时候，手压球的力和球顶手的力一样大吗？',
        concept: '等大',
        interactive: {
          expected: ['一样', '相等', '等大', '相同'],
          alignedReply: '完全正确！球弹得更高是因为形变更大、离手速度更大，而不是那一瞬间两个力不相等。',
          hintReply: '想想牛顿第三定律的第一要素：无论谁更用力，这一对力的大小关系是什么？',
          misconceptions: [
            { keywords: ['手更大', '拍的力大', '不一样', '大于', '更强'], reply: '踩中经典陷阱啦！用力拍球时，是「这一对力同时变大」，但在接触的每一个瞬间，手给球多大，球顶手就多大。再确认一次？' },
          ],
          quickChoices: [
            { label: '一样大，用力拍只是让一对力同时变大', verdict: 'aligned', reply: '太透彻了！用力拍让这一对力同时增大，但两者始终严格相等。' },
            { label: '不一样，我用力拍的时候手给球的力更大', verdict: 'misconception', reply: '这是最常见的错误直觉！接触瞬间手对球和球对手的力永远等大，球弹得高是因为形变和加速度更大。' },
          ],
        },
      },
      { speaker: 'student', text: '应该一样大吧……可是我用力拍的时候，球弹得更高，是不是我给的力更大？', concept: '常见误解' },
      { speaker: 'teacher', text: '球弹得更高是因为你给它的形变更大、离手时速度更大，不是因为那一瞬间两个力不相等。两个力永远相等。', concept: 'F = ma' },
      { speaker: 'student', text: '那为什么球飞走了，我的手没被弹飞？', concept: '异体' },
      {
        speaker: 'teacher',
        text: '好问题！既然两个力大小相等，为什么球飞出去了，而你的手几乎没动？',
        concept: '异体',
        interactive: {
          expected: ['质量', '加速度', 'F=ma', '不同物体', '异体', '重', '轻'],
          alignedReply: '完全打通了！两个力作用在不同物体上不会抵消；球质量小、加速度大，手连着整个身体质量大、加速度极小。',
          hintReply: '提示：结合第二定律 F = ma，力 F 相同的时候，决定加速度 a 大小的是什么物理量？',
          misconceptions: [
            { keywords: ['抵消', '平衡', '合力为零'], reply: '警惕核心红线：两个力作用在不同物体上（一个在球、一个在手），永远不会相互抵消！想想两者的质量差别？' },
          ],
          quickChoices: [
            { label: '分处两个物体不抵消，且球质量小所以加速度大', verdict: 'aligned', reply: '满分解释！第三定律管「力相等」，第二定律 F = ma 管「质量小加速度大」。' },
            { label: '因为手把球的反作用力抵消掉了', verdict: 'misconception', reply: '作用在不同物体上的力永远无法抵消！真正的原因是球质量远小于你的手和身体，同等力下加速度不同。' },
          ],
        },
      },
      { speaker: 'student', text: '所以我记住四句话就行：等大、反向、共线、异体。', concept: '四要素' },
    ],
  },
  mindmap: {
    label: '牛顿第三定律',
    note: '一对力，两个物体',
    children: [
      {
        label: '四要素',
        children: [
          { label: '大小相等', note: '与主动方无关' },
          { label: '方向相反' },
          { label: '同一直线' },
          { label: '作用在两个物体（异体）', note: '判断一对力的关键' },
        ],
      },
      {
        label: '为什么不会抵消',
        note: '平衡要求同一物体',
        children: [
          { label: '分处两个物体，无法相加' },
          { label: '各自产生各自的加速度' },
        ],
      },
      {
        label: '常见误解',
        children: [
          { label: '大车撞小车，力更大', note: '错：力相等，加速度不同' },
          { label: '主动方施力更大', note: '错：交换主动方读数不变' },
        ],
      },
      {
        label: '验证实验',
        children: [
          { label: '两个测力计挂钩相连' },
          { label: '交换主动方' },
          { label: '读数始终相等' },
        ],
      },
    ],
  },
  quiz: {
    questions: [
      {
        stem: '下列哪一组力一定是一对作用力与反作用力？',
        choices: ['书对桌面的压力与桌面对书的支持力', '人推墙的力与墙推人的力', '物体受到的重力与它对面的压力', '两匹马对同一辆车的拉力'],
        answerIndex: 1,
        rationale: '只有「人推墙 / 墙推人」满足等大、反向、共线且分处两个物体。书与桌面的压力—支持力常被误判，需注意它们是否作用在同一物体上。',
        difficulty: 'medium',
        sectionId: 's1',
        concept: '作用力与反作用力',
      },
      {
        stem: '关于作用力与反作用力，下列说法正确的是：',
        choices: ['先有作用力，后有反作用力', '两者可以相互抵消', '两者同时产生、同时消失', '质量大的物体受到的力更大'],
        answerIndex: 2,
        rationale: '作用力与反作用力同时产生、同时消失，分处两个物体不能抵消，大小始终相等。',
        difficulty: 'easy',
        sectionId: 's1',
        concept: '同时性',
      },
      {
        stem: '起跳时脚向后蹬地，人向上运动。人受到的力来自：',
        choices: ['脚对地的蹬力', '地对脚的反作用力', '人的重力', '空气的浮力'],
        answerIndex: 1,
        rationale: '使人改变运动状态的力必须作用在人身上；脚对地的力作用在地面上。',
        difficulty: 'easy',
        sectionId: 's2',
        concept: '异体作用',
      },
      {
        stem: '大卡车与小汽车相撞，关于两者受到的力：',
        choices: ['卡车受到的力更大', '汽车受到的力更大', '两者大小相等', '无法比较'],
        answerIndex: 2,
        rationale: '第三定律给出力相等；汽车损坏更严重是因为质量小、加速度大，属于第二定律的结果。',
        difficulty: 'medium',
        sectionId: 's2',
        concept: '力相等与 F = ma',
      },
      {
        stem: '一匹马拉着车匀速前进。下列说法正确的是：',
        choices: ['马拉车的力大于车拉马的力', '马拉车的力与车拉马的力大小相等', '马拉车的力与地面对车的阻力是一对作用力与反作用力', '车之所以前进是因为马拉车的力大于车拉马的力'],
        answerIndex: 1,
        rationale: '马拉车与车拉马永远等大反向。车能前进取决于车受到的合力（拉力与阻力之差），与「拉马」无关。',
        difficulty: 'hard',
        sectionId: 's2',
        concept: '平衡力 vs 相互作用力',
      },
      {
        stem: '用两个弹簧测力计挂钩相连并对拉，读数分别为 4.0 N 与 4.0 N。若改为让另一边主动拉，读数将：',
        choices: ['变成 0 与 8.0 N', '仍然都是 4.0 N', '变成 8.0 N 与 8.0 N', '无法确定'],
        answerIndex: 1,
        rationale: '主动方不影响两者读数相等，这是第三定律的实验判据。',
        difficulty: 'hard',
        sectionId: 's3',
        concept: '弹簧测力计实验',
      },
    ],
    glows: ['你能区分「哪两个力才是一对」了，这是本节最难的判断。'],
    grows: ['把「力相等」与「加速度不同」分开说，考试时就能避开大车小车的陷阱。'],
  },
}

/** English seed: grade 8, basketball — the paper's Figure 2 example, measured by FKG. */
export const DEMO_EN = {
  title: "Newton's third law on the court",
  source: {
    title: "Newton's Third Law of Motion (original sample text)",
    attribution: 'Written for this plugin on the same topic as OpenStax College Physics; not an excerpt',
    text: 'When two objects push or pull on each other, each one exerts a force on the other. The two forces are equal in size. They point in opposite directions. They act along the same line. They act on two different objects. For this reason the two forces do not cancel. A force pair never holds an object still. When you walk, your foot pushes the ground backward. The ground pushes you forward. A rocket pushes gas out, and the gas pushes the rocket up. To solve a problem, first choose the object you study, then list the forces that act on it.',
  },
  learner: { grade: 8, interest: 'basketball', language: 'en' },
  objectives: [
    'State all four parts of Newton’s third law',
    'Identify which two forces form a pair and which object each one acts on',
    'Explain why a force pair does not cancel',
  ],
  immersion: {
    sections: [
      {
        id: 's1',
        heading: 'When you push the ball, the ball pushes you',
        blocks: [
          {
            type: 'paragraph',
            text: 'A dribble is a brief interaction between your hand and the ball. Your hand exerts a downward force on the ball, and the ball exerts an upward force on your hand.',
          },
          {
            type: 'paragraph',
            personalized: true,
            original: 'When two objects push or pull on each other, each one exerts a force on the other.',
            text: 'Consider a jump shot. Your feet push downward against the floor, and the floor pushes upward against your feet with exactly the same magnitude of force. A stronger push therefore produces a higher jump, which is why players work on leg strength.',
          },
          {
            type: 'callout',
            tone: 'insight',
            title: 'The one detail students miss',
            text: 'One force acts on the ball, and the other force acts on your hand. Forces that act on different objects never cancel each other.',
          },
        ],
        question: {
          stem: 'During a dribble, the pair of forces acts on which objects?',
          choices: ['Both on the ball', 'Both on the hand', 'One on the ball and one on the hand', 'Only on the floor'],
          answerIndex: 2,
          rationale: 'A force pair always acts on two different objects, which is why it cannot cancel.',
        },
      },
      {
        id: 's2',
        heading: 'Why the ball still moves',
        blocks: [
          {
            type: 'paragraph',
            text: 'A pair of forces is equal in magnitude, opposite in direction and collinear. Because the two forces act on different objects, you never add them together, and balance remains a question about a single body.',
          },
          {
            type: 'paragraph',
            personalized: true,
            original: 'They act on two different objects. For this reason the two forces do not cancel.',
            text: 'A point guard and a centre jump for the same rebound. Each player exerts a force on the other, and each player feels the same magnitude in return. The lighter player accelerates more, because an identical force acting on a smaller mass produces a larger acceleration.',
          },
        ],
        memoryAid: {
          items: ['equal', 'opposite', 'same line', 'two bodies'],
          sentence: 'Every Opposite Line Splits two bodies.',
          gloss: 'Equal, Opposite, same Line, Split across two bodies — the four tests for a force pair.',
        },
      },
    ],
  },
  slides: [
    {
      layout: 'title',
      kicker: "Newton's third law",
      title: "Newton's third law on the court",
      subtitle: 'Grade 8 · basketball',
      narration: 'Every action on the court comes with a partner force.',
    },
    {
      layout: 'bullets',
      kicker: 'The law',
      title: 'Four parts of the law',
      bullets: ['Equal in size', 'Opposite in direction', 'Same line', 'Two different objects'],
      narration: 'The fourth part decides whether two forces form a pair.',
    },
    {
      layout: 'two-column',
      kicker: 'Why it does not cancel',
      title: 'Equal forces, different motion',
      columns: [
        ['Two forces, two objects', 'Never added together', 'Balance is about one object'],
        ['Same force, less mass', 'Bigger acceleration', 'F = ma explains the result'],
      ],
      narration: 'This is why the ball leaves your hand even though both forces are equal.',
    },
  ],
  audioLesson: {
    title: 'Teacher and student: who pushes whom',
    keyConcepts: ['force pair', 'two bodies', 'F = ma'],
    turns: [
      { speaker: 'teacher', text: 'You push the ball down. What else happens?', concept: 'force pair' },
      { speaker: 'student', text: 'The ball pushes my hand up. But if the forces are equal, why does the ball move and not my hand?', concept: 'two bodies' },
      { speaker: 'teacher', text: 'Good question. The two forces act on different objects, so nobody adds them together. The ball has little mass, so it gains speed quickly.', concept: 'F = ma' },
      { speaker: 'student', text: 'So equal forces can still give very different motion.', concept: 'F = ma' },
    ],
  },
  mindmap: {
    label: "Newton's third law",
    children: [
      { label: 'Four parts', children: [{ label: 'Equal' }, { label: 'Opposite' }, { label: 'Same line' }, { label: 'Two objects' }] },
      { label: 'No cancellation', note: 'balance is about one object' },
      { label: 'On the court', children: [{ label: 'Dribble' }, { label: 'Jump shot' }, { label: 'Rebound' }] },
    ],
  },
  quiz: {
    questions: [
      { stem: 'Which pair is a third-law pair?', choices: ['Book on table and table on book', 'Person pushes wall / wall pushes person', 'Weight and normal force', 'Two horses pulling one cart'], answerIndex: 1, rationale: 'Only the wall pair is equal, opposite, on one line, on two different objects.', difficulty: 'medium', sectionId: 's1', concept: 'force pair' },
      { stem: 'A force pair is:', choices: ['One before the other', 'Able to cancel', 'Simultaneous', 'Larger on the heavier object'], answerIndex: 2, rationale: 'Both forces appear and vanish together.', difficulty: 'easy', sectionId: 's1', concept: 'simultaneity' },
      { stem: 'You jump. Which force moves you up?', choices: ['Your push on the floor', 'The floor’s push on you', 'Your weight', 'Air pressure'], answerIndex: 1, rationale: 'Only a force on your body changes your motion.', difficulty: 'easy', sectionId: 's1', concept: 'two bodies' },
      { stem: 'A truck hits a small car. The forces are:', choices: ['Larger on the car', 'Larger on the truck', 'Equal in size', 'Impossible to compare'], answerIndex: 2, rationale: 'Third law gives equal forces; the car accelerates more because its mass is smaller.', difficulty: 'medium', sectionId: 's2', concept: 'F = ma' },
      { stem: 'Two spring scales hooked together read 4.0 N and 4.0 N. If the other person pulls instead, the readings become:', choices: ['0 and 8.0 N', 'Still 4.0 N and 4.0 N', '8.0 N and 8.0 N', 'Unknown'], answerIndex: 1, rationale: 'Who pulls never changes the equality of the pair.', difficulty: 'hard', sectionId: 's2', concept: 'equal magnitude' },
    ],
    glows: ['You separated “equal forces” from “different motion”.'],
    grows: ['Rehearse the truck-and-car answer out loud once; it is the classic trap.'],
  },
}
