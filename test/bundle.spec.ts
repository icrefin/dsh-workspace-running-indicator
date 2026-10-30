/**
 * The built client bundle's loader contract.
 *
 * @module dsh-workspace-running-indicator/test/bundle
 */

import { describe, expect, it } from 'vitest'
import { built, loadClientBundle } from './loader.ts'

const packageName = 'dsh-workspace-running-indicator'

describe.skipIf(!built)('built client bundle', () => {
  it('registers under its package name — the boot graph row id', () => {
    expect(loadClientBundle().id).toBe(packageName)
  })

  it('exports the client plugin face the harness mounts', () => {
    const { exports } = loadClientBundle()
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(['sessions', 'workspaces', 'uiSession'])
  })

  it('requests no module: the browser half has no runtime dependencies', () => {
    // `loadClientBundle`'s fake `require` throws on any request, so reaching the
    // factory's exports at all proves the bundle needs nothing from the page.
    expect(() => loadClientBundle()).not.toThrow()
  })
})
