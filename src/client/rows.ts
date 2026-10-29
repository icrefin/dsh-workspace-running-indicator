/**
 * Painting a folded Workspace header with what its Sessions are doing.
 *
 * `ui-workspace` renders a Workspace header as one `role="treeitem"` element
 * carrying `data-row-key="workspace:<workspaceId>"`, and it exposes no seat on
 * that row: `sidebar.session.row.leading` is declared per *Session* row only, and
 * `sidebar.workspaces` is a single occupied seat holding the whole browser. So
 * this plugin does not replace the browser — it decorates the one cell it needs,
 * using the two attributes that are the row's own identity rather than any hashed
 * CSS-module class name:
 *
 * - `data-row-key` names the Workspace, which is how the state map is addressed;
 * - `aria-expanded` (the tree item's ARIA state) says whether the row is folded.
 *
 * The overlay is appended into the row's first cell — the 16×20 icon slot that
 * also holds the folder glyph — as an absolutely positioned node. That cell is the
 * shipped browser's own DOM, so the one rule this plugin obeys is *append only*:
 * React owns the cell's children and keeps them; an extra trailing node that is
 * out of flow neither changes layout nor breaks a patch. A remount replaces both
 * row and overlay together, and the observer in `index.ts` paints the new row.
 *
 * Two states share the cell, and only one overlay is present at a time:
 *
 * | state | overlay | what it means |
 * | --- | --- | --- |
 * | `running` | the shipped ongoing loader | a Session inside is working now |
 * | `completed` | the shipped green dot | a run ended and nobody opened it since |
 *
 * @module dsh-workspace-running-indicator/client/rows
 */

import type { WorkspaceState } from './activity.ts'
import { BADGE_ATTRIBUTE, DOT_ATTRIBUTE, STATE_ATTRIBUTE, WORKSPACE_ROW } from './styles.ts'

/** SVG namespace for the loader artwork. */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Prefix of `data-row-key` for a Workspace row. */
const ROW_KEY_PREFIX = 'workspace:'

/**
 * The Workspace a row belongs to.
 *
 * The ungrouped section is built with an empty key (`workspace:` with nothing
 * after the colon); it is not a Workspace and is answered `undefined`.
 *
 * @param row - a Workspace header row.
 * @returns the Workspace id, or undefined when the row is not addressable.
 */
export function workspaceIdOf(row: Element): string | undefined {
  const key = row.getAttribute('data-row-key')
  if (key === null || !key.startsWith(ROW_KEY_PREFIX)) return undefined
  const workspaceId = key.slice(ROW_KEY_PREFIX.length)
  return workspaceId === '' ? undefined : workspaceId
}

/**
 * Whether the row is folded.
 *
 * A missing `aria-expanded` is treated as folded: the browser writes the state on
 * every Workspace header, and a header that does not carry it is not one this
 * plugin should paint.
 *
 * @param row - a Workspace header row.
 * @returns `true` while the Workspace shows no Session rows.
 */
export function isFolded(row: Element): boolean {
  return row.getAttribute('aria-expanded') !== 'true'
}

/**
 * The icon slot of a Workspace row: the first cell, when it is a glyph cell.
 *
 * The guard is structural rather than class-based: an icon cell holds a direct
 * `svg` child and no text, which is what keeps the overlay from landing on a
 * title cell if the shipped markup ever reorders.
 *
 * @param row - a Workspace header row.
 * @returns the cell to decorate, or undefined when there is none.
 */
export function iconCellOf(row: Element): Element | undefined {
  const cell = row.firstElementChild
  if (cell === null) return undefined
  if (cell.querySelector(':scope > svg') === null) return undefined
  if ((cell.textContent ?? '').trim() !== '') return undefined
  return cell
}

/**
 * Build the loader overlay: the shipped ongoing loader, under this plugin's names.
 *
 * Geometry and stroke values match `StateDot`'s ongoing state (14px edge, 24-unit
 * viewBox, radius 9.5, 2px stroke) so the badge turns at the same weight as the
 * loader on a Session row beside it.
 *
 * @param target - document to create into.
 * @returns the decorative badge element.
 */
export function createBadge(target: Document): Element {
  const badge = target.createElement('span')
  badge.setAttribute(BADGE_ATTRIBUTE, '')
  badge.setAttribute('aria-hidden', 'true')

  const svg = target.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const motion = target.createElementNS(SVG_NS, 'g')
  motion.setAttribute('class', 'dsh-wsr-motion')

  for (const className of ['dsh-wsr-track', 'dsh-wsr-arc']) {
    const circle = target.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('class', className)
    circle.setAttribute('cx', '12')
    circle.setAttribute('cy', '12')
    circle.setAttribute('r', '9.5')
    motion.appendChild(circle)
  }

  svg.appendChild(motion)
  badge.appendChild(svg)
  return badge
}

