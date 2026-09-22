import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOpenFeatureFetch, type OpenFeaturePanel } from './run-open-feature-fetch';
import type { FetchedRevisions } from './fetch-git-revisions';
import { EMPTY_DOCUMENT_STRUCTURE, type FeatureModel } from './build-feature-model';
const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };
const NO_REVISIONS: FetchedRevisions = { revisions: [], truncated: false, skippedCount: 0 };
const slimModel = (featureName: string): FeatureModel => ({ featureName, documentPath: `/workspace/odd/tasks/${featureName}.md`, title: null, branch: null, progress: EMPTY_COUNTS, sections: [], nextStep: null, structure: EMPTY_DOCUMENT_STRUCTURE });

function fakePanel(): {
  panel: OpenFeaturePanel;
  calls: Array<{ history: unknown; focusedTaskStartLine: number | undefined; preserveFocus: boolean | undefined }>;
} {
  const calls: Array<{ history: unknown; focusedTaskStartLine: number | undefined; preserveFocus: boolean | undefined }> = [];
  return {
    panel: {
      show: (_m, _r, _l, history, focusedTaskStartLine, preserveFocus) =>
        calls.push({ history, focusedTaskStartLine, preserveFocus }),
    },
    calls,
  };
}

test('shows the panel exactly once per open, already carrying the resolved history', async () => {
  const { panel, calls } = fakePanel();
  const revisions: FetchedRevisions = {
    revisions: [{ hash: 'abc123', date: '2026-09-20T10:00:00+00:00', text: '- [x] T1 done' }],
    truncated: false,
    skippedCount: 0,
  };
  const fetch = async () => revisions;

  await runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch);

  assert.equal(calls.length, 1, 'expected exactly one render for one open');
  const history = calls[0].history as { available: boolean; points: readonly unknown[] };
  assert.equal(history.available, true, 'expected the resolved history, not a placeholder or the unavailable state');
  assert.equal(history.points.length, 1, 'expected the one fetched revision to have been turned into a history point');
});

test('awaits the bounded git read before rendering anything', async () => {
  const { panel, calls } = fakePanel();
  let resolveFetch!: (r: FetchedRevisions) => void;
  const fetch = () => new Promise<FetchedRevisions>((resolve) => (resolveFetch = resolve));

  const done = runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch);
  assert.equal(calls.length, 0, 'the panel must not render before the git read resolves');

  resolveFetch(NO_REVISIONS);
  await done;
  assert.equal(calls.length, 1, 'expected exactly one render once the fetch resolved');
});

test('passes focusedTaskStartLine through to the panel when given', async () => {
  const { panel, calls } = fakePanel();
  const fetch = async () => NO_REVISIONS;

  await runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch, 42);

  assert.equal(calls[0].focusedTaskStartLine, 42);
});

test('leaves focusedTaskStartLine undefined when the caller gives none (a feature node\'s own click, or a watcher refresh)', async () => {
  const { panel, calls } = fakePanel();
  const fetch = async () => NO_REVISIONS;

  await runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch);

  assert.equal(calls[0].focusedTaskStartLine, undefined);
});

test('passes preserveFocus through to the panel when given', async () => {
  const { panel, calls } = fakePanel();
  const fetch = async () => NO_REVISIONS;

  await runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch, 42, true);

  assert.equal(calls[0].preserveFocus, true);
});

test('leaves preserveFocus undefined when the caller gives none', async () => {
  const { panel, calls } = fakePanel();
  const fetch = async () => NO_REVISIONS;

  await runOpenFeatureFetch(slimModel('sample'), '/workspace', panel, fetch);

  assert.equal(calls[0].preserveFocus, undefined);
});
