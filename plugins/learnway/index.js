/**
 * Host half of Learn Your Way.
 *
 * Contributions, all reversible Cordis effects owned by this plugin's fiber:
 * - authenticated routes under `/api/learnway/*` for the browser panel;
 * - five agent tools that implement the paper's pipeline (measure → save →
 *   read → grade);
 * - the browser half in `client.js` renders the 教材改造台 page.
 *
 * The plugin stays usable headless: without the connection service the tools
 * still work, and without the tools service the panel still works.
 *
 * @module @local/dsh-learnway
 */

import { createLearnwayService } from './src/host/service.js'
import { createApiRoutes } from './src/host/api.js'
import { registerLearnwayTools } from './src/host/tools.js'

/** Plugin id; also the browser module id in client.js. */
export const PLUGIN_ID = '@local/dsh-learnway'
/** Reported by the health route and the panel footer. */
export const VERSION = '0.1.0'
/** Service composition happens through `ctx.inject`, so nothing is required. */
export const inject = []

/**
 * Register the plugin.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config] - row config from the bundle patch.
 */
export function apply(ctx, config = {}) {
  const log = (message) => console.warn(`[learnway] ${message}`)
  let injectedLlm
  let injectedDefaultModel
  const safeGet = (name) => {
    try {
      return typeof ctx.get === 'function' ? ctx.get(name) : undefined
    } catch {
      return undefined
    }
  }
  ctx.inject(['llm'], (llmCtx) => {
    injectedLlm = llmCtx.llm
    return () => { injectedLlm = undefined }
  })
  ctx.inject(['agentDefaultModel'], (modelCtx) => {
    injectedDefaultModel = modelCtx.agentDefaultModel
    return () => { injectedDefaultModel = undefined }
  })
  const service = createLearnwayService({
    config,
    log,
    llmOf: () => injectedLlm ?? safeGet('llm'),
    defaultModelOf: () => injectedDefaultModel ?? safeGet('agentDefaultModel'),
  })

  // Warm the store once so the first panel request is not the first disk read.
  ctx.effect(() => {
    void service.ready()
      .then(() => service.health())
      .then(
        (health) => log(`ready · ${health.lessons} 课时 · 数据目录 ${health.dataDir}`),
        (error) => log(`startup failed: ${error?.message ?? error}`),
      )
    return () => {
      // Lessons are plain files; no process resources outlive the plugin.
    }
  }, 'learnway: startup')

  // Authenticated HTTP API for the panel — optional, so the plugin works headless.
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection
    if (typeof connection?.fetch?.register !== 'function') {
      log('connection.fetch 不可用；面板将无法读取课时')
      return
    }
    for (const route of createApiRoutes(service, { log })) {
      connectionCtx.effect(() => connection.fetch.register(route), `learnway: ${route.path}`)
    }
  })

  // Agent tools — only where the tools service is composed.
  ctx.inject(['tools'], (toolCtx) => {
    // The client-module service answers "is my browser bundle in the page?"; it
    // is optional, and read lazily so activation order never matters.
    const clientModulesOf = () => {
      try {
        return typeof ctx.get === 'function' ? ctx.get('clientModules') : undefined
      } catch {
        return undefined
      }
    }
    toolCtx.effect(
      () => registerLearnwayTools(toolCtx, service, { clientModulesOf }),
      'learnway: agent tools',
    )
  })
}
