/**
 * Synthetic feature documents that record their evidence in a progress
 * table. Neutral IDs and wording only: they reproduce the shape of a
 * table-format document (one row per task, first column the task ID, an
 * extra row for a follow-up, a row for an unknown ID), never a real one.
 */

/** Seven tasks. E1-4, E1-5 and E5-5 are proven by the table; E1-2 is open
 * with a row; E2-1 is checked with a row that says nothing; E2-2 is checked
 * with no row; E2-3 is open with none. `DP-05 Rueda` names no task. */
export const PROGRESS_TABLE_DOCUMENT = [
  '# Feature: table demo',
  '',
  '## Tasks',
  '',
  '### E1 — Skeleton',
  '- [x] E1-4 Health endpoint',
  '- [x] E1-5 Configuration',
  '      An inline note, commit aaaa111.',
  '- [ ] E1-2 CI pipeline',
  '',
  '### E2 — Loading',
  '- [x] E2-1 Loader',
  '- [x] E2-2 Parser',
  '- [ ] E2-3 Cache',
  '',
  '### E5 — Closure',
  '- [x] E5-5 Documentation',
  '',
  '## Progress / evidence',
  '',
  '| Task | Route + trigger | Commit | Checks | Review tier/outcome |',
  '| --- | --- | --- | --- | --- |',
  '| E1-4 | delegated (writer trigger) | 7020bc6 | RED import error -> GREEN 8 passed | slice one: approved |',
  '| E1-5 | inline | 09ecbc2 | GREEN 53 passed | same slice |',
  '| E1-2 | | 3333333 | partial | pending |',
  '| E2-1 | — | — | — | — |',
  '| DP-05 Rueda | inline | 1aa85b3 | flipped | same slice |',
  '| E5-5 cleanup | delegated | 27c8bd8, 81092c5 | multi-rule checks | same slice |',
  '| E5-5 | delegated | f5fe161 | suite passed | same slice |',
  '',
  '## Next step',
  '',
  'E2-3.',
].join('\n');
