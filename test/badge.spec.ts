// @vitest-environment jsdom
/**
 * The badge, driven against the built bundle in a real DOM.
 *
 * The fixture reproduces the shipped row markers only — a tree item keyed
 * `workspace:<id>`, its `aria-expanded` fold state, and the glyph cell — and the
 * assertions cover what the plugin promises: a folded Workspace with a waiting or
 * working Session shows its mark, every other row keeps its folder glyph, and
 * toggling the fold or the Session's state puts the page back the way it was.
 *
 * @module dsh-workspace-running-indicator/test/badge
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { browserList, sessionRow, workspaceRow } from './fixture.ts'
import { built, fakeStore, loadClientBundle, type ClientBundleExports, type FakeStore } from './loader.ts'

/** Attribute this plugin sets on a row while an overlay is drawn; its value is the state. */
const STATE = 'data-dsh-wsr-state'

/** Attribute marking the loader overlay. */
const BADGE = 'data-dsh-wsr-badge'

/** Attribute marking the completion dot. */
const DOT = 'data-dsh-wsr-dot'

/** Attribute marking the waiting-for-an-answer dot. */
const WAITING = 'data-dsh-wsr-waiting'

/** One mounted plugin instance with its effect disposers. */
interface Mounted {
  dispose(): void
}

/** Mounted instances, disposed after every spec. */
const mounted: Mounted[] = []

/**
 * Build the state stores and mount the plugin over them.
 * @param sessions - initial Session catalog snapshot.
 * @param workspaces - initial Workspace projection snapshot.
 * @param statuses - initial unified status projection, by Session id.
 * @returns the stores and the mount's disposer.
 */
function mount(
  sessions: unknown,
  workspaces: unknown,
  statuses: Map<string, unknown> = new Map(),
): {
  sessions: FakeStore<unknown>
  workspaces: FakeStore<unknown>
  statuses: FakeStore<unknown>
  dispose(): void
} {
  const sessionStore = fakeStore<unknown>(sessions)
  const workspaceStore = fakeStore<unknown>(workspaces)
  const statusStore = fakeStore<unknown>(statuses)
  const disposers: (() => void)[] = []
  const exports: ClientBundleExports = loadClientBundle().exports
  exports.apply({
    sessions: { list: sessionStore },
    workspaces: { list: workspaceStore },
    uiSession: { sessionStatus: statusStore },
    effect: (callback: () => (() => void) | void): void => {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  })
  const instance = {
    dispose: (): void => {
      for (const dispose of disposers.splice(0)) dispose()
    },
  }
  mounted.push(instance)
  return { sessions: sessionStore, workspaces: workspaceStore, statuses: statusStore, dispose: instance.dispose }
}

/**
 * A Workspace projection row.
 * @param workspaceId - Workspace id.
 * @param sessionIds - member Sessions.
 * @param path - canonical directory, when hierarchy matters.
 * @returns the row.
 */
function workspace(workspaceId: string, sessionIds: string[], path = `/tmp/${workspaceId}`): unknown {
  return { workspaceId, path, title: workspaceId, sessionIds, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
}

/**
 * A Session catalog snapshot from `[id, running]` pairs.
 * @param rows - Session id and run state.
 * @returns the snapshot.
 */
function catalog(...rows: [string, boolean][]): unknown {
  const byId: Record<string, { id: string; running: boolean }> = {}
  for (const [id, running] of rows) byId[id] = { id, running }
  return { ids: rows.map(([id]) => id), byId, phase: 'ready', projectionsBySession: {} }
}

/**
 * A unified status snapshot from `[id, pending kind]` pairs.
 *
 * A `undefined` kind builds a row with no pending interaction, so a test can move
 * a Session from waiting to answered without touching its catalog row.
 *
 * @param rows - Session id and pending-interaction kind.
 * @returns the status map.
 */
function statuses(...rows: [string, string | undefined][]): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const [id, kind] of rows) map.set(id, kind === undefined ? { running: false } : { running: true, pendingInteraction: { kind } })
  return map
}

/**
 * Let the observer's mutation records and the plugin's microtask paint run.
 * @returns a promise resolved after a macrotask.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * The row of one Workspace.
 * @param workspaceId - Workspace id.
 * @returns the element, or null.
 */
function rowOf(workspaceId: string): HTMLElement | null {
  return document.querySelector(`[data-row-key="workspace:${workspaceId}"]`)
}

