import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel, extractBranch, extractNextStep } from './build-feature-model';
import { parseDocumentStructure } from './parse-document-structure';
import { CACHE_WARM_V2, SIGNAGE_DISPLAY_DRIVER } from './fixtures/synthetic-documents';

/**
 * Unit tests for the small pure helpers (extractBranch, extractNextStep),
 * plus buildFeatureModel tests that compose the whole domain pipeline
 * (parseDocumentStructure + parseChecklist + deriveChecklistState) into
 * one FeatureModel, including a run over a full synthetic document from
 * the T6 corpus. No real project content, per this feature's constraint.
 */

// --- extractBranch -----------------------------------------------------

test('extractBranch reads a bold-labelled value with the colon outside the closing bold', () => {
  const preamble = ['**Feature**: `sample`', '**Branch**: `feat/sample-branch`'].join('\n');
  assert.equal(extractBranch(preamble), 'feat/sample-branch');
});

test('extractBranch reads a bold-labelled value with the colon inside the closing bold', () => {
  const preamble = '**Branch:** feat/sample-branch';
  assert.equal(extractBranch(preamble), 'feat/sample-branch');
});

test('extractBranch reads a plain, unbolded label', () => {
  const preamble = 'Branch: feat/sample-branch';
  assert.equal(extractBranch(preamble), 'feat/sample-branch');
});

test('extractBranch prefers the first inline code span over the surrounding text', () => {
  const preamble = '**Branch**: `feat/sample-branch` (to be created; never commit this on `main`)';
  assert.equal(extractBranch(preamble), 'feat/sample-branch');
});

test('extractBranch strips a trailing parenthetical from a plain, non-code-span value', () => {
  const preamble = 'Branch: feat/sample-branch (to be created)';
  assert.equal(extractBranch(preamble), 'feat/sample-branch');
});

test('extractBranch returns null when the preamble has no Branch line', () => {
  const preamble = '**Feature**: `sample`\n**Started**: 2026-01-01';
  assert.equal(extractBranch(preamble), null);
});

test('extractBranch returns null for an empty preamble', () => {
  assert.equal(extractBranch(''), null);
});

// --- extractNextStep -----------------------------------------------------

test('extractNextStep returns the first non-empty body line with a leading list marker stripped', () => {
  const structure = parseDocumentStructure(
    ['# sample', '', '## Next step', '', '- Run the packaging script end to end.'].join('\n'),
  );
  const nextStepSection = structure.sections.find((s) => s.kind === 'next-step');
  assert.ok(nextStepSection);
  const result = extractNextStep(nextStepSection!);
  assert.ok(result);
  assert.equal(result!.line, 'Run the packaging script end to end.');
  assert.equal(result!.headingLine, nextStepSection!.headingLine);
});

test('extractNextStep returns null when the document has no Next step section', () => {
  const structure = parseDocumentStructure(['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n'));
  const nextStepSection = structure.sections.find((s) => s.kind === 'next-step');
  assert.equal(nextStepSection, undefined);
});

