/**
 * dsh-workspace-running-indicator — browser half.
 *
 * Folding a Workspace in the sidebar hides every Session row inside it, so the
 * shipped browser draws the same folder glyph for a workspace where three turns
 * are running and one where nothing has happened for a week. The Session row's
 * own ongoing loader is still rendered inside a folded group — there is simply no
 * row left to show it on.
 *
 * This bundle does not replace the browser, and it does not add a seat: the
 * workspace header has none. It watches the two snapshots the client already
 * holds, derives which Workspaces are busy (`busy.ts`), and paints the shipped
 * spinner into the header's icon cell of every **folded, busy** row
 * (`rows.ts` + `styles.ts`).
 *
 * Why the catalog is the right source: `ctx.sessions.list` carries the Host's
 * live run state per Session (`running`), updated on every status change, which
 * is exactly the fallback `ui-workspace` itself applies for a row whose live
 * status has not been loaded yet.
 *
 * Two behaviour notes worth stating out loud:
 * - an **expanded** Workspace keeps its folder glyph; its Session rows already
 *   show their own loaders, and the header is not carrying information there;
 * - a row speaks only for **its own** accounted Sessions. A nested Workspace that
 *   runs does not light its parent: the parent's Sessions are what its title
 *   claims, and the nested row is the one that owns that activity.
 *
 * The badge is decorative (`aria-hidden`), matches the shipped loader's colour
 * token, and is hidden together with the folder cell by the shipped hover rule
 * that reveals the disclosure chevron.
 *
 * An external plugin must never take the web shell down: `apply` is wrapped, and
 * every read of a foreign snapshot is guarded in `busy.ts` / here.
 *
 * @module dsh-workspace-running-indicator/client
 */

import { busyWorkspaceIds } from './busy.ts'
import type { SessionsSnapshotLike, SnapshotSource, WorkspacesSnapshotLike } from './contract.ts'
import { clearRow, syncRows } from './rows.ts'
import { WORKSPACE_ROW, installStyles } from './styles.ts'

/** Services this bundle waits for: the two client-side state projections. */
export const inject = ['sessions', 'workspaces']

/** The read face of the two services this plugin consumes. */
export interface ClientStateServices {
  readonly sessions: { readonly list: SnapshotSource<SessionsSnapshotLike> }
  readonly workspaces: { readonly list: SnapshotSource<WorkspacesSnapshotLike> }
}

/** Structural face of the client root context this plugin uses. */
export interface ClientContext extends ClientStateServices {
  effect(callback: () => (() => void) | void, label?: string): void
}

/** Attributes whose change re-derives the fold state of a row. */
const OBSERVED_ATTRIBUTES = ['aria-expanded', 'data-row-key', 'role']

/**
 * Subscribe to a projection, tolerating a store that cannot.
 *
 * A listener throw propagates into the model's own flush loop, so the callback is
 * wrapped rather than trusted: a stale badge is a cosmetic bug, a broken
 * subscription loop is not.
 *
 * @param source - the store face to subscribe to.
 * @param listener - invalidation callback.
 * @returns the unsubscribe callback, or a no-op.
 */
function subscribe(source: SnapshotSource<unknown> | undefined, listener: () => void): () => void {
  if (source === undefined || typeof source.subscribe !== 'function') return () => {}
  try {
    const stop = source.subscribe(() => {
      try {
        listener()
      } catch (error) {
        console.warn('[dsh-workspace-running-indicator] an update could not be applied', error)
      }
    })
    return typeof stop === 'function' ? stop : () => {}
  } catch (error) {
    console.warn('[dsh-workspace-running-indicator] a projection could not be watched', error)
    return () => {}
  }
}

/**
 * Read both snapshots and derive the busy set.
 *
 * @param ctx - client context carrying the two projections.
 * @returns busy Workspace ids; empty when either read fails.
 */
function readBusy(ctx: ClientStateServices): Set<string> {
  try {
    const sessions = ctx.sessions?.list?.getSnapshot()
    const workspaces = ctx.workspaces?.list?.getSnapshot()
    if (sessions === undefined || workspaces === undefined) return new Set()
    return busyWorkspaceIds(sessions, workspaces)
  } catch (error) {
    console.warn('[dsh-workspace-running-indicator] the busy set could not be derived', error)
    return new Set()
  }
}

/**
 * Install the badge for the lifetime of the plugin.
 *
 * The observer makes the paint follow the shipped browser: folding, expanding, a
 * new Workspace, a re-mounted list, or the sidebar opening after boot all arrive
 * as mutations. Rows are reconciled in one pass per animation frame's worth of
 * work (a microtask), and reconciliation is idempotent, so the plugin's own writes
 * settle after at most one extra pass.
 *
 * @param ctx - client root context.
 * @returns the disposer that removes every badge and listener.
 */
function install(ctx: ClientStateServices): () => void {
  const target = globalThis.document
  if (target === undefined) return () => {}
  const scope: HTMLElement | null = target.body ?? target.documentElement
  if (scope === null) return () => {}

  let busy = new Set<string>()
  let disposed = false
  let scheduled = false

  const paint = (): void => {
    if (disposed) return
    // The browser's list is a `role="tree"`; reconciling those subtrees instead of
    // the whole document keeps the pass off the conversation, which mutates on
    // every streamed token. An empty result falls back to the scope so a layout
    // this plugin has not anticipated is still decorated.
    const trees = scope.querySelectorAll('[role="tree"]')
    if (trees.length === 0) {
      syncRows(scope, busy, target)
      return
    }
    for (const tree of trees) syncRows(tree, busy, target)
  }
  const schedule = (): void => {
    if (disposed || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      paint()
    })
  }
  const refresh = (): void => {
    if (disposed) return
    busy = readBusy(ctx)
    paint()
  }

  const stopSessions = subscribe(ctx.sessions?.list, refresh)
  const stopWorkspaces = subscribe(ctx.workspaces?.list, refresh)

  let observer: MutationObserver | undefined
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(schedule)
    observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: OBSERVED_ATTRIBUTES })
  }

  refresh()

  return () => {
    disposed = true
    stopSessions()
    stopWorkspaces()
    observer?.disconnect()
    for (const row of scope.querySelectorAll(WORKSPACE_ROW)) clearRow(row)
  }
}

/**
 * Mount the badge.
 *
 * A throw here fails the whole web boot, so the mount is guarded: the sidebar is
 * the shipped shell's business first and this decoration's second.
 *
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.effect(() => installStyles(), 'dsh-workspace-running-indicator: badge styles')
    ctx.effect(() => install(ctx), 'dsh-workspace-running-indicator: folded workspace badge')
  } catch (error) {
    console.warn('[dsh-workspace-running-indicator] the badge could not be installed', error)
  }
}

// Materialization runs this: the client module system claims a style tag created
// from the bundle's factory body and removes it again when the plugin unloads.
installStyles()