import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeatureModel, ItemModel, SectionModel } from './build-feature-model';
import { EMPTY_DOCUMENT_STRUCTURE } from './build-feature-model';
import type { ChecklistCounts, DerivedItemState } from './derive-checklist-state';
import { compareFeatures, filterFeature, isFeatureClosed } from './filter-and-order-features';

function counts(overrides: Partial<ChecklistCounts> = {}): ChecklistCounts {
  return { done: 0, total: 0, percentage: 0, doneUnproven: 0, ...overrides };
}

function item(overrides: Partial<ItemModel> & { derivedState: DerivedItemState }): ItemModel {
  return {
    id: 'T1',
    title: 'Do the thing',
    commitReference: null,
    startLine: 10,
    endLine: 11,
    evidence: '',
    ...overrides,
  };
}

function section(overrides: Partial<SectionModel> & { items: ItemModel[] }): SectionModel {
  return {
    heading: 'Tasks',
    kind: 'tasks',
    counts: counts(),
    countsTowardProgress: true,
    headingLine: 5,
    ...overrides,
  };
}

function feature(overrides: Partial<FeatureModel> = {}): FeatureModel {
  return {
    featureName: 'sample-feature',
    documentPath: '/does/not/matter/sample-feature.md',
    title: 'sample-feature',
    branch: null,
    progress: counts({ done: 1, total: 2, percentage: 50 }),
    sections: [],
    nextStep: null,
    structure: EMPTY_DOCUMENT_STRUCTURE,
    ...overrides,
  };
}

// --- isFeatureClosed -------------------------------------------------------

test('isFeatureClosed is true when every countable item is done', () => {
  const model = feature({
    sections: [
      section({
        items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done' }), item({ id: 'T3', derivedState: 'done' })],
      }),
    ],
  });
  assert.equal(isFeatureClosed(model), true);
});

test('isFeatureClosed is false when some items are still open', () => {
  const model = feature({
    sections: [
      section({
        items: [item({ id: 'T1', derivedState: 'done' }), item({ id: 'T2', derivedState: 'done' }), item({ id: 'T3', derivedState: 'open' })],
      }),
    ],
  });
  assert.equal(isFeatureClosed(model), false);
});

test('isFeatureClosed is false for a feature with zero countable items: there is no measured progress to close', () => {
  const model = feature({ sections: [] });
  assert.equal(isFeatureClosed(model), false);
});

test('isFeatureClosed counts a done-unproven item as done, same as deriveChecklistState does', () => {
  // done-unproven is additive on top of "done" (see derive-checklist-state.ts):
  // the Open filter does not admit it (see `admits` below), so a feature
  // made entirely of done-unproven items is still closed.
  const model = feature({
    sections: [section({ items: [item({ id: 'T1', derivedState: 'done-unproven' }), item({ id: 'T2', derivedState: 'done-unproven' })] })],
  });
  assert.equal(isFeatureClosed(model), true);
});

test('isFeatureClosed is false when the only items are declined: declined never counts as done', () => {
  const model = feature({ sections: [section({ items: [item({ id: 'T1', derivedState: 'declined' })] })] });
  assert.equal(isFeatureClosed(model), false);
});

test('isFeatureClosed is false when a non-progress-bearing section still has an open item, even though every progress-bearing section is done (T19)', () => {
  // progress (see T5) is deliberately computed over only the sections that
  // count toward it, so a feature can be "done" by that ratio while an
  // "Acceptance criteria" section — which never counts toward progress —
  // still lists work the Open filter admits. isFeatureClosed must agree
  // with the Open filter about what "nothing left" means, so it reads
  // every rendered section, not only the progress-bearing ones.
  const model = feature({
    progress: counts({ done: 1, total: 1, percentage: 100 }),
    sections: [
      section({ heading: 'Tasks', kind: 'tasks', countsTowardProgress: true, items: [item({ id: 'T1', derivedState: 'done' })] }),
      section({
        heading: 'Acceptance criteria',
        kind: 'acceptance-criteria',
        countsTowardProgress: false,
        items: [item({ id: 'A1', derivedState: 'open' })],
      }),
    ],
  });
  assert.equal(isFeatureClosed(model), false);
});

// --- compareFeatures ---------------------------------------------------------

const OPEN_SECTIONS = [section({ items: [item({ id: 'T1', derivedState: 'open' })] })];
const CLOSED_SECTIONS = [section({ items: [item({ id: 'T1', derivedState: 'done' })] })];

test('compareFeatures sorts a closed feature after an open one, regardless of name', () => {
  const open = feature({ featureName: 'zzz-open', sections: OPEN_SECTIONS });
  const closed = feature({ featureName: 'aaa-closed', sections: CLOSED_SECTIONS });
  assert.ok(compareFeatures(closed, open) > 0);
  assert.ok(compareFeatures(open, closed) < 0);
});

