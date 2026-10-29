/**
 * What a Workspace row has to report: work in progress, or work finished unviewed.
 *
 * The sidebar knows this per Session: an expanded Workspace renders each row with
 * its own loader or green completion dot. A **folded** Workspace renders no Session
 * rows at all, so the shipped browser has nothing to aggregate and draws the same
 * folder glyph whether or not anything happened inside.
 *
 * This module rebuilds the aggregate from the two snapshots the client already
 * holds — the Session catalog and the Workspace projection — with the same rules
 * the shipped rows use:
 *
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
 * Working outranks finished: a fresh run supersedes the reminder for the run
 * before it, and the shipped status list orders `ongoing` ahead of `done` too.
 *
 * Nothing here touches the DOM, so it is testable without a browser.
 *
 * @module dsh-workspace-running-indicator/client/activity
 */

import type { SessionsSnapshotLike, WorkspacesSnapshotLike } from './contract.ts'

/** What a folded Workspace header shows in its icon cell. */
export type WorkspaceState = 'running' | 'completed'

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
 * The state of every Workspace that has something to report.
 *
 * @param workspaces - the Workspace projection snapshot.
 * @param active - Session ids working now (`activeSessionIds`).
 * @param unread - Session ids whose run ended unviewed.
 * @returns Workspace ids mapped to what their folded header should show.
 */
export function workspaceStates(
  workspaces: WorkspacesSnapshotLike,
  active: ReadonlySet<string>,
  unread: ReadonlySet<string>,
): Map<string, WorkspaceState> {
  const states = new Map<string, WorkspaceState>()
  for (const item of workspaces.items ?? []) {
    const workspaceId = item.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') continue
    const sessionIds = item.sessionIds ?? []
    if (sessionIds.some((sessionId) => active.has(sessionId))) states.set(workspaceId, 'running')
    else if (sessionIds.some((sessionId) => unread.has(sessionId))) states.set(workspaceId, 'completed')
  }
  return states
}