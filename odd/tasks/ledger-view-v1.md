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
**Chain strategy**: `stacked-to-main`, chosen by the user on 2026-09-21 once the running
count crossed the delivery budget. Each slice is its own pull request against `main`,
resting on the one before it, reviewed and merged in order. The cost accepted with it: a
change to an early slice during review means rebasing the ones stacked above.
**Forecast**: roughly 2,800 authored changed lines including tests. It was low: the count
reached it with twelve tasks still open, so treat it as a planning figure that has now been
overtaken. The delivery budget, not the forecast, is what governs slicing.
**Running count**: see Progress.

### Slice boundaries

Nothing is pushed yet and no pull request exists. These are the intended boundaries, each
a coherent piece of behaviour rather than an arbitrary line count.

| Slice | Commits | Holds |
|-------|---------|-------|
| 1 | `8d2c859` … `7c7dfd7` | Specification, ODD ledger, project scaffolding, the domain/adapter boundary, CI |
| 2 | `b306dca` … `bcd4b71` | Document discovery and the structure parser |
| 3 | `b21c2f0` … `01d3033` | The checklist parser and derived state, including `done-unproven` |
| 4 | from `T6` onward | Fixture corpus, then the adapter layer |

Each slice already carries its own acknowledged review receipt, so the reviews are not
repeated at pull-request time. Pushing, opening pull requests and merging remain the
user's decisions under ordinary repository policy.

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

- [x] T2 Discover feature documents
      Find `odd/tasks/*.md` in the workspace; handle a workspace with no `odd/`, with an
      empty `tasks/`, and with more than one feature file.
      Route: delegated writer (source + tests).
      DONE `b306dca`.
      `discoverFeatureDocuments(root)` returns `{ path, featureName }` per document,
      sorted by feature name because directory read order is OS-dependent and the tree
      must not reshuffle between refreshes. Nothing throws: a missing root, a missing
      `odd/`, a missing or empty `tasks/`, and an unreadable directory all return an
      empty result, because a project without ODD is the common case and must render
      welcome content. Nesting is excluded twice over — the read is non-recursive and
      every candidate is still checked against `isFeatureDocumentPath`.
      Evidence: `npm run check-types` clean; `npm run test:domain` 17/17 pass (10 new
      against real temporary directories, 7 from T1); `npm run bundle` exit 0; `grep`
      over `src/domain/` for a `vscode` import returns clean. RED observed first:
      `TS2307: Cannot find module './discover-feature-documents'`.
      Review: RDD assess over `9319d6d..b306dca` returned risk **high**
      (`shell_source` in `.github/workflows/ci.yml` — the CI, not this code). Consent
      granted by the user. Lineage `review-d8e7ccbcac0bf0ae`, four lenses run
      concurrently. The resilience lens failed once on a model-provider safeguard
      false positive; STATUS reoffered the same slot and the relaunch was admitted.
      **Approved with zero blocking findings, acknowledged, authority burned.**
      Advisory findings recorded as follow-up work, including unpinned GitHub action
      refs and default token permissions in CI.

- [x] T3 Parse document structure
      H1, the four headings present in every document, and the optional ones through an
      alias table (`Progress` / `Progress notes`, `Constraints` / `Checks`, decision and
      findings narratives). An unrecognized heading is preserved, never dropped.
      Route: delegated writer.
      DONE `dd6fd03`.
      `parseDocumentStructure(text)` returns the H1 title, the preamble before the first
      section, and one entry per section with raw heading, canonical kind, body and line
      numbers. Only level-2 headings open a section: the corpus records no subsection
      convention, and promoting an incidental `###` would shred evidence prose into tree
      nodes nothing asks for. A `#` inside a fenced code block is not a heading.
      Evidence: `npm run check-types` clean; `npm run test:domain` 38/38 pass (21 new);
      `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode` import returns
      clean. RED observed first: `TS2307: Cannot find module './parse-document-structure'`.
      **Corpus verification, run by the parent against the five real documents in place**
      (never copied into this repository): all five parse without throwing, all five yield
      an H1 and the four sections every document carries, and section counts match the
      survey exactly — 11, 10, 9, 8, 8. The first run exposed three alias gaps the writer's
      own fixtures could not see, because those fixtures came from the task brief rather
      than from reality: `Decision` in the singular, `Delivery`, and `Why` / `Why now`.
      Sent back and closed under TDD; documents A and B now resolve every heading, and what
      stays unrecognized is prose specific to one document, exactly as intended.
      Review: RDD assess over `b306dca..dd6fd03` returned risk **medium**
      (`slice_budget_reached`, 592 lines). Consent granted by the user. Lineage
      `review-4406b7ab90d13a77`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.**

