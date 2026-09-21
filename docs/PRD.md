# ODD Ledger — VS Code extension for tracking Organic Driven Development work

ODD Ledger puts the state of Organic Driven Development (ODD) in the editor: an activity-bar icon opens a sidebar listing the features in the project, their tasks, and the evidence that closed each one.

**The extension reads the project's `odd/` folder directly.** That folder, and the git history of the files in it, is the only source. No external store, no database of its own, no memory service.

It is a **read-first ledger**, not an agent. It never runs the workflow, never commits, and never enables receipt-driven development.

## Evidence base

Every structural claim was verified against the five real ODD feature documents on this machine:

The documents belong to private projects, so they are referred to by letter. The survey is
reproducible by anyone against their own `odd/` folders.

| Document | Kind of project | Revisions in git |
|----------|-----------------|------------------|
| A | Rust CLI, packaging and QA work | 2 |
| B | documentation-only change | 1 |
| C | shell tooling, the largest document | 10 |
| D | mobile app, first of two features | 1 |
| E | same project as D, second feature | 1 |

Three findings govern the design:

**There is no template.** The ODD document format is described in prose, once, in `~/.claude/CLAUDE.md`. No skeleton, canonical example, or generator exists anywhere. Each document is an independent interpretation, which is why they diverge.

**Most contract fields are aspirational.** Fields the contract mandates appear in as few as one of five documents; the chain-strategy vocabulary appears in none. A parser built from the contract would find almost nothing. A parser built from the documents finds a small, reliable core.

**ODD has no archive, no phases, and no history of its own.** Those belong to other workflows. The interface below is built for what ODD actually produces.

## Folder layout

Verified identical in all four repositories:

```
<project-root>/
└── odd/
    └── tasks/
        ├── <feature-name>.md
        └── <feature-name>.md      ← flat; one project has two
```

`odd/` contains only `tasks/`. No index, no metadata file, no subdirectories, no archive folder. Every document is git-tracked. A project typically has one or two features, not dozens — which is why the interface below is a single view rather than a list plus a drill-down.

## Quick path

1. Open a repository that contains `odd/tasks/`.
2. Click the ODD Ledger icon in the activity bar.
3. The tree shows each feature, its sections, and its tasks.
4. Click a feature to open its detail panel; click a task to jump to its line.

## Document grammar

### What the parser can rely on

True in all five documents:

- One file per feature at `odd/tasks/<feature-name>.md`.
- An H1 title, then `## Objective`, `## Problem`, `## Constraints`, `## Tasks`, with Objective and Problem adjacent near the top.
- Task lines are **flat, single-level Markdown checkboxes**. No document nests a sub-task by indentation.
- Each task line carries a bare ID token immediately after the checkbox marker.
- Per-task detail and evidence is prose under the same list item.

### Task IDs

The observed format is uniformly `T<integer>` — `T1`, `T7`, `T13`. Never dotted, never zero-padded, unique only within a document.

The contract says only "stable task IDs" and never specifies a format, so `T<n>` is convention, not rule. The parser reads the first token after the checkbox as the ID and does not require it to match. A task line with no recognizable ID still renders, identified by position.

### Sections, not phases

**Tasks are flat. There is no `4.1`-under-`4` convention anywhere, and no indentation nesting anywhere.**

The one real grouping mechanism is **heading-scoped ID namespaces**: document C carries `T1..T13` under `## Tasks` and a separate `P1..P8` under `## Pending`. Two distinct sets, not one sequence.

So the tree is `feature → section → task`, where a section is **a heading that contains checklist items** — read from the document, never inferred. IDs scope per section, not per file: `T` is not guaranteed to be the only prefix.

Informal prose labels between runs of items (`Emerged while using it:`) group visually in the source but are not headings and create no tree node.

### Checkbox states

| Marker | State |
|--------|-------|
| `- [ ]` | open |
| `- [x]` | done |
| `- [~]` | observed in document C for a declined-but-recorded item; the contract does not define it |

`[~]` renders as `declined`, counted in the total but not as done. Any other marker renders as `unknown` and is reported, never silently dropped.

Derived on top: **`done-unproven`** — checked, with no evidence text and no commit reference in the item.

### Optional headings

None is guaranteed. Each is rendered when found, its region omitted when absent:

`## Scope` · `## Acceptance criteria` · `## Progress` or `## Progress notes` · `## Next step` · `## TDD mode` · `## Checks` · decision or findings narratives

