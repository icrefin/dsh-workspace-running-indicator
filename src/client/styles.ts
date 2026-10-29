/**
 * The badge's rules, and the one installer that puts them on the page.
 *
 * The spinner artwork is the shipped ongoing loader, re-declared under this
 * plugin's own class prefix rather than imported: a client bundle must not reach
 * into `ui-primitives` for a component whose markup can change without notice.
 * The geometry, the two 1.5s keyframes and the reduced-motion fallback are copied
 * from `StateDot.module.css` so a folded Workspace's badge turns exactly like a
 * Session row's own loader, at the same 14px edge.
 *
 * Two rules carry the behaviour, and both are **structural** on purpose: the
 * Workspace rows are the shipped browser's internal markup, so the plugin keys off
 * ARIA and the row-key attribute rather than a hashed CSS-module class name that
 * changes every build.
 *
 * - the first cell of a Workspace row hosts the badge as an absolute overlay, so
 *   the folder glyph keeps its 16px box and the title never moves;
 * - while `data-dsh-wsr-busy` is set, that cell's own glyph is transparent, so the
 *   overlay is what the user sees. The shipped hover rule replaces the whole cell
 *   with the disclosure chevron, which hides the badge with it.
 *
 * Colours come from `--dsw-alias-*` tokens only, so both themes are covered by one
 * declaration and no dark-mode override is needed.
 *
 * @module dsh-workspace-running-indicator/client/styles
 */

/** Marker attributes the client module system uses to claim and evict the tag. */
const PLUGIN_ID = 'dsh-workspace-running-indicator'
const TAG_ID = `${PLUGIN_ID}/workspace-running.css`

/** Classic-selector form of "a Workspace row", shared with the decorator. */
export const WORKSPACE_ROW = '[role="treeitem"][data-row-key^="workspace:"]'

/** Set on a Workspace row while its badge is present. */
export const BUSY_ATTRIBUTE = 'data-dsh-wsr-busy'

/** Marks the badge element this plugin owns inside a Workspace row. */
export const BADGE_ATTRIBUTE = 'data-dsh-wsr-badge'

/** Rule text, hoisted so the installer and its tests share one source. */
export const BADGE_CSS = [
  `${WORKSPACE_ROW}>span:first-child{position:relative}`,
  `${WORKSPACE_ROW}[${BUSY_ATTRIBUTE}]>span:first-child>svg{opacity:0}`,
  `[${BADGE_ATTRIBUTE}]{position:absolute;inset:0;display:flex;align-items:center;`,
  'justify-content:center;pointer-events:none;color:var(--dsw-alias-label-tertiary)}',
  `[${BADGE_ATTRIBUTE}]>svg{display:block;transform-origin:center}`,
  '.dsh-wsr-motion{transform-origin:center;animation:dsh-wsr-spin 1.5s linear infinite}',
  '.dsh-wsr-track,.dsh-wsr-arc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}',
  '.dsh-wsr-track{opacity:.25}',
  '.dsh-wsr-arc{stroke-dasharray:12 150;animation:dsh-wsr-dash 1.5s ease-in-out infinite}',
  '@keyframes dsh-wsr-spin{to{transform:rotate(360deg)}}',
  '@keyframes dsh-wsr-dash{',
  '0%{stroke-dasharray:12 150;stroke-dashoffset:0}',
  '50%{stroke-dasharray:24 150;stroke-dashoffset:-6}',
  '100%{stroke-dasharray:12 150;stroke-dashoffset:0}}',
  '@media (prefers-reduced-motion:reduce){',
  '.dsh-wsr-motion,.dsh-wsr-arc{animation:none}',
  '.dsh-wsr-arc{stroke-dasharray:18 150;stroke-dashoffset:-3}}',
].join('')

/**
 * Ensure this plugin's style tag exists.
 *
 * Safe to call more than once and from module scope: a second call finds the tag
 * by its claim attributes and leaves it alone. A failure to reach the document (a
 * non-DOM test environment) is not an error — the badge then draws in place but
 * without its motion, which is the plugin's own business to degrade.
 *
 * @param target - document to install into.
 * @returns a disposer that removes the tag this call created, if any.
 */
export function installStyles(target: Document | undefined = globalThis.document): () => void {
  if (target === undefined) return () => {}
  const selector = `style[data-plugin=${JSON.stringify(PLUGIN_ID)}][data-plugin-css=${JSON.stringify(TAG_ID)}]`
  if (target.querySelector(selector) !== null) return () => {}
  const tag = target.createElement('style')
  tag.dataset['plugin'] = PLUGIN_ID
  tag.dataset['pluginCss'] = TAG_ID
  tag.textContent = BADGE_CSS
  target.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}