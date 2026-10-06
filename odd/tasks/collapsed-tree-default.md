# Collapsed tree by default

## Objective
Open the Features tree collapsed, expanding only the branches that still hold unfinished tasks, so what is left to do is what you see first.

## Why
A fully expanded ledger buries the remaining work: a finished feature with 24 done tasks takes as much room as the one task still open. Collapsing by default and revealing only the unfinished branches makes the open work the default reading.

## Scope
Expansion state only. Within a branch that expands, every task stays visible, finished and unfinished alike. This does not filter anything and does not change the existing `All` / `Open` / `Unproven` toolbar filters, the sort modes, or the detail panel. The user chose this over hiding finished tasks inside expanded branches, because that overlaps with the existing `Open` filter.

## Constraints
Branch `feat/unfocused-update-badge` currently carries the badge work; this feature starts from whatever baseline is current when it begins. Preserve untracked `PRD.md` and `.vscode/settings.json`. Single writer. Work-unit commits are authorized for this session; push, PR and publishing are not.

## Tasks
- [x] T1 — Collapse every branch by default and expand only those containing unfinished tasks, with deterministic tests and documentation. Commit: `50ddb55`; released and installed as 1.3.4.

## Acceptance and checks
- A feature whose tasks are all finished renders collapsed.
- A feature holding at least one unfinished task renders expanded, and so does each ancestor needed to reach it.
- A section with no unfinished task stays collapsed even inside an expanded feature.
- An expanded branch still lists all of its tasks, finished ones included.
- A feature with no tasks at all stays collapsed rather than defaulting to expanded.
- The existing filters, sort modes and detail panel behaviour are unchanged; the user's manual expand and collapse still work afterwards.
- Test-first against the tree provider's collapsible-state logic; run type checks, the domain suite and the extension suite. Native review before delivery.

## Decided during exploration
Unfinished reuses the existing admission rule instead of a parallel one: `isSectionClosed` and `isFeatureClosed` in `src/domain/filter-and-order-features.ts`, the same functions behind the `Open` filter. So `open`, `declined` and `unknown` count as unfinished, and `done-unproven` counts as done. A project expands when any of its features is not closed.

The three container types that hard-code `vscode.TreeItemCollapsibleState.Expanded` today are `ProjectNode` (`src/adapter/feature-tree-provider.ts:160`), `FeatureNode` (`:190`) and `SectionNode` (`:238`). `TaskNode` and `NextStepNode` are leaves and stay leaves. A container with nothing unfinished becomes `Collapsed`, never `None`, so it can still be opened by hand.

## Answered: refresh and persisted state
VS Code applies the computed state only to a node it has not rendered before. Nodes carry no `id`, so identity is the label under the parent; `refresh()` fires `onDidChangeTreeData` with no argument, and `AsyncDataTree.setChildren` reuses a known node's collapsed state. A node's remembered expansion therefore wins over the computed default, which is why a manual expand or collapse survives a refresh. This was read from the shipped VS Code 1.140.0 source, then corroborated live.

Live observation after installing 1.3.4: every finished feature rendered collapsed and the unfinished `collapsed-tree-default` rendered expanded down to its open task, exactly as asked. One exception appeared: `workspace-project-grouping` rendered collapsed although it holds an open `T2`. The logic is not at fault — a probe over the real documents returns `featureHoldsUnfinishedWork: true` for it and `false` for `ledger-view-v1` — so that node's remembered state is overriding the default. Forcing it would mean overriding a choice the user made by hand, which is not obviously better; left as observed rather than silently changed.

## Progress and evidence
The adapter only maps a boolean to a collapsible state; the rule lives in `src/domain/filter-and-order-features.ts` as `sectionHoldsUnfinishedWork`, `featureHoldsUnfinishedWork` and `projectHoldsUnfinishedWork`, all built on the `Open` filter's own `admits('open', …)` rule. These deliberately ask "is any item unfinished" rather than `!isClosed`, because `isFeatureClosed` and `isSectionClosed` report `false` for zero items, which would have expanded empty containers.

Test-first: worker observed RED with 5 adapter assertion failures on `collapsibleState` plus a compile-level RED in the domain, then GREEN. Final checks: types clean, domain 516 tests with 513 passing and 3 opt-in skips, extension 179 plus 27 passing, `git diff --check` clean. The parent independently re-ran the type check and the domain suite with identical counts. Native review `review-28477e9a9217eeab` was approved at medium tier after user consent, with three non-blocking informational findings, and its acknowledgement burned the authority. Packaged as `odd-ledger-1.3.4.vsix` with 19 of 19 package tests passing, and the `Claude` profile registry confirms 1.3.4.

## Next step
Start after the badge activation fix is delivered, so the two changes stay separately reviewable.