/**
 * The badge inside one Workspace row.
 * @param workspaceId - Workspace id.
 * @returns the badge, or null.
 */
function badgeOf(workspaceId: string): Element | null {
  return document.querySelector(`[data-row-key="workspace:${workspaceId}"] [${BADGE}]`)
}

/**
 * The completion dot inside one Workspace row.
 * @param workspaceId - Workspace id.
 * @returns the dot, or null.
 */
function dotOf(workspaceId: string): Element | null {
  return document.querySelector(`[data-row-key="workspace:${workspaceId}"] [${DOT}]`)
}

/**
 * The waiting dot inside one Workspace row.
 * @param workspaceId - Workspace id.
 * @returns the dot, or null.
 */
function waitingOf(workspaceId: string): Element | null {
  return document.querySelector(`[data-row-key="workspace:${workspaceId}"] [${WAITING}]`)
}

beforeAll(() => {
  if (!built) throw new Error('lib/client.js is missing: run `pnpm build` before the specs')
})

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const instance of mounted.splice(0)) instance.dispose()
  document.body.innerHTML = ''
})

describe('folded Workspace with a working Session', () => {
  it('draws the spinner badge in the icon cell', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] })

    const row = rowOf('ws-a')
    expect(row?.getAttribute(STATE)).toBe('running')
    const badge = badgeOf('ws-a')
    expect(badge).not.toBeNull()
    // Inside the first cell, beside the folder glyph — the cell keeps its box.
    expect(badge?.parentElement).toBe(row?.firstElementChild)
    expect(badge?.getAttribute('aria-hidden')).toBe('true')
    expect(badge?.querySelector('svg')?.getAttribute('width')).toBe('14')
    expect(badge?.querySelector('.dsh-wsr-track')).not.toBeNull()
    expect(badge?.querySelector('.dsh-wsr-arc')).not.toBeNull()
  })

  it('leaves a folded Workspace with no working Session alone', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'), workspaceRow('ws-b'))
    mount(catalog(['s-1', true], ['s-2', false]), {
      items: [workspace('ws-a', ['s-1']), workspace('ws-b', ['s-2'])],
    })

    expect(badgeOf('ws-a')).not.toBeNull()
    expect(rowOf('ws-b')?.getAttribute(STATE)).toBeNull()
    expect(badgeOf('ws-b')).toBeNull()
  })

  it('leaves an expanded Workspace alone — its Session rows carry their own loaders', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a', { folded: false }), sessionRow('s-1'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] })

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(badgeOf('ws-a')).toBeNull()
  })

  it('never paints the Ungrouped section', () => {
    document.body.innerHTML = browserList(workspaceRow(''))
    mount(catalog(['s-1', true]), { items: [] })

    expect(document.querySelector('[data-row-key="workspace:"]')?.getAttribute(STATE)).toBeNull()
    expect(document.querySelector(`[${BADGE}]`)).toBeNull()
  })
})

describe('nested Workspaces', () => {
  // Regression: eda_vm (/workspace/asic/eda_vm) owns only idle Sessions while
  // tangram (/workspace/asic/eda_vm/tangram) runs. The parent's own title is the
  // only claim its row makes, so it must stay a folder.
  it('keeps an idle parent a folder while a nested child workspace is running', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-parent'), workspaceRow('ws-child'))
    mount(catalog(['s-idle', false], ['s-run', true]), {
      items: [
        workspace('ws-parent', ['s-idle'], '/repo/asic/eda_vm'),
        workspace('ws-child', ['s-run'], '/repo/asic/eda_vm/tangram'),
      ],
    })

    expect(badgeOf('ws-parent')).toBeNull()
    expect(rowOf('ws-parent')?.getAttribute(STATE)).toBeNull()
    expect(badgeOf('ws-child')).not.toBeNull()
  })

  it('animates a parent whose own Session is running, whatever a nested child does', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-parent'), workspaceRow('ws-child'))
    mount(catalog(['s-parent', true], ['s-child', false]), {
      items: [
        workspace('ws-parent', ['s-parent'], '/repo/asic/eda_vm'),
        workspace('ws-child', ['s-child'], '/repo/asic/eda_vm/tangram'),
      ],
    })

    expect(badgeOf('ws-parent')).not.toBeNull()
    expect(badgeOf('ws-child')).toBeNull()
  })

  it('animates both when both own a running Session', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-parent'), workspaceRow('ws-child'))
    mount(catalog(['s-parent', true], ['s-child', true]), {
      items: [
        workspace('ws-parent', ['s-parent'], '/repo/asic/eda_vm'),
        workspace('ws-child', ['s-child'], '/repo/asic/eda_vm/tangram'),
      ],
    })

    expect(badgeOf('ws-parent')).not.toBeNull()
    expect(badgeOf('ws-child')).not.toBeNull()
  })
})

