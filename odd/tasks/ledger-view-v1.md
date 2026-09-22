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
**Review cadence**: per slice, not per task, chosen by the user on 2026-09-22. Medium-risk
work unit commits accumulate against the last reviewed boundary and are reviewed together
when the slice closes. The contract already allows this for medium risk; until now every
task was reviewed on its own, which cost a consent interruption and a review cycle each.
High-risk candidates are unaffected and are still reviewed as soon as they appear, because
the reason a candidate is high risk does not wait for a slice to fill.

### Slice boundaries

The branch is on `origin` since 2026-09-21 and no pull request exists yet. These are the
intended boundaries, each a coherent piece of behaviour rather than an arbitrary line count.

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
      exercising the same shapes; `src/` greps clean. One of the removed strings had also
      tripped a heuristic into rating the candidate high risk, so the sanitation dropped
      a false positive as well.
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

- [x] T6 Build the synthetic fixture corpus
      Documents reproducing every grammar variant found in the survey, plus parser tests
      over them under `node --test`. No real project content. Also a local-only check that
      the five real documents parse, skipped when absent so the suite stays green on any
      other machine.
      **Corrected while implementing**: this task originally said the check would read the
      real documents "from their absolute paths". That contradicted this document's own
      constraint that no real path enters the repository. The location now comes from the
      environment variable `ODD_LEDGER_REAL_CORPUS_DIR`, and nothing is written inside the
      repository, so there is no path left behind to leak.
      Route: delegated writer.
      DONE `d9a3979`.
      Four invented documents covering every surveyed variant between them: a bold
      metadata block in one and not the others, heading name variants, a decision
      narrative with a trailing parenthetical, two ID namespaces under two headings, a
      single section carrying two prefixes at once with a gap in the numbering, all three
      checkbox states plus an unrecognised marker, a fenced block hiding a fake heading
      and a fake item, an acceptance-criteria checklist with no IDs, and one deliberately
      sparse document.
      These are the **first tests of the three parsers composed**. Until now each was
      exercised alone; nothing ran structure, checklist and derivation over one whole
      document and checked the numbers at the far end. Expected values are written by
      hand, not recomputed by the code under test.
      Fixtures are TypeScript modules rather than `.md` assets, because the domain suite
      runs from the compiled output directory and a Markdown file beside it would need a
      copy step this build does not have. Verified absent from the production bundle.
      Evidence: `npm run check-types` clean; `npm run test:domain` 87 pass with the
      optional check skipped; with `ODD_LEDGER_REAL_CORPUS_DIR` pointed at the five real
      documents, **88 pass and none skipped**, so both directions of the opt-in are
      proven; `npm run bundle` exit 0 and `grep` for the fixtures in `dist/` returns 0.
      Every assertion passed on its first run, so rather than invent a RED phase the
      writer falsified them against a deliberately broken derivation — nine tests failed,
      four of them the new ones — then reverted and confirmed byte-identical.
      **Privacy verified by the parent**: a grep across `src/` and `README.md` for every
      real project name, document name, identifier, commit hash, absolute path and home
      directory returns clean. This was the task where the T4 mistake would have done the
      most damage, so it was checked before the commit rather than after.
      **No parser defect found.** Every hand-computed figure matched the parsers exactly.
      Review: RDD assess over `01d3033..d9a3979` returned risk **medium**
      (`slice_budget_reached`, 749 lines). Consent granted by the user. Lineage
      `review-50e3331e6a0cba89`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.**

- [x] T7 Register the activity bar container, the view, and the welcome content
      `contributes.viewsContainers.activitybar` with id, title and a **24x24 SVG icon**, then
      `contributes.views` under that container id, and a `TreeDataProvider`. The empty state
      uses `contributes.viewsWelcome`, the documented mechanism for a tree view with no
      children — not a hand-rolled placeholder node.
      Route: delegated writer (manifest, icon asset, provider, tests).
      CLOSED `ee74937`, review approved and acknowledged on 2026-09-22. It stayed at `[~]`
      for one day on purpose: its review was due and consent is the user's to give, so the
      checkbox did not claim a completion the document's own rules had not granted.
      First adapter-layer work: the first code allowed to import `vscode`, and the first
      tested by launching a real extension host. Uses `window.createTreeView` rather than
      `registerTreeDataProvider`, because the unproven badge lives on the `TreeView`
      instance, and implements `getParent` although nothing nests yet, because `reveal`
      requires it and T9 needs `reveal`. The empty case uses `contributes.viewsWelcome`
      rather than a placeholder node pretending to be data.
      A window with no workspace folder and a folder with no `odd/tasks/` are
      indistinguishable from the view's side and both land on the same welcome content.
      Several folders are all scanned into one flat alphabetical list; there is no
      per-folder grouping level because the interface has none.
      The adapter suite splits into two `@vscode/test-cli` profiles, one with no workspace
      folder and one against a fixture workspace, with disjoint globs so nothing runs twice.
      Evidence: `npm run check-types` clean; `npm run test:domain` unchanged at 87 pass
      with the optional check skipped; `npm run test:extension` 12 passing, exit 0;
      `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode` import returns
      clean. RED observed first as a compile failure on the missing provider module. The
      counts assertion was falsified against a deliberately broken reader — it failed with
      `0/0 !== 2/3` — then reverted and confirmed byte-identical.
      Privacy verified by the parent over `src/adapter/`, `resources/`, the manifest and
      the test configuration: clean.
      Review: RDD assess over `d9a3979..ee74937` returned risk **medium**
      (`slice_budget_reached`, 492 lines). Consent was not requested in the user's absence.
      On 2026-09-22 the user granted it; the native review ran over `d9a3979..f798fc9`
      (12 files, 530 lines, one lens, `review-reliability`), returned **approved**, and the
      exact acknowledgement burned the authority. The closing document commit assessed
      passive, so the reviewed boundary advanced past it.
      Ten advisory findings, none blocking, are listed under Progress as follow-ups.

