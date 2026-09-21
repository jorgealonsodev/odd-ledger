import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentStructure } from './parse-document-structure';
import { parseChecklist } from './parse-checklist';

/**
 * parseChecklist is built on top of parseDocumentStructure (T3): every test
 * below runs the real T3 parser first and feeds its sections into T4,
 * exactly as the extension will. Fixture strings are synthetic and never
 * copy any real ODD document.
 */
function parse(text: string) {
  const structure = parseDocumentStructure(text);
  return parseChecklist(text, structure.sections);
}

test('groups items by section, carrying heading and kind from T3', () => {
  const text = [
    '# widget-export-v2',
    '',
    '## Tasks',
    '- [x] T1 Ship the export button',
    '- [ ] T2 Wire the export command',
    '',
    '## Acceptance criteria',
    '- [ ] Exporting a widget produces a file on disk',
  ].join('\n');

  const result = parse(text);

  assert.deepEqual(
    result.map((s) => [s.heading, s.kind, s.items.length]),
    [
      ['Tasks', 'tasks', 2],
      ['Acceptance criteria', 'acceptance-criteria', 1],
    ],
  );
});

test('IDs are scoped per section: two sections can both hold a T1', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [x] T1 First task',
    '',
    '## Pending',
    '- [ ] T1 A different, unrelated item that happens to share an ID',
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items[0].id, 'T1');
  assert.equal(result[0].items[0].title, 'First task');
  assert.equal(result[1].items[0].id, 'T1');
  assert.equal(result[1].items[0].title, 'A different, unrelated item that happens to share an ID');
});

test('a document can carry two independent ID namespaces with different prefixes', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [x] T1 Task one',
    '- [x] T2 Task two',
    '',
    '## Pending',
    '- [ ] P1 Pending one',
    '- [~] P2 Pending two, declined',
  ].join('\n');

  const result = parse(text);

  assert.deepEqual(result[0].items.map((i) => i.id), ['T1', 'T2']);
  assert.deepEqual(result[1].items.map((i) => i.id), ['P1', 'P2']);
});

test('checkbox states: open, done, declined, and an uppercase X tolerated as done', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [ ] T1 Open item',
    '- [x] T2 Done item',
    '- [X] T3 Done item, uppercase marker',
    '- [~] T4 Declined item',
  ].join('\n');

  const result = parse(text);

  assert.deepEqual(
    result[0].items.map((i) => i.state),
    ['open', 'done', 'done', 'declined'],
  );
});

test('an unrecognized marker renders as unknown, never dropped or coerced', () => {
  const text = ['# doc', '', '## Tasks', '- [?] T1 Something odd', '- [-] T2 Also odd'].join('\n');

  const result = parse(text);

  assert.deepEqual(
    result[0].items.map((i) => i.state),
    ['unknown', 'unknown'],
  );
});

test('a task line whose first token is not an identifier still renders, with no ID and the full text as title', () => {
  const text = [
    '# doc',
    '',
    '## Acceptance criteria',
    '- [ ] A task line whose first token is not `T<n>` still renders.',
    '- [ ] The project holding corpus documents D and E renders both.',
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items[0].id, null);
  assert.equal(result[0].items[0].title, 'A task line whose first token is not `T<n>` still renders.');
  assert.equal(result[0].items[1].id, null);
  assert.equal(result[0].items[1].title, 'The project holding corpus documents D and E renders both.');
});

test('an identifier is recognized by shape: T1, P3, RF-12, and 4.1 all qualify', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [ ] T1 First',
    '- [ ] P3 Second',
    '- [ ] RF-12 Third',
    '- [ ] 4.1 Fourth',
  ].join('\n');

  const result = parse(text);

  assert.deepEqual(
    result[0].items.map((i) => i.id),
    ['T1', 'P3', 'RF-12', '4.1'],
  );
});

test('continuation text on the next line becomes the item evidence', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [x] T1 Cache warmer',
    '      Evidence: 12/12 unit tests, linter clean. Commit 1a2b3c4.',
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items[0].title, 'Cache warmer');
  assert.equal(result[0].items[0].evidence, 'Evidence: 12/12 unit tests, linter clean. Commit 1a2b3c4.');
});

test('a section with no checklist items at all yields an empty items array', () => {
  const text = ['# doc', '', '## Constraints', 'Read-only. No checklist here.'].join('\n');

  const result = parse(text);

  assert.deepEqual(result[0].items, []);
});

