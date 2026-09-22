import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureModel } from './build-feature-model';
import { buildRecordedFields } from './build-recorded-fields';

/**
 * buildRecordedFields (T12) composes the detail panel's "Recorded by this
 * document" table from an already-built FeatureModel. Models are built
 * through buildFeatureModel over small invented documents, rather than
 * hand-built, because what is under test is how each row is read out of a
 * real parsed DocumentStructure and real checklist item evidence, not just
 * data plumbing.
 */

function modelFromText(text: string) {
  return buildFeatureModel('sample', '/does/not/matter/sample.md', text);
}

const ROW_LABELS = ['TDD', 'Delivery', 'Route', 'Line budget', 'Review'];

// --- row presence and order -------------------------------------------------

test('returns exactly the five rows, in a fixed order, when the document records every field', () => {
  const text = [
    '# sample',
    '',
    '## TDD mode',
    '',
    '**Strict, invented convention**: enabled by configuration, using an invented test runner name that goes on for quite a while so this line comfortably exceeds any reasonable character budget for a single table cell value.',
    '',
    '## Delivery',
    '',
    '**Strategy**: invented-strategy, chosen for cost reasons across the whole delivery pipeline, which is a fairly long strategy sentence meant to exceed the character budget easily on its own line.',
    'Forecast: roughly 400 authored changed lines total, a planning figure only.',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Route: delegated writer, already understood.',
    '      Review: assess returned risk low, approved and acknowledged, lineage review-aaaa1111.',
    '- [ ] T2 Not started',
    '      Route: direct inline.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));

  assert.deepEqual(
    fields.map((f) => f.label),
    ROW_LABELS,
  );
  for (const field of fields) {
    assert.notEqual(field.value, '');
  }
});

// --- absence: a document recording nothing ----------------------------------

test('every row reads "not recorded" against a document that records none of the five fields', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));

  assert.deepEqual(
    fields.map((f) => f.value),
    ['not recorded', 'not recorded', 'not recorded', 'not recorded', 'not recorded'],
  );
});

// --- TDD: one-line extraction -----------------------------------------------

test('TDD reads the tdd-mode section\'s first line, with emphasis markers and the leading label stripped', () => {
  const text = ['# sample', '', '## TDD mode', '', '**Strict**: enabled, source: invented config.', '', '## Tasks', '', '- [ ] T1 Do it'].join(
    '\n',
  );

  const fields = buildRecordedFields(modelFromText(text));
  const tdd = fields.find((f) => f.label === 'TDD')!;

  assert.ok(!tdd.value.includes('**'));
  assert.ok(!tdd.value.startsWith('Strict:'));
  assert.match(tdd.value, /enabled, source: invented config\.?/);
});

test('TDD truncates a first line longer than the character budget, with an ellipsis', () => {
  const longLine =
    '**Strict, invented convention**: enabled by configuration, using an invented test runner name that goes on for quite a while so this line comfortably exceeds any reasonable character budget for a single table cell value.';
  const text = ['# sample', '', '## TDD mode', '', longLine, '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const tdd = fields.find((f) => f.label === 'TDD')!;

  assert.ok(tdd.value.length < longLine.length);
  assert.ok(tdd.value.endsWith('…'));
});

test('TDD is "not recorded" when the document has no tdd-mode section', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'TDD')!.value, 'not recorded');
});

// --- Delivery: one-line extraction ------------------------------------------

test('Delivery reads the delivery section\'s first line, with emphasis markers and the leading label stripped', () => {
  const text = ['# sample', '', '## Delivery', '', '**Strategy**: ask-on-risk (default).', '', '## Tasks', '', '- [ ] T1 Do it'].join(
    '\n',
  );

  const fields = buildRecordedFields(modelFromText(text));
  const delivery = fields.find((f) => f.label === 'Delivery')!;

  assert.ok(!delivery.value.includes('**'));
  assert.ok(!delivery.value.startsWith('Strategy:'));
  assert.match(delivery.value, /ask-on-risk \(default\)\.?/);
});

test('Delivery truncates a first line longer than the character budget, with an ellipsis', () => {
  const longLine =
    '**Strategy**: invented-strategy, chosen for cost reasons across the whole delivery pipeline, which is a fairly long strategy sentence meant to exceed the character budget easily on its own line.';
  const text = ['# sample', '', '## Delivery', '', longLine, '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const delivery = fields.find((f) => f.label === 'Delivery')!;

  assert.ok(delivery.value.length < longLine.length);
  assert.ok(delivery.value.endsWith('…'));
});

test('Delivery is "not recorded" when the document has no delivery section', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Delivery')!.value, 'not recorded');
});

// --- Route: derived per-task count -------------------------------------------

test('Route counts some items carrying a route note out of the total', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Route: delegated writer.',
    '- [ ] T2 Not started',
    '      No route note here, just prose.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Route')!.value, 'per task, 1 of 2 recorded');
});