- [x] T8 Tree view: features, sections, tasks
      State icons, ID as written, `done/total`, the unproven badge, the branch when named,
      the commit reference as a second line, and `## Next step` pinned as the feature's
      last child.
      Route: delegated writer. Trigger evidence: 9 non-trivial files across both layers.
      DONE `218c8a5`.
      A new domain module, `buildFeatureModel`, composes the three existing parsers into
      one plain model, so every rule this task adds stays testable without an editor:
      branch extraction from the preamble, next-step extraction, commit-reference
      extraction, and the filter that hides prose-only sections. `hasCommitReference` now
      delegates to an exported `extractCommitReference` rather than carrying a second copy
      of the regex.
      The adapter becomes four node kinds — feature, section, task, next step —
      discriminated by an explicit `kind` field rather than `instanceof`, each carrying a
      real `parent`, because the `reveal` API T9 needs a working `getParent` at every
      level. The next-step node is pushed last, after the sections.
      **A tree item has no second line.** The PRD asks for the commit reference on one, so
      the closest honest equivalent in this API is the item's `description`, and the code
      says so where it formats it. A `done-unproven` task spends that same slot on
      `checked, no evidence recorded`, because naming the absence matters more than
      repeating a reference it does not have.
      Absence is stated, not blank: a feature with no branch says `no branch recorded` in
      its tooltip, and a document with no `## Next step` grows no next-step child at all.
      Fixtures gained a third invented document so both the present and the absent cases
      are observable: one document carries a bold `**Branch**:` line, a done-unproven task,
      a `- [~]` item and two item-bearing sections; another carries a plain `Branch:` line
      and a next step; the third still records neither, which is what makes the absent case
      real rather than asserted against nothing.
      Evidence: `npm run check-types` clean; `npm run test:domain` 110 tests, 109 pass,
      1 skipped (the opt-in real-corpus check); `npm run test:extension` 31 passing in the
      no-folder profile and 12 in the workspace profile; `npm run bundle` exit 0; `grep`
      over `src/domain/` for a `vscode` import returns clean. RED observed first as
      `TS2724` on the missing `extractCommitReference` export, then `TS2307` on the missing
      `build-feature-model` module, then `TS2305` on the four missing node exports. Two
      assertions that passed on their first run were falsified against deliberately broken
      implementations — removing the rawText fallback for commit references, and pushing
      the next-step node first instead of last — then reverted and confirmed byte-identical.
      Review: RDD assess over `67d3488..218c8a5` returned risk **medium**
      (executable change in the adapter test file, 1,231 lines, slice budget reached).
      Consent granted by the user. Lineage `review-37bf3338d6926947`, one lens
      (`review-reliability`). **Approved with zero blocking findings, acknowledged,
      authority burned.** Seven advisory findings; one of them describes a real input class
      and is raised as T18 below, the rest are recorded under Progress.

- [x] T9 Tree behaviour: filter and ordering
      `All` / `Open` / `Unproven`; fully-closed features sorted last and muted; reveal the
      Markdown at a task's line on selection.
      Route: delegated writer. Trigger evidence: 11 files across both layers.
      DONE `77b3ad8`.
      A second domain module, `filter-and-order-features.ts`, holds the three decisions
      this task adds — `isFeatureClosed`, `compareFeatures`, `filterFeature` — so none of
      them needs an editor to test. The adapter holds only the active filter and applies
      them.
      **A filter narrows what is visible, never the counts.** `progress` keeps reporting
      the document's real ratio while `Open` or `Unproven` hides some of the items behind
      it, because a tree that recomputed the ratio from what survived a filter would report
      progress the document never recorded.
      A feature with zero countable items is not closed. `deriveChecklistState` already
      refuses to call zero items complete, and closedness inherits that: there is no
      measured progress to have finished.
      **Both orderings are now pinned to a collation.** The T7 review raised
      `localeCompare` called with no locale, which resolves from the host's ICU build and
      its `LANG`/`LC_ALL`. Fixing only the tree's comparison would not have closed it: that
      comparison uses `sensitivity: 'base'`, so names differing solely by case or accent
      compare equal, and a stable sort then preserves whatever order arrived from
      discovery — whose own sort was still host-resolved. Verified rather than assumed:
      under a Swedish locale the unpinned discovery returns `anchor-store, zebra-cache,
      ärende-queue` where English returns `anchor-store, ärende-queue, zebra-cache`. Both
      comparisons now name `'en'` explicitly, and a domain test locks it.
      The second T7 ordering finding is closed too: the fixture set was rebalanced so the
      alphabetically first feature is the fully closed one, moving from first in discovery
      order to last in rendered order. Deleting the sort call now changes what the test
      sees.
      Evidence: `npm run check-types` clean; `npm run test:domain` 128 tests, 127 pass,
      1 skipped; `npm run test:extension` 36 passing in the no-folder profile and 16 in the
      workspace profile; `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode`
      import returns clean. RED observed first as `TS2307` on the missing
      `filter-and-order-features` module. Assertions that passed on their first run were
      falsified against deliberately broken implementations and reverted byte-identical,
      confirmed by checksum — including the locale test, which was falsified by unpinning
      the collation and re-running the suite under `LC_ALL=sv_SE.UTF-8`, where it failed
      with the Swedish ordering above.
      **Parent correction, recorded because the route was wrong.** The collation fix,
      spanning four files, was made inline by the parent instead of delegated to a writer,
      which crossed this document's own writer trigger. The user caught it. Subsequent
      corrections go to a bounded writer.
      Review: RDD assess over `aca1fb7..77b3ad8` returned risk **medium**
      (configuration change in `package.json`, 656 lines, slice budget reached). Consent
      granted by the user. Lineage `review-46d14787cdfafb2c`, one lens
      (`review-reliability`). **Approved with zero blocking findings, acknowledged,
      authority burned.** Seven advisory findings; two describe real defects and are raised
      as T19 and T20 below.

- [x] T10 Detail panel: header and tiles
      Title from the filename, subtitle with project, path and branch, the Next step block
      rendered first, and the three tiles `PROGRESS`, `UNPROVEN`, `LAST WORK`.
      Route: delegated writer. Trigger evidence: 11 files, two new domain modules.
      DONE `934a288`.
      The panel is one reused webview, not one per feature: opening a second feature
      re-renders the existing one, and disposal clears the cached reference so a later
      open builds a fresh panel instead of reaching for a disposed one.
      The title comes from the filename, never from the document's H1, because the survey
      found H1 wording varies too much between documents to carry a title.
      **Absence is a value, not a blank.** A feature with no countable items reports that
      progress is `not recorded` rather than `0/0 · 0%`, because zero items is the absence
      of measured progress and not a measurement of zero. `LAST WORK` says the same until
      T13 fills it, through a documented seam rather than a placeholder.
      **Everything the panel renders comes from a file on disk**, so every interpolated
      value passes through an escaping helper that lives in the domain layer and is unit
      tested there. The webview runs with scripts off and a content policy that denies
      everything except one nonce-scoped stylesheet.
      Evidence: `npm run check-types` clean; `npm run test:domain` 151 tests, 150 pass,
      1 skipped; `npm run test:extension` 43 passing in the no-folder profile and 16 in the
      workspace profile; `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode`
      import returns clean. RED observed first as `TS2307` on each missing module in turn.
      Three panel behaviours that passed on their first run were falsified one at a time —
      removing the reuse branch's return, emptying the disposal handler, and unescaping the
      title — each failing only its own test, then reverted and confirmed byte-identical by
      checksum.
      Review: RDD assess over `6e7db0b..934a288` returned risk **medium** (configuration
      change in `package.json`, 708 lines, slice budget reached). Consent granted by the
      user. Lineage `review-7d9e677a8032a4c7`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.** Eight
      advisory findings; five live in the module T11 extends and are folded into it rather
      than deferred, the rest are recorded under Progress.

