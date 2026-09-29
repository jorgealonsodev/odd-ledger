# progress-list-evidence — accept evidence recorded as a progress list

**Feature**: `progress-list-evidence`
**Started**: 2026-09-29
**Branch**: `feat/progress-list-evidence`
**Route**: Organic Driven Development (ODD). Not an SDD change.
**Engram mirror**: topic `odd/progress-list-evidence/tasks`, project `odd-ledger`
**Locator**: `odd/tasks/progress-list-evidence.md`
**Release target**: 1.2.1 (user authorized implementation and publication, 2026-09-29)

## Objective

A feature document that records its evidence as a bullet list under a progress/evidence
heading, one entry per task starting with the task ID, must render those closed tasks as
proven — the same way 1.2.0 reads a progress table.

## Problem

Observed on 1.2.0 with a real document (a different project, not committed here): its
`## Progress / evidence` section is a bullet list such as

```markdown
- T0.1 done: commit `a9526b1` (docs-only root commit).
- T0.4b done: `44deb34` (RED 6/31 failing, GREEN 30/30).
- T0.7b: `51b3b62` (RED: ...; GREEN 17 scenarios). RDD: high → **granted** → **approved**
- 2026-09-29: FVM 4.3.1 installed via brew; Flutter 3.47.5 stable installed.
- H0 code status: all tasks T0.1–T0.6b done; 91/91 tests.
```

1.2.0 only reads pipe tables in that section, so 28 of 30 closed tasks show as unproven.

## Why

The user asked for evidence to be read "from different formats equally". A per-task log
list is as unambiguous as a table row.

## Scope (authorized)

- Under the same headings a progress table is accepted under (normalised slug starting with
  `progress` or `evidence`; the document title H1 never opens a scope), read top-level list
  items (`-`, `*`, `+`, `1.`) as progress entries. An entry's text includes its continuation
  lines and nested lines up to the next top-level item, blank line followed by a non-indented
  line, heading, or table.
- Linking: strip emphasis/backticks; the entry's first token, with trailing `:` / `,` / `—`
  removed, must match a task ID exactly (same ID grammar as the table linker, reused, not
  duplicated). No exact first-token match → document-level note (shown with the unattached
  rows, counted toward no task). Duplicate task IDs → ambiguous, linked to none. Ranges or
  ID lists (`T0.1–T0.6b`, `T1, T2`) are never expanded.
- Evidence: the entry text after the ID. It proves a checked task only if, after removing the
  ID, separators, and a leading status word (`done`, `closed`, `complete(d)`, `finished`,
  `pending`, `in progress`, `wip`, `todo`, `blocked`), something other than empty/dash/
  placeholder (`pending`, `n/a`, `tbd`) remains. An entry for an open task never changes its
  state. Commit = first commit-like token in the entry (existing semantics).
- Several entries per task in document order; inline evidence first, then table rows, then
  list entries, each naming its source (`list "<heading>", item N`).
- Rendering reuses the existing evidence/markdown path: raw HTML escaped, images off, same
  link allow-list.
- Release 1.2.1: version bump, CHANGELOG, tag, GitHub release with vsix.
- Out: Marketplace/Open VSX publication (manual, user).

## Constraints

- Hexagonal layout: parsing/linking in `src/domain/`, rendering in `src/adapter/`.
- No regression: documents without progress lists behave exactly as 1.2.0; a table and a
  list may coexist in one section.
- The real document that motivated this (`odd/tasks/nexolink32-v1.md`, untracked in this
  checkout) belongs to another project and is never committed; fixtures are synthetic.

## TDD

- Mode: strict, ON. Source: user global config (`~/.claude/CLAUDE.md`, "Strict TDD Mode: enabled").
- Runner: `npm run test:domain`; `npm run test:extension` for adapter changes.

## Delivery

- Forecast: ~400–600 authored changed lines. Strategy `ask-on-risk`; chain strategy cached
  from progress-table-evidence: `stacked-to-main`.
- RDD: on (global).

## Tasks

- [x] T1 Domain: parse progress list entries under progress/evidence headings, link them to tasks, derive evidence/commit, honesty rules, merge with inline and table evidence; source labels; panel/tree show list evidence and notes.
- [x] T1b Fix review-0086e4aff8993372 advisories (four items).
- [x] T2 Release 1.2.1: README/CHANGELOG, version bump, merge, tag, GitHub release with vsix.

## Acceptance criteria

1. The motivating document renders every closed task that has a `Tn.m ...` entry with a commit as proven (only tasks with no entry stay unproven).
2. `- T0.1 done` alone (no further content) leaves T0.1 unproven.
3. `- H0 code status: all tasks T0.1–T0.6b done` links to no task and is shown as a note.
4. Entries for open tasks do not change their state.
5. Documents without a progress list are unchanged from 1.2.0; all existing tests stay green.
6. Every evidence piece names its source.
7. Security posture unchanged.

## Progress / evidence

| Task | Route + trigger | Commit | Checks | Review tier/outcome |
| --- | --- | --- | --- | --- |
| T1 | delegated writer (writer trigger: parser, linker, model, panel and tree tests) | `abcf10e` | RED: compile error (missing `parseProgressLists`, `listSourceLabel`, 3-arg `linkProgressEvidence`) then GREEN test:domain 453 pass / 0 fail (2 opt-in skips), test:extension 148 + 27 pass, check-types and compile clean, test:package 18 pass; real-document probe: done 30, doneUnproven 5 (was 28) | medium → granted → **approved** (review-0086e4aff8993372, 1 lens, burned); 4 advisories → T1b |
| T1b | delegated writer (writer trigger: parser, linker, tests, docs) | `e2d416a` | RED: 3 new tests failing (trailing punctuation proves, thematic breaks become entries, checkbox consumes item number), then GREEN test:domain 457 pass / 0 fail, test:extension, check-types, test:package clean; real-document probe still done 30 / total 37 / doneUnproven 5 (its unproven tasks have no entry) | assessed b24c1cf..22feb54: medium, review_due=false (under_budget, 64 lines); fixes the advisories of the approved review-0086e4aff8993372 |
| T2 | parent (release, mechanical) | `a7e4a05` | PR #9 merged as `b534730`, tag `v1.2.1`, GitHub release with vsix: https://github.com/jorgealonsodev/odd-ledger/releases/tag/v1.2.1 | not applicable (release commit) |

## Next step

Done. Follow-up: feature `multi-id-evidence` (lines naming several IDs count for all).
