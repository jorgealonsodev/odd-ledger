import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel } from './build-feature-model';
import { buildRecordedFields } from './build-recorded-fields';
import { NOT_EVIDENCE_TABLES, PROGRESS_TABLE_DOCUMENT, PROGRESS_TABLE_VARIANTS } from './fixtures/progress-table-documents';

/**
 * The whole pipeline over a synthetic document that records its evidence in
 * a progress table (see fixtures/progress-table-documents.ts): tasks close
 * as proven through their rows, rows keep their source, and every
 * document without a table keeps reading exactly as before.
 */

function modelFrom(text: string) {
  return buildFeatureModel('sample', '/does/not/matter/sample.md', text);
}

function items(text: string) {
  return modelFrom(text).sections.flatMap((s) => s.items);
}

function byId(text: string, id: string) {
  const found = items(text).find((i) => i.id === id);
  assert.ok(found, `task ${id} not found`);
  return found;
}

test('a checked task with a table row is done and proven, with the row as evidence and its commit', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E1-4');
  assert.equal(t.derivedState, 'done');
  assert.equal(t.commitReference, '7020bc6');
  assert.equal(t.tableEvidence.length, 1);
  assert.equal(t.tableEvidence[0].source, 'table "Progress / evidence", row 1');
});

test('a task with several rows keeps them in document order and takes the first row\'s commit', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E5-5');
  assert.equal(t.derivedState, 'done');
  assert.deepEqual(
    t.tableEvidence.map((r) => r.idCell),
    ['E5-5 cleanup', 'E5-5'],
  );
  assert.equal(t.commitReference, '27c8bd8');
});

test('an open task is never changed by its row, which stays as partial evidence', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E1-2');
  assert.equal(t.derivedState, 'open');
  assert.equal(t.tableEvidence.length, 1);
});

test('a checked task whose row says nothing stays done-unproven, with the row still linked', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E2-1');
  assert.equal(t.derivedState, 'done-unproven');
  assert.equal(t.tableEvidence.length, 1);
});

test('a checked task with no row at all stays done-unproven', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E2-2');
  assert.equal(t.derivedState, 'done-unproven');
  assert.equal(t.tableEvidence.length, 0);
});

test('the tiles count: unproven counts only the checked tasks nothing proves', () => {
  const model = modelFrom(PROGRESS_TABLE_DOCUMENT);
  assert.equal(model.progress.total, 7);
  assert.equal(model.progress.done, 5);
  assert.equal(model.progress.doneUnproven, 2);
});

test('an unattached row is kept at document level and counted toward no task', () => {
  const model = modelFrom(PROGRESS_TABLE_DOCUMENT);
  assert.deepEqual(
    model.unattachedEvidence.map((r) => r.idCell),
    ['DP-05 Rueda'],
  );
  assert.equal(model.ambiguousEvidence.length, 0);
});

test('inline evidence is kept and its commit wins; the table rows follow as separate evidence', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E1-5');
  assert.match(t.evidence, /inline note/);
  assert.equal(t.commitReference, 'aaaa111');
  assert.equal(t.tableEvidence.length, 1);
});

test('the route of a task comes from the route column of its table row', () => {
  const t = byId(PROGRESS_TABLE_DOCUMENT, 'E1-4');
  assert.equal(t.route, 'delegated (writer trigger)');
});

test('a task with no route column value has route null', () => {
  assert.equal(byId(PROGRESS_TABLE_DOCUMENT, 'E2-1').route, null);
});

test('with the progress table removed, the checked tasks are unproven again', () => {
  const without = PROGRESS_TABLE_DOCUMENT.replace(/## Progress \/ evidence[\s\S]*?(?=## Next step)/, '');
  const model = modelFrom(without);
  assert.equal(model.progress.doneUnproven, 4);
  assert.equal(model.unattachedEvidence.length, 0);
});

test('duplicate task IDs make a row ambiguous: named, linked to no task, proving nothing', () => {
  const text = [
    '# Feature',
    '',
    '## Tasks',
    '',
    '- [x] T1 First',
    '- [x] T1 Second, same ID',
    '',
    '## Progress',
    '',
    '| Task | Checks |',
    '| --- | --- |',
    '| T1 | passed |',
  ].join('\n');
  const model = modelFrom(text);
  assert.equal(model.ambiguousEvidence.length, 1);
  assert.equal(model.ambiguousEvidence[0].matchCount, 2);
  assert.equal(model.progress.doneUnproven, 2);
  assert.ok(items(text).every((i) => i.tableEvidence.length === 0));
});

test('a table under an unrelated heading is not evidence', () => {
  const text = [
    '# Feature',
    '',
    '## Tasks',
    '',
    '- [x] T1 First',
    '',
    '## Scope',
    '',
    '| Task | Checks |',
    '| --- | --- |',
    '| T1 | passed |',
  ].join('\n');
  const model = modelFrom(text);
  assert.equal(model.progress.doneUnproven, 1);
  assert.equal(model.unattachedEvidence.length, 0);
});

test('a document without a progress table reads as before: no table evidence, no route, no document rows', () => {
  const text = ['# Feature', '', '## Tasks', '', '- [x] T1 Done', '      Route: inline', '- [x] T2 Bare'].join('\n');
  const model = modelFrom(text);
  assert.equal(model.unattachedEvidence.length, 0);
  assert.equal(model.ambiguousEvidence.length, 0);
  const [t1, t2] = items(text);
  assert.equal(t1.derivedState, 'done');
  assert.equal(t2.derivedState, 'done-unproven');
  assert.deepEqual(t1.tableEvidence, []);
  assert.equal(t1.route, null);
});

test('the recorded Route field counts a route read from a table as well as an inline route note', () => {
  const route = buildRecordedFields(modelFrom(PROGRESS_TABLE_DOCUMENT)).find((f) => f.label === 'Route');
  assert.ok(route);
  assert.notEqual(route.value, 'not recorded');
  assert.match(route.value, /per task, \d+ of 7 recorded/);
});

// --- the same evidence, read from different formats ----------------------------

for (const variant of PROGRESS_TABLE_VARIANTS) {
  test(`table format "${variant.name}" proves its tasks, links every row and reads the commit`, () => {
    const model = modelFrom(variant.text);
    assert.equal(model.progress.doneUnproven, 0);
    assert.equal(model.unattachedEvidence.length, 0);
    assert.equal(model.ambiguousEvidence.length, 0);
    const [t1, t2, t3] = model.sections.flatMap((s) => s.items);
    assert.equal(t1.derivedState, 'done');
    assert.equal(t2.derivedState, 'done');
    assert.equal(t3.derivedState, 'open');
    assert.equal(t1.commitReference, '1a2b3c4');
    assert.equal(t2.commitReference, '5d6e7f8');
  });
}

for (const notEvidence of NOT_EVIDENCE_TABLES) {
  test(`a table ${notEvidence.name} is not evidence: the checked tasks stay unproven`, () => {
    const model = modelFrom(notEvidence.text);
    assert.equal(model.progress.doneUnproven, 2);
    assert.equal(model.unattachedEvidence.length, 0);
  });
}