describe('subagent activity', () => {
  it('counts a running direct subagent as its parent Session working', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(
      {
        byId: { 's-1': { id: 's-1', running: false }, 's-child': { id: 's-child', running: true } },
        ids: ['s-1', 's-child'],
        phase: 'ready',
        projectionsBySession: { 's-1': { values: { subagentCatalog: [{ id: 's-child', mode: 'one-shot' }] } } },
      },
      { items: [workspace('ws-a', ['s-1'])] },
    )

    expect(badgeOf('ws-a')).not.toBeNull()
  })

  it('ignores an external child, as the sidebar itself does', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(
      {
        byId: { 's-1': { id: 's-1', running: false }, 's-ext': { id: 's-ext', running: true } },
        ids: ['s-1', 's-ext'],
        phase: 'ready',
        projectionsBySession: { 's-1': { values: { subagentCatalog: [{ id: 's-ext', mode: 'external' }] } } },
      },
      { items: [workspace('ws-a', ['s-1'])] },
    )

    expect(badgeOf('ws-a')).toBeNull()
  })
})

describe('archived Sessions', () => {
  it('does not animate a Workspace whose only running Session is archived', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true]), {
      items: [workspace('ws-a', ['s-1'])],
      archivedSessionIds: ['s-1'],
    })

    expect(badgeOf('ws-a')).toBeNull()
  })

  it('still animates for the unarchived Session beside it', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true], ['s-2', true]), {
      items: [workspace('ws-a', ['s-1', 's-2'])],
      archivedSessionIds: ['s-1'],
    })

    expect(badgeOf('ws-a')).not.toBeNull()
  })
})

describe('the badge follows the page', () => {
  it('removes the badge when the user expands the Workspace', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] })
    expect(badgeOf('ws-a')).not.toBeNull()

    rowOf('ws-a')?.setAttribute('aria-expanded', 'true')
    await settle()

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(badgeOf('ws-a')).toBeNull()
    // The shipped glyph is visible again because the attribute is gone.
    expect(rowOf('ws-a')?.querySelector('span > svg')).not.toBeNull()
  })

  it('swaps the loader for the completion dot when the run ends', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(catalog(['s-1', false]), { items: [workspace('ws-a', ['s-1'])] })
    expect(badgeOf('ws-a')).toBeNull()
    expect(dotOf('ws-a')).toBeNull()

    sessions.set(catalog(['s-1', true]))
    await settle()
    expect(badgeOf('ws-a')).not.toBeNull()
    expect(dotOf('ws-a')).toBeNull()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('running')

    sessions.set(catalog(['s-1', false]))
    await settle()
    expect(badgeOf('ws-a')).toBeNull()
    expect(dotOf('ws-a')).not.toBeNull()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('completed')
  })

  it('redraws a row the browser remounted', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] })
    expect(badgeOf('ws-a')).not.toBeNull()

    // A re-render that replaces the row node drops the badge with the node.
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    await settle()

    expect(badgeOf('ws-a')).not.toBeNull()
  })

  it('stops watching once the plugin is disposed and restores every row', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions, dispose } = mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] })
    expect(badgeOf('ws-a')).not.toBeNull()

    dispose()

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(badgeOf('ws-a')).toBeNull()
    expect(sessions.listeners).toBe(0)

    sessions.set(catalog(['s-1', false]))
    await settle()
    expect(badgeOf('ws-a')).toBeNull()
  })
})

