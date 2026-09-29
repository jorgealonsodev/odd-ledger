# progress-table-evidence — accept evidence recorded in a progress table

**Feature**: `progress-table-evidence`
**Started**: 2026-09-29
**Branch**: `feat/progress-table-evidence`
**Route**: Organic Driven Development (ODD). Not an SDD change.
**Engram mirror**: topic `odd/progress-table-evidence/tasks`, project `odd-ledger`
**Locator**: `odd/tasks/progress-table-evidence.md`

## Objective

A feature document that records its evidence in a progress table (one row per task, first
column = task ID) must render its closed tasks as proven, with no second copy of the evidence
under each checkbox. Inline evidence (trailing text, indented lines) keeps working exactly as in
v1.1.2; both formats are read and can be combined in one document.

## Problem

Observed on v1.1.2 with a real document (27 closed tasks, each with a `## Progress / evidence`
row naming commit, RED → GREEN checks and review outcome): the ledger showed `27/30 · 27
unproven`. The parser only reads the checkbox's trailing text, its indented lines and commit
tokens on the checkbox line (`src/domain/derive-checklist-state.ts`). Tables are never linked
to tasks.

## Why

The table was a complete, unambiguous record. Making the author duplicate it breaks the
extension's promise of reading ODD documents as they are written.

## Scope (authorized by the user, 2026-09-29)

Implement the external proposal "accept evidence recorded in a progress table", with its two
open questions resolved at the proposal's recommendations, and read evidence equally from
different formats:

- A progress table is a GFM pipe table whose first-column header is `Task`, `ID`, `Task ID`
  (case-insensitive; tolerant aliases allowed, e.g. `Tarea`), placed under a heading whose
  normalised slug starts with `progress` or `evidence` (open question 1 → heading required).
- Tolerant table syntax: with or without leading/trailing pipes, alignment colons in the
  delimiter row, escaped pipes `\|`, pipes inside code spans, ragged rows.
- Linking: exact ID match, else first whitespace token matching the ID grammar
  (`/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/`, at least one digit). Emphasis and backticks stripped.
  Several rows per task in document order. Duplicate IDs → row ambiguous, linked to none, named
  as ambiguous. No match → unattached document-level row, shown, never dropped, counted toward
  no task (open question 2).
- Row contributes `Header: cell` pairs (empty cells omitted); commit = first commit-like token
  in a column whose header contains `commit`, else first commit-like token in the row; a column
  whose header contains `route` supplies the task's route.
- Honesty: a row proves a task only if an evidence-bearing cell (not the ID cell) is non-empty
  and not just `—`/`-`. A row for an open task does not change its state. Inline evidence
  shown first, then table rows. Panel names the source of every evidence piece
  (inline, or `table "<heading>", row N`).
- Out: release/version bump, marketplace publish (user decisions).

## Constraints

- Hexagonal layout: parsing and derivation in `src/domain/` (pure, node:test), rendering in
  `src/adapter/`.
- Security posture unchanged: cells rendered with raw HTML escaped, images off, same link
  allow-list.
- No regression: documents without a progress table behave exactly as v1.1.2; existing tests
  and fixtures stay green.
- Client documents are not committed: fixtures are synthetic; the real document is verified
  through the existing optional real-corpus test (`ODD_LEDGER_REAL_CORPUS_DIR`).

## TDD

- Mode: strict, ON. Source: user global config (`~/.claude/CLAUDE.md`, "Strict TDD Mode: enabled").
- Runner: `npm run test:domain` (node:test over compiled `out/domain`); extension-host tests via
  `npm run test:extension` where the adapter changes.
- RED observed before implementation, then GREEN, then REFACTOR.

## Delivery

- Forecast: ~800–1200 authored changed lines (> 400) → strategy `ask-on-risk`; the running count
  reached ~2060 authored lines, so the chain strategy was asked and the user chose
  `stacked-to-main` (2026-09-29): one PR per task, each based on the previous.
- Slice boundaries: PR1 = T1 (1abda48, 8603f39); PR2 = T2 (1bfb633, 35189e8);
  PR3 = T3 (cae1186, ce8189a); PR4 = T4 + T5 (5ec319c, 43a592f, a8bd475 and its doc commit).
- RDD: on (global). Review candidate = work-unit commit / slice.
- PR chain (stacked-to-main, opened 2026-09-29; merge in order with merge commits, retarget the next PR to `main` after each merge):
  - PR1 #5 https://github.com/jorgealonsodev/odd-ledger/pull/5 (`feat/progress-table-evidence-1-parse` -> `main`)
  - PR2 #6 https://github.com/jorgealonsodev/odd-ledger/pull/6 (`feat/progress-table-evidence-2-link` -> PR1 branch)
  - PR3 #7 https://github.com/jorgealonsodev/odd-ledger/pull/7 (`feat/progress-table-evidence-3-panel` -> PR2 branch)
  - PR4 #8 https://github.com/jorgealonsodev/odd-ledger/pull/8 (`feat/progress-table-evidence` -> PR3 branch)

