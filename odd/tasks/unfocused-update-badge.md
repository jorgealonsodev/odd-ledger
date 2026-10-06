# Unfocused update badge

## Objective
Show a native activity-bar badge for automatic task-document updates received while the VS Code window is unfocused; clear it on refocus.

## Why and scope
Count distinct paths changed, created or deleted in odd/tasks/*.md since focus was lost, rather than noisy repeated saves. Manual refresh and workspace-folder-only refresh do not count. Existing tree/panel refresh behavior stays unchanged. Native theme controls badge color. No OS notifications, manifest changes, publishing or unrelated edits.

## Constraints
Branch: feat/unfocused-update-badge. Preserve existing untracked PRD.md and .vscode/settings.json. Single writer. Live-session YOLO standing permission subsequently enabled ordinary work-unit commits. No push or PR is needed for this task.

## Tasks
- [x] T1 — Implement and verify the unfocused update badge with deterministic tests and brief user documentation. Commit: `4fbbfc2`.
- [x] T2 — Clear the badge when the user actually sees the view instead of when the window regains focus. Commit: `5b61d1e`; released and installed as 1.3.2.

## T2 acceptance and checks
Accepted change after the badge proved invisible in practice: focus regain alone cleared it before the user could read it (proven by the T1 test at `src/adapter/update-badge.test.ts`). T1 behavior is superseded, not reverted; its counting rules stay.

- "Seen" means the window is focused **and** the Features view is visible; only that transition clears the badge and its pending paths.
- While not seen, distinct touched paths accumulate across watcher batches, whether the window is unfocused, the view is hidden, or both.
- Returning to a focused window with the view hidden keeps the badge visible until the view is opened.
- Updates arriving while the view is seen never create a badge.
- Subscribe and dispose the view-visibility listener alongside the existing focus listener.
- Test-first with deterministic tests; run type checks, domain and extension suites; native review before delivery.

## T1 acceptance and checks
- Updates while focused do not create a badge.
- While unfocused, distinct touched paths accumulate; repeated paths count once, empty batches do not increment.
- Initial unfocused state is respected, focus regain clears state and badge, next blur starts clean.
- Subscribe/dispose the window-state listener through extension lifecycle; retain existing refreshes.
- Test-first: observe RED then GREEN on deterministic logic/integration tests. Run type checks, domain suite and applicable extension tests; native review after normalization with user-owned RDD enabled.
- UI appearance requires manual VS Code check unless a runnable UI harness is available.

## Progress and evidence
Implemented distinct-path state, native badge adapter and lifecycle wiring; README documents behavior. Worker observed RED: three behavior tests failed against no-op implementation. GREEN: domain suite 488 passed, 3 opt-in corpus checks skipped. Extension tests 152 + 27 passed. Independent verifier repeated both suites and types successfully, found no blockers; git diff --check passed. Parent repeated npm run check-types and diff check successfully. Native four-lens review approved and exact acknowledgement burned authority for review-66df0df9e86dc3ee. Initial assessment was unassessable due to untracked declaration, so an independent verifier ran. An acknowledgement call with controller-only input was rejected without mutation; provider-directed retry without input completed successfully.

No manual visual/theme check or end-to-end watcher-to-badge assertion was performed. Deterministic adapter tests and structural wiring verification passed. Commit `4fbbfc2` contains behavior, tests and README; original unrelated untracked files remain untouched.

## T2 progress and evidence
Test-first observed: RED with the new-contract tests against a compile-only skeleton kept on the old focus-only clearing (domain 5 failing, adapter 5 failing, exactly the new behaviors). GREEN after implementation: domain 506 tests with 503 passing, 0 failing, 3 opt-in corpus checks skipped; extension 170 adapter-unit plus 27 workspace passing, 0 failing. Parent spot check repeated `npm run check-types` successfully and `git diff --check` clean.

Native review for this candidate did NOT complete: lineage `review-fa7774fa78a83433` started at high tier with four lenses, and the host relay failed with a model-provider safeguard error before any reviewer ran. No reviewer verdict exists and no authority was burned. That is a provider-side failure, not a finding against this code. An independent verifier was launched instead, per the risk-gated plan.

Packaged and installed at the user's explicit request: `dist/extension.js.map` was again left behind by the production build and was preserved as `out/extension.js.map.pre-package-132` before packaging. `odd-ledger-1.3.2.vsix` is 10 files / 152.52 KB, direct package tests 18 passed and 0 failed, and `code --list-extensions --show-versions` reports `jorgealonsodev.odd-ledger@1.3.2`.

Independent verification of commit `5b61d1e`: types clean, `git diff --check` clean, domain 506 tests with 503 passing and 3 opt-in skips, run twice with the same result, and a line-by-line confirmation of the seen contract, the distinct-path counting, both listener subscriptions and disposals, the `extension.ts` wiring and the untouched 1.3.0 grouping source. The verifier skipped the extension suite to avoid rebuilding a packaged `dist/`; the parent then ran it directly and observed 170 adapter-unit plus 27 workspace tests passing with exit 0, confirming the VSIX sha256 and the installed 1.3.2 were both unaffected.

Still unverified: the badge has never been observed visually in a running window. That remains the user's manual check.

## T3 — activate before the view is opened
Live observation disproved the assumption that the badge could work as shipped. With `"activationEvents": []` and a contributed view, VS Code activates this extension only when its Features view first becomes visible in that window, so no watcher runs beforehand and no badge can appear. Evidence, captured in a real window: after a reload with the view hidden, creating an `odd/tasks` document produced no badge while Source Control's own badge updated live; after opening the ODD Ledger view once and switching the sidebar away, a second new document produced the expected purple `1`. The badge logic was never at fault.

Fixed in commit `b40c309` by declaring `"activationEvents": ["onStartupFinished"]`, released as 1.3.3. Deliberately not `*`, so startup is not delayed; the trade-off is that the extension now activates in every window after startup. A structural test in `scripts/verify-package.test.js` asserts the event is declared and that `*` is not, observed failing before the change and passing after. Checks: types clean, domain 506 tests with 503 passing and 3 opt-in skips, extension 170 plus 27 passing, package suite 19 passing after a production build.

Verified live at last. With 1.3.3 loaded, the window reloaded, the sidebar left on the Explorer and the Features view never opened, creating an `odd/tasks` document produced the expected purple `1` on the activity-bar icon. The feature now does what it was asked to do.

One diagnosis along the way was wrong and is recorded so it is not repeated: installation was briefly reported as blocked because `~/.vscode/extensions/extensions.json` kept listing 1.3.2. That file is the default profile's registry. This workspace is bound to the named profile `Claude`, whose own registry lives at `~/.config/Code/User/profiles/-218ee8d6/extensions.json` and correctly listed 1.3.3. Read the profile's registry, not the global one, and never trust the CLI's success message alone.

## Next step
Nothing outstanding for this feature. The tree-collapsing request is tracked separately in `odd/tasks/collapsed-tree-default.md`. Push, pull request and publishing remain the user's decisions. A periodic polling fallback for missed watcher events remains an open user question, deliberately out of T2 scope. The incomplete native review may be retried on a later candidate. No push or PR performed.

## T1 closing note
Manual observation of T1 was never possible: the X11 smoke test never reached badge capture and was cancelled to stop interfering with the desktop, so no screenshot evidence exists. The invisibility was diagnosed from the implementation and its own tests, not from a captured image.
