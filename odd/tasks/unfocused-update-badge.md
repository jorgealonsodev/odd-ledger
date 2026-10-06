# Unfocused update badge

## Objective
Show a native activity-bar badge for automatic task-document updates received while the VS Code window is unfocused; clear it on refocus.

## Why and scope
Count distinct paths changed, created or deleted in odd/tasks/*.md since focus was lost, rather than noisy repeated saves. Manual refresh and workspace-folder-only refresh do not count. Existing tree/panel refresh behavior stays unchanged. Native theme controls badge color. No OS notifications, manifest changes, publishing or unrelated edits.

## Constraints
Branch: feat/unfocused-update-badge. Preserve existing untracked PRD.md and .vscode/settings.json. Single writer. Live-session YOLO standing permission subsequently enabled ordinary work-unit commits. No push or PR is needed for this task.

## Tasks
- [x] T1 — Implement and verify the unfocused update badge with deterministic tests and brief user documentation. Commit: `4fbbfc2`.
- [ ] T2 — Clear the badge when the user actually sees the view instead of when the window regains focus. **In progress.**

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

## Next step
Deliver T2, then repackage and reinstall so the badge can finally be observed. A periodic polling fallback for missed watcher events remains an open user question, deliberately out of T2 scope. No push or PR performed.

## T1 closing note
Manual observation of T1 was never possible: the X11 smoke test never reached badge capture and was cancelled to stop interfering with the desktop, so no screenshot evidence exists. The invisibility was diagnosed from the implementation and its own tests, not from a captured image.
