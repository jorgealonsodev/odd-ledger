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

/** The same two checked tasks (T1, T2) and one open task (T3), with their
 * evidence written in a progress table in different hand-written formats.
 * Every variant must read the same way: T1 and T2 proven, commit `1a2b3c4`
 * and `5d6e7f8`, T3 open. */
function withTasks(evidence: string, newline = '\n'): string {
  return [
    '# Feature: format variants',
    '',
    '## Tasks',
    '',
    '- [x] T1 First',
    '- [x] T2 Second',
    '- [ ] T3 Third',
    '',
    evidence,
    '',
    '## Next step',
    '',
    'T3.',
  ].join(newline);
}

export const PROGRESS_TABLE_VARIANTS: ReadonlyArray<{ readonly name: string; readonly text: string }> = [
  {
    name: 'no leading or trailing pipes, plain delimiter',
    text: withTasks(['## Progress', '', 'Task | Commit | Checks', '--- | --- | ---', 'T1 | 1a2b3c4 | ok', 'T2 | 5d6e7f8 | ok'].join('\n')),
  },
  {
    name: 'alignment colons, padded cells, bold and code IDs, trailing pipes',
    text: withTasks(
      [
        '## Progress / evidence',
        '',
        '| Task    | Commit  | Checks |',
        '|:--------|:-------:|-------:|',
        '| **T1**  | `1a2b3c4` | ok   |',
        '| `T2`    | 5d6e7f8 | ok     |',
      ].join('\n'),
    ),
  },
  {
    name: 'escaped pipe and pipe inside a code span',
    text: withTasks(
      ['## Evidence', '', '| ID | Checks | Commit |', '| --- | --- | --- |', '| T1 | a \\| b | 1a2b3c4 |', '| T2 | ran `x | y` | 5d6e7f8 |'].join('\n'),
    ),
  },
  {
    name: 'ragged rows: a short row and a row with an extra cell',
    text: withTasks(['## Progress', '', '| Task | Checks | Commit |', '| --- | --- | --- |', '| T1 | ok | 1a2b3c4 | extra |', '| T2 | ok |', '| T2 follow-up | ok | 5d6e7f8 |'].join('\n')),
  },
  {
    name: 'Spanish first-column header',
    text: withTasks(['## Evidence', '', '| Tarea | Ruta | Commit |', '| --- | --- | --- |', '| T1 | inline | 1a2b3c4 |', '| T2 | inline | 5d6e7f8 |'].join('\n')),
  },
  {
    name: 'two tables under different evidence headings',
    text: withTasks(
      [
        '## Progress',
        '',
        '| Task | Commit |',
        '| --- | --- |',
        '| T1 | 1a2b3c4 |',
        '',
        '### Evidence log',
        '',
        '| Task ID | Commit |',
        '| --- | --- |',
        '| T2 | 5d6e7f8 |',
      ].join('\n'),
    ),
  },
  {
    name: 'CRLF line endings',
    text: withTasks(['## Progress', '', '| Task | Commit |', '| --- | --- |', '| T1 | 1a2b3c4 |', '| T2 | 5d6e7f8 |'].join('\r\n'), '\r\n'),
  },
];

/** A table that must NOT be read as evidence, and why. */
export const NOT_EVIDENCE_TABLES: ReadonlyArray<{ readonly name: string; readonly text: string }> = [
  {
    name: 'inside a fenced code block',
    text: withTasks(['## Progress', '', '```markdown', '| Task | Commit |', '| --- | --- |', '| T1 | 1a2b3c4 |', '| T2 | 5d6e7f8 |', '```'].join('\n')),
  },
  {
    name: 'under an unrelated heading',
    text: withTasks(['## Risks', '', '| Task | Commit |', '| --- | --- |', '| T1 | 1a2b3c4 |', '| T2 | 5d6e7f8 |'].join('\n')),
  },
  {
    name: 'first column is not a task ID header',
    text: withTasks(['## Progress', '', '| Owner | Commit |', '| --- | --- |', '| T1 | 1a2b3c4 |', '| T2 | 5d6e7f8 |'].join('\n')),
  },
];
