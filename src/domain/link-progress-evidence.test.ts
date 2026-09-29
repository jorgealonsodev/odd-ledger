import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressTables } from './parse-progress-tables';
import { linkProgressEvidence, tableSourceLabel } from './link-progress-evidence';
import type { EvidenceTask } from './link-progress-evidence';

/** Synthetic tables only: neutral IDs and wording that reproduce the shape
 * of a progress table, never a real document. */
function link(table: string, tasks: readonly EvidenceTask[], heading = '## Progress / evidence') {
  const tables = parseProgressTables(`${heading}\n\n${table}\n`);
  return linkProgressEvidence(tables, tasks);
}

const TASKS: EvidenceTask[] = [
  { id: 'E1-4', startLine: 10 },
  { id: 'E1-5', startLine: 11 },
  { id: 'E5-5', startLine: 12 },
  { id: null, startLine: 13 },
];

const TABLE = [
  '| Task | Route + trigger | Commit | Checks |',
  '| --- | --- | --- | --- |',
  '| E1-4 | delegated | 7020bc6 | RED then GREEN |',
  '| E1-5 | inline | 09ecbc2 | ok |',
  '| DP-05 Rueda | inline | 1aa85b3, 87f9602 | flipped |',
  '| E5-5 cleanup | delegated | 27c8bd8, 81092c5 | multi-rule |',
  '| E5-5 | delegated | f5fe161 | suite passed |',
].join('\n');

test('tableSourceLabel names the table heading and the row', () => {
  assert.equal(tableSourceLabel('Progress / evidence', 12), 'table "Progress / evidence", row 12');
});

test('links a row to the task with the exact ID', () => {
  const linked = link(TABLE, TASKS);
  assert.equal(linked.byTask.get(10)?.length, 1);
  assert.equal(linked.byTask.get(10)?.[0].source, 'table "Progress / evidence", row 1');
  assert.equal(linked.byTask.get(11)?.length, 1);
});

test('falls back to the first token of the cell, keeping several rows per task in document order', () => {
  const linked = link(TABLE, TASKS);
  const rows = linked.byTask.get(12) ?? [];
  assert.deepEqual(rows.map((r) => r.idCell), ['E5-5 cleanup', 'E5-5']);
  assert.deepEqual(rows.map((r) => r.row), [4, 5]);
});

test('a row whose ID matches no task is unattached, shown and never linked', () => {
  const linked = link(TABLE, TASKS);
  assert.equal(linked.unattached.length, 1);
  assert.equal(linked.unattached[0].idCell, 'DP-05 Rueda');
  assert.equal(linked.ambiguous.length, 0);
  assert.equal([...linked.byTask.values()].flat().some((r) => r.idCell === 'DP-05 Rueda'), false);
});

test('strips emphasis and backticks from the ID cell before matching', () => {
  const linked = link('| Task | X |\n| --- | --- |\n| **E1-4** | a |\n| `E1-5` cleanup | b |', TASKS);
  assert.equal(linked.byTask.get(10)?.length, 1);
  assert.equal(linked.byTask.get(11)?.length, 1);
});

test('an empty ID cell or a prose-only ID cell is unattached', () => {
  const linked = link('| Task | X |\n| --- | --- |\n| | a |\n| Overall | b |', TASKS);
  assert.equal(linked.unattached.length, 2);
});

test('a duplicated task ID makes the row ambiguous: linked to none, counted once, with its match count', () => {
  const linked = link('| Task | X |\n| --- | --- |\n| T1 | a |', [
    { id: 'T1', startLine: 3 },
    { id: 'T1', startLine: 8 },
  ]);
  assert.equal(linked.ambiguous.length, 1);
  assert.equal(linked.ambiguous[0].matchCount, 2);
  assert.equal(linked.byTask.size, 0);
  assert.equal(linked.unattached.length, 0);
  assert.equal(linked.provenStartLines.size, 0);
});

test('the first-token fallback is ambiguous too when the token names two tasks', () => {
  const linked = link('| Task | X |\n| --- | --- |\n| T1 cleanup | a |', [
    { id: 'T1', startLine: 3 },
    { id: 'T1', startLine: 8 },
  ]);
  assert.equal(linked.ambiguous.length, 1);
});

test('an exact match wins over a first-token match', () => {
  const linked = link('| Task | X |\n| --- | --- |\n| T1 cleanup | a |', [
    { id: 'T1 cleanup', startLine: 5 },
    { id: 'T1', startLine: 3 },
  ]);
  assert.equal(linked.byTask.get(5)?.length, 1);
  assert.equal(linked.byTask.get(3), undefined);
});

test('row evidence is Header: cell pairs in column order, empty cells omitted', () => {
  const linked = link('| Task | Route | Commit | Checks |\n| --- | --- | --- | --- |\n| E1-4 | inline |  | ok |', TASKS);
  const row = linked.byTask.get(10)![0];
  assert.deepEqual(row.pairs, [
    { header: 'Task', value: 'E1-4' },
    { header: 'Route', value: 'inline' },
    { header: 'Checks', value: 'ok' },
  ]);
  assert.equal(row.text, 'Task: E1-4\nRoute: inline\nChecks: ok');
});

