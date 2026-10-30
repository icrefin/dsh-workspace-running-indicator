# dsh-workspace-running-indicator

**A folded Workspace in DeepSeek Harness's sidebar shows what its hidden Sessions
are doing: the in-progress loader while one is working, and the green dot once a
run finished unviewed** — the marks the sidebar already draws on a Session row,
restored where folding hid them.

**English** | [简体中文](README.zh-CN.md)

[![License](https://img.shields.io/github/license/icrefin/dsh-workspace-running-indicator?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-workspace-running-indicator?style=flat-square)](https://github.com/icrefin/dsh-workspace-running-indicator/releases/tag/v0.2.0)
[![CI](https://img.shields.io/github/actions/workflow/status/icrefin/dsh-workspace-running-indicator/ci.yml?branch=main&style=flat-square)](https://github.com/icrefin/dsh-workspace-running-indicator/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-workspace-running-indicator?style=flat-square)](https://github.com/icrefin/dsh-workspace-running-indicator/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-workspace-running-indicator?style=flat-square)](https://github.com/icrefin/dsh-workspace-running-indicator/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/icrefin/dsh-workspace-running-indicator/pulls)
[![Node](https://img.shields.io/badge/node-%3E%3D22.17-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.3-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

## The problem

A folded Workspace hides every Session row inside it. Its header then shows the
same folder glyph whether three turns are running there, a turn just finished with
nobody looking, or nothing has happened for a week — while the row's own loader and
green dot are still rendered inside the group, with no row left to appear on.

```
Workspaces
  ◌ app · folded, running          ← this plugin: the header itself is the status
  ● dsh-plugins · finished unviewed
  ▢ ic_decryptor · idle
  ▾ research · expanded
      ● literature review          ← shipped: a Session row's own done dot
      ◌ chip bring-up              ← shipped: its ongoing loader
```

![A folded Workspace showing the loader and the completion dot](docs/images/workspace-badge.png)

## How it works

The workspace header is shipped UI with **no seat**:

| Owner | What it does |
|---|---|
| `dsh-client-ui-workspace` | renders each Workspace header as `role="treeitem"`, keyed `data-row-key="workspace:<id>"`, with the fold state on `aria-expanded` |
| `sidebar.session.row.leading` | a per-*Session* row cell — no Workspace header has one |
| `sidebar.workspaces` | one occupied seat holding the whole browser: grouping, nesting, ordering, search, drag-and-drop and menus |

Replacing that seat for one glyph would mean owning the browser. This plugin
decorates the single cell it needs instead, from the page side:

| Step | What happens |
|---|---|
| 1 | read `ctx.sessions.list` (the live Session catalog) and `ctx.workspaces.list` (the Workspace projection) |
| 2 | a Workspace is **working** when a member Session reports `running`, or has a running direct subagent (`external` children excluded, as the sidebar excludes them); it is **finished-unviewed** when a member Session's run ended unwatched |
| 3 | keep membership the only key: a row reports for its own accounted Sessions, never for a nested Workspace's |
| 4 | for each row that is `role="treeitem"`, keyed `workspace:<id>`, and `aria-expanded="false"`, overlay the matching mark in its 16×20 icon cell: the loader, or the green dot |
| 5 | keep it that way through a `MutationObserver` on the list — folding, expanding, re-mounts, new Workspaces |

**Why the catalog is the right source.** `ctx.sessions.list.byId[id].running` is
the Host's live run state, delivered on every status change; it is exactly the
fallback `ui-workspace` itself applies to a row whose live status has not been
loaded yet. A folded group therefore asks the same question its expanded rows
already ask. Archived Sessions never count — an archived row carries no live status
either.

**Working outranks finished.** A Workspace with a Session still running shows the
loader; the green dot appears once everything it owns is quiet, which is the order
the shipped row uses too. A fresh run in the same Session clears the dot again.

**The completion dot mirrors the shipped policy.** The flag is not in the catalog —
it is a process-local projection inside `dsh-client-ui-session`, reachable only
through its React hooks — so `completion.ts` rebuilds it from the one signal that
is: a `running` transition observed across snapshots. The rule is copied from that
package's own status projection: mark when a run goes `true → false` and the
Session is not the one on screen (`retainedBy.mainView > 0`); clear when it runs
again, is opened in the main column, or is archived; seed a first sighting without
marking anything. Two consequences are deliberate: a run that had already finished
when the plugin mounted raises no reminder, and **unfolding does not acknowledge** —
only opening the Session does, exactly as it clears the Session row's own dot.

**Only folded rows carry a mark, and only for their own Sessions.** An expanded
Workspace's rows each show their loader or dot where the work is, so its header
keeps its folder glyph. A nested Workspace never lights its parent: `eda_vm` (with
nothing running) stays a folder while `eda_vm/tangram` animates — fixed in 0.1.3,
where directory containment used to reach the parent. On hover the shipped rule
swaps the icon cell for the disclosure chevron, which hides the overlay with it.

**Both marks are the shipped artwork.** The loader copies `StateDot`'s geometry,
its two 1.5s keyframes, the 14px edge, the start-time pinning and the
reduced-motion fallback, in `--dsw-alias-label-tertiary`; the dot is that
component's solid `done` core, 6px in `--dsw-alias-state-success-primary`. All of it
is re-declared under this plugin's own class prefix, with no host component
imported. Pinning the phase is why a badge painted mid-run turns in step with the
Session rows' loaders instead of starting wherever it happened to mount.

![The plugin's loader beside the shipped Session loader](docs/images/loader-comparison.png)

*Left: the shipped Session loader. Right: this plugin's Workspace badge. Both are
rendered from the built bundle against the shipped sidebar stylesheet.*

## Requirements

- DeepSeek Harness **0.2.1-rc.3** (desktop or web UI) — the plugin reads markers of
  that release's sidebar.
- Node.js ≥ 22.17 and pnpm 11 to build from source.

## Installation

Build and pack from this repository:

```sh
pnpm install
pnpm check                       # typecheck · build · vitest
pnpm run pack                    # -> dist/dsh-workspace-running-indicator-0.2.0.tgz
```

Then, in the DeepSeek Harness desktop app, open **Settings → Plugins**, install
`dist/dsh-workspace-running-indicator-0.2.0.tgz`, and **restart the app**. A bundle
added to a running profile is not in the module resolution computed at boot, so its
entry fails to import until the next start. The web client additionally needs a
page reload after that restart.

## Usage

There is nothing to configure: fold a Workspace whose Session is working and its
folder glyph becomes the loader. When the run ends the loader becomes the green
dot, and the dot stays until you open that Session — or start it again. A nested
Workspace reports on its own row and never on its parent's, and an expanded
Workspace keeps its folder glyph because its Session rows already show both
marks.

## What it does not do

- No panel, no settings card, no host routes: the host half is inert and the
  browser half only paints one cell.
- It does not change the Session rows, the fold watermark, the group ordering or
  the collapse behaviour.
- The marks are decorative (`aria-hidden`); the row's accessible name is still the
  Workspace title, so a screen-reader user gets no "in progress" or "finished"
  announcement.
- The reminder is derived, not read: it is right about runs this page watched, and
  silent about runs that finished before it loaded.
- It keys off the row's own identity — `role="treeitem"`, `data-row-key`,
  `aria-expanded` — never a hashed CSS-module class. A future dsh that renames those
  markers makes the badge stop appearing (harmlessly), not misbehave.

## Development

```sh
pnpm install
pnpm check          # three tsconfigs, the loader bundle, then vitest
```

To see the package composed and served without touching the app's profile:

```sh
scripts/dev-profile.sh boot 19499     # isolated DSH home under .dev-home/
scripts/dev-profile.sh url 19499      # prints the served bundle URL
scripts/dev-profile.sh remove
```

## Verification

| Level | Result |
|---|---|
| Typecheck: host half, browser half, tests | clean |
| Built `lib/client.js` behind a fake `window.__ModuleLoader__` | registers under the package name, exports `apply` + `inject: ['sessions', 'workspaces']`, requests no module |
| Behaviour in jsdom against the built bundle | 27 cases: loader and dot in the icon cell, idle, expanded, Ungrouped, idle parent beside a running nested child, parent-only, both, subagent activity, external-child exclusion, archived Sessions, expand removes the mark, run start/end with the dot replacing the loader, dot cleared by opening the Session, dot restored by folding, fresh run supersedes, per-Workspace acknowledgement, re-mount, disposal, throwing store, unreadable snapshot |
| Completion policy, directly | 8 cases: seeding, unwatched completion, watched completion, later acknowledgement, supersede, archive, pending-vs-ready catalog, late row |
| Stylesheet | one tag, idempotent install, removable, theme tokens only, copied keyframes, reduced-motion, success token for the dot |
| Composition in an isolated dsh profile | the Loader row composed and the boot graph served the bundle (`/plugins/??dsh-workspace-running-indicator/client.js&rev=…` → 200) |
| Real engine | the built bundle driven in headless Chrome against the shipped row markup and styles: the folded busy row painted exactly one loader (0.1.2), the reported `eda_vm` / `eda_vm/tangram` shape left `eda_vm` untouched (0.1.3), and a real run transition in 0.2.0 reported `app=completed/dot=yes run=running/dot=no idle=none/dot=no` |
| Live GUI | confirmed in the desktop app after a restart |

The two screenshots are renders of the built bundle against the shipped sidebar
stylesheet, not captures of the running app.

## Files

```
src/
├── index.ts              # host half: the Loader row's inert entry point
└── client/
    ├── index.ts          # snapshots → states → observer → paint
    ├── activity.ts       # working ∪ finished-unviewed, per Workspace
    ├── completion.ts     # the shipped completion-reminder policy, mirrored
    ├── rows.ts           # the row/cell decorator and both overlays
    ├── styles.ts         # the rules for loader + dot, and the tag installer
    └── contract.ts       # the two snapshots, read structurally
test/
├── loader.ts             # the built bundle behind a fake module loader
├── fixture.ts            # the shipped row markup, as the plugin may read it
├── bundle.spec.ts        # loader id + exports
├── badge.spec.ts         # the behaviour in jsdom (27 cases)
├── completion.spec.ts    # the reminder policy on its own (8 cases)
└── styles.spec.ts        # install / eviction / tokens
scripts/
├── dev-profile.sh        # isolated dsh home for composition checks
└── install.sh            # pack, then print the install path
```

## Contributing

Issues and pull requests are welcome — the bug form asks which Workspace state you
saw, which is usually enough to reproduce. [CONTRIBUTING.md](.github/CONTRIBUTING.md)
has the commands and the map of what each spec pins. Report vulnerabilities through
[SECURITY.md](.github/SECURITY.md) rather than a public issue. This project follows
the [Contributor Covenant](.github/CODE_OF_CONDUCT.md).

> If this saves you from unfolding a Workspace just to see whether anything is
> happening, a ⭐ star helps other DSH users find it.

## License

MIT — see [LICENSE](LICENSE).
