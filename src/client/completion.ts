/**
 * Finished-but-unviewed reminders, derived from run-state transitions.
 *
 * A folded Workspace hides the green dot a Session row draws when its run ended
 * and nobody has looked at it since. That flag is *not* in the Session catalog —
 * it is a process-local projection inside `dsh-client-ui-session`, reachable only
 * through its React hooks, and this plugin registers no per-Session slot to read
 * them from. So this module rebuilds the same projection from the one signal the
 * catalog does carry: the `running` flag, observed across snapshots.
 *
 * The rule is copied from `dsh-client-ui-session`'s `RemoteSessionStatus` (dsh
 * 0.2.1-rc.3), deliberately, because a reminder that disagrees with the Session
 * row's own dot is worse than no reminder:
 *
 * ```js
 * if (running) this.completionUnread.delete(sessionId);
 * else if ((previous === true || (previous === void 0 && beforeBaseline)) && !this.isMain(sessionId))
 *   this.completionUnread.add(sessionId);
 * ```
 *
 * with `isMain(id)` = `retainedBy.mainView > 0`, a first sighting *seeding* the
 * run state instead of counting as a completion, and a Session that leaves the
 * catalog cleared only once the list phase is `ready`.
 *
 * Two consequences worth stating:
 *
 * - a run that was already finished when the plugin mounted produces no reminder —
 *   nothing was observed, so nothing is claimed;
 * - opening the Session in the main column is what clears the reminder, exactly
 *   as it clears the Session row's dot. Unfolding the Workspace does not.
 *
 * @module dsh-workspace-running-indicator/client/completion
 */

import type { SessionsSnapshotLike } from './contract.ts'

/**
 * The reminder projection of one client session.
 */
export interface CompletionTracker {
  /**
   * Fold one catalog snapshot into the projection.
   *
   * Called for every catalog invalidation, in snapshot order, so the transitions
   * it sees are the ones the shipped policy sees.
   *
   * @param list - the Session catalog snapshot.
   * @param archived - Session ids the registry has archived; never reminded.
   */
  reconcile(list: SessionsSnapshotLike, archived: ReadonlySet<string>): void
  /**
   * Session ids whose run ended and whose result has not been opened since.
   *
   * @returns a live view; do not mutate.
   */
  unread(): ReadonlySet<string>
}

/**
 * Whether the conversation currently holds this Session in the main column.
 *
 * `ui-workspace` resolves the current Session the same way, so the two surfaces
 * acknowledge a completion at the same moment.
 *
 * @param summary - one catalog row.
 * @returns `true` while the Session is open on screen.
 */
function isMain(summary: { readonly retainedBy?: { readonly mainView?: number | undefined } | undefined } | undefined): boolean {
  return (summary?.retainedBy?.mainView ?? 0) > 0
}

/**
 * Create a tracker.
 *
 * One instance per mounted plugin: the projection is memory, not persisted state,
 * and a fresh mount starts by seeding whatever is running right now.
 *
 * @returns the tracker.
 */
export function createCompletionTracker(): CompletionTracker {
  /** Last observed run state per Session; also remembers which ids were seen. */
  const running = new Map<string, boolean>()
  /** Sessions whose run ended unviewed. */
  const unread = new Set<string>()

  return {
    reconcile(list, archived) {
      const byId = list.byId ?? {}
      const ids = list.ids ?? Object.keys(byId)
      const present = new Set(Object.keys(byId))

      for (const sessionId of ids) {
        const summary = byId[sessionId]
        if (summary === undefined) continue
        const next = summary.running === true
        const previous = running.get(sessionId)
        if (previous === undefined) {
          // Seeding is not a completion: a Session already idle at mount, or a
          // row that appears idle for the first time, never lights a reminder.
          running.set(sessionId, next)
        } else if (previous !== next) {
          running.set(sessionId, next)
          if (next) {
            // A fresh run supersedes the reminder for the run before it.
            unread.delete(sessionId)
          } else if (!isMain(summary)) {
            unread.add(sessionId)
          }
        }
      }

      // Selecting the Session acknowledges its completion, whatever else changed.
      for (const sessionId of present) {
        if (isMain(byId[sessionId])) unread.delete(sessionId)
      }
      // An archived row draws no status at all, so it must not light a Workspace.
      for (const sessionId of [...unread]) {
        if (archived.has(sessionId)) unread.delete(sessionId)
      }
      // Forget Sessions that left the catalog — but only once the list is
      // authoritative, or a reconnect's empty first page would erase reminders.
      if (list.phase === 'ready') {
        for (const sessionId of [...running.keys()]) {
          if (present.has(sessionId)) continue
          running.delete(sessionId)
          unread.delete(sessionId)
        }
      }
    },
    unread: () => unread,
  }
}