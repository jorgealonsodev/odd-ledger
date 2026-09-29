import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressEvidence } from './parse-progress-tables';
import { linkProgressEvidence } from './link-progress-evidence';
import type { EvidenceTask } from './link-progress-evidence';

/** Synthetic entries that name several tasks. */

const TASKS: EvidenceTask[] = [
  { id: 'T1', startLine: 10 },
  { id: 'T2', startLine: 11 },
  { id: 'T3', startLine: 12 },
  { id: 'T1.1', startLine: 13 },
  { id: 'T1.2', startLine: 14 },
  { id: 'T4', startLine: 15 },
  { id: null, startLine: 16 },
];

function link(body: string, tasks: readonly EvidenceTask[] = TASKS) {
  const { tables, lists } = parseProgressEvidence(`## Progress / evidence\n\n${body}\n`);
  return linkProgressEvidence(tables, tasks, lists);
}

function linkedLines(linked: ReturnType<typeof link>): number[] {
  return [...linked.byTask.keys()].sort((a, b) => a - b);
}

test('a leading ID group joined by , / & + and / y links every ID', () => {
  for (const line of [
    '- T1, T2 done: `aaaa111`',
    '- T1/T2 done: `aaaa111`',
    '- T1 & T2 done: `aaaa111`',
    '- T1 + T2 done: `aaaa111`',
    '- T1 and T2 done: `aaaa111`',
    '- T1 AND T2 done: `aaaa111`',
    '- T1 y T2: `aaaa111`',
    '- **T1**, `T2`: `aaaa111`',
    '- T1 , T2 done: `aaaa111`',
  ]) {
    const linked = link(line);
    assert.deepEqual(linkedLines(linked), [10, 11], line);
    assert.equal(linked.unattached.length, 0, line);
    assert.equal(linked.ambiguous.length, 0, line);
    assert.ok(linked.provenStartLines.has(10) && linked.provenStartLines.has(11), line);
  }
});

test('three IDs in a group all link, a repeated ID links once', () => {
  assert.deepEqual(linkedLines(link('- T1, T2 and T3: `aaaa111`')), [10, 11, 12]);
  const linked = link('- T1, T1 done: `aaaa111`');
  assert.equal(linked.byTask.get(10)?.length, 1);
});

test('the group ends at the first token that is not a known ID: "+ follow-ups"', () => {
  const linked = link('- T1.1/T1.2 + follow-ups: `9f1e2d3` wired both.');
  assert.deepEqual(linkedLines(linked), [13, 14]);
  assert.ok(linked.provenStartLines.has(13) && linked.provenStartLines.has(14));
});

test('a status echo after an ID group proves none of them', () => {
  for (const line of ['- T1, T2 done.', '- T1/T2 done', '- T1 and T2 pending', '- T1, T2: done!', '- T1 + T2']) {
    const linked = link(line);
    assert.deepEqual(linkedLines(linked), [10, 11], line);
    assert.equal(linked.provenStartLines.size, 0, line);
  }
});

test('an unknown ID ends the group and stays in the entry text', () => {
  const linked = link('- T1, T9 done: `aaaa111`');
  assert.deepEqual(linkedLines(linked), [10]);
  assert.equal(linked.byTask.get(10)?.[0].proves, true);
});

test('every linked task receives the whole entry, with one source label each', () => {
  const linked = link('- T1/T2 done: `aaaa111`');
  const [a] = linked.byTask.get(10) ?? [];
  const [b] = linked.byTask.get(11) ?? [];
  assert.equal(a.source, 'list "Progress / evidence", item 1');
  assert.equal(b.source, a.source);
  assert.equal(a.text, '- T1/T2 done: `aaaa111`'.slice(2));
  assert.equal(b.text, a.text);
  assert.equal(a.idCell, 'T1');
  assert.equal(b.idCell, 'T2');
  assert.equal(a.commit, 'aaaa111');
  assert.equal(b.commit, 'aaaa111');
  assert.equal(a.matchCount, 1);
});

test('a single-ID entry still shows the text after the ID', () => {
  assert.equal(link('- T1 done: `aaaa111`').byTask.get(10)?.[0].text, 'done: `aaaa111`');
});

test('clause-start IDs after a comma or semicolon link too, each with the commit of its own clause', () => {
  const linked = link('- T1.1 `22deb08` (RED 4/9), T1.2 `7a87dcf` (GREEN 12/12)');
  assert.deepEqual(linkedLines(linked), [13, 14]);
  assert.equal(linked.byTask.get(13)?.[0].commit, '22deb08');
  assert.equal(linked.byTask.get(14)?.[0].commit, '7a87dcf');
  assert.ok(linked.provenStartLines.has(13) && linked.provenStartLines.has(14));
  assert.equal(link('- T1 `aaaa111`; T2 `bbbb222`').byTask.get(11)?.[0].commit, 'bbbb222');
});

