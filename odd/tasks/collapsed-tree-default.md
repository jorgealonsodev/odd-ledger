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
- [ ] T1 — Collapse every branch by default and expand only those containing unfinished tasks, with deterministic tests and documentation.

## Acceptance and checks
- A feature whose tasks are all finished renders collapsed.
- A feature holding at least one unfinished task renders expanded, and so does each ancestor needed to reach it.
- A section with no unfinished task stays collapsed even inside an expanded feature.
- An expanded branch still lists all of its tasks, finished ones included.
- A feature with no tasks at all stays collapsed rather than defaulting to expanded.
- The existing filters, sort modes and detail panel behaviour are unchanged; the user's manual expand and collapse still work afterwards.
- Test-first against the tree provider's collapsible-state logic; run type checks, the domain suite and the extension suite. Native review before delivery.

## Open questions
Whether the computed expansion should be reapplied after a watcher refresh or only on first render is unresolved; decide it from the tree provider's existing refresh behaviour during implementation, and record the choice here.

## Next step
Start after the badge activation fix is delivered, so the two changes stay separately reviewable.