- [x] T11 Detail panel: body
      Objective and problem, every task with its evidence inline, an unproven task stating
      what is missing, and the optional document sections rendered when present.
      Route: delegated writer. Trigger evidence: 12 files across both layers.
      DONE `84b5ddf`.
      The model now carries the `DocumentStructure` it already parsed, so the body reads
      the document's prose without parsing the same text a second time. That prose is not
      on the model otherwise: the section filter keeps only sections holding checklist
      items, which is what T8 needed and what the body cannot use alone.
      **Markdown is not rendered.** Section bodies are emitted as escaped preformatted
      text. This extension has no Markdown renderer, and a partial one written here would
      misread the very corpus it exists to display.
      An unproven task states ODD's own sentence about a checkbox proving nothing, from a
      single exported constant, so the panel and any later renderer cannot drift apart.
      The tree keeps its own shorter phrasing for now because a tree row has no space for
      the full sentence; the constant is there when that is revisited.
      Also closed five findings the T10 review left in this module: the subtitle assertion
      that could not fail, the tab title that skipped its fallback on the reuse path, the
      unreached next-step branch, the unproved command handler, and the unasserted nonce
      pairing. The nonce now comes from `node:crypto` rather than `Math.random`.
      Evidence: `npm run check-types` clean; `npm run test:domain` 161 tests, 160 pass,
      1 skipped; `npm run test:extension` 55 passing in the no-folder profile and 17 in the
      workspace profile; `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode`
      import returns clean. RED observed first as `TS2339` on the missing `structure`
      field, then `TS2307` on the missing body module. The vacuous-subtitle fix was proved
      by breaking the path helper and watching the old test stay green, then watching the
      repaired one fail against the same break. Four further behaviours were falsified one
      at a time and reverted byte-identical, confirmed by checksum.
      Review: RDD assess over `64c3bab..84b5ddf` returned risk **medium** (executable
      change in an adapter test file, 783 lines, slice budget reached). Consent granted by
      the user. Lineage `review-80b7be8e1ddfa5e7`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.** Eight
      advisory findings; they are raised as T21 and T22 below.

- [x] T12 Detail panel: "Recorded by this document"
      One table of the rare contract fields — TDD, delivery, route, line budget, review —
      each showing its value or `not recorded`.
      Route: delegated writer. Trigger evidence: 4 files, one new domain module.
      DONE `280811b`.
      **Every row always renders.** These fields appear in as few as one of five real
      documents, so the region exists to be one honest table rather than six regions that
      disappear when empty. A field the document does not record says so.
      Route has no section of its own: it is recorded per task, so the row counts the items
      whose evidence carries a route note. That counts what the document states. No row
      computes a value the document does not, which is why the line budget reports the
      figure as written rather than deriving one.
      Review has no section kind either. The writer read it from the review evidence on
      task items, taking the most recently recorded — a reading the brief left open, and
      the one the review then found to be implemented incorrectly (see T23).
      Verified by the parent against this repository's own document, which renders all
      five rows populated, including `per task, 22 of 33 recorded`.
      Evidence: `npm run check-types` clean; `npm run test:domain` 178 tests, 177 pass,
      1 skipped; `npm run test:extension` 58 passing in the no-folder profile and 17 in the
      workspace profile; `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode`
      import returns clean. RED observed first as `TS2307` on the missing module; the
      adapter's RED was obtained by stashing only the implementation file and watching
      exactly the three new tests fail. Seven behaviours were then falsified one at a time
      and reverted byte-identical, confirmed by checksum.
      Review: RDD assess over `35fa660..280811b` returned risk **medium** (executable
      change in an adapter test file, 612 lines, slice budget reached). Consent granted by
      the user. Lineage `review-e2c51a1f8b6dff27`, one lens (`review-reliability`).
      **Approved with zero blocking findings, acknowledged, authority burned.** Six
      advisory findings; two are real defects and are raised as T23 and T24.

- [x] T13 Git-derived history
      `git log --follow` over the document; completion ratio recomputed per revision; a
      sentence with revision count and date range by default, a chart only above a
      threshold; per-commit granularity stated in the caption.
      Route: delegated writer, then three delegated corrections and one delegated
      simplification. Trigger evidence: 11 source files across both layers.
      DONE `74fc996`, corrected by `1636231`, `f73dc9b` and `e8a40c9`, simplified by
      `fd805cf`.
      The region reads the document's revisions, recomputes each one's completion ratio by
      parsing that revision's own text, and states a sentence with the revision count and
      date range. A chart appears only past a threshold, because the survey found one real
      document with ten revisions, one with two and three with a single one, so most
      documents cannot be plotted at all. Its caption says each point is one commit on an
      axis of revision time, not working time. The `LAST WORK` tile, left stating its own
      absence in T10, now carries the most recent revision date.
      **Git runs without a shell.** The arguments are an array, never a concatenated
      command line; the repository is named by git's own `-C`; the document path comes
      after a separator so a name beginning with a dash cannot be read as a flag; the git
      location variables are removed from the child environment so that argument is what
      decides which repository is read; and the configuration keys that let a repository
      ask git to run a command of its choosing are disabled for these calls. Any failure,
      including git being absent, is reported as history being unavailable rather than
      thrown.
      **This was the feature's first high-risk candidate**, because it is its first
      external process execution, so it drew four lenses instead of one. What followed is
      worth recording in full, because the shape of it is the lesson.
      The first review found the read running synchronously on the extension host thread,
      one process per revision, from a click. The five second limit bounded each call and
      not the operation, so a long history could freeze the editor for minutes. The
      correction made it asynchronous and closed five narrower holes with it: an unbounded
      fan-out, a non-ASCII filename silently losing all of its history to git's path
      quoting, ambient environment variables overriding the repository argument, a
      silently dropped revision letting the panel state a confident stale date, and the
      repository-chosen configuration keys above.
      **The second review found two criticals that the first correction had introduced.**
      The panel now rendered nothing until git resolved, so a freeze had become a blank
      wait, and making the handler asynchronous opened a race on the single shared panel
      where two quick selections could pair one feature's header with another's history.
      **The third review found two more, again introduced by the second correction.** A
      panel closed during the read reopened itself, and a read where every revision failed
      was reported as no history at all, erasing the distinction the correction before it
      had just added. What remained after that was the deferred render stealing focus when
      the user had merely moved to another editor.
      **At that point the mechanism was deleted rather than patched a fourth time.** The
      two phases existed to avoid a blank wait, and that wait had been unbounded when they
      were designed. The first correction capped the read at fifty revisions, and the
      parent measured what remained: 115 milliseconds for eighteen revisions, roughly 320
      in the worst case, which is ordinary for opening a detail view. The premise had
      expired, so the mechanism was pure cost. Deleting it removed the race, the
      resurrection and the focus theft together, along with the pending state, the request
      token, its guard and the liveness predicate that existed only to serve it.
      Converting a blocking call to an asynchronous one trades a blocking problem for
      problems of ordering, and then of lifetime; a shared, revealable, disposable surface
      has more states than the synchronous version ever had.
      Evidence: `npm run check-types` clean; `npm run test:domain` 207 tests, 206 pass,
      1 skipped; `npm run test:extension` 62 passing in the no-folder profile and 17 in the
      workspace profile; `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode`
      import returns clean, and no synchronous or shell process execution remains in
      production code. The parent proved the freeze was gone rather than asserting it: the
      event loop ticked 52 times during a 58 millisecond read, where a synchronous call
      would have ticked none.
      **Review: declined by the user on this candidate**, after three rounds had already
      run and the mechanism they kept finding fault with had been removed. The three
      completed reviews are what produced every correction above; the simplified result
      itself carries no receipt, and this document does not claim one. Delivery follows
      ordinary repository policy.

