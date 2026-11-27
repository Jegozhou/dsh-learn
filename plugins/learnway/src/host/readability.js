/**
 * Readability measurement for the re-levelling stage.
 *
 * The paper (arXiv:2509.13348v4, §2.1) formulates grade-level personalisation as
 * "re-generate the text so that it matches the Flesch-Kincaid Grade (FKG) of the
 * learner, while maintaining factuality and coverage". That makes FKG a
 * *measurable* constraint on the rewrite, not a vibe: this module is the
 * measuring instrument the agent uses before and after rewriting.
 *
 * Latin script measures exactly what Kincaid et al. defined. CJK script cannot
 * use FKG — the formula is defined on English word/syllable counts — so a CJK
 * text reports `fleschKincaidGrade: null` plus a sentence-load band that is
 * labelled as an estimate rather than dressed up as FKG.
 *
 * @module host/readability
 */

/** Closing punctuation that belongs to the sentence before the break. */
const CLOSING = new Set(['"', "'", '”', '’', '）', ')', ']', '】', '》'])
/** Characters that end a sentence. '；' counts: Chinese prose ends clauses there. */
const TERMINAL = new Set(['.', '!', '?', '。', '！', '？', '…', '；'])

/**
 * Split text into sentences.
 *
 * A plain regex cannot do this: Chinese puts no space after 「。」, so a
 * whitespace-anchored split leaves a whole paragraph as one sentence, while an
 * unanchored split cuts every decimal point. This scanner consumes terminal
 * punctuation plus any closing quotes and the following whitespace, and treats
 * a dot between digits as part of the number.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const value = String(text)
  const parts = []
  let start = 0
  let index = 0
  while (index < value.length) {
    const char = value[index]
    if (!TERMINAL.has(char)) { index += 1; continue }
    if (char === '.' && /[0-9]/.test(value[index + 1] ?? '')) { index += 1; continue }
    let end = index + 1
    // A run like "?!" and its closing quotes stay with the sentence.
    while (end < value.length && (TERMINAL.has(value[end]) || CLOSING.has(value[end]))) end += 1
    parts.push(value.slice(start, end))
    while (end < value.length && /\s/u.test(value[end])) end += 1
    start = end
    index = end
  }
  if (start < value.length) parts.push(value.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/**
 * Count sentences the way a reader would.
 *
 * Real boundaries only: an earlier version also divided commas by three to
 * shorten absurd CJK paragraphs, but that hid the fact that the splitter never
 * fired on 「。」. Boundaries now come from the punctuation itself.
 *
 * @param {string} text
 * @returns {number}
 */