describe('finished-but-unviewed work', () => {
  /**
   * A catalog row with the retention field the completion policy reads.
   * @param id - Session id.
   * @param running - run state.
   * @param mainView - main-column references above zero mean "on screen".
   * @returns the row.
   */
  function row(id: string, running: boolean, mainView = 0): Record<string, unknown> {
    return { id, running, retainedBy: { mainView } }
  }

  /**
   * A catalog snapshot built from explicit rows.
   * @param rows - the rows, keyed by id.
   * @returns the snapshot.
   */
  function snapshot(...rows: Record<string, unknown>[]): unknown {
    const byId: Record<string, unknown> = {}
    for (const entry of rows) byId[String(entry['id'])] = entry
    return { ids: rows.map((entry) => String(entry['id'])), byId, phase: 'ready', projectionsBySession: {} }
  }

  it('reminds a folded Workspace once its run ends', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true)), { items: [workspace('ws-a', ['s-1'])] })
    expect(badgeOf('ws-a')).not.toBeNull()

    sessions.set(snapshot(row('s-1', false)))
    await settle()

    expect(badgeOf('ws-a')).toBeNull()
    const dot = dotOf('ws-a')
    expect(dot).not.toBeNull()
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
    expect(dot?.parentElement).toBe(rowOf('ws-a')?.firstElementChild)
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('completed')
  })

  it('clears the reminder when the Session is opened in the main column', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true)), { items: [workspace('ws-a', ['s-1'])] })
    sessions.set(snapshot(row('s-1', false)))
    await settle()
    expect(dotOf('ws-a')).not.toBeNull()

    sessions.set(snapshot(row('s-1', false, 1)))
    await settle()

    expect(dotOf('ws-a')).toBeNull()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
  })

  it('never reminds for a run that finished in a watched Session', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true, 1)), { items: [workspace('ws-a', ['s-1'])] })
    sessions.set(snapshot(row('s-1', false, 1)))
    await settle()

    expect(dotOf('ws-a')).toBeNull()
  })

  it('does not invent a reminder for a Session that was already idle at mount', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(snapshot(row('s-1', false)), { items: [workspace('ws-a', ['s-1'])] })

    expect(dotOf('ws-a')).toBeNull()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
  })

  it('lets a fresh run replace the reminder with the loader', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true)), { items: [workspace('ws-a', ['s-1'])] })
    sessions.set(snapshot(row('s-1', false)))
    await settle()
    expect(dotOf('ws-a')).not.toBeNull()

    sessions.set(snapshot(row('s-1', true)))
    await settle()

    expect(dotOf('ws-a')).toBeNull()
    expect(badgeOf('ws-a')).not.toBeNull()
  })

  it('keeps the reminder until every completion in the Workspace is seen', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true), row('s-2', true)), {
      items: [workspace('ws-a', ['s-1', 's-2'])],
    })
    sessions.set(snapshot(row('s-1', false), row('s-2', true)))
    await settle()
    expect(dotOf('ws-a')).toBeNull()

    sessions.set(snapshot(row('s-1', false), row('s-2', false)))
    await settle()
    expect(dotOf('ws-a')).not.toBeNull()

    // Viewing one of the two leaves the other unread.
    sessions.set(snapshot(row('s-1', false, 1), row('s-2', false)))
    await settle()
    expect(dotOf('ws-a')).not.toBeNull()

    sessions.set(snapshot(row('s-1', false, 1), row('s-2', false, 1)))
    await settle()
    expect(dotOf('ws-a')).toBeNull()
  })

  it('gives the loader priority while another Session still works', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true), row('s-2', true)), {
      items: [workspace('ws-a', ['s-1', 's-2'])],
    })
    sessions.set(snapshot(row('s-1', false), row('s-2', true)))
    await settle()

    expect(badgeOf('ws-a')).not.toBeNull()
    expect(dotOf('ws-a')).toBeNull()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('running')
  })

  it('hides the reminder while expanded and restores it when folded again', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions } = mount(snapshot(row('s-1', true)), { items: [workspace('ws-a', ['s-1'])] })
    sessions.set(snapshot(row('s-1', false)))
    await settle()
    expect(dotOf('ws-a')).not.toBeNull()

    rowOf('ws-a')?.setAttribute('aria-expanded', 'true')
    await settle()
    expect(dotOf('ws-a')).toBeNull()

    rowOf('ws-a')?.setAttribute('aria-expanded', 'false')
    await settle()
    expect(dotOf('ws-a')).not.toBeNull()
  })

  it('does not remind for an archived completion', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions, workspaces } = mount(snapshot(row('s-1', true)), { items: [workspace('ws-a', ['s-1'])] })
    sessions.set(snapshot(row('s-1', false)))
    await settle()

    workspaces.set({ items: [workspace('ws-a', ['s-1'])], archivedSessionIds: ['s-1'] })
    await settle()

    expect(dotOf('ws-a')).toBeNull()
  })

  it("keeps a nested Workspace's completion off its parent", async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-parent'), workspaceRow('ws-child'))
    const { sessions } = mount(snapshot(row('s-parent', false), row('s-child', true)), {
      items: [workspace('ws-parent', ['s-parent']), workspace('ws-child', ['s-child'], '/repo/asic/eda_vm/tangram')],
    })
    sessions.set(snapshot(row('s-parent', false), row('s-child', false)))
    await settle()

    expect(dotOf('ws-parent')).toBeNull()
    expect(dotOf('ws-child')).not.toBeNull()
  })
})

