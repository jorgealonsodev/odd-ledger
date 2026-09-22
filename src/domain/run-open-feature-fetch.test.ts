import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOpenFeatureFetch, type OpenFeaturePanel } from './run-open-feature-fetch';
import { PENDING_HISTORY } from './build-history';
import type { FetchedRevisions } from './fetch-git-revisions';
import { EMPTY_DOCUMENT_STRUCTURE, type FeatureModel } from './build-feature-model';
const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };
const NO_REVISIONS: FetchedRevisions = { revisions: [], truncated: false, skippedCount: 0 };
const slimModel = (featureName: string): FeatureModel => ({ featureName, documentPath: `/workspace/odd/tasks/${featureName}.md`, title: null, branch: null, progress: EMPTY_COUNTS, sections: [], nextStep: null, structure: EMPTY_DOCUMENT_STRUCTURE });
function fakePanel(): { panel: OpenFeaturePanel; calls: Array<{ history: unknown }> } {
  const calls: Array<{ history: unknown }> = [];
  return { panel: { show: (_m, _r, _l, history) => calls.push({ history }) }, calls };
}

test('renders immediately with PENDING_HISTORY, then fills in the resolved history', async () => {
  const { panel, calls } = fakePanel();
  let resolveFetch!: (r: FetchedRevisions) => void;
  const fetch = () => new Promise<FetchedRevisions>((resolve) => (resolveFetch = resolve));
  const done = runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch, () => true);
  assert.equal(calls.length, 1, 'expected an immediate render before the fetch settles');
  assert.equal(calls[0].history, PENDING_HISTORY);
  resolveFetch(NO_REVISIONS);
  await done;
  assert.equal(calls.length, 2, 'expected a second render once the fetch resolved');
  assert.notEqual(calls[1].history, PENDING_HISTORY);
});

test('drops the resolved result once isCurrent reports a newer request has taken over', async () => {
  const { panel, calls } = fakePanel();
  let resolveFetch!: (r: FetchedRevisions) => void;
  const fetch = () => new Promise<FetchedRevisions>((resolve) => (resolveFetch = resolve));
  let current = true;
  const done = runOpenFeatureFetch(slimModel('stale'), '/workspace', panel, fetch, () => current);
  current = false; // a newer request started while this fetch was in flight
  resolveFetch(NO_REVISIONS);
  await done;
  assert.equal(calls.length, 1, "a stale fetch's resolved history must not render");
});
