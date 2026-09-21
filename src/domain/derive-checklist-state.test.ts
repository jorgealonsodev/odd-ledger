import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentStructure } from './parse-document-structure';
import { parseChecklist } from './parse-checklist';
import { deriveChecklistState, hasCommitReference } from './derive-checklist-state';
import type { ChecklistSection, ChecklistItem, ChecklistItemState } from './parse-checklist';

/**
 * Mirrors parse-checklist.test.ts: most tests build a synthetic document,
 * run it through the real T3 and T4 parsers, and feed the result into T5.
 * A few tests construct ChecklistSection/ChecklistItem values directly to
 * isolate one derivation rule without the parsing layer around it. No
 * fixture reproduces any real ODD document.
 */
function derive(text: string) {
  const structure = parseDocumentStructure(text);
  const sections = parseChecklist(text, structure.sections);
  return deriveChecklistState(sections);
}

function item(overrides: Partial<ChecklistItem> & { state: ChecklistItemState }): ChecklistItem {
  return {
    rawMarker: 'x',
    id: null,
    title: 'An item',
    evidence: '',
    rawText: '- [x] An item',
    startLine: 1,
    endLine: 1,
    ...overrides,
  };
}

function section(overrides: Partial<ChecklistSection> & { items: ChecklistItem[] }): ChecklistSection {
  return {
    heading: 'Tasks',
    kind: 'tasks',
    ...overrides,
  };
}

// --- hasCommitReference -----------------------------------------------

test('hasCommitReference recognizes a bare seven-character hex token with a digit', () => {
  assert.equal(hasCommitReference('DONE 9f8e7d6'), true);
});

test('hasCommitReference recognizes a backticked hex token', () => {
  assert.equal(hasCommitReference('Corrected by `a1b2c3d`.'), true);
});

test('hasCommitReference recognizes the "Commit <sha>" form', () => {
  assert.equal(hasCommitReference('Commit 4c0ffee1 lands the fix.'), true);
});

test('hasCommitReference recognizes a full forty-character hash', () => {
  assert.equal(hasCommitReference('da39a3ee5e6b4b0d3255bfef95601890afd80709'), true);
});

test('hasCommitReference does not fire on an all-letter hex-shaped word with no digit', () => {
  // "deadbeef" is eight characters, every one drawn from a-f, but it is a
  // placeholder word here, not a hash: no digit appears anywhere in it.
  // A real git object id this long has a vanishingly small chance of
  // containing no digit at all, so requiring one is what separates a hash
  // from a word that merely happens to fit the hex alphabet.
  assert.equal(hasCommitReference('The stub server logged the placeholder token deadbeef in its output.'), false);
});

test('hasCommitReference does not fire on ordinary prose with short numbers', () => {
  assert.equal(hasCommitReference('Evidence: 12/12 unit tests, linter clean.'), false);
});

test('hasCommitReference does not fire on a plain English sentence', () => {
  assert.equal(hasCommitReference('Reviewed the constraints section and found it accurate.'), false);
});

test('hasCommitReference does not match a hex-looking fragment embedded in a longer word', () => {
  // "facedown" starts with the hex-shaped "faced" but is one continuous
  // word; the trailing "own" keeps a word boundary from ever closing after
  // a hex run, so this must not be read as a reference.
  assert.equal(hasCommitReference('The panel renders facedown until the toggle is clicked.'), false);
});

// --- done-unproven -------------------------------------------------------

test('a done item with neither evidence nor a commit reference is done-unproven', () => {
  const sections = [section({ items: [item({ state: 'done', title: 'Document the signing step', evidence: '' })] })];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].items[0].derivedState, 'done-unproven');
});

test('a done item with evidence text and no commit reference is proven (evidence text alone is enough)', () => {
  const sections = [
    section({
      items: [
        item({
          state: 'done',
          evidence: 'Verified manually against the staging environment.',
          rawText: '- [x] T1 An item\n      Verified manually against the staging environment.',
        }),
      ],
    }),
  ];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].items[0].derivedState, 'done');
});

test('a done item with a commit reference and no other evidence is proven (a commit reference alone is enough)', () => {
  const sections = [
    section({
      items: [
        item({
          state: 'done',
          evidence: '',
          rawText: '- [x] T1 An item\n      9f8e7d6',
        }),
      ],
    }),
  ];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].items[0].derivedState, 'done');
});

test('an open item is never done-unproven, even with no evidence', () => {
  const sections = [section({ items: [item({ state: 'open', evidence: '' })] })];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].items[0].derivedState, 'open');
});

test('a declined item is never done-unproven, even with no evidence', () => {
  const sections = [section({ items: [item({ state: 'declined', rawMarker: '~', evidence: '' })] })];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].items[0].derivedState, 'declined');
});

test('an unknown-marker item is never done-unproven, even with no evidence', () => {
  const sections = [section({ items: [item({ state: 'unknown', rawMarker: '?', evidence: '' })] })];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].items[0].derivedState, 'unknown');
});

// --- counting rules --------------------------------------------------

test('a declined item counts in the total but not as done', () => {
  const sections = [
    section({
      items: [
        item({ state: 'done', evidence: 'proof', rawText: '- [x] T1' }),
        item({ state: 'declined', rawMarker: '~', evidence: '' }),
      ],
    }),
  ];
  const result = deriveChecklistState(sections);
  assert.deepEqual(result.sections[0].counts, { done: 1, total: 2, percentage: 50, doneUnproven: 0 });
});