- [x] T4 Parse the checklist
      Heading-scoped sections; the first token after the marker as the task ID without
      requiring `T<n>`; states `[ ]`, `[x]`, `[~]`, and `unknown` for anything else;
      evidence prose under each item.
      Route: delegated writer.
      DONE `b21c2f0`, with fixtures sanitised in `ba26aca`.
      `parseChecklist(text, sections)` returns one group per section with its heading,
      kind and items; an item carries state, ID or null, title, evidence, raw text and
      line numbers. An ID is recognised by **shape, not position**: alphanumeric
      segments joined by a dot or dash containing at least one digit, so `T1`, `P3`,
      `RF-12` and `4.1` qualify and prose does not. Taking the first token would have
      read `A` and `The` as identifiers in acceptance-criteria checklists. No prefix is
      hardcoded. Sections are deliberately not classified — that is T5.
      Evidence: `npm run check-types` clean; `npm run test:domain` 58/58 pass (25 new);
      `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode` import returns
      clean. RED observed first: `TS2307: Cannot find module './parse-checklist'`. Where
      a later test passed on its first run, the writer falsified it against a
      deliberately broken implementation to prove it was not vacuous, rather than
      inventing a RED phase.
      **Corpus verification, run by the parent against the five real documents plus this
      repository's own feature document.** Every checklist parses. It also corrected the
      original survey: in document C, `T12..T16` live under `## Pending`, not `## Tasks`,
      so one section carries **two ID prefixes at once** — `P*` and `T*` together — and
      `T11` does not exist at all. This repository's own document returns 16 task items
      with IDs and 11 acceptance criteria with **no** ID, which is the shape rule working
      exactly as intended.
      **Privacy correction.** The task brief quoted real corpus lines verbatim as
      examples and they became fixtures, against this document's own constraint. Caught
      by the parent during review, before any push. Every fixture now uses invented text
      exercising the same shapes; `src/` greps clean. Removing the string `exec.path`
      also dropped a heuristic false positive that had rated the candidate high risk.
      Review: RDD assess over `dd6fd03..ba26aca` returned risk **medium**
      (`slice_budget_reached`, 675 lines) after the correction. Consent granted by the
      user. Lineage `review-da6037c677b0bc8c`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.**

- [x] T5 Derive task and feature state
      `done-unproven` (checked, no evidence, no commit reference), per-section and
      per-feature counts, completion ratio with `[~]` counted in the total and not as done.
      Route: delegated writer.
      DONE `94071f7`.
      `deriveChecklistState(sections)` returns per-item derived state, per-section counts
      and a feature roll-up of done, total, percentage and unproven. `done-unproven` is
      **additive, not a demotion**: the item still counts as done, and the extension says
      what is missing rather than silently rewriting what its author recorded.
      A commit reference is a 7-to-40 character hex run at word boundaries containing at
      least one digit. The digit requirement matters because `a`–`f` spells English:
      `deadbeef` is hex-shaped with no digit. A real object id derived from binary content
      has under a tenth of a percent chance of avoiding digits entirely.
      **Progress rule, decided on evidence.** A section counts when its kind is `tasks` or
      unrecognized. Counting only `tasks` reported one real document as ten of ten complete
      while five items sat open under a section its author named `Pending`; counting every
      section reported this repository's own document as four of twenty-eight, because
      eleven acceptance criteria became outstanding work. The chosen rule gives eighteen of
      twenty-three and four of seventeen, both truthful. Excluded sections still render.
      `declined` and `unknown` count in the total but not as done. A feature with no
      countable items reports zero per cent, never `NaN`.
      Evidence: `npm run check-types` clean; `npm run test:domain` 82/82 pass (24 new);
      `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode` import returns
      clean. RED observed first: `TS2307: Cannot find module './derive-checklist-state'`.
      The digit requirement was falsified against a deliberately broken implementation to
      prove its test was not vacuous.
      **Corpus verification, run by the parent.** Both known figures reproduce exactly:
      document C gives 18/23, this repository's own document gives 4/17 with its eleven
      acceptance criteria excluded. And the product demonstrated itself on real data —
      **document B reports 7/7, one hundred per cent, with three of those seven tasks
      recording neither evidence nor a commit.** That gap between marked and proven is the
      reason this extension exists, and it showed up in a real document rather than a
      fixture.
      Review: RDD assess over `ba26aca..94071f7` returned risk **medium**
      (`slice_budget_reached`, 605 lines). Consent granted by the user. Lineage
      `review-95e2064abd84b83f`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.**
      The review also caught a stale denominator in this document's own progress line,
      corrected below.

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

