import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel } from './build-feature-model';
import { buildEvidencePieces, formatEvidenceRowMarkdown, INLINE_EVIDENCE_SOURCE } from './build-evidence-pieces';
import { renderMarkdown } from './render-markdown';
import { PROGRESS_TABLE_DOCUMENT } from './fixtures/progress-table-documents';

/**
 * buildEvidencePieces turns a task's evidence (inline text, then table rows)
 * into source-labelled Markdown pieces, the one shape the tree tooltip and
 * the detail panel both render. Table cells are document content from a
 * file the user merely cloned, so they go through the same
 * prepareEvidenceMarkdown -> renderMarkdown path as inline evidence, and the
 * security posture of that path is asserted here for cells specifically.
 */

function model(text: string) {
  return buildFeatureModel('sample', '/does/not/matter/sample.md', text);
}

function task(text: string, id: string) {
  const found = model(text)
    .sections.flatMap((s) => s.items)
    .find((i) => i.id === id);
  assert.ok(found);
  return found;
}

function docWithCell(cell: string): string {
  return ['# F', '', '## Tasks', '', '- [x] T1 First', '', '## Progress', '', '| Task | Checks |', '| --- | --- |', `| T1 | ${cell} |`].join('\n');
}

test('a row renders as one bold-headed list item per non-empty cell, in column order', () => {
  const t = task(PROGRESS_TABLE_DOCUMENT, 'E1-4');
  const markdown = formatEvidenceRowMarkdown(t.tableEvidence[0]);
  const lines = markdown.split('\n');
  assert.equal(lines[0], '- **Task**: E1-4');
  assert.equal(lines[1], '- **Route + trigger**: delegated (writer trigger)');
  assert.equal(lines[2], '- **Commit**: 7020bc6');
  assert.equal(lines.length, 5);
});

test('markdown-significant characters in a header cannot break the row markup', () => {
  const text = ['# F', '', '## Tasks', '', '- [x] T1 First', '', '## Progress', '', '| Task | a_b[c](x) |', '| --- | --- |', '| T1 | ok |'].join('\n');
  const markdown = formatEvidenceRowMarkdown(task(text, 'T1').tableEvidence[0]);
  assert.ok(markdown.includes('- **a\\_b\\[c\\](x)**: ok'), markdown);
});

test('a cell beyond the header row renders without a label', () => {
  const text = ['# F', '', '## Tasks', '', '- [x] T1 First', '', '## Progress', '', '| Task | A |', '| --- | --- |', '| T1 | x | stray |'].join('\n');
  const markdown = formatEvidenceRowMarkdown(task(text, 'T1').tableEvidence[0]);
  assert.ok(markdown.split('\n').includes('- stray'));
});

test('inline evidence comes first with source "inline", then each table row with its table and row', () => {
  const pieces = buildEvidencePieces(task(PROGRESS_TABLE_DOCUMENT, 'E1-5'));
  assert.deepEqual(
    pieces.map((p) => p.source),
    [INLINE_EVIDENCE_SOURCE, 'table "Progress / evidence", row 2'],
  );
  assert.match(pieces[0].markdown, /inline note/);
  assert.match(pieces[1].markdown, /\*\*Commit\*\*: 09ecbc2/);
});

test('every table row of a task is its own piece, in document order', () => {
  const pieces = buildEvidencePieces(task(PROGRESS_TABLE_DOCUMENT, 'E5-5'));
  assert.deepEqual(
    pieces.map((p) => p.source),
    ['table "Progress / evidence", row 6', 'table "Progress / evidence", row 7'],
  );
});

test('a task with no inline evidence and no rows has no pieces', () => {
  assert.deepEqual(buildEvidencePieces(task(PROGRESS_TABLE_DOCUMENT, 'E2-2')), []);
});

test('a task with only inline evidence has one "inline" piece', () => {
  const text = ['# F', '', '## Tasks', '', '- [x] T1 First', '      Checked by hand.'].join('\n');
  const pieces = buildEvidencePieces(task(text, 'T1'));
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].source, 'inline');
});

test('a raw <script> tag in a cell is escaped, never emitted', () => {
  const [piece] = buildEvidencePieces(task(docWithCell('<script>alert(1)</script>'), 'T1'));
  const html = renderMarkdown(piece.markdown);
  assert.ok(!html.includes('<script>'), html);
  assert.match(html, /&lt;script&gt;/);
});

test('an image in a cell renders as text, never an <img> element', () => {
  const [piece] = buildEvidencePieces(task(docWithCell('![img](https://example.com/x.png)'), 'T1'));
  const html = renderMarkdown(piece.markdown);
  assert.ok(!/<img/i.test(html), html);
});

test('a link in a cell keeps the allow-list: https links render, javascript: never becomes an href', () => {
  const [safe] = buildEvidencePieces(task(docWithCell('[ok](https://example.com)'), 'T1'));
  assert.match(renderMarkdown(safe.markdown), /href="https:\/\/example\.com"/);
  const [bad] = buildEvidencePieces(task(docWithCell('[x](javascript:alert(1))'), 'T1'));
  assert.ok(!/href\s*=\s*"javascript:/i.test(renderMarkdown(bad.markdown)));
});

test('raw HTML in a header cell is escaped too', () => {
  const text = ['# F', '', '## Tasks', '', '- [x] T1 First', '', '## Progress', '', '| Task | <b onclick=x>H</b> |', '| --- | --- |', '| T1 | ok |'].join('\n');
  const [piece] = buildEvidencePieces(task(text, 'T1'));
  assert.ok(!renderMarkdown(piece.markdown).includes('<b onclick'));
});