Heading-name variants are matched by a small alias table, not exact string.

### Fields the extension must not depend on

| Field | Reality |
|-------|---------|
| Bold metadata block (`**Feature**`, `**Branch**`, `**Locator**`) | 1 of 5 |
| Per-task route declaration | 1 of 5 per task; 1 of 5 as one blanket sentence |
| Delivery strategy (`ask-on-risk`, `auto-chain`, `single-pr`, `exception-ok`) | 1 of 5 |
| Chain strategy (`stacked-to-main`, `feature-branch-chain`) | **0 of 5** |
| Line forecast and running count | 1 of 5 |
| Review tier and outcome | 1 of 5, as prose |
| Explicit start date | 1 of 5 |

Each renders as a region stating it was not found in this document, naming the field. Absence is displayed, never guessed and never blank.

## Interface

### Activity bar

A single icon labelled **ODD Ledger**, revealing one view.

### The view

One tree, not two panes. A project has one or two features; a separate overview list would be a header for two rows.

```
ODD LEDGER                                   [⟳] [▽] [···]
  checkout-service · 1 feature · 7/10

  ▾ ☰ rate-limit-hardening        7/10  ⚠1   feat/rate-…
    ▾ Tasks
        ☑ T1  Pin the retry ceiling to its single source
                4b7c1e9
        ☑ T2  Reuse the warm-up list in the scheduler
                9c1f204
        ⚠ T6  Document the signing step
                checked, no evidence recorded
        ☐ T8  Smoke-test the built artifact on a clean container
    → Next: run the packaging script end to end on a clean container
```

| Element | Behaviour |
|---------|-----------|
| Header line | Project name · feature count · combined task ratio |
| Toolbar | Refresh, filter, overflow |
| Filter | `All`, `Open`, `Unproven`. Not `Current`/`Archive` — ODD has no archive, on disk or in the contract |
| Empty state | `contributes.viewsWelcome`, the documented mechanism for a tree view with no children |
| Feature node | Name, `done/total`, an unproven-count badge when non-zero, and the branch when the document names one |
| Section node | One heading that contains checklist items. Shown even when there is only one, so its name stays visible |
| Task node | State icon, ID as written, title; the commit reference on a second line when the evidence names one |
| Next line | The document's `## Next step`, pinned as the last child of the feature. It is the single most useful line for resuming, so it is visible without opening anything |

A feature whose tasks are all closed sorts to the bottom and renders muted. That is as close to "archived" as ODD gets, and it is derived, not stored.

Clicking a task reveals it in the Markdown at its line. Clicking a feature opens the detail panel.

### Detail panel

Ordered by what ODD makes actionable: what to do next, what is not yet proven, then the substance, then the rest.

```
┌─────────────────────────────────────────────────────────┐
│ rate-limit-hardening                                    │
│ checkout-service · odd/tasks/rate-limit-…md · feat/ra…  │
│                                                         │
│ → NEXT STEP                                             │
│   Run the packaging script end to end on a clean        │
│   container, then record the result under T8.           │
│                                                         │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│ │ PROGRESS   │ │ UNPROVEN   │ │ LAST WORK  │            │
│ │ 7/10 · 70% │ │ 1 task     │ │ 2026-09-21 │            │
│ └────────────┘ └────────────┘ └────────────┘            │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ Objective                                               │
│ <objective and problem, rendered from the document>     │
│                                                         │
│ Tasks                                                   │
│ ☑ T1  Pin the retry ceiling to its source…              │
│       DONE 4b7c1e9                                      │
│ ⚠ T6  Document the signing step                         │
│       Checked, but the item records no evidence and no  │
│       commit. ODD treats a checkbox as no proof at all. │
│                                                         │
│ Constraints · Scope · Acceptance criteria · Checks      │
│ <each rendered when the document has it>                │
│                                                         │
│ Recorded by this document                               │
│ TDD          Strict, source: global config · cargo test │
│ Delivery     ask-on-risk                                │
│ Route        per task, recorded                         │
│ Line budget  not recorded                               │
│ Review       RDD high · lineage review-0316… · approved │
│                                                         │
│ History                                                 │
│ 2 revisions in git, 2026-09-20 to 2026-09-21.           │
└─────────────────────────────────────────────────────────┘
```

