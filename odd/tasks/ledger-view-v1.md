# ledger-view-v1 — read-only ODD ledger in the VS Code sidebar

**Feature**: `ledger-view-v1`
**Started**: 2026-09-21
**Branch**: `feat/ledger-view-v1` (to be created; never commit this work on `main`)
**Route**: Organic Driven Development (ODD). Not an SDD change — no proposal/spec/design/tasks artifacts.
**Engram mirror**: topic `odd/ledger-view-v1/tasks`
**Locator**: `odd/tasks/ledger-view-v1.md`
**Specification**: `docs/PRD.md` (270 lines), written from a verified survey of the five real ODD documents on this machine.

## Objective

Ship a VS Code extension that reads the project's `odd/` folder and renders, in one sidebar tree plus a detail panel, every ODD feature, its sections, its tasks, the evidence that closed each one, and the next step.

## Problem

ODD state is spread across a Markdown document and git history, and a developer reconciles it by hand in a terminal while working. Worse, a `- [x]` in the document proves nothing on its own: the contract is explicit that a checkbox grants no approval and no receipt. Nothing today makes the gap between "checked" and "proven" visible.

## Why

Two facts from the survey make this worth building rather than assuming:

1. The ODD document format has **no template anywhere** — it is prose in `~/.claude/CLAUDE.md`, interpreted independently by each document. A reader that tolerates that variance is the product.
2. Contract-mandated fields appear in as few as **one of five** real documents, and the chain-strategy vocabulary in **none**. Anything built on the contract rather than the corpus would render empty.

## Scope

In scope: document discovery, a tolerant parser, the tree view, the detail panel, git-derived history, theming, and packaging.

Out of scope, and already recorded as non-goals in the PRD: running or automating ODD, writing to feature documents, creating commits or branches, touching receipt-driven development, reading anything outside `odd/` and the git history of its files, and enforcing contract compliance.

## Constraints

- **Read-only.** The extension never writes to a feature document, never normalizes it, never commits.
- **No fixtures from the real corpus.** The five surveyed documents belong to private projects and are referred to by letter, A to E. Test fixtures are synthetic documents that reproduce the grammar variety — flat `T<n>` IDs, a second `P<n>` namespace under a different heading, a `- [~]` item, missing optional headings, an unrecognized ID token — without carrying any real project content. No real document, name, path or excerpt enters this repository.
- **Absence is displayed, never guessed.** Missing headings, unrecorded fields, absent history: each states what was not found. Blank space and zeroes both lie.
- **Theme tokens only.** No hardcoded colours. VS Code exposes theme colors as CSS variables in
  webviews and sets `body.vscode-light`, `body.vscode-dark` and `body.vscode-high-contrast`.
  All three categories must render, not just light and dark.
- **The domain layer imports nothing from `vscode`.** Discovery, parsing and derivation are plain
  TypeScript over strings and paths. Only the adapter layer — providers, panel, commands — touches
  the extension API. This is what makes strict TDD affordable: the domain is unit-tested without
  launching an editor, and the previous attempt's fight to stub the `vscode` module disappears.
- The extension must render all five real documents without error. That is verified locally against the real files, which are never copied into this repository.

## TDD mode

**Strict TDD: enabled.** Source: global operator configuration (`Strict TDD Mode: enabled` in `~/.claude/CLAUDE.md`).

**Runner: resolved from Microsoft's official convention** (VS Code Extension API docs, retrieved
2026-09-21), in two layers that follow the boundary above:

| Layer | Runner | Why |
|-------|--------|-----|
| Domain — discovery, parser, derivation | `tsc` to `out/` then `node --test` | No `vscode` import, so no editor to launch. Fast enough for a RED/GREEN cycle per task |
| Adapter — views, panel, commands | `@vscode/test-cli` (Mocha under the hood), configured in `.vscode-test.mjs` | The documented way to test an extension; `@vscode/test-electron` stays available for lower-level control |

The docs are explicit that test code is compiled separately with `tsc` and excluded from the
production bundle, so this split is the convention rather than a deviation from it.