- [ ] T17 Survive a malformed document
      An unterminated code fence currently swallows the rest of a document in both the
      structure parser and the checklist parser. Raised as an advisory finding by two
      consecutive independent reviews, which is why it is a task rather than a note.
      Also covers an H1 appearing after the first section, currently dropped, and
      `endLine` drifting for a document with no trailing newline.
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

Branch `feat/ledger-view-v1`, thirteen commits. 5 of 17 tasks closed.

| Commit | What |
|--------|------|
| `8d2c859` | PRD and this document |
| `f99f508` | T1 scaffolding and the domain/adapter boundary |
| `9319d6d` | T1 correction: domain test script no longer depends on shell glob support |
| `13ab521` | CI on push and pull request; ignore `.codegraph/` |
| `7c7dfd7` | T1 recorded as closed |
| `b306dca` | T2 feature document discovery |
| `01ea0c1` | T2 recorded as closed |
| `dd6fd03` | T3 document structure parser |
| `bcd4b71` | T3 recorded as closed |
| `b21c2f0` | T4 checklist parser |
| `ba26aca` | T4 fixtures sanitised of corpus excerpts |
| `28dd155` | T4 recorded as closed, T17 raised |
| `94071f7` | T5 derived state |

Running authored count: roughly 2,750 lines against a ~2,800 forecast. The forecast is
about to be met with twelve tasks still open, so it was low; the delivery budget, not the
forecast, is what governs, and `ask-on-risk` will request a chain strategy before the next
slice. Chain strategy still
unresolved; `ask-on-risk` will request it before the count crosses the budget.

A local CodeGraph index was initialized for this checkout: 7 files, 20 nodes, 25 edges.
It is ignored by git, because an index is per-checkout and its root and indexed bytes
differ between working trees.

**An unterminated code fence has now been raised as a blocking-grade advisory by two
consecutive reviews**, against the structure parser and again against the checklist
parser. A malformed document would swallow the rest of itself in both. Two independent
reports on the same input class make this a task, not a note, and it is added as T17.

**Advisory findings carried forward, not yet tasks.** None blocked any review; each is
separate later work. Three are worth naming because they describe real inputs the parser
could meet: an **unterminated code fence** would swallow the rest of a document; an `#`
H1 appearing *after* the first section is currently dropped; and `endLine` is off for a
document ending without a trailing newline. From earlier reviews: CI uses unpinned GitHub
action refs and default token permissions.

**Follow-up recorded, not yet a task**: CI pins `node-version: '24'`. The defect corrected
in `9319d6d` was precisely a Node-version-dependent behaviour, so a single pinned version
cannot catch that class of regression. A version matrix is worth considering before v1
ships.

## Next step

T6: build the synthetic fixture corpus — documents reproducing every grammar variant the
survey found, plus a local-only check that the five real documents parse, skipped when
absent so the suite stays green on any other machine. Route: delegated writer. RED first
under `npm run test:domain`.
