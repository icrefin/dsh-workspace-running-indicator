// @vitest-environment jsdom
/**
 * The stylesheet installer.
 *
 * The badge's motion lives entirely in CSS, so the tag has to exist exactly once
 * and has to be removable: the client module system evicts a tag created from the
 * bundle's factory body when the plugin is disabled.
 *
 * @module dsh-workspace-running-indicator/test/styles
 */

import { describe, expect, it } from 'vitest'
import { BADGE_ATTRIBUTE, DOT_ATTRIBUTE, STATE_ATTRIBUTE, WORKSPACE_ROW, installStyles } from '../src/client/styles.ts'

/**
 * Find this plugin's style tag.
 * @returns the tag, or null.
 */
function styleTag(): HTMLStyleElement | null {
  return document.querySelector('style[data-plugin="dsh-workspace-running-indicator"]')
}

describe('badge styles', () => {
  it('keys the row by ARIA and the row key, never a hashed class', () => {
    expect(WORKSPACE_ROW).toBe('[role="treeitem"][data-row-key^="workspace:"]')
    expect(STATE_ATTRIBUTE).toBe('data-dsh-wsr-state')
    expect(BADGE_ATTRIBUTE).toBe('data-dsh-wsr-badge')
    expect(DOT_ATTRIBUTE).toBe('data-dsh-wsr-dot')
  })

  it('installs one tag and leaves it alone on a second call', () => {
    document.querySelectorAll('style[data-plugin="dsh-workspace-running-indicator"]').forEach((tag) => tag.remove())
    const removeFirst = installStyles()
    const removeSecond = installStyles()
    expect(document.querySelectorAll('style[data-plugin="dsh-workspace-running-indicator"]')).toHaveLength(1)
    removeSecond()
    expect(styleTag()).not.toBeNull()
    removeFirst()
    expect(styleTag()).toBeNull()
  })

  it('declares the overlay, the hidden glyph and the shipped spinner timing', () => {
    document.querySelectorAll('style[data-plugin="dsh-workspace-running-indicator"]').forEach((tag) => tag.remove())
    const dispose = installStyles()
    const css = styleTag()?.textContent ?? ''
    expect(css).toContain('[data-dsh-wsr-badge],[data-dsh-wsr-dot]{position:absolute')
    expect(css).toContain('[data-dsh-wsr-state]>span:first-child>svg{opacity:0}')
    expect(css).toContain('dsh-wsr-spin 1.5s linear infinite')
    expect(css).toContain('dsh-wsr-dash 1.5s ease-in-out infinite')
    expect(css).toContain('prefers-reduced-motion:reduce')
    // Tokens only: a literal colour would break dark mode.
    expect(css).toContain('var(--dsw-alias-label-tertiary)')
    // The completion dot keeps the shipped success token, like a finished row.
    expect(css).toContain('background:var(--dsw-alias-state-success-primary)')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    dispose()
  })

  it('does nothing outside a document', () => {
    expect(() => installStyles(undefined)).not.toThrow()
  })
})