## Delivery

**Strategy**: `ask-on-risk` (default).
**Forecast**: roughly 2,800 authored changed lines including tests — well above one 400-line slice, so a chain strategy will be requested before the running count crosses the budget. Chain strategy: not yet resolved.
**Running count**: 0.

## Tasks

- [x] T1 Bootstrap the project to Microsoft's extension layout
      The documented structure: `package.json` manifest with `engines.vscode`, `main`, and
      `activationEvents: []` (commands self-activate since 1.74); `tsconfig.json`;
      `src/extension.ts` exporting `activate`/`deactivate` with disposables pushed to
      `context.subscriptions`; `.vscode/launch.json` and `tasks.json`; `.gitignore`; `README.md`.
      Plus esbuild bundling with `vscode` marked external, `.vscode-test.mjs`, and both test
      layers wired with one smoke test each, observed failing then passing.
      Route: delegated writer (many files, but all already-understood scaffolding).
      DONE `f99f508`, corrected by `9319d6d`, CI in `13ab521`.
      Evidence: `npm run check-types` clean; `npm run test:domain` 7/7 pass;
      `npm run bundle` exit 0; `npm run test:extension` 1 passing; `dist/extension.js`
      exports `activate` as a function; `grep` over `src/domain/` for a `vscode` import
      returns clean. RED observed before each: `TS2307: Cannot find module
      './feature-document'` for the domain layer, and an `AssertionError` on a
      deliberately wrong extension id for the adapter layer.
      Review: RDD assess over `8d2c859..f99f508` returned risk **medium**
      (`slice_budget_reached`, an executable change in `.vscode-test.mjs`). Consent
      granted by the user. Lineage `review-f49235a75681f569`, one lens
      (`review-reliability`), one CRITICAL candidate-caused finding
      (`R3-domain-suite-glob`), one bounded correction inside a 2-line budget,
      targeted validation passed, **approved and acknowledged, authority burned**.
      Six advisory findings were recorded as non-blocking; they are follow-up work.

- [ ] T2 Discover feature documents
      Find `odd/tasks/*.md` in the workspace; handle a workspace with no `odd/`, with an
      empty `tasks/`, and with more than one feature file.
      Route: delegated writer (source + tests).

- [ ] T3 Parse document structure
      H1, the four headings present in every document, and the optional ones through an
      alias table (`Progress` / `Progress notes`, `Constraints` / `Checks`, decision and
      findings narratives). An unrecognized heading is preserved, never dropped.
      Route: delegated writer.

- [ ] T4 Parse the checklist
      Heading-scoped sections; the first token after the marker as the task ID without
      requiring `T<n>`; states `[ ]`, `[x]`, `[~]`, and `unknown` for anything else;
      evidence prose under each item.
      Route: delegated writer.

- [ ] T5 Derive task and feature state
      `done-unproven` (checked, no evidence, no commit reference), per-section and
      per-feature counts, completion ratio with `[~]` counted in the total and not as done.
      Route: delegated writer.

- [ ] T6 Build the synthetic fixture corpus
      Documents reproducing every grammar variant found in the survey, plus parser tests
      over them under `node --test`. No real project content. Also a local-only check that
      the five real documents parse, reading them from their absolute paths, skipped when
      absent so the suite stays green on any other machine.
      Route: delegated writer.

- [ ] T7 Register the activity bar container, the view, and the welcome content
      `contributes.viewsContainers.activitybar` with id, title and a **24x24 SVG icon**, then
      `contributes.views` under that container id, and a `TreeDataProvider`. The empty state
      uses `contributes.viewsWelcome`, the documented mechanism for a tree view with no
      children — not a hand-rolled placeholder node.
      Route: delegated writer (manifest, icon asset, provider, tests).

- [ ] T8 Tree view: features, sections, tasks
      State icons, ID as written, `done/total`, the unproven badge, the branch when named,
      the commit reference as a second line, and `## Next step` pinned as the feature's
      last child.
      Route: delegated writer.

