import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeatureModel } from './build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE } from './build-feature-model';
import type { ChecklistCounts } from './derive-checklist-state';
import { groupFeaturesByProject, sumProgress } from './group-features-by-project';

function counts(done: number, total: number, doneUnproven = 0): ChecklistCounts {
  return { done, total, percentage: total === 0 ? 0 : Math.round((done / total) * 100), doneUnproven };
}

function feature(name: string, progress: ChecklistCounts = counts(1, 2)): FeatureModel {
  return {
    featureName: name,
    documentPath: `/does/not/matter/${name}.md`,
    title: name,
    branch: null,
    progress,
    sections: [],
    nextStep: null,
    structure: EMPTY_DOCUMENT_STRUCTURE,
    unattachedEvidence: [],
    ambiguousEvidence: [],
  };
}

// --- sumProgress -----------------------------------------------------------

test('sumProgress adds done, total and doneUnproven across every model', () => {
  const total = sumProgress([feature('a', counts(1, 2, 1)), feature('b', counts(3, 4, 2))]);
  assert.equal(total.done, 4);
  assert.equal(total.total, 6);
  assert.equal(total.doneUnproven, 3);
});

test('sumProgress derives the percentage from the summed counts, not by averaging', () => {
  // 1/2 (50%) and 3/4 (75%) average to 62.5, but 4/6 is 67%.
  assert.equal(sumProgress([feature('a', counts(1, 2)), feature('b', counts(3, 4))]).percentage, 67);
});

test('sumProgress of no models is all zeros', () => {
  assert.deepEqual(sumProgress([]), { done: 0, total: 0, percentage: 0, doneUnproven: 0 });
});

// --- groupFeaturesByProject ------------------------------------------------

test('groupFeaturesByProject groups models by folder in first-appearance (folder) order', () => {
  const a1 = feature('a1');
  const b1 = feature('b1');
  const a2 = feature('a2');
  const groups = groupFeaturesByProject([
    { folderPath: '/proj/a', model: a1 },
    { folderPath: '/proj/a', model: a2 },
    { folderPath: '/proj/b', model: b1 },
  ]);
  assert.deepEqual(
    groups.map((g) => g.folderPath),
    ['/proj/a', '/proj/b'],
  );
  assert.deepEqual(groups[0].models, [a1, a2]);
  assert.deepEqual(groups[1].models, [b1]);
});

test('groupFeaturesByProject preserves the input order of models inside a group', () => {
  const groups = groupFeaturesByProject([
    { folderPath: '/proj/a', model: feature('z') },
    { folderPath: '/proj/a', model: feature('m') },
  ]);
  assert.deepEqual(
    groups[0].models.map((m) => m.featureName),
    ['z', 'm'],
  );
});

test('groupFeaturesByProject gives each group the summed progress of its own models only', () => {
  const groups = groupFeaturesByProject([
    { folderPath: '/proj/a', model: feature('a1', counts(1, 2, 1)) },
    { folderPath: '/proj/a', model: feature('a2', counts(2, 2)) },
    { folderPath: '/proj/b', model: feature('b1', counts(0, 5)) },
  ]);
  assert.deepEqual(
    { done: groups[0].progress.done, total: groups[0].progress.total, unproven: groups[0].progress.doneUnproven },
    { done: 3, total: 4, unproven: 1 },
  );
  assert.equal(groups[1].progress.total, 5);
});

test('groupFeaturesByProject returns no groups for no input', () => {
  assert.deepEqual(groupFeaturesByProject([]), []);
});