export function countSentences(text) {
  return splitSentences(text).length
}
/** Latin words, including internal apostrophes and hyphens. */
const LATIN_WORD = /[A-Za-z][A-Za-z'’-]*/gu
/** CJK ideographs, kana and hangul each read as one syllable. */
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
/** Vowel groups approximate English syllables; a trailing silent "e" is removed later. */
const VOWEL_GROUP = /[aeiouy]+/g

/** Minimum share of a script before the text is called mixed. */
const MIXED_SHARE = 0.12

/**
 * Approximate English syllable count for one word.
 *
 * Vowel-group counting plus the usual corrections (silent final "e", "le"
 * endings, a floor of one). Accurate enough for a grade band, which is all FKG
 * needs.
 *
 * @param {string} word
 * @returns {number}
 */
export function countSyllables(word) {
  const clean = String(word).toLowerCase().replace(/[^a-z]/g, '')
  if (clean.length === 0) return 0
  if (clean.length <= 3) return 1
  let groups = (clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(VOWEL_GROUP) ?? []).length
  if (groups === 0) groups = 1
  return groups
}

/**
 * Which writing system dominates the text.
 *
 * @param {string} text
 * @returns {'latin' | 'cjk' | 'mixed'}
 */
export function detectScript(text) {
  const latin = (String(text).match(LATIN_WORD) ?? []).length
  const cjk = (String(text).match(CJK_CHAR) ?? []).length
  const total = latin + cjk
  if (total === 0) return 'latin'
  const cjkShare = cjk / total
  if (cjkShare >= 1 - MIXED_SHARE) return 'cjk'
  if (cjkShare <= MIXED_SHARE) return 'latin'
  return 'mixed'
}

/**
 * Reading-load band for a CJK sentence length, in characters.
 *
 * @param {number} charsPerSentence
 * @returns {{ band: string, label: string }}
 */
function cjkBand(charsPerSentence) {
  if (charsPerSentence <= 12) return { band: 'k3-5', label: '小学低年级' }
  if (charsPerSentence <= 18) return { band: 'g4-6', label: '小学高年级' }
  if (charsPerSentence <= 26) return { band: 'g7-9', label: '初中' }
  if (charsPerSentence <= 34) return { band: 'g10-12', label: '高中' }
  return { band: 'college', label: '大学及以上' }
}

/**
 * Round to `digits` decimals, tolerating NaN/Infinity.
 *
 * @param {number} value
 * @param {number} digits
 * @returns {number | null}
 */
export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Measure one text.
 *
 * @param {string} text
 * @returns {{
 *   script: 'latin' | 'cjk' | 'mixed',
 *   chars: number,
 *   words: number,
 *   sentences: number,
 *   syllables: number,
 *   avgSentenceLength: number | null,
 *   avgSyllablesPerWord: number | null,
 *   fleschReadingEase: number | null,
 *   fleschKincaidGrade: number | null,
 *   gradeBand: string,
 *   gradeBandLabel: string,
 *   longestSentence: string,
 *   longestSentenceWords: number,
 *   note?: string,
 * }}
 */
export function analyzeText(text) {
  const source = String(text ?? '')
  const trimmed = source.trim()
  const script = detectScript(trimmed)
  const sentences = countSentences(trimmed)
  const latinWords = trimmed.match(LATIN_WORD) ?? []
  const cjkChars = trimmed.match(CJK_CHAR) ?? []
  // A CJK character is one syllable and, for counting purposes, one word.
  const words = latinWords.length + cjkChars.length
  const syllables = latinWords.reduce((total, word) => total + countSyllables(word), 0) + cjkChars.length
  const avgSentenceLength = sentences > 0 ? words / sentences : null
  const avgSyllablesPerWord = words > 0 ? syllables / words : null

  const longest = splitSentences(trimmed).sort((a, b) => b.length - a.length)[0] ?? ''
  const longestSentenceWords = (longest.match(LATIN_WORD) ?? []).length + (longest.match(CJK_CHAR) ?? []).length

  let fleschReadingEase = null
  let fleschKincaidGrade = null
  let note
  if (script === 'cjk') {
    note = 'FKG 由英文单词数/音节数定义，中文（含日韩）正文不适用；此处给的是按句长的阅读负荷估计，请以句长、词频和注释密度作为重分级依据。'
  } else if (avgSentenceLength !== null && avgSentenceLength > 0 && avgSyllablesPerWord !== null) {
    fleschReadingEase = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord
    fleschKincaidGrade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59
    if (script === 'mixed') note = '混合文本：中文按每字一个音节计入，FKG 仅作粗略参考。'
  } else {
    note = '文本为空，无法测量。'
  }

  const cjkGrade = cjkBand(avgSentenceLength ?? 0)
  const latinBand = fleschKincaidGrade === null ? null : bandOfGrade(fleschKincaidGrade)

  return {
    script,
    chars: trimmed.length,
    words,
    sentences,
    syllables,
    avgSentenceLength: round(avgSentenceLength),
    avgSyllablesPerWord: round(avgSyllablesPerWord, 3),
    fleschReadingEase: round(fleschReadingEase, 1),
    fleschKincaidGrade: round(fleschKincaidGrade, 1),
    gradeBand: script === 'cjk' ? cjkGrade.band : (latinBand?.band ?? 'unknown'),
    gradeBandLabel: script === 'cjk' ? cjkGrade.label : (latinBand?.label ?? '未定'),
    longestSentence: longest.length > 220 ? `${longest.slice(0, 220)}…` : longest,
    longestSentenceWords,
    ...(note ? { note } : {}),
  }
}

/**
 * Map an FKG value onto a band, mirroring the school stages the paper used
 * (7th grade, 10th grade, undergraduate).
 *
 * @param {number} grade
 * @returns {{ band: string, label: string }}
 */
export function bandOfGrade(grade) {
  if (grade <= 5) return { band: 'k3-5', label: '小学低年级' }
  if (grade <= 8) return { band: 'g6-8', label: '初中' }
  if (grade <= 12) return { band: 'g9-12', label: '高中' }
  return { band: 'college', label: '大学及以上' }
}

/**
 * Compare a measurement against the learner's grade and say whether the
 * rewrite is within tolerance.
 *
 * @param {ReturnType<typeof analyzeText>} analysis
 * @param {number} targetGrade - FKG target, e.g. 7, 10, 13 for undergraduate.
 * @param {number} [tolerance] - acceptable absolute FKG distance (default 1.0).
 * @returns {{ target: number, delta: number | null, tolerance: number, verdict: 'within' | 'close' | 'off' | 'unmeasurable', message: string }}
 */
export function compareToGrade(analysis, targetGrade, tolerance = 1) {
  const target = Number(targetGrade)
  if (!Number.isFinite(target)) {
    return { target: null, delta: null, tolerance, verdict: 'unmeasurable', message: '未给出目标年级，未作比较。' }
  }
  if (analysis.fleschKincaidGrade === null) {
    const unit = analysis.script === 'cjk' ? '字' : '词'
    return {
      target,
      delta: null,
      tolerance,
      verdict: 'unmeasurable',
      message: `该文本为${analysis.script === 'cjk' ? '中文' : '非英文'}，FKG 不可用；当前句长 ${analysis.avgSentenceLength ?? 0} ${unit}/句，负荷估计 ${analysis.gradeBandLabel}，目标为 ${target} 年级。`,
    }
  }
  const delta = analysis.fleschKincaidGrade - target
  const distance = Math.abs(delta)
  const verdict = distance <= tolerance ? 'within' : distance <= tolerance * 2 ? 'close' : 'off'
  const direction = delta > 0 ? '高于' : '低于'
  return {
    target,
    delta: round(delta, 1),
    tolerance,
    verdict,
    message: verdict === 'within'
      ? `FKG ${analysis.fleschKincaidGrade} 与目标 ${target} 年级相差 ${round(distance, 1)}，在 ±${tolerance} 容差内。`
      : `FKG ${analysis.fleschKincaidGrade} ${direction}目标 ${target} 年级 ${round(distance, 1)} 级（容差 ±${tolerance}）：${delta > 0 ? '需要更短的句子和更常见的词。' : '可以提高信息密度或句子复杂度。'}`,
  }
}

/**
 * Content-word overlap between the source and generated material, as a coarse
 * coverage signal (the paper's Coverage criterion, measured cheaply).
 *
 * Both sides are reduced to character/word n-grams so Chinese and English are
 * compared by the same code path.
 *
 * @param {string} sourceText
 * @param {string} generatedText
 * @returns {{ ratio: number | null, shared: number, sourceTerms: number, method: string }}
 */
export function coverage(sourceText, generatedText) {
  const terms = (text) => {
    const value = String(text ?? '')
    const latin = (value.toLowerCase().match(/[a-z][a-z'-]{2,}/gu) ?? [])
    const cjkPairs = []
    const cjkRuns = value.match(/[\p{Script=Han}]{2,}/gu) ?? []
    for (const run of cjkRuns) {
      for (let index = 0; index < run.length - 1; index += 1) cjkPairs.push(run.slice(index, index + 2))
    }
    return { set: new Set([...latin, ...cjkPairs]), method: latin.length > 0 && cjkPairs.length > 0 ? 'latin-words+han-bigrams' : latin.length > 0 ? 'latin-words' : 'han-bigrams' }
  }
  const a = terms(sourceText)
  const b = terms(generatedText)
  if (a.set.size === 0) return { ratio: null, shared: 0, sourceTerms: 0, method: a.method }
  let shared = 0
  for (const term of a.set) if (b.set.has(term)) shared += 1
  return { ratio: round(shared / a.set.size, 3), shared, sourceTerms: a.set.size, method: a.method }
}
