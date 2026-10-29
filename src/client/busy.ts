/**
 * Which Workspaces currently hold working Sessions.
 *
 * The sidebar knows this per row: an expanded Workspace renders each Session row
 * with its own ongoing loader. A **folded** Workspace renders no Session rows at
 * all, so the shipped browser has nothing to derive an aggregate from and draws
 * the same folder glyph whether or not work is happening inside.
 *
 * This module rebuilds that aggregate from the two snapshots the client already
 * holds — the Session catalog and the Workspace projection — with the same rules
 * the shipped rows use:
 *
 * - a Session is active when its catalog row says `running`, exactly the
 *   fallback `ui-workspace` applies when no live status has been loaded yet;
 * - a Session with a running direct subagent is active too, because its own row
 *   shows the shared ongoing loader for that child;
 * - `external` subagent children are ignored, mirroring the sidebar's exclusion;
 * - an archived Session never counts: its row carries no live status either;
 * - **membership is the only key.** A Workspace animates for its own accounted
 *   Sessions and never for a nested Workspace's: `eda_vm` with idle Sessions must
 *   stay a folder even while `eda_vm/tangram` runs, because its own title is the
 *   only claim the row makes. Activity inside a nested Workspace belongs to that
 *   Workspace's own row, which the parent's expansion reveals.
 *
 * Nothing here touches the DOM, so it is testable without a browser.
 *
 * @module dsh-workspace-running-indicator/client/busy
 */

import type { SessionsSnapshotLike, WorkspacesSnapshotLike } from './contract.ts'

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
 * The Workspace ids whose folded row should animate.
 *
 * @param sessions - the Session catalog snapshot.
 * @param workspaces - the Workspace projection snapshot.
 * @returns Workspace ids with at least one of their own Sessions working.
 */
export function busyWorkspaceIds(
  sessions: SessionsSnapshotLike,
  workspaces: WorkspacesSnapshotLike,
): Set<string> {
  const active = activeSessionIds(sessions, new Set(workspaces.archivedSessionIds ?? []))
  const busy = new Set<string>()
  for (const item of workspaces.items ?? []) {
    const workspaceId = item.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') continue
    const sessionIds = item.sessionIds ?? []
    if (sessionIds.some((sessionId) => active.has(sessionId))) busy.add(workspaceId)
  }
  return busy
}