test('Route counts every item when all of them carry a route note', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Route: delegated writer.',
    '- [ ] T2 Not started',
    '      route: direct inline.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Route')!.value, 'per task, 2 of 2 recorded');
});

test('Route is "not recorded" when no item carries a route note', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      DONE with no route note.',
    '- [ ] T2 Not started',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Route')!.value, 'not recorded');
});

// --- Line budget: a stated figure, never computed ----------------------------

test('Line budget reports the figure as written when the delivery section states one', () => {
  const text = [
    '# sample',
    '',
    '## Delivery',
    '',
    '**Strategy**: ask-on-risk (default).',
    'Forecast: roughly 400 authored changed lines total, a planning figure only.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const lineBudget = fields.find((f) => f.label === 'Line budget')!;

  assert.match(lineBudget.value, /400/);
  assert.match(lineBudget.value, /lines?/);
});

test('Line budget is "not recorded" when the delivery section states no figure', () => {
  const text = ['# sample', '', '## Delivery', '', '**Strategy**: ask-on-risk (default).', '', '## Tasks', '', '- [ ] T1 Do it'].join(
    '\n',
  );

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Line budget')!.value, 'not recorded');
});

test('Line budget is "not recorded" when there is no delivery section at all', () => {
  const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Line budget')!.value, 'not recorded');
});

// --- Review: recorded review evidence, never guessed -------------------------

test('Review reads the recorded review evidence, with the leading label stripped', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Review: assess returned risk low, approved and acknowledged, lineage review-aaaa1111.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const review = fields.find((f) => f.label === 'Review')!;

  assert.ok(!review.value.startsWith('Review:'));
  assert.match(review.value, /approved and acknowledged/);
});

test('Review takes the most recently recorded review evidence when more than one task carries one', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Review: first review, approved.',
    '- [x] T2 Ship it too',
    '      Review: second review, approved.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const review = fields.find((f) => f.label === 'Review')!;

  assert.match(review.value, /second review/);
  assert.ok(!review.value.includes('first review'));
});

test('Review is "not recorded" when no item records review evidence', () => {
  const text = ['# sample', '', '## Tasks', '', '- [x] T1 Ship it', '      DONE, no review line.'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  assert.equal(fields.find((f) => f.label === 'Review')!.value, 'not recorded');
});

test('Review takes the most recently recorded line when a single item carries more than one', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Review: first attempt, correction required.',
    '      Review: second attempt, approved and acknowledged.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const review = fields.find((f) => f.label === 'Review')!;

  assert.match(review.value, /second attempt/);
  assert.ok(!review.value.includes('first attempt'));
});

test('Review takes the newest across both items and lines when both repeat within a document', () => {
  const text = [
    '# sample',
    '',
    '## Tasks',
    '',
    '- [x] T1 Ship it',
    '      Review: oldest, from the first attempt at T1.',
    '      Review: still older than anything in T2.',
    '',
    '## Backlog',
    '',
    '- [x] T2 Ship it too',
    '      Review: newest, the most recently recorded line in the document.',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const review = fields.find((f) => f.label === 'Review')!;

  assert.match(review.value, /newest, the most recently recorded line/);
  assert.ok(!review.value.includes('oldest'));
  assert.ok(!review.value.includes('still older'));
});

// --- Line budget: the figure survives a hard-wrapped delivery paragraph -----

test('Line budget keeps the stated figure and the full sentence when the delivery paragraph wraps across source lines', () => {
  const text = [
    '# sample',
    '',
    '## Delivery',
    '',
    '**Strategy**: ask-on-risk (default).',
    '**Forecast**: roughly 1,234 authored changed lines including tests. It was a guess that',
    'undershot by a wide margin once the real scope became clear.',
    '',
    '## Tasks',
    '',
    '- [ ] T1 Do it',
  ].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const lineBudget = fields.find((f) => f.label === 'Line budget')!;

  assert.equal(lineBudget.value, 'roughly 1,234 authored changed lines including tests.');
});

// --- Truncation never cuts a word in half ------------------------------------

test('a truncated table value never ends mid-word', () => {
  // Twenty fixed-width words with no sentence punctuation anywhere: the
  // character budget lands inside a word rather than on a space, so this
  // reliably exercises the word-boundary fallback rather than the
  // sentence-boundary path.
  const longLine = Array.from({ length: 20 }, () => 'abcdefghij').join(' ');
  const text = ['# sample', '', '## TDD mode', '', longLine, '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');

  const fields = buildRecordedFields(modelFromText(text));
  const tdd = fields.find((f) => f.label === 'TDD')!;

  assert.ok(tdd.value.endsWith('…'));
  const withoutEllipsis = tdd.value.slice(0, -1);
  assert.ok(longLine.startsWith(withoutEllipsis));
  const nextChar = longLine.charAt(withoutEllipsis.length);
  assert.ok(nextChar === '' || nextChar === ' ');
});
