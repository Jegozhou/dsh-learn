/**
 * Filesystem layout for the Learn Your Way plugin.
 *
 * Everything the plugin writes lives under one data directory
 * (`$DSH_HOME/learnway` by default): the saved lesson records. Nothing is
 * written outside it, and a profile without `DSH_HOME` falls back to `~/.dsh`.
 *
 * @module host/paths
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

/** Root data directory for this plugin. */
export function defaultDataDir() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'learnway')
}

/**
 * Resolve the directory layout for a configuration.
 *
 * @param {{dataDir?: string}} [config]
 * @returns {{dataDir: string, lessonsDir: string, exportsDir: string}}
 */
export function resolvePaths(config = {}) {
  const dataDir = resolve(config.dataDir ?? defaultDataDir())
  return {
    dataDir,
    lessonsDir: join(dataDir, 'lessons'),
    exportsDir: join(dataDir, 'exports'),
    progressDir: join(dataDir, 'progress'),
  }
}

/**
 * Create every directory the plugin needs.
 *
 * @param {ReturnType<typeof resolvePaths>} paths
 * @returns {Promise<ReturnType<typeof resolvePaths>>}
 */
export async function ensurePaths(paths) {
  await Promise.all(Object.values(paths).map((dir) => mkdir(dir, { recursive: true })))
  return paths
}
