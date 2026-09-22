import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPanelHeader } from './build-panel-header';
import type { FeatureModel } from './build-feature-model';

/**
 * buildPanelHeader (T10) composes the detail panel's header and tile row
 * from an already-built FeatureModel (T8) plus the workspace root the
 * document was discovered under. Models are hand-built here, the same way
 * feature-tree-provider.test.ts hand-builds them, rather than routed
 * through buildFeatureModel: what is under test is the header shape, not
 * the parsers that fed T8.
 */

const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

function model(overrides: Partial<FeatureModel> = {}): FeatureModel {
  return {
    featureName: 'cache-warm-v2',
    documentPath: '/workspace/odd/tasks/cache-warm-v2.md',
    title: '# A completely different H1 wording',
    branch: null,
    progress: EMPTY_COUNTS,
    sections: [],
    nextStep: null,
    ...overrides,
  };
}

// --- title -----------------------------------------------------------------

test('title comes from the feature name, not the document H1', () => {
  const header = buildPanelHeader(
    model({ featureName: 'cache-warm-v2', title: 'Ship the cache warmer' }),
    '/workspace',
  );
  assert.equal(header.title, 'cache-warm-v2');
  assert.notEqual(header.title, 'Ship the cache warmer');
});

// --- project and relative path ----------------------------------------------

test('project is the workspace root\'s base directory name', () => {
  const header = buildPanelHeader(model(), '/home/dev/checkout-service');
  assert.equal(header.project, 'checkout-service');
});

test('relativePath is the document path relative to the workspace root', () => {
  const header = buildPanelHeader(
    model({ documentPath: '/home/dev/checkout-service/odd/tasks/cache-warm-v2.md' }),
    '/home/dev/checkout-service',
  );
  assert.equal(header.relativePath, 'odd/tasks/cache-warm-v2.md');
});

test('relativePath uses forward slashes for a nested document path regardless of platform', () => {
  const header = buildPanelHeader(
    model({ documentPath: '/home/dev/checkout-service/odd/tasks/nested/deep/cache-warm-v2.md' }),
    '/home/dev/checkout-service',
  );
  assert.equal(header.relativePath, 'odd/tasks/nested/deep/cache-warm-v2.md');
  assert.ok(!header.relativePath.includes('\\'));
});

// --- branch ------------------------------------------------------------------

test('branch is carried through when the document names one', () => {
  const header = buildPanelHeader(model({ branch: 'feat/cache-warm-v2' }), '/workspace');
  assert.equal(header.branch, 'feat/cache-warm-v2');
});

test('branch is null when the document names none', () => {
  const header = buildPanelHeader(model({ branch: null }), '/workspace');
  assert.equal(header.branch, null);
});

// --- next step -----------------------------------------------------------------

test('nextStep is carried through when the document records one', () => {
  const nextStep = { line: 'Ship the remaining task.', headingLine: 40 };
  const header = buildPanelHeader(model({ nextStep }), '/workspace');
  assert.deepEqual(header.nextStep, nextStep);
});

test('nextStep is null when the document records none', () => {
  const header = buildPanelHeader(model({ nextStep: null }), '/workspace');
  assert.equal(header.nextStep, null);
});

// --- tiles: PROGRESS ---------------------------------------------------------

test('the PROGRESS tile reports done/total and percentage', () => {
  const header = buildPanelHeader(
    model({ progress: { done: 7, total: 10, percentage: 70, doneUnproven: 1 } }),
    '/workspace',
  );
  assert.deepEqual(header.tiles[0], { label: 'PROGRESS', value: '7/10 · 70%' });
});

test('the PROGRESS tile states absence rather than 0/0 · 0% when there are zero items', () => {
  const header = buildPanelHeader(model({ progress: EMPTY_COUNTS }), '/workspace');
  assert.deepEqual(header.tiles[0], { label: 'PROGRESS', value: 'not recorded' });
});

// --- tiles: UNPROVEN -----------------------------------------------------------

test('the UNPROVEN tile pluralises for more than one unproven task', () => {
  const header = buildPanelHeader(
    model({ progress: { done: 5, total: 10, percentage: 50, doneUnproven: 3 } }),
    '/workspace',
  );
  assert.deepEqual(header.tiles[1], { label: 'UNPROVEN', value: '3 tasks' });
});

test('the UNPROVEN tile stays singular for exactly one unproven task', () => {
  const header = buildPanelHeader(
    model({ progress: { done: 5, total: 10, percentage: 50, doneUnproven: 1 } }),
    '/workspace',
  );
  assert.deepEqual(header.tiles[1], { label: 'UNPROVEN', value: '1 task' });
});

test('the UNPROVEN tile reads "none" rather than "0 tasks" when there are zero', () => {
  const header = buildPanelHeader(
    model({ progress: { done: 5, total: 5, percentage: 100, doneUnproven: 0 } }),
    '/workspace',
  );
  assert.deepEqual(header.tiles[1], { label: 'UNPROVEN', value: 'none' });
});

// --- tiles: LAST WORK ------------------------------------------------------------

test('the LAST WORK tile states absence by default: git history is not read until T13', () => {
  const header = buildPanelHeader(model(), '/workspace');
  assert.deepEqual(header.tiles[2], { label: 'LAST WORK', value: 'not recorded' });
});

test('the LAST WORK tile carries a supplied date through its seam parameter, for T13 to fill', () => {
  const header = buildPanelHeader(model(), '/workspace', '2026-09-21');
  assert.deepEqual(header.tiles[2], { label: 'LAST WORK', value: '2026-09-21' });
});