test('the commit comes from a column whose header contains "commit", ahead of tokens elsewhere', () => {
  const linked = link(
    '| Task | Checks | Commit(s) |\n| --- | --- | --- |\n| E1-4 | see 1111111 | 2222222 (+ docs 3333333) |',
    TASKS,
  );
  assert.equal(linked.byTask.get(10)![0].commit, '2222222');
});

test('with no commit column the first commit-like token in the row is used, ignoring the ID cell', () => {
  const linked = link('| Task | Checks | Notes |\n| --- | --- | --- |\n| E1-4 | ok | landed in 4444444 |', TASKS);
  assert.equal(linked.byTask.get(10)![0].commit, '4444444');
});

test('a row with no commit-like token has commit null', () => {
  const linked = link('| Task | Checks |\n| --- | --- |\n| E1-4 | deadbeef and abcdefg |', TASKS);
  assert.equal(linked.byTask.get(10)![0].commit, null);
});

test('a column whose header contains "route" supplies the route', () => {
  const linked = link(TABLE, TASKS);
  assert.equal(linked.byTask.get(10)![0].route, 'delegated');
  assert.equal(linked.byTask.get(11)![0].route, 'inline');
});

test('a row with an empty or dash-only route has route null', () => {
  const linked = link('| Task | Route |\n| --- | --- |\n| E1-4 | — |\n| E1-5 |  |', TASKS);
  assert.equal(linked.byTask.get(10)![0].route, null);
  assert.equal(linked.byTask.get(11)![0].route, null);
});

test('a linked row proves its task only with a non-empty, non-dash evidence cell outside the ID cell', () => {
  const proving = link('| Task | Checks |\n| --- | --- |\n| E1-4 | ok |', TASKS);
  assert.deepEqual([...proving.provenStartLines], [10]);

  for (const empty of ['', '—', '–', '-', '**—**', ' - ']) {
    const linked = link(`| Task | Commit | Checks |\n| --- | --- | --- |\n| E1-4 | ${empty} | ${empty} |`, TASKS);
    assert.equal(linked.provenStartLines.size, 0, `"${empty}" must not prove`);
    assert.equal(linked.byTask.get(10)?.length, 1, 'the row is still linked and shown');
    assert.equal(linked.byTask.get(10)![0].proves, false);
  }
});

test('the ID cell alone never proves, even for a row that has other empty cells only', () => {
  const linked = link('| Task | Checks |\n| --- | --- |\n| E1-4 | |', TASKS);
  assert.equal(linked.provenStartLines.size, 0);
});

test('a task with one empty row and one evidence row is proven', () => {
  const linked = link('| Task | Checks |\n| --- | --- |\n| E1-4 | — |\n| E1-4 cleanup | ok |', TASKS);
  assert.deepEqual([...linked.provenStartLines], [10]);
});

test('several tables in one document contribute rows to the same task, tables in document order', () => {
  const text = [
    '## Progress',
    '',
    '| Task | X |',
    '| --- | --- |',
    '| E1-4 | first |',
    '',
    '## Evidence',
    '',
    '| ID | X |',
    '| --- | --- |',
    '| E1-4 | second |',
  ].join('\n');
  const linked = linkProgressEvidence(parseProgressTables(text), TASKS);
  const rows = linked.byTask.get(10)!;
  assert.deepEqual(rows.map((r) => r.heading), ['Progress', 'Evidence']);
});

test('no tables, no linked evidence', () => {
  const linked = linkProgressEvidence([], TASKS);
  assert.equal(linked.byTask.size, 0);
  assert.equal(linked.unattached.length, 0);
  assert.equal(linked.ambiguous.length, 0);
  assert.equal(linked.provenStartLines.size, 0);
});

test('a task without an ID is never a link target', () => {
  const linked = link('| Task | X |\n| --- | --- |\n| Overall summary | a |', [{ id: null, startLine: 1 }]);
  assert.equal(linked.unattached.length, 1);
});

test('the Route column is not evidence: a row with only an ID and a route leaves the task unproven', () => {
  const linked = link('| Task | Route | Commit |\n| --- | --- | --- |\n| E1-4 | delegated | — |', TASKS);
  assert.equal(linked.provenStartLines.size, 0);
  assert.equal(linked.byTask.get(10)![0].proves, false);
  assert.equal(linked.byTask.get(10)![0].route, 'delegated', 'the route is still shown');
});

test('a bare pending marker is not evidence, whatever its case or emphasis', () => {
  for (const marker of ['pending', 'Pending', '**PENDING**', 'n/a', 'N/A', 'tbd', 'TBD', '_tbd_', '–']) {
    const linked = link(`| Task | Route | Review |\n| --- | --- | --- |\n| E1-4 | delegated | ${marker} |`, TASKS);
    assert.equal(linked.provenStartLines.size, 0, `"${marker}" must not prove`);
  }
});

test('a route plus a commit proves, and a review cell with real text proves', () => {
  const withCommit = link('| Task | Route | Commit |\n| --- | --- | --- |\n| E1-4 | delegated | 7020bc6 |', TASKS);
  assert.deepEqual([...withCommit.provenStartLines], [10]);
  const withReview = link('| Task | Route | Review |\n| --- | --- | --- |\n| E1-4 | delegated | approved |', TASKS);
  assert.deepEqual([...withReview.provenStartLines], [10]);
});
