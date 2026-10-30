/**
 * The shipped sidebar markup, as far as this plugin may look at it.
 *
 * Copied from `ui-workspace`'s `Rows` module at dsh 0.2.1-rc.5: a Workspace header
 * is a flex row whose first cell is the 16×20 glyph slot, followed by the hover
 * chevron cell, the title column and the hover actions. The class names are the
 * module's hashes and are reproduced only so the fixture looks like the real
 * page — the plugin itself never reads them; it reads `role`, `data-row-key` and
 * `aria-expanded`, which is what this fixture keeps faithful.
 *
 * @module dsh-workspace-running-indicator/test/fixture
 */

/** The folder glyph the shipped row draws; any `svg` child satisfies the cell. */
const FOLDER_SVG = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h5l2 2h5v7H2z"/></svg>'

/**
 * One Workspace header row.
 * @param workspaceId - Workspace id; the empty string builds the Ungrouped section.
 * @param options - fold state and label.
 * @returns the row's markup.
 */
export function workspaceRow(
  workspaceId: string,
  options: { folded?: boolean; label?: string } = {},
): string {
  const folded = options.folded ?? true
  const label = options.label ?? workspaceId
  return `<div class="JoiKIa_projectRow" role="treeitem" data-row-key="workspace:${workspaceId}" aria-expanded="${folded ? 'false' : 'true'}"><span class="JoiKIa_slot JoiKIa_folder">${FOLDER_SVG}</span><span class="JoiKIa_slot JoiKIa_chevron"><svg width="16" height="16"></svg></span><span class="JoiKIa_projectText"><span class="JoiKIa_title">${label}</span></span><span class="JoiKIa_rowActions"></span></div>`
}

/**
 * A Session row, so a fixture that draws expanded groups looks real.
 * @param sessionId - Session id.
 * @returns the row's markup.
 */
export function sessionRow(sessionId: string): string {
  return `<div class="JoiKIa_sessionRow" role="treeitem" data-row-key="session:${sessionId}"><span class="JoiKIa_title">${sessionId}</span></div>`
}

/**
 * The whole browser list.
 * @param rows - row markup, in render order.
 * @returns the list container's markup.
 */
export function browserList(...rows: string[]): string {
  return `<div class="JoiKIa_root"><div class="JoiKIa_list" role="tree">${rows.join('')}</div></div>`
}
