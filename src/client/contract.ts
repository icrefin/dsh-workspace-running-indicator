/**
 * The browser-side snapshots this plugin reads, as it reads them.
 *
 * These are **structural** faces, not the shipped types: a client bundle is
 * compiled against no harness `.d.ts`, and the store shapes belong to packages
 * this plugin does not own. Every field is optional because a field a future
 * host drops must degrade to "no signal", never to a thrown read.
 *
 * Sources of truth (dsh 0.2.1-rc.5):
 * - `ctx.sessions.list` — `@deepseek-ai/dsh-api-session-controller`'s
 *   `ClientSessions.list`, the catalog snapshot the sidebar's session rows read.
 *   `byId[id].running` is the Host-asserted, live-updated run state.
 * - `ctx.workspaces.list` — `@deepseek-ai/dsh-api-workspace-controller`'s
 *   Workspace projection; each item owns its Session membership in manual order.
 * - `ctx.uiSession.sessionStatus` — `@deepseek-ai/dsh-client-ui-session`'s
 *   unified per-Session status: the same projection the shipped row reads to
 *   decide between `waiting`, `ongoing`, `done` and `idle`. Its
 *   `pendingInteraction` is what makes a row's dot yellow while a question,
 *   approval or plan review waits for the user.
 *
 * @module dsh-workspace-running-indicator/client/contract
 */

/**
 * The local retention counts a Session row carries.
 *
 * `mainView` counts the references the Conversation holds on this Session: it is
 * above zero exactly while the Session is the one open in the main column, which
 * is how both `ui-workspace` and this plugin decide whether a completion was
 * seen.
 */
export interface RetainInfoLike {
  readonly mainView?: number | undefined
}

/** One catalog row, as far as this plugin reads it. */
export interface SessionSummaryLike {
  readonly id?: string | undefined
  /** Host-asserted live run state; the sidebar's own fallback for a session row. */
  readonly running?: boolean | undefined
  readonly retainedBy?: RetainInfoLike | undefined
}

/** One entry of a parent Session's direct-subagent catalog. */
export interface SubagentCatalogEntryLike {
  readonly id?: string | undefined
  /** `external` children are excluded from the sidebar's own activity count. */
  readonly mode?: string | undefined
}

/** Per-Session shared projections carried by the catalog snapshot. */
export interface SessionProjectionLike {
  readonly subagentCatalog?: readonly SubagentCatalogEntryLike[] | undefined
}

/** One projected Session value set. */
export interface SessionValuesLike {
  readonly values?: SessionProjectionLike | undefined
}

/** The Session catalog snapshot (`ctx.sessions.list.getSnapshot()`). */
export interface SessionsSnapshotLike {
  /** Catalog order; the shipped reconcile loop walks it. */
  readonly ids?: readonly string[] | undefined
  readonly byId?: Readonly<Record<string, SessionSummaryLike | undefined>> | undefined
  readonly projectionsBySession?: Readonly<Record<string, SessionValuesLike | undefined>> | undefined
  /**
   * `pending` until the Host's first list answer lands. The shipped policy only
   * forgets vanished Sessions once it is `ready`, so a reconnect does not wipe
   * completion reminders.
   */
  readonly phase?: string | undefined
}

/**
 * One Workspace row (`ctx.workspaces.list.getSnapshot().items[]`).
 *
 * Membership is the only field this plugin reads: the row states which Sessions
 * are accounted to it, and a nested Workspace's directory path deliberately plays
 * no part — its activity belongs to its own row, never to a parent's.
 */
export interface WorkspaceViewLike {
  readonly workspaceId?: string | undefined
  /** Sessions accounted to this Workspace. */
  readonly sessionIds?: readonly string[] | undefined
}

/** The Workspace projection snapshot. */
export interface WorkspacesSnapshotLike {
  readonly items?: readonly WorkspaceViewLike[] | undefined
  /**
   * Registry-global archive set. An archived Session shows no live status in the
   * sidebar — its row keeps that cell blank — so it must not light a Workspace
   * either, or the two surfaces would disagree.
   */
  readonly archivedSessionIds?: readonly string[] | undefined
}

/** The read face both services expose on their `list` projection. */
export interface SnapshotSource<T> {
  getSnapshot(): T
  /** @returns the unsubscribe callback. */
  subscribe(listener: () => void): () => void
}

/**
 * How a Session is currently asking a human for an answer.
 *
 * `dsh-client-ui-session` publishes the interaction it is holding; the sidebar's
 * own row draws the yellow `warning` dot for the three kinds it understands
 * (`approval`, `plan-review`, `question`) and for nothing else.
 */
export interface PendingInteractionLike {
  /** `approval`, `plan-review`, `question`; any other value draws no status. */
  readonly kind?: string | undefined
}

/** One Session's unified status row. */
export interface SessionStatusLike {
  /** Live run state, as the status projection last observed it. */
  readonly running?: boolean | undefined
  /** Set exactly while the Session waits for a human answer. */
  readonly pendingInteraction?: PendingInteractionLike | undefined
  /** The projection's own finished-unviewed flag, when present. */
  readonly completionUnread?: boolean | undefined
}

/**
 * The unified status projection of `dsh-client-ui-session`
 * (`ctx.uiSession.sessionStatus`), keyed by Session id.
 *
 * This is the source the shipped Session rows themselves read, so the pending
 * interaction this plugin acts on is the exact one the yellow dot stands for.
 */
export type SessionStatusSnapshotLike = ReadonlyMap<string, SessionStatusLike | undefined>