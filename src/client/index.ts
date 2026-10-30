/**
 * dsh-workspace-running-indicator — browser half.
 *
 * Folding a Workspace in the sidebar hides every Session row inside it, so the
 * shipped browser draws the same folder glyph for a workspace where a Session is
 * waiting for an answer, one where three turns are running, one where a turn just
 * finished unviewed, and one where nothing has happened for a week. All three
 * marks — the yellow waiting dot, the ongoing loader and the green done dot — are
 * still rendered inside a folded group; there is simply no row left to show them
 * on.
 *
 * This bundle does not replace the browser, and it does not add a seat: the
 * workspace header has none. It watches the snapshots the client already holds,
 * derives what each Workspace has to report (`activity.ts`, with the completion
 * reminder mirrored from the shipped policy in `completion.ts`), and paints the
 * matching mark into the header's icon cell of every **folded** row that has one
 * (`rows.ts` + `styles.ts`).
 *
 * Why the catalog is the right source: `ctx.sessions.list` carries the Host's
 * live run state per Session (`running`), updated on every status change, which
 * is exactly the fallback `ui-workspace` itself applies for a row whose live
 * status has not been loaded yet — and transitions in that field are what the
 * shipped completion policy reads too. The waiting mark is read from
 * `ctx.uiSession.sessionStatus`, the unified projection the shipped row itself
 * consults, so the yellow dot stands for the same pending interaction it does on
 * a Session row.
 *
 * Four behaviour notes worth stating out loud:
 * - an **expanded** Workspace keeps its folder glyph; its Session rows already
 *   show their own marks, and the header is not carrying information there;
 * - a row speaks only for **its own** accounted Sessions. A nested Workspace that
 *   runs does not light its parent: the parent's Sessions are what its title
 *   claims, and the nested row is the one that owns that activity;
 * - a waiting Session outranks a running one, and work in progress outranks a
 *   completion reminder — the shipped row order is pending, ongoing, done, so a
 *   folded Workspace shows the mark its most urgent Session row would;
 * - a direct subagent's pending interaction does not reach its parent, mirroring
 *   the shipped row, which adopts a running child's loader but never its pending
 *   mark.
 *
 * The marks are decorative (`aria-hidden`), match the shipped tokens, and are
 * hidden together with the folder cell by the shipped hover rule that reveals the
 * disclosure chevron.
 *
 * An external plugin must never take the web shell down: `apply` is wrapped, and
 * every read of a foreign snapshot is guarded here.
 *
 * @module dsh-workspace-running-indicator/client
 */

import { activeSessionIds, waitingSessionIds, workspaceStates, type WorkspaceState } from './activity.ts'
import { createCompletionTracker, type CompletionTracker } from './completion.ts'
import type {
  SessionStatusSnapshotLike,
  SessionsSnapshotLike,
  SnapshotSource,
  WorkspacesSnapshotLike,
} from './contract.ts'
import { clearRow, syncRows } from './rows.ts'
import { WORKSPACE_ROW, installStyles } from './styles.ts'

/** Services this bundle waits for: the client-side state projections. */
export const inject = ['sessions', 'workspaces', 'uiSession']

/** The read face of the services this plugin consumes. */
export interface ClientStateServices {
  readonly sessions: { readonly list: SnapshotSource<SessionsSnapshotLike> }
  readonly workspaces: { readonly list: SnapshotSource<WorkspacesSnapshotLike> }
  /**
   * `dsh-client-ui-session`'s unified status projection.
   *
   * The fiber declares this service — that declaration is what makes
   * `ctx.uiSession` readable through the guarded facade — and the read is still
   * written as an optional chain, so an absent or partially shaped service costs
   * only the waiting dot instead of throwing.
   */
  readonly uiSession?: {
    readonly sessionStatus?: SnapshotSource<SessionStatusSnapshotLike> | undefined
  } | undefined
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
 * Read the snapshots, fold the catalog into the completion tracker, and derive
 * what every Workspace has to report.
 *
 * The status projection is read separately: if it is absent or throws, the
 * loader and the done dot still work and only the waiting dot is lost.
 *
 * @param ctx - client context carrying the projections.
 * @param tracker - the completion projection to advance; one per mount.
 * @returns Workspace id → state; empty when a required read fails.
 */
function readStates(ctx: ClientStateServices, tracker: CompletionTracker): Map<string, WorkspaceState> {
  try {
    const sessions = ctx.sessions?.list?.getSnapshot()
    const workspaces = ctx.workspaces?.list?.getSnapshot()
    if (sessions === undefined || workspaces === undefined) return new Map()
    const archived = new Set(workspaces.archivedSessionIds ?? [])
    tracker.reconcile(sessions, archived)
    const waiting = waitingSessionIds(readStatuses(ctx), archived)
    return workspaceStates(workspaces, activeSessionIds(sessions, archived), tracker.unread(), waiting)
  } catch (error) {
    console.warn('[dsh-workspace-running-indicator] the Workspace states could not be derived', error)
    return new Map()
  }
}

/**
 * Read the unified Session status projection, degrading to "no signal".
 *
 * @param ctx - client context.
 * @returns the projection snapshot, or undefined when the shell has none.
 */
function readStatuses(ctx: ClientStateServices): SessionStatusSnapshotLike | undefined {
  try {
    return ctx.uiSession?.sessionStatus?.getSnapshot()
  } catch (error) {
    console.warn('[dsh-workspace-running-indicator] the Session statuses could not be read', error)
    return undefined
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
 * @returns the disposer that removes every overlay and listener.
 */
function install(ctx: ClientStateServices): () => void {
  const target = globalThis.document
  if (target === undefined) return () => {}
  const scope: HTMLElement | null = target.body ?? target.documentElement
  if (scope === null) return () => {}

  const tracker = createCompletionTracker()
  let states = new Map<string, WorkspaceState>()
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
      syncRows(scope, states, target)
      return
    }
    for (const tree of trees) syncRows(tree, states, target)
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
    states = readStates(ctx, tracker)
    paint()
  }

  const stopSessions = subscribe(ctx.sessions?.list, refresh)
  const stopWorkspaces = subscribe(ctx.workspaces?.list, refresh)
  const stopStatuses = subscribe(ctx.uiSession?.sessionStatus, refresh)

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
    stopStatuses()
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