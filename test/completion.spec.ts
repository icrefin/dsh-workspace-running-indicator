/**
 * The completion reminder policy, exercised directly.
 *
 * These cases pin the rules the shipped `dsh-client-ui-session` status projection
 * applies, because a reminder that disagrees with a Session row's own green dot is
 * worse than no reminder at all. The DOM-level consequences are covered in
 * `badge.spec.ts`; here the tracker runs on its own.
 *
 * @module dsh-workspace-running-indicator/test/completion
 */

import { describe, expect, it } from 'vitest'
import { createCompletionTracker } from '../src/client/completion.ts'
import type { SessionsSnapshotLike } from '../src/client/contract.ts'

/** One catalog row, with the retention the policy reads. */
interface Row {
  readonly id: string
  readonly running: boolean
  readonly mainView?: number
}

/**
 * Build a catalog snapshot.
 * @param phase - list phase; `ready` means the catalog is authoritative.
 * @param rows - the rows.
 * @returns the snapshot.
 */
function snapshot(phase: 'pending' | 'ready', ...rows: Row[]): SessionsSnapshotLike {
  const byId: Record<string, { id: string; running: boolean; retainedBy: { mainView: number } }> = {}
  for (const row of rows) byId[row.id] = { id: row.id, running: row.running, retainedBy: { mainView: row.mainView ?? 0 } }
  return { ids: rows.map((row) => row.id), byId, phase, projectionsBySession: {} }
}

/** No archived sessions. */
const none = new Set<string>()

describe('completion reminders', () => {
  it('seeds a first sighting without inventing a reminder', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), none)
    expect([...tracker.unread()]).toEqual([])
  })

  it('marks a run that ends while the Session is not on screen', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: true }), none)
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), none)
    expect([...tracker.unread()]).toEqual(['s-1'])
  })

  it('does not mark a run that ends while the Session is on screen', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: true, mainView: 1 }), none)
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false, mainView: 1 }), none)
    expect([...tracker.unread()]).toEqual([])
  })

  it('clears the reminder when the Session is opened afterwards', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: true }), none)
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), none)
    expect(tracker.unread().has('s-1')).toBe(true)

    tracker.reconcile(snapshot('ready', { id: 's-1', running: false, mainView: 2 }), none)
    expect(tracker.unread().has('s-1')).toBe(false)
  })

  it('lets a fresh run supersede the reminder', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: true }), none)
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), none)
    expect(tracker.unread().has('s-1')).toBe(true)

    tracker.reconcile(snapshot('ready', { id: 's-1', running: true }), none)
    expect(tracker.unread().has('s-1')).toBe(false)
  })

  it('drops a reminder whose Session is archived', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: true }), none)
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), none)
    expect(tracker.unread().has('s-1')).toBe(true)

    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), new Set(['s-1']))
    expect(tracker.unread().has('s-1')).toBe(false)
  })

  it('keeps reminders while the catalog is merely pending', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready', { id: 's-1', running: true }), none)
    tracker.reconcile(snapshot('ready', { id: 's-1', running: false }), none)

    // A reconnect's first page is not authoritative: nothing is forgotten yet.
    tracker.reconcile(snapshot('pending'), none)
    expect(tracker.unread().has('s-1')).toBe(true)

    // Once the catalog is ready again without the row, the Session is gone.
    tracker.reconcile(snapshot('ready'), none)
    expect(tracker.unread().has('s-1')).toBe(false)
  })

  it('seeds a Session first seen idle instead of marking it', () => {
    const tracker = createCompletionTracker()
    tracker.reconcile(snapshot('ready'), none)
    tracker.reconcile(snapshot('ready', { id: 's-9', running: false }), none)
    expect(tracker.unread().has('s-9')).toBe(false)
  })
})
