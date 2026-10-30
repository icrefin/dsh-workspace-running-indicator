/**
 * What a Workspace row has to report: a Session waiting for an answer, work in
 * progress, or work finished unviewed.
 *
 * The sidebar knows this per Session: an expanded Workspace renders each row with
 * its own status mark. A **folded** Workspace renders no Session rows at all, so
 * the shipped browser has nothing to aggregate and draws the same folder glyph
 * whether or not anything happened inside.
 *
 * This module rebuilds the aggregate from the snapshots the client already
 * holds — the Session catalog, the Workspace projection, and the unified
 * per-Session status projection — with the same rules the shipped rows use:
 *
 * - a Session **waits for the user** when `dsh-client-ui-session` is holding a
 *   pending interaction of a kind the sidebar knows: `approval`, `plan-review` or
 *   `question`. That is the yellow dot on its row;
 * - a Session is **working** when its catalog row says `running`, exactly the
 *   fallback `ui-workspace` applies when no live status has been loaded yet, or
 *   when one of its running direct subagents has the row showing that loader too;
 * - a Session is **finished-unviewed** when the catalog reports a run ending that
 *   nobody has opened since (`completion.ts` mirrors the shipped policy);
 * - `external` subagent children are ignored, mirroring the sidebar's exclusion;
 * - an archived Session never counts: its row carries no status at all;
 * - **membership is the only key.** A Workspace reports for its own accounted
 *   Sessions and never for a nested Workspace's: `eda_vm` with idle Sessions must
 *   stay a folder even while `eda_vm/tangram` runs, because its own title is the
 *   only claim the row makes.
 *
 * The shipped row orders its status marks **pending interaction first**, then
 * `ongoing`, then `done`; this aggregate uses the same precedence, so a folded
 * Workspace answers with the mark the single most urgent row inside it would
 * draw. Working outranks finished as well: a fresh run supersedes the reminder
 * for the run before it.
 *
 * A direct subagent's pending interaction does not reach its parent here: the
 * shipped parent row shows the loader for a running child but never adopts the
 * child's pending mark — the answer is for the child's conversation, not for the
 * parent's. Pending propagation therefore mirrors the row, exactly as running
 * propagation does.
 *
 * Nothing here touches the DOM, so it is testable without a browser.
 *
 * @module dsh-workspace-running-indicator/client/activity
 */

import type { SessionStatusSnapshotLike, SessionsSnapshotLike, WorkspacesSnapshotLike } from './contract.ts'

/** What a folded Workspace header shows in its icon cell. */
export type WorkspaceState = 'waiting' | 'running' | 'completed'

/**
 * The pending-interaction kinds the sidebar draws a status dot for.
 *
 * `ui-workspace`'s `visiblePendingKind` accepts exactly these three and drops
 * everything else, because a forged kind must not invent a row state.
 */
const WAITING_KINDS: ReadonlySet<string> = new Set(['approval', 'plan-review', 'question'])

/**
 * The Session ids that are working right now.
 *
 * @param sessions - the Session catalog snapshot.
 * @param archived - Session ids the registry has archived; never active.
 * @returns active Session ids, including parents of running direct subagents.
 */
export function activeSessionIds(sessions: SessionsSnapshotLike, archived: ReadonlySet<string> = new Set()): Set<string> {
  const byId = sessions.byId ?? {}
  const running = (id: string): boolean => !archived.has(id) && byId[id]?.running === true
  const active = new Set<string>()
  for (const sessionId of Object.keys(byId)) {
    if (running(sessionId)) active.add(sessionId)
  }
  for (const [parentId, projection] of Object.entries(sessions.projectionsBySession ?? {})) {
    if (archived.has(parentId)) continue
    for (const child of projection?.values?.subagentCatalog ?? []) {
      if (child?.mode === 'external') continue
      if (child?.id !== undefined && running(child.id)) active.add(parentId)
    }
  }
  return active
}

/**
 * The Session ids waiting for a human answer right now.
 *
 * Reads the unified status projection, so the selection is the sidebar's own:
 * only the three known kinds count, and an archived Session is dropped before its
 * mark could reach a row that draws no status at all.
 *
 * @param statuses - `ctx.uiSession.sessionStatus.getSnapshot()`, or undefined
 *   when the shell composes no Session UI.
 * @param archived - Session ids the registry has archived; never waiting.
 * @returns pending Session ids.
 */
export function waitingSessionIds(
  statuses: SessionStatusSnapshotLike | undefined,
  archived: ReadonlySet<string> = new Set(),
): Set<string> {
  const waiting = new Set<string>()
  if (statuses === undefined) return waiting
  for (const [sessionId, status] of statuses) {
    if (archived.has(sessionId)) continue
    const kind = status?.pendingInteraction?.kind
    if (kind !== undefined && WAITING_KINDS.has(kind)) waiting.add(sessionId)
  }
  return waiting
}

/**
 * The state of every Workspace that has something to report.
 *
 * @param workspaces - the Workspace projection snapshot.
 * @param active - Session ids working now (`activeSessionIds`).
 * @param unread - Session ids whose run ended unviewed.
 * @param waiting - Session ids waiting for an answer (`waitingSessionIds`).
 * @returns Workspace ids mapped to what their folded header should show.
 */
export function workspaceStates(
  workspaces: WorkspacesSnapshotLike,
  active: ReadonlySet<string>,
  unread: ReadonlySet<string>,
  waiting: ReadonlySet<string> = new Set(),
): Map<string, WorkspaceState> {
  const states = new Map<string, WorkspaceState>()
  for (const item of workspaces.items ?? []) {
    const workspaceId = item.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') continue
    const sessionIds = item.sessionIds ?? []
    // Pending interaction first, then ongoing, then done — the shipped row order.
    if (sessionIds.some((sessionId) => waiting.has(sessionId))) states.set(workspaceId, 'waiting')
    else if (sessionIds.some((sessionId) => active.has(sessionId))) states.set(workspaceId, 'running')
    else if (sessionIds.some((sessionId) => unread.has(sessionId))) states.set(workspaceId, 'completed')
  }
  return states
}