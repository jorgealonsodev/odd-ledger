import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel } from './build-feature-model';
import { buildPanelBody, UNPROVEN_TASK_MESSAGE } from './build-panel-body';

/**
 * buildPanelBody (T11) composes the detail panel's body regions — the
 * combined Objective/Problem prose, the item-bearing sections with their
 * evidence, and the document's other optional sections — from an
 * already-built FeatureModel. Models are built through buildFeatureModel
 * over small invented documents, rather than hand-built, because what is
 * under test here is how the regions are assembled from a real parsed
 * DocumentStructure, not just data plumbing.
 */

// --- objective ---------------------------------------------------------

test('objective joins the Objective and Problem sections\' bodies, in that order', () => {
  const text = [
    '# sample',
    '',
    '## Problem',
    '',
    'Nothing tracks this today.',
    '',
    '## Objective',
    '',
    'Ship the tracker.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.equal(body.objective, 'Ship the tracker.\n\nNothing tracks this today.');
});

test('objective is the sole section\'s body when only Problem is present', () => {
  const text = ['# sample', '', '## Problem', '', 'Nothing tracks this today.', '', '## Tasks', '', '- [ ] T1 Do it'].join(
    '\n',
  );
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.equal(body.objective, 'Nothing tracks this today.');
});

test('objective is null when the document has neither Objective nor Problem', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.equal(body.objective, null);
});

// --- task sections -------------------------------------------------------

test('taskSections is exactly the FeatureModel\'s own item-bearing sections, not a re-derived copy', () => {
  const text = ['# sample', '', '## Tasks', '', '- [x] T1 Ship it', '      DONE `4b7c1e9`'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.equal(body.taskSections, model.sections);
  assert.equal(body.taskSections[0].items[0].commitReference, '4b7c1e9');
});

// --- other document sections ---------------------------------------------

test('otherSections includes every recognized non-checklist section that is present, in document order', () => {
  const text = [
    '# sample',
    '',
    '## Constraints',
    '',
    'Read-only.',
    '',
    '## Why',
    '',
    'Because it matters.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
    '',
    '## Delivery',
    '',
    'ask-on-risk.',
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.otherSections.map((s: { heading: string }) => s.heading),
    ['Constraints', 'Why', 'Delivery'],
  );
  assert.equal(body.otherSections[0].body, 'Read-only.');
});

test('otherSections excludes the Next step section: the header already shows it', () => {
  const text = ['# sample', '', '## Next step', '', 'Ship the remaining task.', '', '## Tasks', '', '- [ ] T1 Do it'].join(
    '\n',
  );
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.otherSections.map((s: { heading: string }) => s.heading),
    [],
  );
});

test('otherSections excludes an unrecognized heading, even with a non-empty body', () => {
  const text = ['# sample', '', '## Rollout notes', '', 'Some prose no alias recognizes.', '', '## Tasks', '', '- [ ] T1 Do it'].join(
    '\n',
  );
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.otherSections.map((s: { heading: string }) => s.heading),
    [],
  );
});

test('otherSections omits a recognized section whose body is empty', () => {
  const text = ['# sample', '', '## Checks', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.otherSections.map((s: { heading: string }) => s.heading),
    [],
  );
});

// --- the unproven task message constant -----------------------------------

test('UNPROVEN_TASK_MESSAGE states what is missing in ODD\'s own terms', () => {
  assert.equal(
    UNPROVEN_TASK_MESSAGE,
    'Checked, but the item records no evidence and no commit. ODD treats a checkbox as no proof at all.',
  );
});
