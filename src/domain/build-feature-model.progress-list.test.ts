import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel } from './build-feature-model';
import { PROGRESS_LIST_DOCUMENT } from './fixtures/progress-list-documents';
import { PROGRESS_TABLE_DOCUMENT } from './fixtures/progress-table-documents';

/**
 * The whole pipeline over a synthetic document that records its evidence as
 * a progress list (see fixtures/progress-list-documents.ts).
 */

function modelFrom(text: string) {
  return buildFeatureModel('sample', '/does/not/matter/sample.md', text);
}

function byId(text: string, id: string) {
  const found = modelFrom(text)
    .sections.flatMap((s) => s.items)
    .find((i) => i.id === id);
  assert.ok(found, `task ${id} not found`);
  return found;
}

test('a checked task with a list entry that has content is done and proven, with its commit and source', () => {
  const t = byId(PROGRESS_LIST_DOCUMENT, 'L1');
  assert.equal(t.derivedState, 'done');
  assert.equal(t.commitReference, 'aaaa111');
  assert.equal(t.tableEvidence.length, 1);
  assert.equal(t.tableEvidence[0].source, 'list "Progress / evidence", item 1');
});

test('an emphasised ID links, and the entry text reads without the ID', () => {
  const t = byId(PROGRESS_LIST_DOCUMENT, 'L2');
  assert.equal(t.derivedState, 'done');
  assert.equal(t.tableEvidence[0].text, '`bbbb222` (RED 3/9 failing, GREEN 9/9).');
  assert.equal(t.commitReference, 'dddd444', 'the inline commit still wins over list commits');
});

test('"- L3 done" alone leaves L3 done-unproven, with the entry still linked', () => {
  const t = byId(PROGRESS_LIST_DOCUMENT, 'L3');
  assert.equal(t.derivedState, 'done-unproven');
  assert.equal(t.tableEvidence.length, 1);
});

test('nested lines of an entry are its evidence', () => {
  const t = byId(PROGRESS_LIST_DOCUMENT, 'L4');
  assert.equal(t.derivedState, 'done');
  assert.equal(t.commitReference, 'cccc333');
  assert.equal(t.tableEvidence[0].source, 'list "Progress / evidence", item 4');
});

test('a checked task with no entry stays done-unproven', () => {
  assert.equal(byId(PROGRESS_LIST_DOCUMENT, 'L5').derivedState, 'done-unproven');
});

test('an entry for an open task never changes its state and stays as evidence', () => {
  const t = byId(PROGRESS_LIST_DOCUMENT, 'L6');
  assert.equal(t.derivedState, 'open');
  assert.equal(t.tableEvidence.length, 1);
});

test('table rows and list entries of one task come table first, then list, each with its source', () => {
  const t = byId(PROGRESS_LIST_DOCUMENT, 'L7');
  assert.equal(t.derivedState, 'done');
  assert.deepEqual(
    t.tableEvidence.map((r) => r.source),
    ['table "Progress / evidence", row 1', 'list "Progress / evidence", item 8'],
  );
  assert.equal(t.commitReference, '7777777');
});

test('an entry that names no task is a document-level note, counted toward nothing', () => {
  const model = modelFrom(PROGRESS_LIST_DOCUMENT);
  assert.deepEqual(
    model.unattachedEvidence.map((r) => r.idCell),
    ['2026-09-29', 'H0'],
  );
  assert.match(model.unattachedEvidence[1].text, /all tasks L1–L3 done/);
  assert.equal(model.ambiguousEvidence.length, 0);
});

test('progress counts: proven and unproven closed tasks add up as the lists say', () => {
  const { progress } = modelFrom(PROGRESS_LIST_DOCUMENT);
  assert.equal(progress.done, 7);
  assert.equal(progress.doneUnproven, 3, 'L3, L5 and L8 are unproven');
});

test('a document with no progress list reads exactly as before', () => {
  const model = modelFrom(PROGRESS_TABLE_DOCUMENT);
  const rows = model.sections.flatMap((s) => s.items).flatMap((i) => i.tableEvidence);
  assert.ok(rows.every((r) => r.source.startsWith('table ')));
  assert.ok(model.unattachedEvidence.every((r) => r.source.startsWith('table ')));
});

test('a plain bullet list under an ordinary heading is never read', () => {
  const text = ['# F', '', '## Tasks', '', '- [x] T1 First', '', '## Scope', '', '- T1 done: commit `aaaa111`'].join('\n');
  const t = byId(text, 'T1');
  assert.equal(t.derivedState, 'done-unproven');
  assert.equal(t.tableEvidence.length, 0);
});
