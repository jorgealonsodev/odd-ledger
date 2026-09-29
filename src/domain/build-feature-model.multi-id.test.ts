import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel } from './build-feature-model';
import { PROGRESS_MULTI_ID_DOCUMENT } from './fixtures/progress-multi-id-documents';

/** The whole pipeline over fixtures/progress-multi-id-documents.ts. */

const model = buildFeatureModel('sample', '/does/not/matter/sample.md', PROGRESS_MULTI_ID_DOCUMENT);
const items = model.sections.flatMap((s) => s.items);

function task(id: string, index = 0) {
  const found = items.filter((i) => i.id === id)[index];
  assert.ok(found, `task ${id} not found`);
  return found;
}

test('an entry with a clause-start ID proves both tasks, each with its own commit', () => {
  assert.equal(task('M1.1').derivedState, 'done');
  assert.equal(task('M1.2').derivedState, 'done');
  assert.equal(task('M1.1').commitReference, '22deb08');
  assert.equal(task('M1.2').commitReference, '7a87dcf');
  assert.equal(task('M1.1').tableEvidence[0].source, 'list "Progress / evidence", item 1');
  assert.equal(task('M1.2').tableEvidence[0].source, 'list "Progress / evidence", item 1');
});

test('"M1.3/M1.4 + follow-ups" proves both', () => {
  for (const id of ['M1.3', 'M1.4']) {
    assert.equal(task(id).derivedState, 'done', id);
    assert.equal(task(id).commitReference, '9f1e2d3', id);
    assert.equal(task(id).tableEvidence.length, 1, id);
  }
});

test('a task mentioned mid-sentence stays unproven, its neighbour is proven', () => {
  assert.equal(task('M2.3').derivedState, 'done');
  assert.equal(task('M2.1').derivedState, 'done-unproven');
  assert.equal(task('M2.1').tableEvidence.length, 0);
});

test('a leading-range note links to no task and is shown at document level', () => {
  assert.equal(task('M0.1').derivedState, 'done-unproven');
  assert.equal(task('M0.6b').derivedState, 'done-unproven');
  assert.ok(model.unattachedEvidence.some((r) => r.text.includes('all tasks M0.1–M0.6b done')));
});

test('a status echo shared by two tasks proves neither', () => {
  assert.equal(task('M3.1').derivedState, 'done-unproven');
  assert.equal(task('M3.2').derivedState, 'done-unproven');
  assert.equal(task('M3.1').tableEvidence.length, 1);
  assert.equal(task('M3.2').tableEvidence.length, 1);
});

test('a table row naming two tasks proves both; an open task never changes state', () => {
  assert.equal(task('M4.1').derivedState, 'done');
  assert.equal(task('M4.2').derivedState, 'done');
  assert.equal(task('M4.1').tableEvidence.length, 2);
  assert.equal(task('M4.3').derivedState, 'open');
  assert.equal(task('M4.3').tableEvidence.length, 1);
});

test('a duplicated ID is ambiguous while the other ID of the entry still links', () => {
  assert.equal(task('M5.2').derivedState, 'done');
  assert.equal(task('M5.2').tableEvidence.length, 1);
  assert.equal(task('M5.1', 0).derivedState, 'done-unproven');
  assert.equal(task('M5.1', 1).derivedState, 'done-unproven');
  assert.ok(model.ambiguousEvidence.length >= 1);
});
