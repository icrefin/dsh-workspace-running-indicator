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
 * - a nested Workspace's activity reaches its parent, since the parent row is the
 *   only row still on screen once the parent is folded.
 *
 * Nothing here touches the DOM, so it is testable without a browser.
 *
 * @module dsh-workspace-running-indicator/client/busy
 */

import type {
  SessionsSnapshotLike,
  WorkspacesSnapshotLike,
  WorkspaceViewLike,
} from './contract.ts'

/**
 * Normalize a Workspace path for containment tests.
 *
 * Mirrors `ui-workspace`'s own `folderPath`: Windows separators are unified only
 * when the path is a Windows path, so a POSIX directory whose name contains a
 * backslash keeps its identity, and trailing separators are dropped.
 *
 * @param path - Host-spelled directory path.
 * @returns the comparison form.
 */
export function folderPath(path: string): string {
  const unified = /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\') ? path.replaceAll('\\', '/') : path
  return unified.replace(/\/+$/, '')
}

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
 * Mark every Workspace that contains a busy Workspace, by directory nesting.
 *
 * @param busy - Workspace ids known to be busy, mutated in place.
 * @param items - every Workspace row of the projection.
 * @param paths - normalized path per Workspace id.
 * @returns the same set.
 */
function includeAncestors(
  busy: Set<string>,
  items: readonly WorkspaceViewLike[],
  paths: ReadonlyMap<string, string>,
): Set<string> {
  const busyPaths: string[] = []
  for (const workspaceId of busy) {
    const path = paths.get(workspaceId)
    if (path !== undefined) busyPaths.push(path)
  }
  for (const item of items) {
    const workspaceId = item.workspaceId
    const path = workspaceId === undefined ? undefined : paths.get(workspaceId)
    if (workspaceId === undefined || path === undefined || busy.has(workspaceId)) continue
    // A Workspace directory contains another when the child starts with
    // `<root>/`; the root itself never counts as its own ancestor.
    if (busyPaths.some((child) => child !== path && child.startsWith(`${path}/`))) busy.add(workspaceId)
  }
  return busy
}

/**
 * The Workspace ids whose folded row should animate.
 *
 * @param sessions - the Session catalog snapshot.
 * @param workspaces - the Workspace projection snapshot.
 * @returns Workspace ids with at least one working Session (or busy descendant).
 */
export function busyWorkspaceIds(
  sessions: SessionsSnapshotLike,
  workspaces: WorkspacesSnapshotLike,
): Set<string> {
  const items = workspaces.items ?? []
  const active = activeSessionIds(sessions, new Set(workspaces.archivedSessionIds ?? []))
  const busy = new Set<string>()
  const paths = new Map<string, string>()

  for (const item of items) {
    const workspaceId = item.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') continue
    if (typeof item.path === 'string' && item.path !== '') paths.set(workspaceId, folderPath(item.path))
    const sessionIds = item.sessionIds ?? []
    if (sessionIds.some((sessionId) => active.has(sessionId))) busy.add(workspaceId)
  }
  return includeAncestors(busy, items, paths)
}