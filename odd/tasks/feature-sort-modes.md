# feature-sort-modes — a user-selectable sort mode for the Features tree

**Feature**: `feature-sort-modes`
**Started**: 2026-09-24
**Branch**: `feat/feature-sort-modes`
**Route**: Organic Driven Development (ODD). Not an SDD change — no proposal/spec/design/tasks artifacts.
**Engram mirror**: topic `odd/feature-sort-modes/tasks`, project `odd-ledger`
**Locator**: `odd/tasks/feature-sort-modes.md`

## Objective

Let the user choose how the "ODD Ledger: Features" tree orders its root feature nodes: by
creation date (oldest first, the new default), by status (open first, closed last — today's
only behaviour), or by name. Persist the choice; keep items inside a feature in document order.

## Problem

`compareFeatures` in `src/domain/filter-and-order-features.ts` hardcodes status-then-name
ordering with no way to see, at a glance, which feature was started first — the one signal
git history already carries and the tree currently throws away.

## Why

The user asked for it directly; no further research needed. The existing git-invocation
pattern in `src/domain/fetch-git-revisions.ts` already proves execFile-based, no-shell git
reads are safe and already reviewed in this codebase, so creation-date lookup reuses that
safety pattern rather than inventing a new one.

## Scope

In scope: a `LedgerSortMode` domain type (`created` | `status` | `name`), pure comparators
and an `orderFeatures` orchestrator in `src/domain/filter-and-order-features.ts`; a
git-backed creation-date fetch (`src/domain/fetch-feature-creation-date.ts`) mirroring
`fetch-git-revisions.ts`'s execFile safety pattern; a non-blocking cache for those dates
(`src/domain/feature-creation-date-cache.ts`); wiring `FeatureTreeDataProvider` to use the
selected mode; a toolbar QuickPick command (`oddLedger.selectSortMode`) with a codicon,
mirroring how the three filter commands are declared and wired; persistence via
`context.globalState` (filters are not persisted today, so this establishes the pattern);
README documentation.

Out of scope: reordering items within a feature (unchanged, document order); a settings.json
contribution (README states "no settings" and that stays true — this is workspace-state, not
configuration); changing the existing filter behaviour.

## Constraints

- Decision logic (comparators, sort orchestration, caching policy) stays in `src/domain/`,
  pure or with an injected async dependency, tested with `node --test`. Only
  `FeatureTreeDataProvider`, `extension.ts` and `package.json` touch the VS Code API or the
  manifest.
- Git is invoked the same way `fetch-git-revisions.ts` already does: `execFile`, never a
  shell string, every argument its own array element, repo-local config keys neutralised,
  env vars that could redirect git's target deleted, bounded timeout and buffer. This module
  mirrors that pattern in its own file rather than importing from `fetch-git-revisions.ts`,
  to avoid risking a refactor of already-reviewed, already-tested code for an unrelated
  feature; the duplication is ~20 lines of constants.
- A document with no discoverable creation date (untracked, uncommitted, git unavailable)
  sorts after every dated document, ordered by name among themselves.