test('compareFeatures orders two open features by name', () => {
  const a = feature({ featureName: 'alpha', sections: OPEN_SECTIONS });
  const b = feature({ featureName: 'beta', sections: OPEN_SECTIONS });
  assert.ok(compareFeatures(a, b) < 0);
  assert.ok(compareFeatures(b, a) > 0);
});

test('compareFeatures orders two closed features by name within the closed group', () => {
  const a = feature({ featureName: 'alpha', sections: CLOSED_SECTIONS });
  const b = feature({ featureName: 'beta', sections: CLOSED_SECTIONS });
  assert.ok(compareFeatures(a, b) < 0);
});

test('compareFeatures orders names numerically, not lexicographically: feature-2 before feature-10', () => {
  // A plain localeCompare with no options compares character by character,
  // so "feature-10" < "feature-2" because "1" < "2". The `numeric: true`
  // option is what makes "feature-2" sort before "feature-10", which is the
  // order a person actually expects. This also falsifies an implementation
  // that dropped the numeric option.
  const a = feature({ featureName: 'feature-2' });
  const b = feature({ featureName: 'feature-10' });
  assert.ok(compareFeatures(a, b) < 0);
});

test('compareFeatures ignores diacritics: "cafe" and "café" compare equal, proving explicit collation options are used', () => {
  // localeCompare's default sensitivity is "variant", which treats "cafe"
  // and "café" as different. Passing `{ sensitivity: 'base' }` explicitly
  // is what makes them compare equal here, independent of whichever locale
  // the host process happens to be running under. A call to
  // `a.localeCompare(b)` with no locale or options would not reliably
  // return 0 for this pair, so this assertion falsifies that omission.
  const a = feature({ featureName: 'cafe' });
  const b = feature({ featureName: 'café' });
  assert.equal(compareFeatures(a, b), 0);
});

// --- filterFeature -----------------------------------------------------------

test('filterFeature("all") returns the feature unchanged', () => {
  const model = feature({
    sections: [section({ items: [item({ derivedState: 'open' })] })],
  });
  assert.equal(filterFeature(model, 'all'), model);
});

test('filterFeature("open") keeps open, declined and unknown items, drops done and done-unproven', () => {
  const model = feature({
    sections: [
      section({
        items: [
          item({ id: 'T1', derivedState: 'open' }),
          item({ id: 'T2', derivedState: 'declined' }),
          item({ id: 'T3', derivedState: 'unknown' }),
          item({ id: 'T4', derivedState: 'done' }),
          item({ id: 'T5', derivedState: 'done-unproven' }),
        ],
      }),
    ],
  });
  const filtered = filterFeature(model, 'open');
  assert.ok(filtered);
  assert.equal(filtered!.sections.length, 1);
  assert.deepEqual(
    filtered!.sections[0].items.map((i: ItemModel) => i.id),
    ['T1', 'T2', 'T3'],
  );
});

test('filterFeature("unproven") keeps only done-unproven items', () => {
  const model = feature({
    sections: [
      section({
        items: [
          item({ id: 'T1', derivedState: 'open' }),
          item({ id: 'T2', derivedState: 'done' }),
          item({ id: 'T3', derivedState: 'done-unproven' }),
        ],
      }),
    ],
  });
  const filtered = filterFeature(model, 'unproven');
  assert.ok(filtered);
  assert.deepEqual(
    filtered!.sections[0].items.map((i: ItemModel) => i.id),
    ['T3'],
  );
});

test('filterFeature drops a section left with no items', () => {
  const model = feature({
    sections: [
      section({ heading: 'Tasks', items: [item({ derivedState: 'open' })] }),
      section({ heading: 'Done things', items: [item({ derivedState: 'done' })] }),
    ],
  });
  const filtered = filterFeature(model, 'open');
  assert.ok(filtered);
  assert.equal(filtered!.sections.length, 1);
  assert.equal(filtered!.sections[0].heading, 'Tasks');
});

test('filterFeature returns null when no section survives', () => {
  const model = feature({
    sections: [section({ items: [item({ derivedState: 'done' })] })],
  });
  assert.equal(filterFeature(model, 'open'), null);
});

test('filterFeature returns null for a feature with no sections at all', () => {
  const model = feature({ sections: [] });
  assert.equal(filterFeature(model, 'open'), null);
});

test('filterFeature never rewrites progress: it keeps reporting the document\'s real ratio', () => {
  // The tree must not invent progress a filter happens to hide: a feature
  // that is 1/5 done in the document stays 1/5 in its header even when the
  // "unproven" filter narrows it down to a single visible item.
  const realProgress = counts({ done: 1, total: 5, percentage: 20, doneUnproven: 1 });
  const model = feature({
    progress: realProgress,
    sections: [
      section({
        items: [
          item({ id: 'T1', derivedState: 'done-unproven' }),
          item({ id: 'T2', derivedState: 'open' }),
        ],
      }),
    ],
  });
  const filtered = filterFeature(model, 'unproven');
  assert.ok(filtered);
  assert.deepEqual(filtered!.progress, realProgress);
});