/**
 * Build the completion overlay: the shipped green dot.
 *
 * `StateDot`'s `done` state is a 10px box painting one 6px core in
 * `--dsw-alias-state-success-primary`; the overlay centres that same 6px core in
 * the icon cell, so a folded Workspace's reminder is the dot its own Session rows
 * would draw.
 *
 * @param target - document to create into.
 * @returns the decorative dot element.
 */
export function createDot(target: Document): Element {
  const dot = target.createElement('span')
  dot.setAttribute(DOT_ATTRIBUTE, '')
  dot.setAttribute('aria-hidden', 'true')
  return dot
}

/**
 * Ensure exactly one overlay of the requested kind is present.
 *
 * @param cell - the icon slot.
 * @param attribute - the overlay's marker attribute.
 * @param build - factory used when the overlay is missing.
 * @param other - the marker attribute of the overlay that must not be there.
 * @param target - document to create into.
 * @returns whether the cell changed.
 */
function ensureOverlay(
  cell: Element,
  attribute: string,
  build: (target: Document) => Element,
  other: string,
  target: Document,
): boolean {
  let changed = false
  for (const stale of cell.querySelectorAll(`:scope > [${other}]`)) {
    stale.remove()
    changed = true
  }
  if (cell.querySelector(`:scope > [${attribute}]`) === null) {
    const overlay = build(target)
    cell.appendChild(overlay)
    if (attribute === BADGE_ATTRIBUTE) pinPhase(overlay)
    changed = true
  }
  return changed
}

/**
 * Start the loader's animation at document time zero, like the shipped spinner.
 *
 * A CSS animation starts when its element is inserted, so badges painted at
 * different moments — and the Session rows' own loaders — would rotate out of
 * phase. `StateDot` pins every loader to the same start time for exactly this
 * reason; the badge inherits that behaviour so a folded Workspace's ring turns in
 * step with the rows beside it. A detached element has no animations yet, and a
 * browser without `getAnimations` simply keeps the default phase.
 *
 * @param badge - the freshly inserted badge.
 */
function pinPhase(badge: Element): void {
  const animated = badge as Element & {
    getAnimations?: (options?: { subtree?: boolean }) => Animation[]
  }
  for (const animation of animated.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0
}

/**
 * Draw one state on a row, without rewriting what is already there.
 *
 * Idempotent by construction: a row already in the requested state costs one
 * attribute read and one selector test, so an observer storm cannot turn into a
 * write storm.
 *
 * @param row - a folded Workspace header row.
 * @param cell - its icon slot.
 * @param state - what the row should show.
 * @param target - document to create the overlay into.
 * @returns whether the row changed.
 */
export function markRow(row: Element, cell: Element, state: WorkspaceState, target: Document): boolean {
  let changed = false
  if (row.getAttribute(STATE_ATTRIBUTE) !== state) {
    row.setAttribute(STATE_ATTRIBUTE, state)
    changed = true
  }
  changed = state === 'running'
    ? ensureOverlay(cell, BADGE_ATTRIBUTE, createBadge, DOT_ATTRIBUTE, target) || changed
    : ensureOverlay(cell, DOT_ATTRIBUTE, createDot, BADGE_ATTRIBUTE, target) || changed
  return changed
}

/**
 * Return one row to its shipped appearance.
 *
 * @param row - any Workspace header row.
 * @returns whether the row changed.
 */
export function clearRow(row: Element): boolean {
  let changed = false
  if (row.hasAttribute(STATE_ATTRIBUTE)) {
    row.removeAttribute(STATE_ATTRIBUTE)
    changed = true
  }
  for (const overlay of row.querySelectorAll(`[${BADGE_ATTRIBUTE}], [${DOT_ATTRIBUTE}]`)) {
    overlay.remove()
    changed = true
  }
  return changed
}

/**
 * Reconcile every Workspace row under `root` with the state map.
 *
 * Folded and reported draws the overlay; anything else — expanded, idle, the
 * ungrouped section, a row whose markup is not recognised — is left in its shipped
 * state, and an overlay left over from an earlier pass is removed.
 *
 * @param root - subtree to reconcile (the document, in production).
 * @param states - Workspace ids mapped to what their folded header should show.
 * @param target - document owning the rows; defaults to `root`'s owner document.
 * @returns how many rows were changed.
 */
export function syncRows(
  root: Document | DocumentFragment | Element,
  states: ReadonlyMap<string, WorkspaceState>,
  target: Document | null = root instanceof Document ? root : root.ownerDocument,
): number {
  let changed = 0
  for (const row of root.querySelectorAll(WORKSPACE_ROW)) {
    const workspaceId = workspaceIdOf(row)
    const state = workspaceId === undefined ? undefined : states.get(workspaceId)
    const cell = state !== undefined && isFolded(row) ? iconCellOf(row) : undefined
    if (cell !== undefined && state !== undefined && target !== null) {
      if (markRow(row, cell, state, target)) changed += 1
    } else if (clearRow(row)) {
      changed += 1
    }
  }
  return changed
}
