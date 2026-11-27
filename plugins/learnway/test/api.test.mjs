import assert from 'node:assert/strict'
import test from 'node:test'

import { API_PREFIX, createApiRoutes } from '../src/host/api.js'

/** A service stub: every handler below must survive a call. */
function stubService() {
  return {
    health: async () => ({ ok: true, lessons: 2 }),
    list: async () => [{ id: 'a', title: 'A' }],
    get: async (id) => (String(id) === 'a' ? { id: 'a', lesson: { title: 'A' } } : null),
    grade: async (id) => (String(id) === 'a' ? { score: 50, total: 2 } : null),
    getProgress: async (id) => (String(id) === 'a' ? { id: 'a', attempts: [], items: {}, summary: { attemptCount: 0 } } : null),
    saveReflection: async (id, index, text) => (String(id) === 'a' ? { id: 'a', items: { [index]: { reflection: text } } } : null),
    evaluateReflection: async (id, index, text) => (String(id) === 'a' ? { id: 'a', items: { [index]: { reflection: text } }, evaluation: { verdict: 'solid', praise: '好' } } : null),
    generateVariantQuestion: async (id) => (String(id) === 'a' ? { ok: true, question: { stem: '新题', choices: ['A', 'B'], answerIndex: 0 } } : null),
    reexplainBlock: async (id) => (String(id) === 'a' ? { ok: true, explanation: '更通俗的讲法' } : null),
    getProfile: async () => ({ grade: 8, interests: ['篮球'], style: 'analogy', misconceptions: [] }),
    updateProfile: async (patch) => ({ grade: patch.grade ?? 8, interests: patch.interests ?? ['篮球'], style: 'analogy', misconceptions: [] }),
    evaluateAudioReply: async (id) => (String(id) === 'a' ? { ok: true, verdict: 'aligned', advance: true, teacherReply: '好！' } : null),
    reviewQueue: async () => ({ totalDue: 1, byQuadrant: { misconception: 1, gap: 0, fragile: 0, mastered: 0 }, items: [] }),
    remove: async (id) => String(id) === 'a',
    recordPing: (info) => ({ at: 'now', phase: info?.phase ?? '' }),
    exportDeck: async () => null,
    exportDir: () => '/tmp',
  }
}

test('routes register under the full /api/learnway prefix', () => {
  const routes = createApiRoutes(stubService(), { log: () => {} })
  assert.ok(routes.length >= 6)
  const seenPaths = new Set()
  for (const route of routes) {
    // dsh-client-connection validates exact Fetch routes under `/api/*` and
    // dispatches by the full `new URL(request.url).pathname`.
    assert.ok(route.path.startsWith(`${API_PREFIX}/`), `${route.path} must start with ${API_PREFIX}/`)
    assert.ok(!seenPaths.has(route.path), `${route.path} must not be registered twice`)
    seenPaths.add(route.path)
    assert.ok(route.methods.length > 0)
    assert.equal(new Set(route.methods).size, route.methods.length, `${route.path} must not repeat methods`)
    assert.ok(['GET', 'HEAD', 'POST'].includes(route.methods[0]))
    assert.ok(['buffered', 'streaming'].includes(route.requestBody))
    assert.equal(typeof route.fetch, 'function')
  }
})

test('GET handlers answer JSON without a body', async () => {
  const routes = createApiRoutes(stubService(), { log: () => {} })
  const health = routes.find((route) => route.path === `${API_PREFIX}/health`)
  const response = await health.fetch(new Request('http://x/api/learnway/health'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await response.json(), { ok: true, lessons: 2 })

  const lesson = routes.find((route) => route.path === `${API_PREFIX}/lesson`)
  const response2 = await lesson.fetch(new Request('http://x/api/learnway/lesson?id=a'))
  assert.equal((await response2.json()).lesson.title, 'A')
  const missing = await lesson.fetch(new Request('http://x/api/learnway/lesson?id=zzz'))
  assert.equal(missing.status, 404)
})

test('POST handlers parse JSON bodies and reject bad input', async () => {
  const routes = createApiRoutes(stubService(), { log: () => {} })
  const ping = routes.find((route) => route.path === `${API_PREFIX}/ping` && route.methods.includes('POST'))
  const response = await ping.fetch(new Request('http://x/api/learnway/ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phase: 'factory-entered' }),
  }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).ok, true)

  const grade = routes.find((route) => route.path === `${API_PREFIX}/grade`)
  const bad = await grade.fetch(new Request('http://x/api/learnway/grade', { method: 'POST', body: 'not json' }))
  assert.equal(bad.status, 500)
  assert.equal((await bad.json()).ok, false)

  const progress = routes.find((route) => route.path === `${API_PREFIX}/progress`)
  const progOk = await progress.fetch(new Request('http://x/api/learnway/progress?id=a'))
  assert.equal(progOk.status, 200)
  assert.equal((await progOk.json()).ok, true)

  const queue = routes.find((route) => route.path === `${API_PREFIX}/review-queue`)
  const queueOk = await queue.fetch(new Request('http://x/api/learnway/review-queue'))
  assert.equal(queueOk.status, 200)
  assert.equal((await queueOk.json()).totalDue, 1)

  const reflect = routes.find((route) => route.path === `${API_PREFIX}/reflect`)
  const refOk = await reflect.fetch(new Request('http://x/api/learnway/reflect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'a', index: 0, text: '因为异体' }),
  }))
  assert.equal(refOk.status, 200)
  assert.equal((await refOk.json()).items['0'].reflection, '因为异体')

  const audioReply = routes.find((route) => route.path === `${API_PREFIX}/audio-reply`)
  const audioOk = await audioReply.fetch(new Request('http://x/api/learnway/audio-reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'a', turnIndex: 0, answer: '相等' }),
  }))
  assert.equal(audioOk.status, 200)
  assert.equal((await audioOk.json()).advance, true)

  const profileRoute = routes.find((route) => route.path === `${API_PREFIX}/profile`)
  assert.equal((await (await profileRoute.fetch(new Request('http://x/api/learnway/profile'))).json()).profile.grade, 8)
  const profPost = await profileRoute.fetch(new Request('http://x/api/learnway/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grade: 10 }),
  }))
  assert.equal((await profPost.json()).profile.grade, 10)

  const variantRoute = routes.find((route) => route.path === `${API_PREFIX}/variant`)
  const varOk = await variantRoute.fetch(new Request('http://x/api/learnway/variant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'a', index: 0 }),
  }))
  assert.equal((await varOk.json()).question.stem, '新题')

  const reexRoute = routes.find((route) => route.path === `${API_PREFIX}/reexplain`)
  const reexOk = await reexRoute.fetch(new Request('http://x/api/learnway/reexplain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'a', text: '测试', mode: 'analogy' }),
  }))
  assert.equal((await reexOk.json()).explanation, '更通俗的讲法')
})

test('the export download route refuses anything outside the fixed table', async () => {
  const routes = createApiRoutes(stubService(), { log: () => {} })
  const download = routes.find((route) => route.path === `${API_PREFIX}/export` && route.methods.includes('GET'))
  const traversal = await download.fetch(new Request('http://x/api/learnway/export?id=../../etc&file=../../../etc/passwd'))
  assert.equal(traversal.status, 400)
  const unknown = await download.fetch(new Request('http://x/api/learnway/export?id=a&file=index.js'))
  assert.equal(unknown.status, 400)
})
