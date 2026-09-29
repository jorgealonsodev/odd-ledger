import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressEvidence } from './parse-progress-tables';
import { linkProgressEvidence, listSourceLabel } from './link-progress-evidence';
import type { EvidenceTask } from './link-progress-evidence';

/** Synthetic progress lists only: neutral IDs and wording. */

const TASKS: EvidenceTask[] = [
  { id: 'T1', startLine: 10 },
  { id: 'T2', startLine: 11 },
  { id: 'T2.1b', startLine: 12 },
  { id: 'T3', startLine: 13 },
  { id: null, startLine: 14 },
];

function link(list: string, tasks: readonly EvidenceTask[] = TASKS) {
  const { tables, lists } = parseProgressEvidence(`## Progress / evidence\n\n${list}\n`);
  return linkProgressEvidence(tables, tasks, lists);
}

test('listSourceLabel names the heading and the item', () => {
  assert.equal(listSourceLabel('Progress / evidence', 4), 'list "Progress / evidence", item 4');
});

test('an entry links to the task named by its first token, keeping the source label', () => {
  const linked = link('- T1 done: commit `aaaa111`.');
  const rows = linked.byTask.get(10);
  assert.equal(rows?.length, 1);
  assert.equal(rows?.[0].source, 'list "Progress / evidence", item 1');
  assert.equal(rows?.[0].commit, 'aaaa111');
  assert.equal(rows?.[0].matchCount, 1);
  assert.ok(linked.provenStartLines.has(10));
});

test('emphasis, backticks and trailing : , — – are stripped from the first token', () => {
  for (const line of ['- **T1** done: aaaa111', '- `T1`: aaaa111', '- T1, aaaa111', '- T1— aaaa111', '- T1: aaaa111', '* __T1__: aaaa111']) {
    const linked = link(line);
    assert.equal(linked.byTask.get(10)?.length, 1, line);
    assert.equal(linked.unattached.length, 0, line);
  }
});

test('an ID with a suffix links exactly, and a longer or shorter ID does not', () => {
  const linked = link('- T2.1b done: aaaa111\n- T2.1 done: bbbb222\n- T2.1bc done: cccc333');
  assert.equal(linked.byTask.get(12)?.length, 1);
  assert.equal(linked.unattached.length, 2);
});

test('several entries for one task stay in document order, one item number each', () => {
  const linked = link('- T1 first: aaaa111\n- T2 x: bbbb222\n- T1 second: cccc333');
  assert.deepEqual(linked.byTask.get(10)?.map((r) => r.source), [
    'list "Progress / evidence", item 1',
    'list "Progress / evidence", item 3',
  ]);
});

test('an entry whose first token names no task is a note: unattached, counted toward nothing', () => {
  const linked = link('- H0 code status: all tasks T1–T3 done; 91/91 tests.\n- 2026-09-29: FVM installed.');
  assert.equal(linked.unattached.length, 2);
  assert.equal(linked.byTask.size, 0);
  assert.equal(linked.provenStartLines.size, 0);
  assert.equal(linked.unattached[0].idCell, 'H0');
  assert.equal(linked.unattached[0].matchCount, 0);
  assert.match(linked.unattached[0].text, /all tasks T1–T3 done/);
});

test('ranges and ID lists are never expanded', () => {
  for (const line of ['- T1–T3 done: aaaa111', '- T1-T3 done: aaaa111', '- T1, T2 done: aaaa111', '- T1 – T3 done: aaaa111', '- T1/T2 done: aaaa111']) {
    const linked = link(line);
    assert.equal(linked.byTask.size, 0, line);
    assert.equal(linked.unattached.length, 1, line);
  }
});

test('a duplicated task ID makes the entry ambiguous: linked to none', () => {
  const tasks: EvidenceTask[] = [
    { id: 'T1', startLine: 10 },
    { id: 'T1', startLine: 20 },
  ];
  const linked = link('- T1 done: aaaa111', tasks);
  assert.equal(linked.byTask.size, 0);
  assert.equal(linked.ambiguous.length, 1);
  assert.equal(linked.ambiguous[0].matchCount, 2);
  assert.equal(linked.provenStartLines.size, 0);
});

test('the commit is the first commit-like token in the whole entry, nested lines included', () => {
  const linked = link('- T1 done: no hash here\n  - nested: `bbbb222`, `cccc333`');
  assert.equal(linked.byTask.get(10)?.[0].commit, 'bbbb222');
});

test('an entry with no commit-like token has commit null', () => {
  assert.equal(link('- T1 done: verified by hand').byTask.get(10)?.[0].commit, null);
});

test('a status word alone does not prove: "- T1 done" and its siblings', () => {
  for (const word of ['done', 'DONE', 'Closed', 'complete', 'completed', 'finished', 'pending', 'in progress', 'wip', 'todo', 'blocked']) {
    for (const line of [`- T1 ${word}`, `- T1 ${word}:`, `- T1: ${word}.`.replace('.', ''), `- **T1** ${word}`]) {
      const linked = link(line);
      assert.equal(linked.byTask.get(10)?.length, 1, line);
      assert.equal(linked.provenStartLines.has(10), false, line);
      assert.equal(linked.byTask.get(10)?.[0].proves, false, line);
    }
  }
});

test('an ID with nothing after it, or only dashes or a placeholder, does not prove', () => {
  for (const line of ['- T1', '- T1 —', '- T1: -', '- T1 done — n/a', '- T1 done: TBD', '- T1 done: **pending**', '- T1 done: —']) {
    assert.equal(link(line).provenStartLines.has(10), false, line);
  }
});

test('a status word followed by real content proves', () => {
  for (const line of ['- T1 done: commit `aaaa111`', '- T1: `44deb34` (RED then GREEN)', '- T1 done: verified by hand', '- T1 in progress: half done, aaaa111']) {
    assert.equal(link(line).provenStartLines.has(10), true, line);
  }
});

test('only one leading status word is removed, so a second one counts as content', () => {
  assert.equal(link('- T1 done done').provenStartLines.has(10), true);
});

test('content on a nested line proves even when the first line is a bare status', () => {
  assert.equal(link('- T1 done\n  - commit `aaaa111`').provenStartLines.has(10), true);
});

test('the entry shown for a linked task is the text after the ID, without its separator', () => {
  const row = link('- T1 done: commit `aaaa111`').byTask.get(10)?.[0];
  assert.equal(row?.text, 'done: commit `aaaa111`');
  assert.deepEqual(row?.pairs, [{ header: '', value: 'done: commit `aaaa111`' }]);
  assert.equal(row?.idCell, 'T1');
  assert.equal(row?.route, null);
});

test('list entries follow table rows in a task\'s evidence, and each counts its own item number', () => {
  const doc = '## Progress / evidence\n\n| Task | Commit |\n| --- | --- |\n| T1 | aaaa111 |\n\n- T1 done: bbbb222\n';
  const { tables, lists } = parseProgressEvidence(doc);
  const linked = linkProgressEvidence(tables, TASKS, lists);
  assert.deepEqual(linked.byTask.get(10)?.map((r) => r.source), [
    'table "Progress / evidence", row 1',
    'list "Progress / evidence", item 1',
  ]);
});

test('linking with no lists behaves exactly as before', () => {
  const { tables } = parseProgressEvidence('## Progress\n\n| Task | Commit |\n| --- | --- |\n| T1 | aaaa111 |\n');
  const linked = linkProgressEvidence(tables, TASKS);
  assert.equal(linked.byTask.get(10)?.length, 1);
});