test('inline code spans in the title are preserved untouched', () => {
  const text = ['# doc', '', '## Tasks', '- [x] T2 `RetryPolicy` backoff ceiling and jitter + tests'].join('\n');

  const result = parse(text);

  assert.equal(result[0].items[0].title, '`RetryPolicy` backoff ceiling and jitter + tests');
});

test('a bold-wrapped ID and title, where the bold closes mid-line, splits into title and evidence', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    "- [x] **T1 — Pin the timeout constant to its single source.** DONE `9f8e7d6`.",
  ].join('\n');

  const result = parse(text);
  const item = result[0].items[0];

  assert.equal(item.id, 'T1');
  assert.equal(item.title, 'Pin the timeout constant to its single source.');
  assert.equal(item.evidence, 'DONE `9f8e7d6`.');
});

test('a blank line between an item and its continuation does not break the attachment', () => {
  const text = ['# doc', '', '## Tasks', '- [x] T1 Title line', '', '      Evidence appears after a blank line.'].join(
    '\n',
  );

  const result = parse(text);
  const item = result[0].items[0];

  assert.equal(item.title, 'Title line');
  assert.equal(item.evidence, 'Evidence appears after a blank line.');
});

test('tabs used for continuation indentation are tolerated', () => {
  const text = ['# doc', '', '## Tasks', '- [x] T1 Title line', '\tEvidence indented with a tab.'].join('\n');

  const result = parse(text);
  const item = result[0].items[0];

  assert.equal(item.evidence, 'Evidence indented with a tab.');
});

test('CRLF line endings parse the same as LF', () => {
  const text = ['# doc', '', '## Tasks', '- [x] T1 Title line', '      Evidence on CRLF.'].join('\r\n');

  const result = parse(text);
  const item = result[0].items[0];

  assert.equal(item.title, 'Title line');
  assert.equal(item.evidence, 'Evidence on CRLF.');
});

test('a fenced code block inside an item continuation is kept as evidence, not split into items', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [x] T1 Title line',
    '      Evidence:',
    '      ```',
    '      - [ ] this looks like an item but is example code',
    '      ```',
    '- [ ] T2 Next real item',
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items.length, 2);
  assert.equal(result[0].items[0].id, 'T1');
  assert.match(result[0].items[0].evidence, /this looks like an item but is example code/);
  assert.equal(result[0].items[1].id, 'T2');
  assert.equal(result[0].items[1].title, 'Next real item');
});

test('a checklist-shaped line inside a top-level fenced code block is not parsed as an item', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    'Example of the grammar:',
    '```',
    '- [ ] not a real task, just documentation',
    '```',
    '- [x] T1 The only real item',
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].id, 'T1');
  assert.equal(result[0].items[0].title, 'The only real item');
});

test('alternate list bullet markers * and + are tolerated alongside -', () => {
  const text = ['# doc', '', '## Tasks', '* [x] T1 Started with an asterisk', '+ [ ] T2 Started with a plus'].join(
    '\n',
  );

  const result = parse(text);

  assert.deepEqual(
    result[0].items.map((i) => [i.id, i.state]),
    [
      ['T1', 'done'],
      ['T2', 'open'],
    ],
  );
});

test('items carry accurate 1-based start and end line numbers', () => {
  const text = [
    '# doc', // 1
    '', // 2
    '## Tasks', // 3
    '- [x] T1 First item', // 4
    '      More evidence.', // 5
    '- [ ] T2 Second item', // 6
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items[0].startLine, 4);
  assert.equal(result[0].items[0].endLine, 5);
  assert.equal(result[0].items[1].startLine, 6);
  assert.equal(result[0].items[1].endLine, 6);
});

test('rawText preserves the original literal source lines of the item', () => {
  const text = ['# doc', '', '## Tasks', '- [x] T1 First item', '      Evidence line.'].join('\n');

  const result = parse(text);

  assert.equal(result[0].items[0].rawText, '- [x] T1 First item\n      Evidence line.');
});

test('an informal prose label between runs of items is not attached to the previous item as evidence', () => {
  const text = [
    '# doc',
    '',
    '## Tasks',
    '- [x] T1 First item',
    'Found during rollout:',
    '- [ ] T2 Second item',
  ].join('\n');

  const result = parse(text);

  assert.equal(result[0].items.length, 2);
  assert.equal(result[0].items[0].evidence, '');
  assert.equal(result[0].items[1].id, 'T2');
});