describe('a Session waiting for an answer', () => {
  it('draws the yellow waiting dot in the icon cell', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] }, statuses(['s-1', 'question']))

    const row = rowOf('ws-a')
    expect(row?.getAttribute(STATE)).toBe('waiting')
    const dot = waitingOf('ws-a')
    expect(dot).not.toBeNull()
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
    // Inside the first cell, beside the folder glyph — the cell keeps its box.
    expect(dot?.parentElement).toBe(row?.firstElementChild)
    // Exactly one overlay at a time.
    expect(badgeOf('ws-a')).toBeNull()
    expect(dotOf('ws-a')).toBeNull()
  })

  it('treats an approval and a plan review as waiting too', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'), workspaceRow('ws-b'), workspaceRow('ws-c'))
    mount(catalog(['s-a', true], ['s-b', true], ['s-c', false]), {
      items: [workspace('ws-a', ['s-a']), workspace('ws-b', ['s-b']), workspace('ws-c', ['s-c'])],
    }, statuses(['s-a', 'approval'], ['s-b', 'plan-review']))

    expect(waitingOf('ws-a')).not.toBeNull()
    expect(waitingOf('ws-b')).not.toBeNull()
    expect(waitingOf('ws-c')).toBeNull()
  })

  it('draws nothing for a pending kind the sidebar does not know', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', false]), { items: [workspace('ws-a', ['s-1'])] }, statuses(['s-1', 'unknown-kind']))

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(waitingOf('ws-a')).toBeNull()
    expect(dotOf('ws-a')).toBeNull()
  })

  it('outranks the loader while the Session also runs', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] }, statuses(['s-1', 'question']))

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('waiting')
    expect(waitingOf('ws-a')).not.toBeNull()
    expect(badgeOf('ws-a')).toBeNull()
  })

  it('outranks the completion dot, and hands back to it once answered', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { sessions, statuses: statusStore } = mount(
      catalog(['s-1', true]),
      { items: [workspace('ws-a', ['s-1'])] },
      statuses(['s-1', 'question']),
    )
    expect(waitingOf('ws-a')).not.toBeNull()

    // The run ends while the question is still open: waiting stays primary.
    sessions.set(catalog(['s-1', false]))
    await settle()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('waiting')
    expect(dotOf('ws-a')).toBeNull()

    // Answering it uncovers the completion reminder underneath.
    statusStore.set(statuses(['s-1', undefined]))
    await settle()
    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('completed')
    expect(waitingOf('ws-a')).toBeNull()
    expect(dotOf('ws-a')).not.toBeNull()
  })

  it('hands back to the loader once answered while the run continues', async () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { statuses: statusStore } = mount(
      catalog(['s-1', true]),
      { items: [workspace('ws-a', ['s-1'])] },
      statuses(['s-1', 'question']),
    )
    expect(waitingOf('ws-a')).not.toBeNull()

    statusStore.set(statuses(['s-1', undefined]))
    await settle()

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBe('running')
    expect(waitingOf('ws-a')).toBeNull()
    expect(badgeOf('ws-a')).not.toBeNull()
  })

  it('leaves an expanded Workspace alone — its Session row carries the dot', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a', { folded: false }), sessionRow('s-1'))
    mount(catalog(['s-1', true]), { items: [workspace('ws-a', ['s-1'])] }, statuses(['s-1', 'question']))

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(waitingOf('ws-a')).toBeNull()
  })

  it('lights only the Workspace that owns the waiting Session', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'), workspaceRow('ws-b'))
    mount(catalog(['s-a', true], ['s-b', true]), {
      items: [workspace('ws-a', ['s-a']), workspace('ws-b', ['s-b'])],
    }, statuses(['s-b', 'question']))

    expect(waitingOf('ws-a')).toBeNull()
    expect(waitingOf('ws-b')).not.toBeNull()
  })

  it("keeps a nested child's pending question off its parent", () => {
    document.body.innerHTML = browserList(workspaceRow('ws-parent'), workspaceRow('ws-child'))
    mount(catalog(['s-parent', false], ['s-child', false]), {
      items: [
        workspace('ws-parent', ['s-parent'], '/repo/asic/eda_vm'),
        workspace('ws-child', ['s-child'], '/repo/asic/eda_vm/tangram'),
      ],
    }, statuses(['s-parent', undefined], ['s-child', 'question']))

    expect(waitingOf('ws-parent')).toBeNull()
    expect(waitingOf('ws-child')).not.toBeNull()
  })

  it("does not adopt a direct subagent's pending interaction", () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(
      {
        byId: { 's-1': { id: 's-1', running: false }, 's-child': { id: 's-child', running: true } },
        ids: ['s-1', 's-child'],
        phase: 'ready',
        projectionsBySession: { 's-1': { values: { subagentCatalog: [{ id: 's-child', mode: 'one-shot' }] } } },
      },
      { items: [workspace('ws-a', ['s-1'])] },
      statuses(['s-child', 'question']),
    )

    // The shipped parent row adopts a running child's loader, never its pending
    // mark; the child's answer belongs to the child's own conversation.
    expect(waitingOf('ws-a')).toBeNull()
    expect(badgeOf('ws-a')).not.toBeNull()
  })

  it('does not paint for an archived Session', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    mount(catalog(['s-1', false]), {
      items: [workspace('ws-a', ['s-1'])],
      archivedSessionIds: ['s-1'],
    }, statuses(['s-1', 'question']))

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(waitingOf('ws-a')).toBeNull()
  })

  it('removes the waiting dot when the plugin is disposed', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const { dispose } = mount(
      catalog(['s-1', true]),
      { items: [workspace('ws-a', ['s-1'])] },
      statuses(['s-1', 'question']),
    )
    expect(waitingOf('ws-a')).not.toBeNull()

    dispose()

    expect(rowOf('ws-a')?.getAttribute(STATE)).toBeNull()
    expect(waitingOf('ws-a')).toBeNull()
    // The shipped folder glyph is visible again.
    expect(rowOf('ws-a')?.querySelector('span > svg')).not.toBeNull()
  })
})