test('extractNextStep returns null when the Next step section has an empty body', () => {
  const structure = parseDocumentStructure(['# sample', '', '## Next step', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n'));
  const nextStepSection = structure.sections.find((s) => s.kind === 'next-step');
  assert.ok(nextStepSection);
  assert.equal(extractNextStep(nextStepSection!), null);
});

// --- buildFeatureModel: sections filtered to those with items ------------

test('buildFeatureModel excludes sections with no checklist items', () => {
  const text = [
    '# sample',
    '',
    '## Objective',
    '',
    'Prose with no checklist at all.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  assert.deepEqual(
    model.sections.map((s) => s.heading),
    ['Tasks'],
  );
});

test('buildFeatureModel excludes the Next step section from sections even when it is written as a checklist item', () => {
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

  // The next-step region is owned by the header/tree node (model.nextStep),
  // never by the ordinary task-section list, regardless of how its body is
  // written.
  assert.deepEqual(
    model.sections.map((s) => s.heading),
    ['Tasks'],
  );
  assert.ok(model.nextStep);
  assert.equal(model.nextStep!.line, '[ ] Ship the remaining task.');
});

// --- buildFeatureModel: commit reference (evidence vs rawText) -----------

test('buildFeatureModel finds a commit reference in an item\'s evidence', () => {
  const text = ['# sample', '', '## Tasks', '', '- [x] T1 Ship it', '      DONE `4b7c1e9`'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const item = model.sections[0].items[0];
  assert.equal(item.commitReference, '4b7c1e9');
});

test('buildFeatureModel falls back to rawText for a commit reference not present in evidence', () => {
  const text = ['# sample', '', '## Tasks', '', '- [x] T1 9f8e7d6 Ship it'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const item = model.sections[0].items[0];
  assert.equal(item.evidence, '');
  assert.equal(item.commitReference, '9f8e7d6');
});

test('buildFeatureModel reports no commit reference when none is present anywhere in the item', () => {
  const text = ['# sample', '', '## Tasks', '', '- [x] T1 Ship it', '      Verified manually.'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  const item = model.sections[0].items[0];
  assert.equal(item.commitReference, null);
});

test('buildFeatureModel does not read an all-letter hex-shaped word as a commit reference', () => {
  const text = ['# sample', '', '## Tasks', '', '- [x] T1 Ship it', '      deadbeef is a placeholder, not a hash.'].join(
    '\n',
  );
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);
  assert.equal(model.sections[0].items[0].commitReference, null);
});

// --- buildFeatureModel: the full synthetic document -----------------------

test('buildFeatureModel over cache-warm-v2: branch absent, sections filtered, next step present', () => {
  const model = buildFeatureModel('cache-warm-v2', '/does/not/matter/cache-warm-v2.md', CACHE_WARM_V2.text);

  assert.equal(model.featureName, 'cache-warm-v2');
  assert.equal(model.documentPath, '/does/not/matter/cache-warm-v2.md');
  assert.equal(model.title, 'cache-warm-v2');
  // This document's bold metadata block carries Feature/Started/Route, but
  // no Branch line, so branch extraction must report absence, never guess.
  assert.equal(model.branch, null);

  // Scope has a fenced-off fake heading/item and no real checklist items;
  // Objective/Problem/Why/Constraints have none either. Only Tasks and
  // Progress carry checklist items... Progress here is prose, not a
  // checklist, so only Tasks remains.
  assert.deepEqual(
    model.sections.map((s) => s.heading),
    ['Tasks'],
  );

  const tasks = model.sections[0];
  assert.equal(tasks.kind, 'tasks');
  assert.equal(tasks.countsTowardProgress, true);
  assert.equal(tasks.counts.done, 3);
  assert.equal(tasks.counts.total, 6);

  assert.deepEqual(
    tasks.items.map((i) => i.id),
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  );
  assert.equal(tasks.items[0].commitReference, '4a1c9e3');
  assert.equal(tasks.items[1].commitReference, null); // evidence present, no commit
  assert.equal(tasks.items[2].commitReference, null); // done-unproven: no evidence at all

  assert.equal(model.progress.done, 3);
  assert.equal(model.progress.total, 6);

  assert.ok(model.nextStep);
  assert.equal(
    model.nextStep!.line,
    'C4: add the manifest size limit, then reopen C6 once the format question',
  );
});

test('buildFeatureModel over signage-display-driver-v1: no branch, no next step, sparse document', () => {
  const model = buildFeatureModel(
    'signage-display-driver-v1',
    '/does/not/matter/signage-display-driver-v1.md',
    SIGNAGE_DISPLAY_DRIVER.text,
  );

  assert.equal(model.branch, null);
  assert.equal(model.nextStep, null);
  assert.deepEqual(
    model.sections.map((s) => s.heading),
    ['Tasks'],
  );
  assert.equal(model.progress.done, 2);
  assert.equal(model.progress.total, 3);
});

// --- buildFeatureModel: threading the parsed DocumentStructure -------------

test('buildFeatureModel also returns the DocumentStructure it parsed, so a caller never parses the text twice', () => {
  const text = ['# sample', '', '## Objective', '', 'Ship it.', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
  const model = buildFeatureModel('sample', '/does/not/matter/sample.md', text);

  assert.equal(model.structure.title, 'sample');
  assert.deepEqual(
    model.structure.sections.map((s) => s.heading),
    ['Objective', 'Tasks'],
  );
  assert.equal(model.structure.sections[0].body, 'Ship it.');
});
