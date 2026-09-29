import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressTables } from './parse-progress-tables';

/**
 * Every fixture here is synthetic: neutral task IDs and wording that only
 * reproduce the *shape* of a progress table, never a real document.
 */

const BASIC = [
  '# Feature: demo',
  '',
  '## Tasks',
  '',
  '- [x] T1 First',
  '',
  '## Progress / evidence',
  '',
  '| Task | Route | Commit | Checks |',
  '| --- | --- | --- | --- |',
  '| T1 | inline | 1a2b3c4 | RED then GREEN |',
  '| T2 | delegated | 5d6e7f8 | ok |',
  '',
  '## Next step',
  '',
  'T3.',
].join('\n');

test('detects a table under "Progress / evidence" and reads its headers and rows', () => {
  const tables = parseProgressTables(BASIC);
  assert.equal(tables.length, 1);
  const [table] = tables;
  assert.equal(table.heading, 'Progress / evidence');
  assert.equal(table.headingLine, 7);
  assert.equal(table.headerLine, 9);
  assert.deepEqual(table.headers, ['Task', 'Route', 'Commit', 'Checks']);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], { row: 1, line: 11, cells: ['T1', 'inline', '1a2b3c4', 'RED then GREEN'] });
  assert.equal(table.rows[1].row, 2);
  assert.equal(table.rows[1].line, 12);
});

test('accepts the heading variants that start with progress or evidence, at any level', () => {
  for (const heading of ['## Evidence', '## Progress', '### Evidence log', '## progress notes', '## EVIDENCE (v2)']) {
    const text = `${heading}\n\n| Task | X |\n| --- | --- |\n| T1 | y |\n`;
    assert.equal(parseProgressTables(text).length, 1, heading);
  }
});

test('ignores a table under a heading that is not progress or evidence', () => {
  for (const heading of ['## Scope', '## Risks', '## Tasks', '## Unprogressive', '## Delivery evidence']) {
    const text = `${heading}\n\n| Task | X |\n| --- | --- |\n| T1 | y |\n`;
    assert.equal(parseProgressTables(text).length, 0, heading);
  }
});

test('the document title (first H1) scopes nothing, even when it starts with progress', () => {
  const text = '# Progress report\n\n| Task | X |\n| --- | --- |\n| T1 | y |\n';
  assert.equal(parseProgressTables(text).length, 0);
});

test('ignores a table before any heading', () => {
  assert.equal(parseProgressTables('| Task | X |\n| --- | --- |\n| T1 | y |\n').length, 0);
});

test('a table under a deeper heading inherits an evidence ancestor, and names that ancestor', () => {
  const text = '## Evidence\n\n### E1\n\n| Task | X |\n| --- | --- |\n| T1 | y |\n';
  const [table] = parseProgressTables(text);
  assert.equal(table.heading, 'Evidence');
  assert.equal(table.headingLine, 1);
});

test('a sibling heading ends the ancestor scope', () => {
  const text = '## Evidence\n\ntext\n\n## Scope\n\n### Detail\n\n| Task | X |\n| --- | --- |\n| T1 | y |\n';
  assert.equal(parseProgressTables(text).length, 0);
});

test('accepts Task, ID, Task ID and Tarea as the first-column header, case-insensitively', () => {
  for (const first of ['Task', 'task', 'ID', 'Id', 'Task ID', 'TASK ID', 'Task-ID', 'Tarea', '**Task**', '`ID`']) {
    const text = `## Progress\n\n| ${first} | X |\n| --- | --- |\n| T1 | y |\n`;
    assert.equal(parseProgressTables(text).length, 1, first);
  }
});

test('rejects a table whose first column is something else', () => {
  for (const first of ['Risk', 'Name', 'Item', 'Commit', 'Tasks done']) {
    const text = `## Progress\n\n| ${first} | X |\n| --- | --- |\n| T1 | y |\n`;
    assert.equal(parseProgressTables(text).length, 0, first);
  }
});

test('tolerates rows and delimiter without leading or trailing pipes', () => {
  const text = '## Evidence\n\nTask | Commit | Checks\n--- | --- | ---\nT1 | 1a2b3c4 | ok\nT2 | 5d6e7f8 | ok |\n';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.headers, ['Task', 'Commit', 'Checks']);
  assert.deepEqual(table.rows.map((r) => r.cells), [
    ['T1', '1a2b3c4', 'ok'],
    ['T2', '5d6e7f8', 'ok'],
  ]);
});