## Tasks

- [x] T1 Domain: detect progress tables (heading + first-column header, tolerant GFM syntax) and parse rows into cells.
- [x] T2 Domain: link rows to tasks (exact, first-token, ambiguous, unattached); derive table evidence, commit and route; apply honesty rules; merge with inline evidence (inline first); tree/tiles counts.
- [x] T3 Adapter: panel shows table evidence with its source label, plus unattached and ambiguous rows; tree label uses the linked commit; escaping unchanged.
- [x] T4 Fixtures, optional real-corpus check against the real document, README/CHANGELOG docs.
- [x] T5 Cleanup of review-9e6933213c59853a advisories: (1) Route column and bare `pending`/`n/a`/`tbd` cells are not evidence; (2) an H1 closes deeper headings; (3) real-corpus `withoutProgressTables` reuses the parser.

## Acceptance criteria

1. The real document (`phase1-step-analyzer.md` at `da85b46`) renders 0 unproven with no edits.
2. With the table removed, its 27 closed tasks are unproven again.
3. A row whose evidence cells are all empty leaves its task unproven.
4. `E5-5 cleanup` links to `E5-5`; `DP-05 Rueda` is shown as unattached, never dropped.
5. Duplicate task IDs make the row ambiguous; linked to nothing; the panel says so.
6. No progress table → identical to v1.1.2; existing tests green.
7. The panel names the source of every evidence piece.
8. Security posture unchanged.

## Progress / evidence

| Task | Route + trigger | Commit | Checks | Review tier/outcome |
| --- | --- | --- | --- | --- |
| T1 | delegated (writer trigger: 2+ non-trivial files) | 1abda48 | RED 15 failed (stub returned no tables) -> GREEN 337 pass / 0 fail (`npm run test:domain`); `npm run check-types` clean | medium; slice review consent granted, `review-9e6933213c59853a` (main..43a592f), 1 lens (review-reliability): approved, acknowledged, authority burned (revision sha256:f6ba3ab0c443df2be5a9f305475d91b80123271f9f5a688a659f3113ee39afb9) |
| T2 | delegated (writer trigger: 2+ non-trivial files) | 1bfb633 | RED 18 failed (linker stub) then 11 failed (model/derive wiring stubs) -> GREEN 376 pass / 0 fail, 1 skipped (`npm run test:domain`); `npm run check-types` clean | medium; slice review consent granted, `review-9e6933213c59853a` (main..43a592f), 1 lens (review-reliability): approved, acknowledged, authority burned (revision sha256:f6ba3ab0c443df2be5a9f305475d91b80123271f9f5a688a659f3113ee39afb9) |
| T3 | delegated (writer trigger: 2+ non-trivial files) | cae1186 | RED 11 domain failures (evidence-piece stubs) + 7 extension-host failures (tooltip/panel/regions) -> GREEN `npm run test:domain` 389 pass / 0 fail; `npm run test:extension` 139 adapter-unit + 27 workspace passing; `npm run check-types` clean | medium; slice review consent granted, `review-9e6933213c59853a` (main..43a592f), 1 lens (review-reliability): approved, acknowledged, authority burned (revision sha256:f6ba3ab0c443df2be5a9f305475d91b80123271f9f5a688a659f3113ee39afb9) |
| T4 | delegated (writer trigger: 2+ non-trivial files) | 5ec319c | Characterisation tests over already-implemented behaviour: no RED (7 format variants + 3 not-evidence tables passed on first run; disclosed). `npm run test:domain` 401 tests, 399 pass / 0 fail / 2 skipped (opt-in); `npm run test:extension` 139 + 27 passing; `npm run test:package` 0 fail. Real document via `ODD_LEDGER_REAL_TABLE_CORPUS_DIR`: 27/30, 0 unproven; table removed: 27 unproven; 1 unattached row, 0 ambiguous | medium; slice review consent granted, `review-9e6933213c59853a` (main..43a592f), 1 lens (review-reliability): approved, acknowledged, authority burned (revision sha256:f6ba3ab0c443df2be5a9f305475d91b80123271f9f5a688a659f3113ee39afb9) |
| T5 | delegated (writer trigger: 2+ non-trivial files) | a8bd475 | RED 3 failed (route-only row, pending markers, H1 scope) -> GREEN `npm run test:domain` 403 pass / 0 fail / 2 skipped; `npm run test:extension` 139 + 27 passing; `npm run check-types` clean; real document via `ODD_LEDGER_REAL_TABLE_CORPUS_DIR`: 0 unproven with table, 27 without | assessed 43a592f..fd1c764: medium, review_due=false (under_budget, 120 lines) → pending in slice; covered by the next assessment from boundary 43a592f |

## Next step

Delivery: create the stacked-to-main PR chain (push and PR creation await the user).