- [x] T14 Theming and layout
      Theme tokens throughout and codicons. The webview styles against the CSS variables VS
      Code injects and against `body.vscode-light`, `body.vscode-dark` and
      `body.vscode-high-contrast` — all three categories, not two. Narrow sidebar width, tile
      row wrapping.
      Route: delegated writer. DONE `c875697`.
      The panel's task states now use the same codicons the tree already shows, so both
      surfaces name a state the same way and the glyphs take their colour from the theme
      rather than carrying one. Only the five rules this panel needs are written out and
      only the font file is fetched, which is why the content policy gained exactly one
      exception: the nonce vouches for the stylesheet element, not for a resource a rule
      inside it loads. Scripts stay denied.
      **High contrast got what it actually needs, which is a boundary.** The other two
      categories separate surfaces with a background fill; high contrast does not, so the
      chart, which had no border at all and sat on the bare page, now carries one and its
      points carry a stroke.
      The chart also stopped clipping itself. Its box had no margin, so a point at either
      extreme was drawn half outside it, and with the aspect ratio left free the clipping
      was worse on one axis than the other. The margin is now the point radius, read from
      the same constant, with the invariant recorded beside it so the two cannot drift.
      That geometry defect had been raised as an advisory finding in the T13 review and
      was never a task; it closed here because it is drawing, which is this task's subject.
      **A test now fails if any literal colour reaches the rendered page**, searching the
      whole document for hexadecimal values, `rgb(` and named colours. That check is cheap
      and does not rot, unlike a manual audit that expires at the next change. Writing it
      was instructive: the first version matched `white` inside `white-space` and had to
      learn word boundaries, which is a genuine failure observed rather than a story about
      one.
      Layout needed nothing: the wrapping tile row, the wrapping table values and all
      three theme selectors were already in place from T10 through T13.
      Evidence: `npm run check-types` clean; `npm run test:domain` unchanged at 207 tests,
      206 pass, 1 skipped, this being adapter-only work; `npm run test:extension` 66
      passing in the no-folder profile and 17 in the workspace profile; `npm run bundle`
      exit 0 with the font shipped as a runtime dependency rather than bundled; `grep` over
      `src/domain/` for a `vscode` import returns clean. Four behaviours were falsified one
      at a time and reverted byte-identical, confirmed by checksum.
      Review: RDD assess over `63e784f..c875697` returned risk **medium** (368 lines,
      configuration change from the new dependency). Under the review cadence chosen on
      2026-09-22 this accumulates into the current slice rather than being reviewed alone.

- [x] T15 Refresh on change
      Watch `odd/tasks/*.md` and refresh the tree and any open panel; manual refresh action.
      Route: delegated writer. The route recorded here was `direct inline` and was wrong:
      the work spans a watcher, a debounce, a panel absence state and their tests across
      nine files, which is the writer trigger several times over.
      DONE `c490f35`.
      **This task existed on paper until the repository owner hit it.** While using the
      view on 2026-09-22 they read a count of eight from the tree while the document
      already recorded twelve, with nothing to tell stale data from real data. That is the
      whole justification, observed rather than argued.
      One watcher per workspace folder, scoped with a relative pattern rather than one
      absolute glob, so a multi-root window works and a folder added later is covered.
      Creating or deleting a document changes which features exist, so the root list is
      rebuilt rather than a node refreshed, and a panel whose document was deleted states
      that instead of showing content that is gone.
      Adding or removing a workspace folder changes what is discovered, so the watchers are
      rebuilt for the new folder set and the old ones disposed. An earlier review of this
      feature flagged objects that were never disposed; every watcher and listener here
      reaches the subscription list.
      **One save fires several events and a git operation fires many**, so they are
      coalesced into a single refresh after a short delay. The coalescing lives in the
      domain layer with its timer injected, which is what lets it be proved by counting
      instead of by waiting: three triggers produce two cancellations and exactly one run.
      The parent verified that directly against the compiled module.
      The watcher reports only which documents were touched, not what happened to each,
      and the consumer reads the filesystem for current truth when the delay elapses. A
      create, a change and a delete can race inside one window, and bookkeeping that
      remembered the event kind would go stale inside it.
      **One coverage gap, disclosed rather than papered over.** The workspace-folder rebuild
      path has no test. The writer wrote one, found it mutated persistent editor state and
      corrupted a later unrelated test profile, and removed it rather than leave a flaky
      test or a poisoned fixture. That path is therefore covered by reading, not by
      running, and this document says so rather than letting the suite imply otherwise.
      Evidence: `npm run check-types` clean; `npm run test:domain` 212 tests, 211 pass,
      1 skipped; `npm run test:extension` 76 passing in the no-folder profile and 22 in the
      workspace profile; `npm run bundle` exit 0; `grep` over `src/domain/` for a `vscode`
      import returns clean. RED observed first for each new module. Behaviours that passed
      on their first run were falsified one at a time and reverted byte-identical, confirmed
      by checksum, including removing the cancel before rescheduling and disposing the
      debounce without its child watchers.