- The tree's `getChildren` stays synchronous — no architecture change to make it async.
  Creation dates are cached per document path; a cache miss returns "unknown" immediately
  (sorted last) and kicks off exactly one in-flight fetch per path, firing the tree's change
  event when it resolves so the view re-renders once the real date is known. A resolved date
  is cached permanently (a document's first commit does not move); "unknown" is retried on
  the next discovery pass, which is what makes a freshly committed document pick up its real
  date without a manual refresh.

## TDD mode

**Strict TDD: enabled.** Source: global operator configuration (`Strict TDD Mode: enabled`
in `~/.claude/CLAUDE.md`).
**Runner**: `npm run test:domain` (compiles then `node --test` under `out/domain`) for every
domain-layer task; `npm run test:extension` (`@vscode/test-cli` over two profiles, real
VS Code via Xvfb) for adapter coverage — confirmed available in this environment (Xvfb
present, baseline 23/23 passing before this feature's changes).

## Route

Delegated direct (writer trigger: 2+ non-trivial files — five new/changed source files plus
their tests, the manifest and the README).

## Delivery strategy

`ask-on-risk` (default). Forecast: roughly 500–700 authored changed lines including tests
across five source files, extension.ts wiring, package.json and README — a small feature,
tracked here per the ~400-line planning heuristic rather than as a hard cap.

## Tasks

- [x] S1 Create the feature branch and this tracking document.
      DONE — branch `feat/feature-sort-modes`, this file.

- [x] S2 Domain: `fetchFeatureCreationDate` — the git-backed creation-date read.
      `git log --follow --diff-filter=A --format=%aI -- <path>`, earliest parsed date, or
      `null` for no repo / no commits / not committed / unparsable output. Mirrors
      `fetch-git-revisions.ts`'s execFile safety pattern in its own module.
      Evidence: see Progress.

- [x] S3 Domain: `FeatureCreationDateCache` — non-blocking caching/retry policy.
      `.get(path)` is a synchronous read of whatever is cached (`undefined` = not known yet);
      `.ensure(repoRoot, path, onResolved)` starts at most one in-flight fetch per path,
      caches a resolved date permanently, and retries `null` results on the next call.
      Evidence: see Progress.

- [x] S4 Domain: sort modes in `filter-and-order-features.ts`.
      `LedgerSortMode`, `isLedgerSortMode`, `compareFeaturesByName`,
      `compareFeaturesByStatus` (== today's `compareFeatures`, kept as an alias so existing
      call sites and tests are untouched), `compareFeaturesByCreatedDate` (takes an injected
      `documentPath -> date | undefined` lookup), and `orderFeatures(models, mode, lookup?)`.
      Evidence: see Progress.

- [x] S5 Adapter: wire `FeatureTreeDataProvider` to the selected sort mode.
      Constructor takes optional `{ initialSortMode, persistSortMode, fetchCreationDate }`;
      `setSortMode`/`currentSortMode`; `discoverFeatures` calls `orderFeatures` with the
      cache's lookup and, in `created` mode, calls `creationDateCache.ensure` per discovered
      document so an unresolved date re-renders once known.
      Evidence: see Progress.

- [x] S6 Adapter + manifest: `oddLedger.selectSortMode` QuickPick command.
      New command with a `$(sort-precedence)` codicon, declared in `package.json`
      `contributes.commands`/`menus.view/title` next to the existing filter commands; wired
      in `extension.ts` to show a QuickPick of the three modes, call `provider.setSortMode`,
      and persist the choice to `context.globalState`, restoring it via
      `isLedgerSortMode` on activation (defaulting to `created`).
      Evidence: see Progress.

- [x] S7 README: document the sort modes and the new command.
      Evidence: see Progress.

- [x] S8 Final verification pass and doc closure.

- [x] S9 Correction from native review lineage `review-a02553d0e2e9bf37`: fix an
      endless refresh loop in `FeatureCreationDateCache.ensure` on a document git
      cannot date. Findings `R2-unknown-date-refetch-loop`, `R3-001`,
      `R4-refresh-loop-on-unknown-date` (one corroborated CRITICAL defect, three
      lens IDs). Evidence: see Progress.

## Acceptance criteria

- Default tree order (no stored preference) is `created`: oldest-first by first-commit
  author date, undated documents last by name.
- Selecting `status` reproduces exactly today's `compareFeatures` order.
- Selecting `name` orders purely alphabetically with the existing pinned collation.
- The choice persists across a simulated reload (globalState round-trip).
- Items inside a feature are unaffected (document order, unchanged code path).
- `npm run compile`, `npm run test:domain`, and `npm run test:extension` all pass.

## Progress / Evidence

- **S1** DONE. Branch `feat/feature-sort-modes`; this file created.

- **S2** DONE `d4cc363`. `src/domain/fetch-feature-creation-date.ts` +
  `fetch-feature-creation-date.test.ts` (6 tests, real temporary git repos, same discipline
  as `fetch-git-revisions.test.ts`). RED: `npm run compile` → `TS2307: Cannot find module
  './fetch-feature-creation-date'`. GREEN: `npm run test:domain` 287/287 (286 pass + 1
  opt-in skip), all 3 new "creation date" tests passing.

- **S3** DONE `9012d86`. `src/domain/feature-creation-date-cache.ts` +
  `feature-creation-date-cache.test.ts` (8 tests, fake injected fetcher, no real git/vscode).
  RED: `npm run compile` → `TS2307: Cannot find module './feature-creation-date-cache'`.
  GREEN: `npm run test:domain` 295/295 (294 pass + 1 skip).

- **S4** DONE `8ed2305`. `LedgerSortMode`, `isLedgerSortMode`, `compareFeaturesByName`,
  `compareFeaturesByStatus` (`compareFeatures` kept as its exact alias — `assert.equal
  (compareFeatures, compareFeaturesByStatus)` is itself one of the new tests), `compareFeaturesByCreatedDate`,
  `orderFeatures` added to `filter-and-order-features.ts` (+12 tests). RED: `npm run compile`
  → 5× `TS2305`/`TS2724` (missing exports) + 5× `TS7006` (implicit-any in new test params,
  resolved once `orderFeatures`'s real signature existed). GREEN: `npm run test:domain`
  307/307 (306 pass + 1 skip).

- **S5** DONE `3ca942c`. `FeatureTreeDataProvider` constructor gained
  `{ initialSortMode, persistSortMode, fetchCreationDate }`; `setSortMode`/`currentSortMode`;
  `discoverFeatures` now calls `orderFeatures` and, only in `created` mode,
  `creationDateCache.ensure` per document. Default `fetchCreationDate` is a no-op
  (`async () => null`) so constructing a provider never spawns git — production wiring
  (extension.ts, S6) supplies the real one. Two pre-existing workspace tests that asserted
  closed-last order now pin `initialSortMode: 'status'` explicitly, since the tree's default
  changed to `created`; confirmed by re-reading both before editing them (only 2 of 4
  order-sensitive `deepEqual` assertions in that file needed this — the other two remained
  correct by coincidence, since their remaining features happen to sort the same way
  alphabetically as by status).
  4 new unit tests (`feature-tree-provider.test.ts`) + 6 new workspace tests
  (`feature-tree-provider.workspace-test.ts`, real fixture, fake injected `fetchCreationDate`
  — never real git against this repository's own history, matching this codebase's existing
  discipline).
  **Process note (honesty over a clean narrative):** for this task the new adapter tests and
  the implementation were written across several `Edit` calls without pausing after each
  test-only edit to run `npm run compile` and observe an isolated failure, unlike S2–S4. The
  unit tests in `feature-tree-provider.test.ts` were written before the corresponding
  constructor/method existed (referencing `currentSortMode`/`setSortMode`/`initialSortMode`
  not yet defined), so they were RED-eligible in substance; the workspace tests were added
  after the provider changes were already in place. No RED was actually captured for the
  workspace-test additions. GREEN was verified for the whole task: `npm run test:domain`
  307/307 unaffected; `npm run test:extension` 121→125→126 (adapter-unit, unaffected by S5
  itself) and 23→27 (adapter-workspace) passing, 0 failing.
  A real bug was caught and fixed before commit: an early draft of the
  `setSortMode("created") after discovery` test counted `setSortMode`'s own synchronous
  change-event fire toward the 3 expected async fetch-completion fires, which could resolve
  the wait one fetch early; fixed by registering the listener after the mode switch and the
  discovery call that starts the fetches, not before.

- **S6** DONE `517af30`. `src/adapter/sort-mode-state.ts` (+4 tests) for globalState
  read/write, validated through `isLedgerSortMode`. `oddLedger.selectSortMode` QuickPick
  command wired in `extension.ts`, `$(sort-precedence)` codicon declared in `package.json`
  next to the three filter commands. RED (`sort-mode-state`): `npm run compile` →
  `TS2307: Cannot find module './sort-mode-state'`. GREEN: `npm run test:extension`
  125 passing (adapter-unit).
  **Process note:** the first draft of `sort-mode-state.test.ts` imported `test` from
  `node:test`, the convention `src/domain/*.test.ts` uses — wrong for `src/adapter/`, which
  runs under `@vscode/test-cli`/Mocha and expects the global `suite`/`test` (no import), the
  convention every other file under `src/adapter/` already follows. The mistake was caught
  because the adapter-unit pass count stayed at 121 after adding 4 new tests that still
  individually printed `✔` (registered with node:test's own default runner, invisible to
  Mocha's summary) — corrected before commit; the corrected version raised the count to 125
  as expected. The `oddLedger.selectSortMode` command registration test
  (`extension-activation.test.ts`) was added alongside the implementation, not before it —
  same precedent as this codebase's other command-registration checks (e.g. `refresh`,
  `openFeature`), and consistent with the fact that the three existing filter commands have
  no dedicated tests at all; the QuickPick's own interactive behaviour is not covered by an
  automated test for the same reason.

- **S7** DONE `2162d4a`. README: new "Sort" row in the features table, new command row, and
  a "Limits worth knowing" bullet noting `Created` needs git the same way History does.

- **S8** DONE. Final verification (see Verification below).

- **S9** DONE `8bb7c2a`. Native review lineage `review-a02553d0e2e9bf37` returned
  `correction_required` with one corroborated CRITICAL defect across three lens IDs:
  `R2-unknown-date-refetch-loop`, `R3-001`, `R4-refresh-loop-on-unknown-date`.
  `FeatureCreationDateCache.ensure` called `onResolved` in `finally` even when the fetch
  returned `null` or rejected, and never remembered a `null` outcome — the provider wires
  `onResolved` to `changeEmitter.fire()`, so VS Code's re-query of `getChildren` restarted the
  fetch and fired again, spinning forever whenever git is missing, the folder is not a repo, a
  document is uncommitted, or git times out.

  Fix: `known` (permanent, resolved dates) is now joined by an `unresolved` set (paths that
  settled with `null` or rejected) — `ensure` skips both, and calls `onResolved` only when a
  fetch actually finds a date. `invalidateUnresolved()` clears the `unresolved` set; it is
  called from `FeatureTreeDataProvider.refresh()` (the manual refresh command and every
  watcher-triggered rebuild), the one existing hook that already runs on both a user refresh
  and a document change, so a document committed after an unresolved settle is re-checked on
  the next refresh rather than never or on every redraw. Doc comments in
  `feature-creation-date-cache.ts` and `feature-tree-provider.ts`, and README.md's `Created`
  sort bullet, updated to describe this.

  RED: `npm run compile` → `TS2339: Property 'invalidateUnresolved' does not exist on type
  'FeatureCreationDateCache'` (tests written first, against the not-yet-existing method and
  the not-yet-changed `ensure` contract).
  GREEN: `npm run test:domain` 309/309 (308 pass + 1 opt-in skip) — 4 tests added/rewritten in
  `feature-creation-date-cache.test.ts`: a null result does not call `onResolved`; a rejected
  fetch does not call `onResolved`; a second `ensure()` for a settled-`null` path does not
  refetch; `invalidateUnresolved()` lets it fetch again. The two pre-existing tests that
  asserted the old "null is retried on the very next call" / "onResolved still fires on
  rejection" contract were rewritten to the new one, per this task's instructions.
  `npm run test:extension`: adapter-unit 126/126, adapter-workspace 27/27, 0 failing (both
  profiles unaffected — no workspace-level test exercises this path yet).

  Authored changed lines (`git show --shortstat 8bb7c2a`): see Verification.

## Verification

- `npm run compile`: clean, no errors.
- `npm run test:domain`: 307 tests, 306 pass, 1 skipped (the opt-in real-corpus check,
  skipped because `ODD_LEDGER_REAL_CORPUS_DIR` is unset — expected on this and every other
  machine without that variable), 0 failing.
- `npm run lint`: **not defined** in `package.json` (`grep '"lint"' package.json` — no
  match); this project has no lint script. Running `npm run lint` anyway exits non-zero with
  an unrelated environment-level message ("ESLint output (JSON parse failed...)"), not a real
  project lint result — reported honestly rather than treated as a check outcome.
- `npm run test:extension`: both `@vscode/test-cli` profiles green — adapter-unit 126
  passing (0 failing), adapter-workspace 27 passing (0 failing). Confirmed available in this
  environment (Xvfb present); baseline before this feature was 23/23 in the workspace
  profile.
- `npm run check-types` and `npm run bundle`: both clean (run once at S6 close as an extra
  sanity check beyond the four requested commands, since this feature added new production
  imports to `extension.ts`).

Authored changed lines (`git diff --shortstat main...HEAD`, excluding `out/`/`dist/`, which
are gitignored and not part of the diff regardless): **1039 insertions, 21 deletions across
15 files** — over the ~500–700 line forecast, mostly doc comments and tests at this
codebase's existing density (every new module carries the same depth of doc comment as
`fetch-git-revisions.ts`/`run-open-feature-fetch.ts`), not scope creep. Still comfortably
under the ~400-line-per-task heuristic's total for 6 implementation tasks and requires no
mid-feature chain-strategy decision; delivery (push, PR) remains the user's decision under
ordinary repository policy and was explicitly out of scope for this work.

**S9 (correction)**: `npm run compile` clean; `npm run test:domain` 309 tests, 308 pass, 1
skipped (same opt-in check), 0 failing; `npm run test:extension` adapter-unit 126 passing,
adapter-workspace 27 passing, 0 failing. Authored changed lines of the fix commit
(`git show --shortstat 8bb7c2a`): `4 files changed, 101 insertions(+), 32 deletions(-)`.

## Next step

Feature complete on `feat/feature-sort-modes`, 7 commits ahead of `main` (S1-S8 plus this
correction), not pushed. Next step is the user's: review the branch and decide push/PR.