describe('degrading instead of breaking the page', () => {
  it('survives a store whose subscribe throws', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const disposers: (() => void)[] = []
    expect(() => {
      loadClientBundle().exports.apply({
        sessions: {
          list: {
            getSnapshot: () => catalog(['s-1', true]),
            subscribe: () => {
              throw new Error('store closed')
            },
          },
        },
        workspaces: {
          list: {
            getSnapshot: () => ({ items: [workspace('ws-a', ['s-1'])] }),
            subscribe: () => () => {},
          },
        },
        effect: (callback: () => (() => void) | void): void => {
          const dispose = callback()
          if (typeof dispose === 'function') disposers.push(dispose)
        },
      })
    }).not.toThrow()

    // The initial read still paints; only the subscription is lost.
    expect(badgeOf('ws-a')).not.toBeNull()
    for (const dispose of disposers) dispose()
  })

  it('keeps the catalog marks when the status projection cannot be read', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const disposers: (() => void)[] = []
    expect(() => {
      loadClientBundle().exports.apply({
        sessions: { list: fakeStore<unknown>(catalog(['s-1', true])) },
        workspaces: { list: fakeStore<unknown>({ items: [workspace('ws-a', ['s-1'])] }) },
        uiSession: {
          sessionStatus: {
            getSnapshot: () => {
              throw new Error('not connected')
            },
            subscribe: () => () => {},
          },
        },
        effect: (callback: () => (() => void) | void): void => {
          const dispose = callback()
          if (typeof dispose === 'function') disposers.push(dispose)
        },
      })
    }).not.toThrow()

    // No pending signal: the loader still reports the run.
    expect(badgeOf('ws-a')).not.toBeNull()
    expect(waitingOf('ws-a')).toBeNull()
    for (const dispose of disposers) dispose()
  })

  it('draws nothing when the snapshots cannot be read', () => {
    document.body.innerHTML = browserList(workspaceRow('ws-a'))
    const disposers: (() => void)[] = []
    loadClientBundle().exports.apply({
      sessions: {
        list: {
          getSnapshot: () => {
            throw new Error('not connected')
          },
          subscribe: () => () => {},
        },
      },
      workspaces: { list: fakeStore<unknown>({ items: [workspace('ws-a', ['s-1'])] }) },
      effect: (callback: () => (() => void) | void): void => {
        const dispose = callback()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
    })

    expect(badgeOf('ws-a')).toBeNull()
    for (const dispose of disposers) dispose()
  })
})
