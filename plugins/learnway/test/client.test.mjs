import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

/** Minimal React: the client module only builds elements and calls hooks. */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

/** Load client.js with a stubbed module loader and return the captured module. */
async function loadClientModule() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const sandbox = {
    window: { __ModuleLoader__: { load: (definition) => { sandbox.__module = definition } } },
    navigator: { language: 'zh-CN' },
    document: { baseURI: 'http://127.0.0.1:0/' },
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async () => ({ text: async () => '{}', ok: true, status: 200 }),
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return sandbox.__module
}

test('client module registers the page and the sidebar entry', async () => {
  const definition = await loadClientModule()
  assert.equal(definition.id, '@local/dsh-learnway')

  const module = definition.factory((specifier) => {
    assert.equal(specifier, 'react')
    return React
  })
  // Spread first: the module's arrays come from the VM realm, so their
  // prototype differs from this realm's Array.prototype.
  assert.deepEqual([...module.inject], ['slots'])

  const injected = []
  const registered = []
  const ctx = {
    slots: {
      inject: (owner, install) => {
        injected.push(owner)
        return install()
      },
      register: (options, Component) => {
        registered.push({ options, Component })
        return () => {}
      },
    },
  }
  module.apply(ctx)

  assert.deepEqual([...injected].sort(), ['main', 'sidebar.panellist'])
  const main = registered.find((entry) => entry.options.name === 'main')
  const sidebar = registered.find((entry) => entry.options.name === 'sidebar.panellist')
  assert.ok(main, 'main panel registered')
  assert.equal(main.options.key, 'learnway')
  assert.equal(typeof main.Component, 'function')
  assert.ok(sidebar, 'sidebar entry registered')
  assert.equal(sidebar.options.id, 'learnway', 'the sidebar id must equal the main panel key')
  assert.equal(typeof sidebar.Component, 'function')
  // A thunk label follows the active locale without re-registering.
  assert.equal(typeof sidebar.options.label, 'function')
  assert.equal(sidebar.options.label(), '教材改造台')
})

test('a missing slots service does not throw', async () => {
  const definition = await loadClientModule()
  const module = definition.factory(() => React)
  assert.doesNotThrow(() => module.apply({}))
  assert.doesNotThrow(() => module.apply({ slots: {} }))
})

test('every referenced style and locale key exists', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const defined = new Set([...source.matchAll(/^\s{6}([A-Za-z][A-Za-z0-9]*): \{/gmu)].map((match) => match[1]))
  const used = new Set([...source.matchAll(/styles\.([A-Za-z][A-Za-z0-9]*)/gu)].map((match) => match[1]))
  const missing = [...used].filter((key) => !defined.has(key))
  assert.deepEqual([...missing].sort(), [], 'a styles.<key> reference without a definition renders undefined')

  const [beforeEn, rest] = source.split('      en: {')
  const [enBlock] = rest.split('    }\n\n    /** Translate')
  const keysOf = (block) => new Set([...block.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9]*):/gmu)].map((match) => match[1]))
  const zh = keysOf(beforeEn)
  const en = keysOf(enBlock)
  const usedKeys = new Set([...source.matchAll(/\bt\('([A-Za-z][A-Za-z0-9]*)'/gu)].map((match) => match[1]))
  assert.deepEqual([...usedKeys].filter((key) => !zh.has(key)).sort(), [], 'missing zh string')
  assert.deepEqual([...usedKeys].filter((key) => !en.has(key)).sort(), [], 'missing en string')
  assert.deepEqual([...zh].filter((key) => !en.has(key)).sort(), [], 'zh/en dictionaries must be symmetric')
})
