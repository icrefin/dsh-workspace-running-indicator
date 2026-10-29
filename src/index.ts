/**
 * dsh-workspace-running-indicator — host half.
 *
 * The whole behaviour is a page-side decoration of the sidebar's Workspace rows:
 * it reads two client projections and paints one badge. Nothing runs in the host
 * process, so this half only supplies the Loader row's plugin identity.
 *
 * It exists because a dsh bundle is a package plus a Loader row, and the row
 * mounts `exports["."]`. {@link apply} is intentionally empty; the browser half
 * (`exports["./client"]`) carries the behaviour.
 *
 * @module dsh-workspace-running-indicator
 */

/** Loader row id; mirrors `cordis.patch.yml` and the package name. */
export const name = 'dsh-workspace-running-indicator'

/** Inert host half: the browser half paints the badge. */
export function apply(): void {}