- [x] T16 Package and document
      Extension packaging, README, and the settings reference.
      Route: delegated writer. DONE `aba99fa`.
      The package carries six files: the manifest, the README, the bundle, the activity
      bar icon and the one font the webview loads. Everything else is excluded, including
      the sources, the tests, the fixtures, the local indexes and this `odd/` folder.
      **The packaging risk this document recorded was real and was met head on.** The
      codicon font ships only because it is a runtime dependency, so an ignore file that
      swept the module directory aside would have taken the panel's icons with it and
      nothing would have failed: no error, no warning, just a panel with blank squares.
      The proof is therefore taken from the built artifact rather than the working tree,
      and it is a test rather than a command someone ran once, so the next change to the
      ignore rules has to keep it true. It was observed failing first: eight of its ten
      assertions failed before the ignore file existed.
      The README is written for a first reader. It says what is read, which is the
      project's `odd/` folder and the git history of the files in it and nothing else, and
      it gives the non-goals the same weight as the features, because a read-only ledger
      that never writes, never commits and never runs the workflow is defined as much by
      what it refuses as by what it shows. The honesty rules are described as behaviour
      rather than implementation, since they are the product: a checked task with no
      evidence reads as done but unproven, and what a document does not record is named as
      not recorded rather than drawn as a zero.
      **The extension contributes no configuration, and the README says so** instead of
      printing an empty table. Nothing plausible surfaced that was worth exposing.
      The manifest needed nothing it did not already have. No licence file was added and
      the packager still warns about it, because choosing a licence is the repository
      owner's decision and not this task's.
      Evidence: `npm run check-types` clean; `npm run test:domain` 212 tests, 211 pass,
      1 skipped; `npm run test:extension` 82 passing in the no-folder profile and 22 in the
      workspace profile; `npm run bundle` exit 0; `npm run test:package` 12 of 12; `grep`
      over `src/domain/` for a `vscode` import returns clean. The parent listed the built
      package independently and confirmed the font present and nothing private inside.

### Cleanup pass

**Closed on 2026-09-22 in four batches**, grouped by module and root cause rather than run
one task at a time: the parsers (`3b93dd7`), the panel body's regions (`a273ea6`), the
recorded-by table (`c907f7f`), and the remaining rules and assertions (`aff116f`). Four
writer runs instead of eight, and one accumulated slice review instead of eight.
Three of the eight were not what their own descriptions said, which is recorded with each.

Every item below is a defect an approved review raised, or one the parent verified
against a real document. None of them blocked their review. They were interleaved with
the feature work until 2026-09-22, which made the remaining list grow faster than it
shrank; the user moved them here so the feature reaches its shape first and the
defects close as one pass afterwards. Order within the pass is not fixed.

- [x] T17 Survive a malformed document
      An unterminated code fence currently swallows the rest of a document in both the
      structure parser and the checklist parser. Raised as an advisory finding by two
      consecutive independent reviews, which is why it is a task rather than a note.
      Also covers an H1 appearing after the first section, currently dropped, and
      `endLine` drifting for a document with no trailing newline.
      Route: delegated writer.

- [x] T18 A Next step written as a checklist item renders twice
      The section filter keeps every section holding at least one checklist item, and the
      next step is additionally emitted as its own node, so a document whose `## Next step`
      is written as a list item renders it in both places. Raised by the T8 review as an
      advisory finding; it is a task rather than a note because it describes a document
      shape the corpus can actually produce, and the fix is a decision about which of the
      two renderings wins, not a typo.
      Route: direct inline.

- [x] T19 Closedness and the `Open` filter disagree about which sections count
      `isFeatureClosed` reads only `progress`, which sums the sections that count toward
      it, while the `Open` filter admits items from every section regardless. A feature
      whose progress-bearing sections are all done therefore renders muted and sorted last
      while `Open` still shows its outstanding acceptance criteria. One of the two rules
      has to give; which one is the decision this task carries.
      Route: delegated writer.

- [x] T20 The locale test compares a precomposed filename byte-exact
      It writes a document whose filename carries a precomposed diacritic and compares the
      discovered feature name with `deepEqual`. A filesystem that normalizes filenames to
      their decomposed form returns a different byte sequence for the same name, so the
      test fails there for a reason that has nothing to do with collation. Normalize both
      sides, or assert on relative order rather than exact strings.
      Route: delegated writer.

- [x] T21 A section holding checklist items renders twice in the panel body
      The body renders item-bearing sections as task lists and, separately, every
      recognized optional section as prose. A section that is both — an `Acceptance
      criteria` heading whose items are checkboxes — appears in both regions. Verified by
      the parent against this repository's own feature document, which renders
      `Acceptance criteria` once as a checklist and once as raw text. The fix is a
      decision about which region wins, not a typo.
      Route: delegated writer.

- [x] T22 Three assertions in the panel work do not observe what they name
      From the T11 review. The no-argument command test samples the webview tab count
      synchronously around a command whose own file documents that tab state settles
      asynchronously, so it cannot fail. The workspace-profile test names workspace-root
      resolution as its subject but asserts only that a tab with the feature name
      appeared, which the feature name alone produces. And the per-state task glyph and
      its modifier class are asserted nowhere.
      **This is the second review in a row to find assertions that cannot fail**, and the
      first set was itself introduced while closing the same class of finding. That makes
      it a task rather than a note: the pattern is the defect.
      Route: delegated writer.

- [x] T23 The Review row does not take the most recent review
      Its two loops run in opposite directions: the outer keeps the last matching item
      across sections while the inner returns the first matching line within an item, so
      the value is neither consistently the newest nor the oldest. Found by the T12
      review. Pick one order and make the tests pin it.
      Route: delegated writer.

