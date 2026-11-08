# dsh-workspace-running-indicator

A folded Workspace in DeepSeek Harness's sidebar hides every Session inside it, so
the row looks identical whether a Session there is waiting for your answer, three
turns are running, a turn finished and nobody has looked at it, or nothing has
happened for a week. This plugin puts the row's own marks back on the Workspace:
the **yellow waiting dot** a Session row draws while a question, approval or plan
review waits for the user, the **in-progress** loader it draws while it is
working, and the **green dot** it draws when a run finished unviewed.

Tested against **dsh 0.2.2-rc.1** (desktop and web UI).

```
Workspaces
  ◉ app                     ← folded, a session inside is waiting for an answer
  ◐ dsh-plugins             ← folded, a session inside is working
  ● records                 ← folded, a run finished and nobody opened it
  ▢ ic_decryptor            ← folded, nothing to report
  ▾ research                ← expanded: its session rows carry their own marks
      ● literature review
      ◐ chip bring-up
```

## Why this is a plugin and not a setting

`dsh-client-ui-workspace` renders each Workspace header as one tree item and
declares **no seat on it**: `sidebar.session.row.leading` is a per-*Session* row
cell, and `sidebar.workspaces` is a single occupied seat holding the whole
browser. The header's own logic is why the glyph does not change — a collapsed
group renders `sessions: []`, so there is no status to aggregate, and the status
dot is only ever drawn on a Session row.

Replacing `sidebar.workspaces` would mean owning the browser's grouping, nesting,
ordering, search, drag-and-drop and menus for one glyph. This plugin instead
decorates the single cell it needs, from the page side:

| Step | What happens |
|---|---|
| 1 | read `ctx.sessions.list` (the live Session catalog), `ctx.workspaces.list` (the Workspace projection) and `ctx.uiSession.sessionStatus` (the unified per-Session status) |
| 2 | derive what each Workspace has to report: **waiting** (a member Session with a pending `approval`, `plan-review` or `question`), **working** (a member Session with `running`, or a running direct subagent) or **finished-unviewed** (a member Session whose run ended unwatched) |
| 3 | keep membership the only key: a row reports for its own accounted Sessions, never for a nested Workspace's |
| 4 | for every row that is `role="treeitem"`, keyed `workspace:<id>`, and `aria-expanded="false"`, overlay the matching mark — the yellow waiting dot, the loader or the green dot — in the 16×20 icon cell |
| 5 | keep it that way through a `MutationObserver` on the list (`role="tree"`) — folding, expanding, re-mounts, new Workspaces |

**Why the catalog is the right source.** `ctx.sessions.list.byId[id].running` is
the Host's live run state, delivered on every status change; it is exactly the
fallback `ui-workspace` itself applies to a row whose live status has not been
loaded yet. A folded group therefore asks the same question its expanded rows
already ask.

**Why the status projection is the right source for waiting.** The yellow dot is
not a catalog fact: `dsh-client-ui-session` holds pending interactions in a
process-local projection and the shipped row draws `StateDot` `warning` from it.
`ctx.uiSession.sessionStatus` is that projection's public read face, so the
plugin selects exactly the kinds `ui-workspace` selects — `approval`,
`plan-review`, `question` — and ignores anything else, including a forged kind. A
shell composing no Session UI simply has no status source; the two catalog-derived
marks still work.

**Waiting outranks working, and working outranks finished.** The shipped row
orders its status marks pending interaction → `ongoing` → `done`, and a folded
Workspace answers with the mark its most urgent Session row would draw. A fresh
run in the same Session clears the green dot; answering a pending question hands
the row back to whichever mark is underneath.

**The completion reminder mirrors the shipped policy.** The green flag is not in
the catalog — it is a process-local projection inside `dsh-client-ui-session`,
reachable only through its React hooks — so `completion.ts` rebuilds it from the
one signal that is: a `running` transition observed across snapshots. The rule is
copied from that package's own status projection, line for line: mark when a run
goes `true → false` and the Session is not the one on screen
(`retainedBy.mainView > 0`), clear when it runs again, when it is opened in the
main column, or when it is archived, and seed a first sighting without marking
anything. Two consequences are deliberate: a run that had already finished when
the plugin mounted raises no reminder, and **unfolding does not acknowledge** —
only opening the Session does, exactly as it clears the Session row's own dot.

