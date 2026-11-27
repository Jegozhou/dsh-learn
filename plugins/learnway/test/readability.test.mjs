import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeText, bandOfGrade, compareToGrade, countSentences, countSyllables, coverage, detectScript,
} from '../src/host/readability.js'

test('syllables are counted per vowel group', () => {
  assert.equal(countSyllables('cat'), 1)
  assert.equal(countSyllables('table'), 2)
  assert.equal(countSyllables(''), 0)
  assert.ok(countSyllables('beautiful') >= 3)
})

test('sentences split on terminal punctuation without breaking decimals', () => {
  assert.equal(countSentences('One. Two! Three?'), 3)
  assert.equal(countSentences('The value is 2.5 here.'), 1)
  assert.equal(countSentences(''), 0)
})

test('script detection separates latin, cjk and mixed text', () => {
  assert.equal(detectScript('The ball moves fast.'), 'latin')
  assert.equal(detectScript('球向上飞，手向下压。'), 'cjk')
  assert.equal(detectScript('牛顿说 F = ma 很重要，这是一条基本规律。'), 'mixed')
})

test('latin text yields a Flesch-Kincaid grade', () => {
  const simple = analyzeText('The cat sat. The dog ran. We had fun. It was good.')
  const complex = analyzeText(
    'Notwithstanding the considerable methodological complications inherent in longitudinal investigations, '
    + 'researchers frequently encounter substantial difficulties when attempting to operationalise '
    + 'psychometric constructs whose theoretical underpinnings remain conceptually contested.',
  )
  assert.equal(simple.script, 'latin')
  assert.equal(typeof simple.fleschKincaidGrade, 'number')
  assert.ok(complex.fleschKincaidGrade > simple.fleschKincaidGrade, 'denser prose must grade harder')
  assert.equal(bandOfGrade(simple.fleschKincaidGrade).band, 'k3-5')
})

test('cjk text is not dressed up as FKG', () => {
  const analysis = analyzeText('你运球时手掌压向篮球，篮球在同一个瞬间顶回你的手掌。这两个力分别作用在两个不同的物体上。')
  assert.equal(analysis.script, 'cjk')
  assert.equal(analysis.fleschKincaidGrade, null)
  assert.equal(analysis.fleschReadingEase, null)
  assert.ok(typeof analysis.avgSentenceLength === 'number')
  assert.ok(analysis.note && analysis.note.includes('FKG'))
})

test('grade comparison reports within, close and off', () => {
  const easy = analyzeText('The cat sat on the mat. The dog ran to the park. We had fun today.')
  const within = compareToGrade(easy, easy.fleschKincaidGrade, 1)
  assert.equal(within.verdict, 'within')
  const off = compareToGrade(easy, (easy.fleschKincaidGrade ?? 0) + 6, 1)
  assert.equal(off.verdict, 'off')
  const unmeasurable = compareToGrade(analyzeText('这是一段中文。'), 8, 1)
  assert.equal(unmeasurable.verdict, 'unmeasurable')
})

test('coverage compares the same script on both sides', () => {
  const source = 'Newton third law force pair equal opposite two objects'
  assert.equal(coverage(source, source).ratio, 1)
  const partial = coverage(source, 'Newton third law force pair')
  assert.ok(partial.ratio > 0.3 && partial.ratio < 1)
  assert.equal(coverage('', 'anything').ratio, null)
  const chinese = coverage('作用力与反作用力大小相等方向相反', '作用力与反作用力大小相等')
  assert.ok(chinese.ratio > 0.3)
  assert.equal(chinese.method, 'han-bigrams')
})