test('a clause-start ID without a commit in its clause falls back to the first commit of the entry', () => {
  const linked = link('- T1 `aaaa111` done, T2 verified by hand');
  assert.equal(linked.byTask.get(11)?.[0].commit, 'aaaa111');
});

test('a clause-start ID may itself open an ID group', () => {
  assert.deepEqual(linkedLines(link('- T1 `aaaa111`, T2/T3 `bbbb222`')), [10, 11, 12]);
});

test('commas inside parentheses or code spans do not open a clause', () => {
  assert.deepEqual(linkedLines(link('- T1 `aaaa111` (RED 3, T2 failing)')), [10]);
  assert.deepEqual(linkedLines(link('- T1 done: `aaaa111, T2 x`')), [10]);
});

test('an ID mentioned mid-sentence never links', () => {
  const linked = link('- T3 done: `abc1234` fixes a regression introduced by T2.');
  assert.deepEqual(linkedLines(linked), [12]);
  assert.equal(linked.provenStartLines.has(11), false);
});

test('a leading range is a note, however it is written, and never links its clauses', () => {
  for (const line of ['- T1–T3 done: `aaaa111`', '- T1-T3 done: `aaaa111`', '- T1..T3 done: `aaaa111`', '- T1 - T3 done: `aaaa111`', '- T1 – T3 done: `aaaa111`', '- T1 to T3 done: `aaaa111`', '- T1–T9 done: `aaaa111`', '- T1, T2 – T3 done: `aaaa111`', '- T1 – T3, T2 `aaaa111`']) {
    const linked = link(line);
    assert.equal(linked.byTask.size, 0, line);
    assert.equal(linked.unattached.length, 1, line);
  }
});

test('a note that names IDs only after a range in prose stays a note', () => {
  const linked = link('- H0 code status: all tasks T1–T3 done; 91/91 tests.');
  assert.equal(linked.byTask.size, 0);
  assert.equal(linked.unattached.length, 1);
});

test('duplicate task IDs stay ambiguous per ID: the other IDs of the entry still link', () => {
  const tasks: EvidenceTask[] = [
    { id: 'T1', startLine: 10 },
    { id: 'T1', startLine: 20 },
    { id: 'T2', startLine: 11 },
  ];
  const linked = link('- T1 and T2 done: `aaaa111`', tasks);
  assert.deepEqual(linkedLines(linked), [11]);
  assert.equal(linked.ambiguous.length, 1);
  assert.equal(linked.ambiguous[0].matchCount, 2);
  assert.equal(linked.unattached.length, 0);
  assert.deepEqual([...linked.provenStartLines], [11]);
});

test('an entry whose only IDs are duplicated is ambiguous and linked to none', () => {
  const tasks: EvidenceTask[] = [
    { id: 'T1', startLine: 10 },
    { id: 'T1', startLine: 20 },
  ];
  const linked = link('- T1 done: `aaaa111`', tasks);
  assert.equal(linked.byTask.size, 0);
  assert.equal(linked.ambiguous.length, 1);
});

test('a table row whose ID cell names several tasks links to all of them', () => {
  for (const cell of ['T1, T2', 'T1/T2', 'T1 & T2', 'T1 and T2', 'T1 + T2', '**T1**, **T2**']) {
    const linked = link(`| Task | Commit |\n| --- | --- |\n| ${cell} | aaaa111 |`);
    assert.deepEqual(linkedLines(linked), [10, 11], cell);
    assert.equal(linked.byTask.get(10)?.[0].source, 'table "Progress / evidence", row 1', cell);
    assert.equal(linked.byTask.get(11)?.[0].commit, 'aaaa111', cell);
    assert.equal(linked.byTask.get(10)?.[0].idCell, 'T1', cell);
    assert.ok(linked.provenStartLines.has(10) && linked.provenStartLines.has(11), cell);
  }
});

test('a table row with an ID group and no other content proves nothing', () => {
  const linked = link('| Task | Commit |\n| --- | --- |\n| T1, T2 | — |');
  assert.deepEqual(linkedLines(linked), [10, 11]);
  assert.equal(linked.provenStartLines.size, 0);
});

test('a table row uses only its first cell: later cells never link tasks, ranges stay notes', () => {
  const linked = link('| Task | Commit | Notes |\n| --- | --- | --- |\n| T1 | aaaa111 | also T2, T3 |\n| T1 – T3 | bbbb222 | range |\n| T1..T3 | cccc333 | range |');
  assert.deepEqual(linkedLines(linked), [10]);
  assert.equal(linked.byTask.get(10)?.length, 1);
  assert.equal(linked.unattached.length, 2);
});

test('a table row keeps linking by the first word of a longer cell', () => {
  assert.deepEqual(linkedLines(link('| Task | Commit |\n| --- | --- |\n| T1 Loader | aaaa111 |')), [10]);
});