**Only folded rows carry a mark.** An expanded Workspace's Session rows each show
their own loader or dot where the work actually is, so its header is not carrying
information — the folder glyph stays. On hover the shipped rule swaps the whole
icon cell for the disclosure chevron, which hides the overlay with it.

**All three marks are the shipped artwork.** The loader copies `StateDot`'s
geometry, its two 1.5s keyframes (`dsh-wsr-spin`, `dsh-wsr-dash`), the 14px edge,
the start-time pinning and the reduced-motion fallback, in
`--dsw-alias-label-tertiary`. Both dots are that component's solid 6px core: the
waiting dot in `--dsw-alias-state-warn-primary`, the completion dot in
`--dsw-alias-state-success-primary`. All of it is re-declared under this plugin's
own class prefix, with no host component imported. Pinning the phase is why a
badge painted mid-run turns in step with the Session rows' own loaders instead of
starting wherever it happened to mount.

## What it does not do

- No panel, no settings card, no host routes: the host half is inert and the
  browser half only paints one cell.
- The reminder is derived, not read: it is right about runs this page watched and
  silent about runs that finished before it loaded. The waiting dot, by contrast,
  is read straight from `dsh-client-ui-session`'s status projection.
- It does not change the Session rows, the fold watermark, the group ordering or
  the collapse behaviour.
- It does not propagate a direct subagent's pending interaction to its parent
  Workspace: the shipped parent row adopts a running child's loader but never its
  pending mark, and the answer belongs to the child's conversation.
- The marks are decorative (`aria-hidden`); the row's accessible name is still the
  Workspace title, so a screen-reader user gets no "waiting", "in progress" or
  "finished" announcement.
- It keys off the row's own identity — `role="treeitem"`, `data-row-key`,
  `aria-expanded` — never a hashed CSS-module class. A future dsh that renames
  those markers makes the badge stop appearing (harmlessly), not misbehave.

## Install

```sh
pnpm install
pnpm check                      # typecheck three projects, build, vitest
pnpm run pack                   # -> dist/dsh-workspace-running-indicator-0.3.1.tgz
```

The desktop profile is owned by the Electron application, so `dsh plugin add`
refuses it. Install the packed tarball from **Settings → Plugins**, then
**restart the app** — a bundle added to a running profile is not in the module
resolution computed at boot, so its entry fails to import until the next start.

## Verification

| Level | Result |
|---|---|
| Typecheck (host half, browser half, tests) | clean |
| Built `lib/client.js` behind a fake `window.__ModuleLoader__` | registers under `dsh-workspace-running-indicator`, exports `apply` + `inject: ['sessions', 'workspaces', 'uiSession']`, requests no module |
| Behaviour in jsdom against the built bundle | 40 cases: the loader, the green dot and the yellow waiting dot in the icon cell; waiting/approval/plan-review kinds; unknown kind ignored; waiting over running over done; answering hands the row back; idle, expanded, Ungrouped; idle parent beside a running nested child; parent-only; both; subagent activity and its pending exclusion; external-child exclusion; archived Sessions (running and waiting); expand removes the mark; run start/end with the dot replacing the loader; dot cleared by opening the Session; dot restored by folding; fresh run supersedes; per-Workspace acknowledgement; re-mount; disposal; throwing store; unreadable snapshots; unreadable status projection |
| Completion policy, directly | 8 cases: seeding, unwatched completion, watched completion, later acknowledgement, supersede, archive, pending-vs-ready catalog, late row |
| Stylesheet | one tag, idempotent install, removable, tokens only, copied keyframes, reduced-motion, success and warning tokens for the two dots |
| Isolated dsh profile (`scripts/dev-profile.sh`) | the row composes (`- id: dsh-workspace-running-indicator`) and the boot graph serves the bundle at `/plugins/??dsh-workspace-running-indicator/client.js&rev=…` (200, exact artifact) |
| Live GUI | **not performed** — the tarball is installed in the desktop profile; confirm after the restart (fold a Workspace whose session is working, and one whose session asks a question) |

## License

MIT
