# workspace-project-grouping — group features by project in multi-root workspaces

**Feature**: `workspace-project-grouping`
**Started**: 2026-09-30
**Branch**: `feat/workspace-project-grouping`
**Route**: Organic Driven Development (ODD). Not an SDD change.
**Engram mirror**: topic `odd/workspace-project-grouping/tasks`, project `odd-ledger`
**Locator**: `odd/tasks/workspace-project-grouping.md`
**Release target**: 1.3.0 (implementation authorized 2026-09-30; release/publication awaits the user's decision)

## Objective

In a multi-root workspace, the Features tree must show which project each ODD feature
belongs to, instead of one flat list that mixes every folder's features together.

## Problem

Observed on 1.2.2 with a multi-root workspace: `FeatureTreeDataProvider.discoverFeatures`
iterates every `vscode.workspace.workspaceFolders` entry, flattens every folder's feature
documents into one array, sorts them globally and renders them as root nodes. A feature from
project A sits next to one from project B with nothing telling them apart.

## Why

The user asked to "differentiate between projects": features from other projects were shown
together as if they were one ledger.

## Scope (authorized)

- When the workspace has two or more folders, the root of the tree is one project node per
  workspace folder that has at least one feature visible under the active filter, in
  `workspaceFolders` order. Label = the folder's `name`; tooltip = the folder's path;
  icon = `root-folder` theme icon; description = aggregate `done/total` across its visible
  features (plus ` · N unproven` when applicable); expanded by default;
  `contextValue = 'oddLedger.project'`. A project node has no click command.
- Each project node's children are that folder's features, ordered by the active sort mode
  exactly as today (sorting is per project, not global).
- With zero or one workspace folder the tree is unchanged: features stay at the root, no
  project node is ever shown (no wrapper for the common single-folder case).
- `FeatureNode.parent` becomes `ProjectNode | undefined`; `getParent` stays a one-line
  lookup; task → section → feature chains used by `open-task.ts` are unchanged.
- Filter, sort mode, refresh, the creation-date cache and the watcher keep their behaviour.
- Docs: README (tree section) and CHANGELOG entry for the next release.
- Out: version bump, tag, GitHub release and Marketplace publication (user decision).

## Constraints

- Hexagonal layout: anything vscode-free (grouping, aggregate counts) belongs in
  `src/domain/`; tree items in `src/adapter/`.
- No regression for single-folder workspaces; every existing test stays green.
- No new dependencies.

## TDD

- Mode: strict, ON. Source: user global config (`~/.claude/CLAUDE.md`, "Strict TDD Mode: enabled").
- Runner: `npm run test:domain`; `npm run test:extension` for adapter changes; `npm run check-types`.

## Delivery

- Forecast: ~300–450 authored changed lines. Strategy `ask-on-risk`; chain strategy cached
  from earlier features: `stacked-to-main`.
- RDD: on (global).

## Tasks

- [x] T1 Tree: project nodes per workspace folder in multi-root workspaces (domain grouping + `ProjectNode` + provider + tests), README and CHANGELOG alongside.
- [x] T1b Fix the three review-19126de87d96a1f6 advisories (test file only).
- [ ] T2 Release 1.3.0: version bump, merge, tag, GitHub release with vsix (awaits user authorization).

## Acceptance criteria

1. With two workspace folders that both hold `odd/tasks/*.md`, the root shows two project
   nodes named after the folders, each holding only its own features.
2. A folder without visible features shows no project node.
3. With one workspace folder the root is the flat feature list, byte-for-byte the same
   behaviour as 1.2.2.
4. Filter and sort mode apply within each project; `getParent(feature)` returns its project
   node in multi-root workspaces and `undefined` otherwise.
5. Clicking a task under a project still reveals it and opens the panel.
6. `npm run check-types`, `npm run test:domain` and `npm run test:extension` pass.

## Progress / evidence

| Task | Route + trigger | Commit | Checks | Review tier/outcome |
| --- | --- | --- | --- | --- |
| T1 | delegated writer (writer trigger: domain grouping, provider, tests, docs) | `bd3aa3e` (+docs `a6b88ec`) | RED: compile errors (missing `./group-features-by-project`, no exported `ProjectNode`, unknown `workspaceFolders` option), then GREEN check-types clean, test:domain 494 tests / 491 pass / 0 fail / 3 opt-in skips, test:extension adapter-unit 158 pass (10 new multi-root) + adapter-workspace 27 pass; parent spot check re-ran check-types and test:domain with the same result | assessed 9d6285c..a6b88ec: medium (executable change in tree tests), review_due=true (slice_budget_reached, 558 lines) → consent granted → lineage review-19126de87d96a1f6, 1 lens (review-reliability) → **approved**, acknowledged, authority burned; 3 SUGGESTION advisories (R3-001 root-down lookup coverage, R3-002 shadowed `roots` in tests, R3-003 fixture `index: 0`) → T1b |
| T1b | delegated writer (per-action worker; one test file, host tests take minutes) | `e65cf4c` | R3-001 new root-down test written first and observed passing (coverage addition, production unchanged); R3-002 locals renamed `rootNodes`; R3-003 fixture passes a real per-suite index; check-types clean, test:extension adapter-unit 159 pass + adapter-workspace 27 pass, 0 fail; parent spot check re-ran check-types clean | assessed a6b88ec..c8adc88: medium, review_due=false (under_budget, 65 lines); fixes the advisories of the approved review-19126de87d96a1f6 |

## Next step

T2 release 1.3.0 (user authorized on 2026-09-30).

Note: the writer added an injectable `workspaceFolders` provider option (defaults to `vscode.workspace.workspaceFolders`) so multi-root cases are unit-tested with real temp folders; no real multi-root host test was added because the harness opens a single fixture folder.
