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

// --- exclusive partition: a section with items renders once, as a task ----

test('an Acceptance criteria section written as checkboxes appears exactly once, as a task section', () => {
  const text = [
    '# sample',
    '',
    '## Acceptance criteria',
    '',
    '- [ ] All five documents parse.',
    '- [x] The chart renders past the threshold.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.taskSections.map((s) => s.heading),
    ['Acceptance criteria', 'Tasks'],
  );
  assert.equal(body.taskSections[0].items.length, 2);
  // The same heading must not also appear as raw prose: the task rendering
  // already carries strictly more information (state and evidence per
  // item) than the prose region would.
  assert.deepEqual(
    body.otherSections.map((s: { heading: string }) => s.heading),
    [],
  );
});

test('an Objective section written as checkboxes is rendered only as a task section, never merged into the objective prose', () => {
  const text = [
    '# sample',
    '',
    '## Objective',
    '',
    '- [ ] Ship the tracker.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.taskSections.map((s) => s.heading),
    ['Objective', 'Tasks'],
  );
  assert.equal(body.objective, null);
});

test('no recognized section kind that holds checklist items ever appears in both taskSections and otherSections', () => {
  // Every kind OTHER_SECTION_KINDS can claim, plus Tasks itself, each
  // written with one checklist item. If a future exclusion fix special-
  // cased one heading instead of the general "has items" rule, this would
  // still catch every other kind leaking into both regions.
  const headings = [
    'Constraints',
    'Scope',
    'Acceptance criteria',
    'Progress',
    'TDD mode',
    'Checks',
    'Decision taken',
    'Delivery',
    'Why',
    'Tasks',
  ];
  const text = [
    '# sample',
    '',
    ...headings.flatMap((heading) => ['', `## ${heading}`, '', `- [ ] Do the ${heading} thing.`]),
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  const taskHeadings = new Set(body.taskSections.map((s) => s.heading));
  const otherHeadings = new Set(body.otherSections.map((s: { heading: string }) => s.heading));

  for (const heading of headings) {
    assert.ok(taskHeadings.has(heading), `${heading} should render as a task section`);
    assert.ok(!otherHeadings.has(heading), `${heading} must not also render as prose`);
  }
});

test('a Next step section written as a checklist item never renders as a task section or as prose', () => {
  const text = [
    '# sample',
    '',
    '## Next step',
    '',
    '- [ ] Ship the remaining task.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const body = buildPanelBody(model);

  assert.deepEqual(
    body.taskSections.map((s) => s.heading),
    ['Tasks'],
  );
  assert.deepEqual(
    body.otherSections.map((s: { heading: string }) => s.heading),
    [],
  );
  assert.ok(model.nextStep);
});

// --- focused task ----------------------------------------------------------

test('focusedTask is the item whose startLine matches focusedTaskStartLine', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 First', '- [ ] T2 Second'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const secondItem = model.sections[0].items[1];

  const body = buildPanelBody(model, secondItem.startLine);

  assert.equal(body.focusedTask, secondItem);
});

test('focusedTask is null when no focusedTaskStartLine is given', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 First'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);

  const body = buildPanelBody(model);

  assert.equal(body.focusedTask, null);
});

test('focusedTask is null when focusedTaskStartLine matches no item in the document', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 First'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);

  const body = buildPanelBody(model, 9999);

  assert.equal(body.focusedTask, null);
});

// --- the unproven task message constant -----------------------------------

test('UNPROVEN_TASK_MESSAGE states what is missing in ODD\'s own terms', () => {
  assert.equal(
    UNPROVEN_TASK_MESSAGE,
    'Checked, but the item records no evidence and no commit. ODD treats a checkbox as no proof at all.',
  );
});
