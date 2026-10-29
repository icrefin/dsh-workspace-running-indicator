/**
 * Load the *built* client bundle the way the web client's module system does:
 * execute the file behind a fake `window.__ModuleLoader__` and take the exports
 * its factory returns. This is the only check that catches a broken loader
 * banner; a wrong `id` fails the live page with `loaded without registering <id>`.
 *
 * The specs that use it skip with a visible note when `lib/client.js` has not been
 * built yet. `pnpm check` builds before it tests, so a normal run exercises the
 * artifact.
 *
 * @module dsh-workspace-running-indicator/test/loader
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Absolute path of the artifact under test. */
export const bundlePath = resolve(process.cwd(), 'lib/client.js')

/** Whether the build artifact exists. */
export const built = existsSync(bundlePath)

/** The plugin face the harness mounts from `exports["./client"]`. */
export interface ClientBundleExports {
  apply: (ctx: unknown) => void
  inject?: readonly string[]
  install?: (ctx: unknown) => () => void
  [key: string]: unknown
}

/** One loader entry, captured from the fake module table. */
interface LoaderEntry {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/** The loader surface the bundle calls at materialization. */
interface LoaderGlobal {
  __ModuleLoader__?: { load: (entry: LoaderEntry) => void }
}

/**
 * Execute the bundle and materialize its exports.
 * @returns the boot-graph id it registered under and the module exports.
 */
export function loadClientBundle(): { id: string; exports: ClientBundleExports } {
  let entry: LoaderEntry | undefined
  const globals = globalThis as unknown as { window?: LoaderGlobal }
  const standIn = globals.window === undefined
  if (standIn) globals.window = {}
  const host = globals.window as LoaderGlobal
  const previous = host.__ModuleLoader__
  host.__ModuleLoader__ = {
    load: (candidate) => {
      entry = candidate
    },
  }
  try {
    // Executing the emitted bundle is the point of this helper.
    new Function(readFileSync(bundlePath, 'utf8'))()
    if (entry === undefined) throw new Error('the bundle did not call window.__ModuleLoader__.load')
    const captured = entry
    const exports = captured.factory((specifier) => {
      throw new Error(`the bundle requested unexpected module "${specifier}"`)
    })
    return { id: captured.id, exports: exports as ClientBundleExports }
  } finally {
    if (previous === undefined) delete host.__ModuleLoader__
    else host.__ModuleLoader__ = previous
    if (standIn) delete globals.window
  }
}

/** A snapshot store face with the subscribe/getSnapshot pair the plugin reads. */
export interface FakeStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  set(next: T): void
  readonly listeners: number
}

/**
 * Build a minimal snapshot store, matching `dsh-client-store`'s read face.
 * @param initial - first snapshot.
 * @returns the store.
 */
export function fakeStore<T>(initial: T): FakeStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next) => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    get listeners() {
      return listeners.size
    },
  }
}
