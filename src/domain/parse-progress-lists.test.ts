import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressLists, parseProgressTables } from './parse-progress-tables';

/** Synthetic documents only: neutral IDs and wording that reproduce the
 * shape of a progress list, never a real document. */

const HEAD = '# Feature: demo\n\n## Progress / evidence\n\n';

test('reads top-level bullets under a progress heading, one entry per item', () => {
  const lists = parseProgressLists(`${HEAD}- T1 done: commit \`aaaa111\`.\n- T2: \`bbbb222\`\n`);
  assert.equal(lists.length, 2);
  assert.deepEqual(
    lists.map((l) => [l.heading, l.item, l.line, l.text]),
    [
      ['Progress / evidence', 1, 5, 'T1 done: commit `aaaa111`.'],
      ['Progress / evidence', 2, 6, 'T2: `bbbb222`'],
    ],
  );
});

test('accepts -, *, +, "1." and "1)" markers', () => {
  const lists = parseProgressLists(`${HEAD}- a1\n* b2\n+ c3\n1. d4\n2) e5\n`);
  assert.deepEqual(lists.map((l) => l.text), ['a1', 'b2', 'c3', 'd4', 'e5']);
  assert.deepEqual(lists.map((l) => l.item), [1, 2, 3, 4, 5]);
});

test('an evidence heading may also start with "evidence"', () => {
  const lists = parseProgressLists('## Evidence log\n\n- T1 done: x1\n');
  assert.equal(lists.length, 1);
  assert.equal(lists[0].heading, 'Evidence log');
});

test('lists outside a progress or evidence heading are never read', () => {
  assert.deepEqual(parseProgressLists('## Scope\n\n- T1 done: commit `aaaa111`\n'), []);
});

test('the document title H1 never opens a scope, even when it starts with "Progress"', () => {
  assert.deepEqual(parseProgressLists('# Progress report\n\n- T1 done: commit `aaaa111`\n'), []);
});

test('a heading nested under a progress heading keeps the scope, and the heading text is the nearest evidence heading', () => {
  const lists = parseProgressLists('## Progress / evidence\n\n### Week 1\n\n- T1 x1\n');
  assert.equal(lists.length, 1);
  assert.equal(lists[0].heading, 'Progress / evidence');
});

test('continuation and nested lines belong to the entry, up to the next top-level item', () => {
  const lists = parseProgressLists(`${HEAD}- T1 done: first\n  wrapped line\n  - nested one\n  - nested two\n- T2 next\n`);
  assert.equal(lists.length, 2);
  assert.equal(lists[0].text, 'T1 done: first\nwrapped line\n- nested one\n- nested two');
  assert.equal(lists[1].text, 'T2 next');
});

test('a lazy continuation line (no indent, no blank before it) stays in the entry', () => {
  const lists = parseProgressLists(`${HEAD}- T1 done: first\nsecond half\n- T2 next\n`);
  assert.equal(lists[0].text, 'T1 done: first\nsecond half');
});

test('a blank line followed by an indented line continues the entry', () => {
  const lists = parseProgressLists(`${HEAD}- T1 done: first\n\n  more detail\n- T2 next\n`);
  assert.equal(lists[0].text, 'T1 done: first\n\nmore detail');
});

test('a blank line followed by a non-indented prose line ends the entry, and the prose is not read', () => {
  const lists = parseProgressLists(`${HEAD}- T1 done: first\n\nA paragraph.\nstill the paragraph\n- T2 next\n`);
  assert.deepEqual(lists.map((l) => l.text), ['T1 done: first', 'T2 next']);
});

test('a heading ends the entry and the section', () => {
  const lists = parseProgressLists(`${HEAD}- T1 x1\n## Next step\n\n- T2 x2\n`);
  assert.deepEqual(lists.map((l) => l.text), ['T1 x1']);
});

test('a table ends the entry, and a table and a list coexist in one section', () => {
  const doc = `${HEAD}| Task | Commit |\n| --- | --- |\n| T1 | aaaa111 |\n\n- T2 done: bbbb222\n- T3 - t3note\n`;
  assert.equal(parseProgressTables(doc).length, 1);
  const lists = parseProgressLists(doc);
  assert.deepEqual(lists.map((l) => l.text), ['T2 done: bbbb222', 'T3 - t3note']);
  assert.deepEqual(lists.map((l) => l.item), [1, 2]);
});

test('a list entry directly followed by a table header row ends at the table', () => {
  const doc = `${HEAD}- T1 done: aaaa111\n| Task | Commit |\n| --- | --- |\n| T2 | bbbb222 |\n`;
  assert.deepEqual(parseProgressLists(doc).map((l) => l.text), ['T1 done: aaaa111']);
  assert.equal(parseProgressTables(doc).length, 1);
});

test('lists inside fenced code are examples, not entries', () => {
  const doc = `${HEAD}\`\`\`\n- T1 done: aaaa111\n\`\`\`\n- T2 done: bbbb222\n`;
  assert.deepEqual(parseProgressLists(doc).map((l) => l.text), ['T2 done: bbbb222']);
});

test('checkbox items are tasks, not evidence entries', () => {
  const doc = `${HEAD}- [x] T1 a task\n- [ ] T2 another\n- T3 done: aaaa111\n`;
  assert.deepEqual(parseProgressLists(doc).map((l) => l.text), ['T3 done: aaaa111']);
});

test('checkbox items do not consume an item number', () => {
  const doc = `${HEAD}- [x] T1 a task\n- [ ] T2 another\n- T3 done: aaaa111\n- T4 done: bbbb222\n`;
  assert.deepEqual(parseProgressLists(doc).map((l) => [l.text, l.item]), [
    ['T3 done: aaaa111', 1],
    ['T4 done: bbbb222', 2],
  ]);
});

test('thematic breaks are not entries and end the current entry', () => {
  for (const hr of ['* * *', '- - -', '***', '---', '___', '_ _ _', '  ***', '-----']) {
    const doc = `${HEAD}- T1 done: aaaa111\n${hr}\n- T2 done: bbbb222\n`;
    const lists = parseProgressLists(doc);
    assert.deepEqual(lists.map((l) => [l.text, l.item]), [['T1 done: aaaa111', 1], ['T2 done: bbbb222', 2]], hr);
  }
  assert.deepEqual(parseProgressLists(`${HEAD}* * *\n- - -\n`), []);
});

test('item numbers restart under each evidence heading', () => {
  const doc = '## Progress\n\n- a1\n- b2\n\n## Evidence\n\n- c3\n';
  assert.deepEqual(parseProgressLists(doc).map((l) => [l.heading, l.item]), [
    ['Progress', 1],
    ['Progress', 2],
    ['Evidence', 1],
  ]);
});

test('CRLF endings read the same', () => {
  const lists = parseProgressLists(`${HEAD}- T1 a1\n  more\n- T2 b2\n`.replace(/\n/g, '\r\n'));
  assert.deepEqual(lists.map((l) => l.text), ['T1 a1\nmore', 'T2 b2']);
});

test('a document with no progress heading has no entries', () => {
  assert.deepEqual(parseProgressLists('# T\n\n- item\n'), []);
});