| Region | Content |
|--------|---------|
| Title | Feature name from the filename — H1 wording varies too much to use |
| Subtitle | Project · repo-relative path · branch when the document names one |
| Next step | Rendered first and prominently. ODD's resume protocol turns on this line |
| Tiles | `PROGRESS`, `UNPROVEN` (count of checked tasks with no evidence), `LAST WORK` (from git, since only one document records a date). Three tiles, not four — no `CREATED` tile, because four of five documents have no start date and an inferred one carries no meaning |
| Objective | Objective and problem, rendered as Markdown |
| Tasks | Every task with its evidence inline. An unproven task states what is missing, in ODD's own terms |
| Document sections | Constraints, Scope, Acceptance criteria, Checks, decision narratives — each rendered when present |
| Recorded by this document | A single table of the rare contract fields, each either its value or `not recorded`. One honest table instead of six empty regions |
| History | A sentence with the revision count and date range. A chart only when there are enough revisions to mean something |

### History — what git can honestly show

History is reconstructed from `git log --follow` over the document: each revision is one data point, its completion ratio recomputed by parsing that revision.

This is the only history that exists. No document records its own progress, and nothing outside `odd/` is consulted.

Measured on the real corpus: document C has 10 revisions, document A has 2, and the other three have 1. So one document plots meaningfully, one gives two points, three cannot be plotted.

The region therefore states the revision count and date range as a sentence by default, and draws a chart only above a threshold. Granularity is per commit: a commit closing four tasks is one step of four, and the caption says the axis is revision time, not working time.

### Absence convention

Anything not found is stated, named, and never guessed: a missing heading, an unrecorded field, a feature with no branch, a document with no history. Blank space and zeroes both lie.

### Theming

- VS Code theme tokens throughout; no hardcoded colours. The webview styles against the CSS
  variables VS Code injects and against the `body.vscode-light`, `body.vscode-dark` and
  `body.vscode-high-contrast` classes — all three categories.
- Codicons for all icons; the activity bar container takes a 24x24 SVG.
- Legible at a narrow sidebar width; the tile row wraps.

## Non-goals

- Executing, orchestrating, or automating the ODD protocol.
- Creating commits, branches, or pull requests.
- Enabling, disabling, or bypassing receipt-driven development, or rendering any review verdict.
- Normalizing, reformatting, or rewriting feature documents. They stay hand-editable; the extension never writes to them.
- Enforcing the ODD contract. A document missing mandated fields renders as it is, never flagged non-compliant — every real document would fail such a check.
- Reading anything outside the project's `odd/` folder and the git history of its files.

## Acceptance criteria

The five real documents are the test corpus.

- [ ] All five parse and render without error.
- [ ] Document C renders two section nodes, `Tasks` with `T*` and `Pending` with `P*`, IDs scoped per section.
- [ ] Its `- [~]` item renders as `declined`, counted in the total and not as done.
- [ ] Document D, which has no Scope, Progress, Next step, or Acceptance criteria heading, still renders its title, objective, and full task list — and shows no Next step line rather than an empty one.
- [ ] A checked task with no evidence and no commit reference renders as `done-unproven` and is counted in the `UNPROVEN` tile.
- [ ] The four documents with no line forecast show `not recorded` in the `Recorded by this document` table, not zero.
- [ ] The three single-revision documents state their revision count instead of drawing a chart.
- [ ] A task line whose first token is not `T<n>` still renders.
- [ ] The project holding documents D and E renders both features, with the fully-closed one sorted last and muted.
- [ ] A repository without `odd/tasks/` shows welcome content, not an error.
- [ ] The UI renders correctly in light, dark and high-contrast themes, and at a narrow sidebar width.

## Resolved decisions

| Question | Decision |
|----------|----------|
| Task grouping | Heading-scoped sections read from the document. No ID-prefix or indentation inference — neither exists in the corpus |
| Data source | The project's `odd/` folder, read directly, plus the git history of its files. Nothing else |
| Progress history | Reconstructed from git revisions; a sentence by default, a chart only when revisions justify one |
| Engram | Not used. It is not in the project folder, and the mirror does not hold what the contract claims |
| Archive | No archive exists in ODD. Completed features are derived, sorted last, and muted |
| Two panes or one | One tree. A project has one or two features |
| Project layout and testing | Microsoft's documented extension layout; `node --test` for the domain layer, `@vscode/test-cli` for the adapter layer |

## Next step

Break the work down into tasks. Implementation is not yet authorized by this document.