test('an unknown-marker item counts in the total but not as done, the same as a declined item', () => {
  // An unrecognized marker asserts nothing about completion. Treating it as
  // done would be a guess the document never made; dropping it from the
  // total entirely would erase a real recorded item. So it counts exactly
  // like a declined item: present in the denominator, absent from the
  // numerator.
  const sections = [section({ items: [item({ state: 'unknown', rawMarker: '?', evidence: '' })] })];
  const result = deriveChecklistState(sections);
  assert.deepEqual(result.sections[0].counts, { done: 0, total: 1, percentage: 0, doneUnproven: 0 });
});

test('a done-unproven item still counts as done: the flag is a visibility signal, not a demotion', () => {
  const sections = [section({ items: [item({ state: 'done', evidence: '' })] })];
  const result = deriveChecklistState(sections);
  assert.deepEqual(result.sections[0].counts, { done: 1, total: 1, percentage: 100, doneUnproven: 1 });
});

test('percentage rounds to the nearest integer', () => {
  const sections = [
    section({
      items: [
        item({ state: 'done', evidence: 'proof' }),
        item({ state: 'open' }),
        item({ state: 'open' }),
      ],
    }),
  ];
  const result = deriveChecklistState(sections);
  assert.equal(result.sections[0].counts.percentage, 33);
});

test('a feature with zero countable items reports 0%, never NaN', () => {
  const sections = [section({ heading: 'Constraints', kind: 'constraints', items: [] })];
  const result = deriveChecklistState(sections);
  assert.equal(Number.isNaN(result.progress.percentage), false);
  assert.deepEqual(result.progress, { done: 0, total: 0, percentage: 0, doneUnproven: 0 });
});

// --- progress counting: which sections count -----------------------------

test('a "tasks" section and an unrecognized section both count toward feature progress', () => {
  const text = [
    '# widget-export-v2',
    '',
    '## Tasks',
    '- [x] T1 Ship the export button',
    '      DONE a1b2c3d',
    '- [x] T2 Wire the export command',
    '      DONE b2c3d4e',
    '- [ ] T3 Document the export flag',
    '',
    '## Pending',
    '- [ ] P1 Handle a slow network during export',
    '- [ ] P2 Handle a cancelled export mid-flight',
  ].join('\n');

  const result = derive(text);

  assert.equal(result.sections[0].kind, 'tasks');
  assert.equal(result.sections[0].countsTowardProgress, true);
  assert.equal(result.sections[1].kind, null);
  assert.equal(result.sections[1].countsTowardProgress, true);
  assert.deepEqual(result.progress, { done: 2, total: 5, percentage: 40, doneUnproven: 0 });
});

test('an "acceptance criteria" section is excluded from feature progress but still carries its own counts', () => {
  const text = [
    '# widget-export-v2',
    '',
    '## Tasks',
    '- [x] T1 Ship the export button',
    '      DONE a1b2c3d',
    '- [ ] T2 Wire the export command',
    '',
    '## Acceptance criteria',
    '- [ ] Exporting a widget produces a file on disk',
    '- [ ] The file opens in the default viewer',
    '- [ ] A failed export leaves no partial file behind',
  ].join('\n');

  const result = derive(text);

  const acceptance = result.sections[1];
  assert.equal(acceptance.kind, 'acceptance-criteria');
  assert.equal(acceptance.countsTowardProgress, false);
  assert.deepEqual(acceptance.counts, { done: 0, total: 3, percentage: 0, doneUnproven: 0 });

  // Only the Tasks section (1 of 2 done) feeds the feature roll-up; the
  // three acceptance criteria never enter the denominator.
  assert.deepEqual(result.progress, { done: 1, total: 2, percentage: 50, doneUnproven: 0 });
});

test('every other recognized section kind is also excluded from feature progress', () => {
  const text = [
    '# widget-export-v2',
    '',
    '## Tasks',
    '- [x] T1 Ship the export button',
    '      DONE a1b2c3d',
    '',
    '## Checks',
    '- [x] Linter clean',
    '- [ ] Manual smoke test',
  ].join('\n');

  const result = derive(text);

  assert.equal(result.sections[1].kind, 'checks');
  assert.equal(result.sections[1].countsTowardProgress, false);
  assert.deepEqual(result.progress, { done: 1, total: 1, percentage: 100, doneUnproven: 0 });
});

// --- structural pass-through -------------------------------------------

test('section heading and kind are carried through unchanged, and item fields are preserved alongside derivedState', () => {
  const text = ['# doc', '', '## Tasks', '- [x] T1 Ship the widget'].join('\n');
  const result = derive(text);

  assert.equal(result.sections[0].heading, 'Tasks');
  assert.equal(result.sections[0].kind, 'tasks');
  const derivedItem = result.sections[0].items[0];
  assert.equal(derivedItem.id, 'T1');
  assert.equal(derivedItem.title, 'Ship the widget');
  assert.equal(derivedItem.state, 'done');
  assert.equal(derivedItem.derivedState, 'done-unproven');
});

test('a whole feature made only of items with no evidence and no reference across two sections reproduces a known ratio', () => {
  const text = [
    '# sample-feature',
    '',
    '## Tasks',
    '- [x] T1 First',
    '      DONE a1b2c3d',
    '- [x] T2 Second',
    '      DONE b2c3d4e',
    '- [ ] T3 Third',
    '- [ ] T4 Fourth',
    '',
    '## Findings',
    '- [ ] F1 Unrecognized-heading item one',
  ].join('\n');

  const result = derive(text);

  assert.deepEqual(result.progress, { done: 2, total: 5, percentage: 40, doneUnproven: 0 });
});