- [ ] T9 Tree behaviour: filter and ordering
      `All` / `Open` / `Unproven`; fully-closed features sorted last and muted; reveal the
      Markdown at a task's line on selection.
      Route: delegated writer.

- [ ] T10 Detail panel: header and tiles
      Title from the filename, subtitle with project, path and branch, the Next step block
      rendered first, and the three tiles `PROGRESS`, `UNPROVEN`, `LAST WORK`.
      Route: delegated writer.

- [ ] T11 Detail panel: body
      Objective and problem, every task with its evidence inline, an unproven task stating
      what is missing, and the optional document sections rendered when present.
      Route: delegated writer.

- [ ] T12 Detail panel: "Recorded by this document"
      One table of the rare contract fields — TDD, delivery, route, line budget, review —
      each showing its value or `not recorded`.
      Route: delegated writer.

- [ ] T13 Git-derived history
      `git log --follow` over the document; completion ratio recomputed per revision; a
      sentence with revision count and date range by default, a chart only above a
      threshold; per-commit granularity stated in the caption.
      Route: delegated writer.

- [ ] T14 Theming and layout
      Theme tokens throughout and codicons. The webview styles against the CSS variables VS
      Code injects and against `body.vscode-light`, `body.vscode-dark` and
      `body.vscode-high-contrast` — all three categories, not two. Narrow sidebar width, tile
      row wrapping.
      Route: delegated writer.

- [ ] T15 Refresh on change
      Watch `odd/tasks/*.md` and refresh the tree and any open panel; manual refresh action.
      Route: direct inline.

- [ ] T16 Package and document
      Extension packaging, README, and the settings reference.
      Route: delegated writer.

## Acceptance criteria

Inherited from `docs/PRD.md`, verified against the five real documents locally and the
synthetic corpus in CI:

- [ ] All five real documents parse and render without error.
- [ ] Corpus document C renders two section nodes with IDs scoped per section.
- [ ] Its `- [~]` item renders as `declined`, in the total and not as done.
- [ ] Corpus document D, missing four optional headings, renders title, objective and
      full task list, and shows no Next step line rather than an empty one.
- [ ] A checked task with no evidence renders `done-unproven` and counts in `UNPROVEN`.
- [ ] Documents with no line forecast show `not recorded`, not zero.
- [ ] Single-revision documents state their revision count instead of drawing a chart.
- [ ] A task line whose first token is not `T<n>` still renders.
- [ ] The project holding corpus documents D and E renders both, closed one last and muted.
- [ ] A repository without `odd/tasks/` shows welcome content, not an error.
- [ ] The UI renders correctly in light, dark and high-contrast themes, and at a narrow
      sidebar width.

## Checks

Per task, the runner for that task's layer — `node --test` for domain work,
`@vscode/test-cli` for adapter work — with observed RED before implementation and GREEN after.
Before delivery: both suites, `tsc --noEmit`, and a manual render of all five real documents.

## Progress

Branch `feat/ledger-view-v1`, four commits. 1 of 16 tasks closed.

| Commit | What |
|--------|------|
| `8d2c859` | PRD and this document |
| `f99f508` | T1 scaffolding and the domain/adapter boundary |
| `9319d6d` | T1 correction: domain test script no longer depends on shell glob support |
| `13ab521` | CI on push and pull request; ignore `.codegraph/` |

Running authored count: roughly 750 lines against a ~2,800 forecast. Chain strategy still
unresolved; `ask-on-risk` will request it before the count crosses the budget.

A local CodeGraph index was initialized for this checkout: 7 files, 20 nodes, 25 edges.
It is ignored by git, because an index is per-checkout and its root and indexed bytes
differ between working trees.

**Follow-up recorded, not yet a task**: CI pins `node-version: '24'`. The defect corrected
in `9319d6d` was precisely a Node-version-dependent behaviour, so a single pinned version
cannot catch that class of regression. A version matrix is worth considering before v1
ships.

## Next step

T2: discover feature documents. Route: delegated writer. RED first under `npm run
test:domain`, which now runs `node --test` from inside the compiled domain directory.