- [x] T24 Two table rows are cut mid-sentence at the document's own line wrap
      The line-budget row selects a delivery line because a figure appears in it, then
      truncates that line at a character budget, so a figure sitting past the budget is
      cut out of the very row that exists to show it. Verified by the parent against this
      repository's document, where the row reads `roughly 2,800 authored changed lines
      including tests. It was low: the count` and simply stops. The TDD row stops
      similarly. **This is the same root cause the T8 review raised against the next-step
      extractor**: a hard-wrapped sentence is cut at the source's wrap rather than at a
      sentence boundary. Two independent reports on one input class make it a task.
      Route: delegated writer.

## Acceptance criteria

Inherited from `docs/PRD.md`, verified against the five real documents locally and the
synthetic corpus in CI:

- [ ] All five real documents parse and render without error.
      Not provable here. This depends on the five real ODD documents, which deliberately
      never enter this repository. `real-corpus.optional.test.ts` checks parsing alone,
      opt-in via `ODD_LEDGER_REAL_CORPUS_DIR`, and it skipped in this audit's run of
      `npm run test:domain` for lack of that variable. Rendering is checked nowhere.
      Closing this needs someone with the real documents on disk to run that check, then
      open the built extension against them and look.

- [x] Corpus document C renders two section nodes with IDs scoped per section.
      `full-pipeline.test.ts`: "conveyor-sort-routing-v1: two sections, a mixed-prefix
      gap, and an identifier scoped per section" — a new fixture,
      `conveyor-sort-routing-v1` (`src/domain/fixtures/synthetic-documents.ts`),
      reproduces document C's exact shape with invented content: `Tasks` carries a
      single prefix (`Q*`), and `Pending` mixes `Q*` and `H*` together with a gap in
      the `Q` numbering (`Q11` never appears between `Q10` and `Q12`). The test asserts
      both render as separate section nodes through `parseDocumentStructure`, and that
      the identifier `Q1`, present in both sections, is scoped per section rather than
      collapsed into one namespace: `Tasks`'s `Q1` stays done, `Pending`'s `Q1` stays a
      distinct, still-open item.

- [x] Its `- [~]` item renders as `declined`, in the total and not as done.
      `feature-tree-provider.workspace-test.ts`: "a declined task ([~]) renders with the
      circle-slash icon and counts in the section total" — `beta-notification-hub`'s
      declined item renders with the circle-slash icon while its section reads `2/4`,
      counted without being counted done.

- [x] Corpus document D, missing four optional headings, renders title, objective and
      full task list, and shows no Next step line rather than an empty one.
      `zeta-report-export`, in the sample-workspace fixture, carries exactly the four
      core headings (Objective, Problem, Constraints, Tasks) and none of Scope,
      Progress, Next step or Acceptance criteria — document D's own shape.
      `feature-tree-provider.workspace-test.ts`: "a feature with no Next step section
      renders sections only, no trailing next-step node" and "each feature node shows
      its done/total counts derived from the domain layer" (zeta: `1/2`) close it; the
      task-list-as-nodes rendering itself is proven generically by the hierarchy test
      over `alpha-widget-cache` in the same file.

- [x] A checked task with no evidence renders `done-unproven` and counts in `UNPROVEN`.
      `derive-checklist-state.test.ts`: "a done item with neither evidence nor a commit
      reference is done-unproven". `feature-tree-provider.workspace-test.ts`: "a
      done-unproven task renders the warning icon and its 'checked, no evidence
      recorded' description" and "a feature with an unproven task shows the unproven
      badge in its description". `build-panel-header.test.ts`: "the UNPROVEN tile
      pluralises for more than one unproven task" and its singular sibling.

- [x] Documents with no line forecast show `not recorded`, not zero.
      `build-recorded-fields.test.ts`: "Line budget is 'not recorded' when there is no
      delivery section at all" and "...when the delivery section states no figure".

- [x] Single-revision documents state their revision count instead of drawing a chart.
      `build-history.test.ts`: "states the singular sentence for exactly one revision"
      now also asserts `showChart === false` alongside the existing sentence assertion,
      at exactly one revision — the case the chart threshold check (tested at 2 and 3
      revisions) never covered.

- [x] A task line whose first token is not `T<n>` still renders.
      `parse-checklist.test.ts`: "a task line whose first token is not an identifier
      still renders, with no ID and the full text as title" — its fixture text is this
      criterion's own sentence, asserted to parse with `id: null` and the sentence as
      its title.

- [x] The project holding corpus documents D and E renders both, closed one last and muted.
      `feature-tree-provider.workspace-test.ts`: "getChildren returns one feature node
      per discovered document, closed features sorted last (T9)" — the sample
      workspace's three real documents render together with the fully-closed one sorted
      last — and "a fully-closed, fully-proven feature renders green with the pass icon
      (T9, extended)" for its distinct rendering. "Muted" is this codebase's own term
      for that state (PRD: "sorts to the bottom and renders muted"); nothing in the
      implementation is a literal grey or dimmed colour, only the green "pass" or amber
      "warning" tokens.

- [ ] A repository without `odd/tasks/` shows welcome content, not an error.
      Not provable here. `discover-feature-documents.test.ts`'s "returns an empty array
      when the root has no odd/ directory at all" and "...when odd/ exists but tasks/
      does not" prove the no-throw, empty-array half. The `viewsWelcome` text is a
      static `package.json` declaration with no `when` clause; whether it actually
      appears in the sidebar is VS Code's own rendering, which no extension-host test in
      this suite exercises. Closing this needs a human to open the extension against a
      repository without `odd/tasks/` and look.

- [ ] The UI renders correctly in light, dark and high-contrast themes, and at a narrow
      sidebar width.
      Not provable here. `feature-detail-panel.test.ts`'s "declares a
      Content-Security-Policy and styles all three VS Code theme classes" and "the
      rendered HTML contains no hardcoded colour: no hex, no rgb(), no named CSS colour"
      prove theme-token discipline structurally, not visual correctness. No test
      measures layout at a narrow width. Closing this needs a human to switch through
      light, dark and high-contrast themes and narrow the sidebar in the running
      extension.

These eleven criteria were inherited from `docs/PRD.md` on day one and were never
consulted as a gate while the twenty-four tasks above were closed: the tasks document
tracked its own evidence per task, and nobody tied that evidence back to this list until
this audit. Audited now: eight close with an existing test whose failure would mean the
criterion false, cited above; three depend on the five real documents or on a human
looking at the running extension and cannot be closed from this repository alone.
`24/24` tasks closed
never implied `11/11` criteria proven, and the gap between the two is what this audit
closes honestly instead of by assumption.

## Checks

Per task, the runner for that task's layer — `node --test` for domain work,
`@vscode/test-cli` for adapter work — with observed RED before implementation and GREEN after.
Before delivery: both suites, `tsc --noEmit`, and a manual render of all five real documents.

## Progress

Branch `feat/ledger-view-v1`, pushed to `origin` on 2026-09-21. **24 of 24 tasks closed.**

**What the cleanup pass actually found**, beyond closing the eight defects.

`T17`'s description was wrong about where the end-line drift lived. It said documents with
no trailing newline; the drift was in the ordinary case of a file saved with one, because
splitting on the line terminator leaves an empty element behind. Read against this
repository's own thousand-line document, the last section reported one line too many. The
defect had been described from reading the code and described incorrectly; only running it
against a real document showed where it was.
Its fence recovery is deterministic rather than heuristic: a fence is only a fence when a
closing marker exists ahead of it, so a fence that does close behaves exactly as before,
including the fixture whose fenced block deliberately holds a heading and a checklist item.

`T18` and `T21` were one defect wearing two hats. The body chose its regions with two
independent filters, so anything satisfying both rendered twice. A section holding items
now claims itself and the prose region skips what is claimed, because the task rendering
carries the state and evidence of every item and raw text does not.

`T24` did not widen a budget, which would have moved the cut rather than fixing it. A
hard-wrapped paragraph is one sentence to a reader, so it is rejoined before being read.
The same defect lived in the next-step extractor, reported separately by an earlier review,
and now shares the one helper.
That fix then overshot: preferring a sentence boundary took the earliest one, so the mode
row said only that it was enabled and dropped where that came from. Caught by rendering the
table against this repository's own document rather than by a test, and corrected in the
next batch. A row that is grammatically whole and says nothing is not an improvement.

`T19` was a genuine decision, not a typo. Closedness and the `Open` filter disagreed about
which sections count, so a feature could render finished and muted while the filter still
listed its outstanding work. Closedness now asks the filter's question. The progress ratio
keeps its narrower rule, chosen deliberately under T5, so the two answer different
questions consistently instead of the same question differently.

`T22` closed the defect class these reviews kept finding: assertions naming a subject they
never observed. Every one of this feature's reviews found some, and one set was introduced
while fixing another. The three here were falsified individually before being trusted.

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
| `01d3033` | T5 recorded as closed |
| `a02f5af`, `…` | Chain strategy and slice boundaries recorded |
| `d9a3979` | T6 synthetic corpus and full-pipeline tests |
| `288eea6` | Corpus excerpts the first anonymisation pass missed, removed |
| `ee74937` | T7 activity bar container, view and welcome content |
| `f798fc9` | T7 recorded as implemented and awaiting its review |
| `67d3488` | T7 review approved, recorded as closed |
| `218c8a5` | T8 feature, section, task and next-step nodes |
| `aca1fb7` | T8 review approved, recorded as closed; T18 raised |
| `77b3ad8` | T9 filter, ordering and reveal-on-click |
| `6e7db0b` | T9 review approved, recorded as closed; T19 and T20 raised |
| `934a288` | T10 detail panel header and tiles |
| `64c3bab` | T10 review approved, recorded as closed |
| `84b5ddf` | T11 panel body, and five T10 findings closed |
| `35fa660` | T11 review approved, recorded as closed; T21 and T22 raised |
| `280811b` | T12 recorded-by-this-document table |
| `01dbe1f` | T12 review approved, recorded as closed; T23 and T24 raised |
| `74fc996` | T13 git-derived history |
| `f59a84a` | Review cadence per slice; defects moved to a cleanup pass |
| `1636231` | T13 first correction: the read no longer blocks the editor |
| `f73dc9b` | T13 second correction: the panel shows first, newest click wins |
| `e8a40c9` | T13 third correction: a closed panel stays closed |
| `fd805cf` | T13 simplified: the deferred second render deleted |
| `63e784f` | T13 recorded as closed with its three review rounds |
| `c875697` | T14 codicons, high-contrast boundaries and an unclipped chart |
| `8c8a72e` | T14 recorded as closed; a packaging risk flagged for T16 |
| `c490f35` | T15 watch the documents and refresh on change |
| `bb8882e` | T15 recorded as closed with its untested folder-rebuild path |
| `5b7e2be` | T14/T15 slice correction: the refresh gained a failure path |
| `b9de37a` | T14/T15 slice review approved and acknowledged |
| `aba99fa` | T16 packaging, README and the settings reference |
| `4378877` | T16 recorded as closed; the feature work complete |
| `3b93dd7` | Cleanup 1: a malformed document keeps its own content |
| `a273ea6` | Cleanup 2: one section belongs to one region |
| `c907f7f` | Cleanup 3: a wrapped paragraph read as the sentence it is |
| `aff116f` | Cleanup 4: assertions that observe their subject, closedness agreed |
| `35fa660` | T11 review approved, recorded as closed; T21 and T22 raised |
| `280811b` | T12 recorded-by-this-document table |
| `5b7e2be` | T14/T15 slice review correction: the watcher-driven refresh gets a real failure path |

Running authored count: roughly 2,750 lines against a ~2,800 forecast. The forecast was
low: it was met with twelve tasks still open. The delivery budget, not the forecast, is
what governs, and the chain strategy is settled as `stacked-to-main` (see Delivery).

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

**Advisory findings from the T7 review (2026-09-22), none blocking, not yet tasks.** All
in the adapter layer. Two of them land on tasks already planned and are noted there rather
than duplicated: the missing folder-change listener and file watcher is T15, and the
locale-dependent `localeCompare` ordering plus the sort assertion that passes even with the
sort removed both belong to T9's ordering work. The rest, in the reviewer's severity order:
a per-document read failure is swallowed and renders as `0/0`, indistinguishable from a
document with no tasks, and no test reaches that branch; the folder discovery call sits
outside any failure isolation, so one unreadable folder rejects the whole tree, and no test
runs with two folders; the refresh command's wiring to the provider is asserted only by
the command's presence, never by executing it; the provider and its event emitter are never
disposed. Three suggestions: the welcome text names one cause for a state reached from
three situations; the shared zero-count constant is returned by reference and not frozen;
every render does synchronous file reads on the extension host thread.

**Advisory findings from the T8 review (2026-09-22), none blocking.** One became T18. Of
the rest, three are worth naming: `buildFeatureModel` reads a section's heading line from
one array and everything else from another, relying on a 1:1 alignment that only a comment
asserts and no test pins, and no test asserts a section's heading line at all; the widened
unreadable-document fallback now returns a whole empty model and still nothing exercises
it, which is the same untested catch branch the T7 review already raised; and
`extractNextStep` returns the first physical line, so a hard-wrapped next step is cut at
the source wrap rather than at a sentence boundary. Three suggestions: a domain test is
named for a function it never calls; the trailing-punctuation stripper is applied to every
branch value including code spans and is covered by no test; and the string
`checked, no evidence recorded` is written twice with nothing pinning the two together.

**Advisory findings from the T9 review (2026-09-22), none blocking.** Two became T19 and
T20. Of the rest: the three filter commands are registered and declared but every test
calls the provider method directly, so a command-id typo in either place would go
unnoticed; the filter introduces a new way for the root list to come back empty, which
falls through to welcome content written for a different cause and is exercised by no
test; one adapter test's name claims two behaviours and asserts one; a filtered section
keeps its unfiltered counts, which is the deliberate feature-level rule applied one level
down but neither documented nor asserted there; and the active filter is not observable
anywhere in the interface, so the toolbar gives no feedback about which one is on.

**Advisory findings from the T10 review (2026-09-22), none blocking.** Five are folded
into T11, which extends the same module: a panel test whose subtitle assertion cannot fail
because its fixture path does not sit under the workspace root it passes in; the reuse
path setting the tab title unconditionally while the creation path substitutes a fallback;
the next-step region's non-empty branch reached by no test; the `openFeature` handler
asserted nowhere, so its no-argument guard and workspace-folder resolution are unproved;
and nothing asserting that the nonce in the content policy matches the one on the style
element, which is also where the nonce moves off `Math.random`. Three remain: a disposal
callback that clears the current panel unconditionally rather than only when the disposed
panel is still the current one; a fallback that names the document's own directory as the
project when no workspace folder resolves; and a command invokable from the palette, where
its guard returns silently with no feedback.

**Advisory findings from the T11 review (2026-09-22), none blocking.** Three became T22
and one led to T21. The remaining four are recorded here: region omission tests a body's
raw length while the sibling evidence check trims first, so a whitespace-only section
still renders; the list of optional section kinds is hand-maintained, so a kind added to
the parser is silently dropped from the panel until someone remembers this list; duplicate
headings are handled two ways, with the objective lookup taking the first match and the
optional-section pass taking all of them; and the empty-structure fallback is one shared
exported object whose array instance is reused by production and four fixtures.

**Advisory findings from the T12 review (2026-09-22), none blocking.** Two became T23 and
T24. The rest: the escaping test asserts the escaped markup appears somewhere in the page
rather than in the cell it is about, and the body renderer emits prose elsewhere that
could satisfy it; both aggregation helpers walk every item-bearing section but every test
document has exactly one, so the outer loop is never exercised; the truncation tests
assert only that the value shrank and ends in an ellipsis, so the stated budget is not
pinned; and a line that is nothing but a label falls back to rendering the label the row
already names.

**Tooling, recorded because it affected this session's work.** The CodeGraph index had
gone stale: its daemon exits five minutes after its last client disconnects, and a
delegated writer runs longer than that with no query in between, so nothing watched the
files for most of each task. Raised the idle timeout and added a resync after each
subagent. CodeGraph was then upgraded to 1.6.0 at the user's instruction, which required a
full re-index; the timeout default is unchanged in that version, so both fixes stand.

**A packaging risk T16 must not walk into.** T14 added the codicon font as a runtime
dependency, which is what makes it ship, and this repository has no ignore file yet. If
T16 writes one that excludes the module directory wholesale, the font disappears and the
panel loses its icons silently, with nothing failing. Whatever T16 writes must keep that
font reachable and prove it from the built package rather than from the working tree.

**Follow-up recorded, not yet a task**: CI pins `node-version: '24'`. The defect corrected
in `9319d6d` was precisely a Node-version-dependent behaviour, so a single pinned version
cannot catch that class of regression. A version matrix is worth considering before v1
ships.

**The T14/T15 slice review (lineage `review-5fdd501c4d53856e`, `review-reliability` lens)
is approved and acknowledged.** It found the watcher-driven refresh had no failure path at
all: a document that vanished or turned unreadable between the existence check and the
read, or a git-history fetch that rejected, was swallowed by a discarded promise while the
panel kept showing content that was no longer true. A refresh feature that fails silently
that way puts the view back to lying about being current — exactly the problem T15 exists
to remove. Corrected in `5b7e2be`.

**The final slice — T16 and the four-batch cleanup pass — is reviewed and approved**,
lineage `review-18b6367ac3fa8602`, one lens (`review-reliability`), and the exact
acknowledgement burned its authority. Every finding it raised was advisory. The sharpest
one: `unwrapLines` only starts a new logical line after a blank line, a bold span or a
`Label:` prefix, so two consecutive Markdown bullets with no blank line between them still
get joined into one — the same defect class T24 was raised to fix, now reappearing in an
input class no test covers. The rest are lighter: an unterminated fence can still pair
with a later block's real opening marker and swallow the section between them; a stray
second H1 opens its own untyped section, and items after it may shift into or out of
progress counting with no model-level test watching; the new packaging clean script uses
`rm -rf` and is not portable to a Windows shell without a POSIX layer; and the no-argument
guard's negative test waits a fixed 500 ms while the matching positive helper polls for up
to 2000 ms, leaving a window where a slow host could still miss a wrongly opened panel.
None of these opened a correction or reopened the review. **Every task in this document is
now closed and reviewed.**

## Next step

Both decisions that waited on the repository owner are settled: the branch was pushed as
it stood on 2026-09-21 with the residue in `8d2c859` and `dd6fd03` known and accepted, and
the T7 review was granted, approved and acknowledged on 2026-09-22.

**Every task in this document is closed.** The remaining work is the accumulated slice's
review, and then delivery, which is not this document's to decide.

Three things wait on the repository owner. Twenty-three commits sit unpushed on this branch,
and pushing is theirs to decide. Five non-terminal review lineages have accumulated in
the store, three of them from the T13 arc including one left escalated after its targeted
validator rejected a correction; none blocks anything, but they should be disposed of
deliberately rather than left behind. And the cleanup commits have not been reviewed: they
form one accumulated slice whose review is the next step.

**The T14 and T15 slice was reviewed and approved**, lineage `review-5fdd501c4d53856e`,
one lens. It found one critical defect worth recording for its irony: the watcher-driven
refresh had no failure path. A document that vanished between the existence check and the
read, an unreadable file, or a failed git read all produced a rejected promise nobody
observed while the panel kept showing stale content. A refresh that fails silently
reinstates exactly the problem T15 exists to remove, and the 309 tests were green
throughout because none of them exercised a failing read. The correction gave the two
failures different answers: a document that is gone reuses the absence state, while a
failed read says the view may be stale and keeps tracking the document so the next change
retries rather than leaving the panel dead.

Two decisions the user took on 2026-09-22, after asking whether the pace suited a VS Code
extension: review per slice rather than per task, and defer every open defect to a cleanup
pass at the end. The measurement behind them: six tasks closed in about two hours, roughly
sixty per cent of that in the writers and forty in the review cycle and bookkeeping, with
the open list growing from 17 items to 24 because each review raised more defects than the
task closed. The build pace was not the problem; the interleaving and the per-task review
cadence were.