test('tolerates alignment colons and extra spaces in the delimiter row', () => {
  const text = '## Evidence\n\n| Task | Commit | Checks |\n|:---|:---:|---:|\n|  T1  |   1a2b3c4   | ok |\n';
  const [table] = parseProgressTables(text);
  assert.equal(table.rows.length, 1);
  assert.deepEqual(table.rows[0].cells, ['T1', '1a2b3c4', 'ok']);
});

test('an escaped pipe stays inside its cell and is unescaped', () => {
  const text = '## Evidence\n\n| Task | Checks |\n| --- | --- |\n| T1 | a \\| b |\n';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.rows[0].cells, ['T1', 'a | b']);
});

test('a pipe inside a code span stays inside its cell, code span preserved', () => {
  const text = '## Evidence\n\n| Task | Checks |\n| --- | --- |\n| T1 | ran `a | b` fine | \n| T2 | ``x | `y` | z`` ok |\n';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.rows[0].cells, ['T1', 'ran `a | b` fine']);
  assert.deepEqual(table.rows[1].cells, ['T2', '``x | `y` | z`` ok']);
});

test('an unmatched backtick does not swallow the rest of the row', () => {
  const text = '## Evidence\n\n| Task | A | B |\n| --- | --- | --- |\n| T1 | it`s | fine |\n';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.rows[0].cells, ['T1', 'it`s', 'fine']);
});

test('ragged rows: missing cells are padded empty, extra cells are kept', () => {
  const text = '## Evidence\n\n| Task | A | B |\n| --- | --- | --- |\n| T1 | only |\n| T2 | a | b | extra |\n';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.rows[0].cells, ['T1', 'only', '']);
  assert.deepEqual(table.rows[1].cells, ['T2', 'a', 'b', 'extra']);
});

test('reads several progress tables in one document, each with its own heading', () => {
  const text = [
    '## Progress',
    '',
    '| Task | A |',
    '| --- | --- |',
    '| T1 | x |',
    '',
    '## Evidence',
    '',
    '| ID | A |',
    '| --- | --- |',
    '| T2 | y |',
  ].join('\n');
  const tables = parseProgressTables(text);
  assert.deepEqual(tables.map((t) => t.heading), ['Progress', 'Evidence']);
  assert.deepEqual(tables.map((t) => t.rows[0].cells[0]), ['T1', 'T2']);
});

test('a table inside a fenced code block is not a table', () => {
  const text = '## Evidence\n\n```markdown\n| Task | A |\n| --- | --- |\n| T1 | x |\n```\n';
  assert.equal(parseProgressTables(text).length, 0);
});

test('a heading inside a fenced code block does not scope a table', () => {
  const text = '## Scope\n\n```\n## Evidence\n```\n\n| Task | A |\n| --- | --- |\n| T1 | x |\n';
  assert.equal(parseProgressTables(text).length, 0);
});

test('a table ends at the first blank line, prose without pipes, or heading', () => {
  const text = '## Evidence\n\n| Task | A |\n| --- | --- |\n| T1 | x |\nplain prose\n| T2 | y |\n';
  const [table] = parseProgressTables(text);
  assert.equal(table.rows.length, 1);
});

test('a header line without a valid delimiter row is not a table', () => {
  const text = '## Evidence\n\n| Task | A |\n| T1 | x |\n| T2 | y |\n';
  assert.equal(parseProgressTables(text).length, 0);
});

test('a row whose cells are all empty is dropped; a row with only an ID is kept', () => {
  const text = '## Evidence\n\n| Task | A |\n| --- | --- |\n| | |\n| T1 | |\n';
  const [table] = parseProgressTables(text);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].row, 2, 'row numbers count the data rows as written');
  assert.deepEqual(table.rows[0].cells, ['T1', '']);
});

test('tolerates CRLF line endings and a table on the last line without a newline', () => {
  const text = '## Evidence\r\n\r\n| Task | A |\r\n| --- | --- |\r\n| T1 | x |';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.rows[0].cells, ['T1', 'x']);
});

test('header cells are stripped of emphasis and code markers', () => {
  const text = '## Evidence\n\n| **Task** | `Commit` | _Checks_ |\n| --- | --- | --- |\n| T1 | a | b |\n';
  const [table] = parseProgressTables(text);
  assert.deepEqual(table.headers, ['Task', 'Commit', 'Checks']);
});

test('a document without any table yields none', () => {
  assert.deepEqual(parseProgressTables('# T\n\n## Evidence\n\njust prose\n'), []);
  assert.deepEqual(parseProgressTables(''), []);
});
