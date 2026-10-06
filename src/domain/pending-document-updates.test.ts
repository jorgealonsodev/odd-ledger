import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PendingDocumentUpdates } from './pending-document-updates';

// "Seen" means the window is focused AND the view is visible; a batch is
// counted in every other state.
const INITIAL_STATES = [
  { label: 'a focused window with the view visible', focused: true, viewVisible: true, counted: false },
  { label: 'an unfocused window with the view visible', focused: false, viewVisible: true, counted: true },
  { label: 'a focused window with the view hidden', focused: true, viewVisible: false, counted: true },
  { label: 'an unfocused window with the view hidden', focused: false, viewVisible: false, counted: true },
] as const;

for (const { label, focused, viewVisible, counted } of INITIAL_STATES) {
  test(`initial state: ${label} ${counted ? 'counts' : 'does not count'} a batch`, () => {
    const updates = new PendingDocumentUpdates({ focused, viewVisible });
    updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
    assert.equal(updates.count, counted ? 1 : 0);
  });
}

test('counts distinct paths across batches and repeated saves count once', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: false });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md', '/workspace/odd/tasks/beta.md']));
  updates.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));

  assert.equal(updates.count, 2);
});

test('distinct paths keep accumulating across signals that never complete "seen"', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: false });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));

  updates.setFocused(true);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md', '/workspace/odd/tasks/beta.md']));
  updates.setFocused(false);
  updates.setViewVisible(true);
  updates.recordBatch(new Set(['/workspace/odd/tasks/gamma.md']));

  assert.equal(updates.count, 3);
});

test('empty batches and batches received while seen do not increment the count', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: false });
  updates.recordBatch(new Set());
  assert.equal(updates.count, 0);

  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  updates.setFocused(true);
  updates.setViewVisible(true);
  updates.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));
  assert.equal(updates.count, 0);
});

test('regaining focus while the view is hidden keeps the pending paths and keeps counting', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: false });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));

  updates.setFocused(true);
  assert.equal(updates.count, 1);

  updates.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));
  assert.equal(updates.count, 2);
});

test('showing the view while the window is unfocused keeps the pending paths and keeps counting', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: false });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));

  updates.setViewVisible(true);
  assert.equal(updates.count, 1);

  updates.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));
  assert.equal(updates.count, 2);
});

test('repeated signals that leave the user unseen never clear the pending paths', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: false });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));

  updates.setFocused(false);
  updates.setViewVisible(false);
  assert.equal(updates.count, 1);

  updates.setFocused(true);
  updates.setViewVisible(false);
  assert.equal(updates.count, 1);
});

test('regaining focus with the view visible completes "seen": it clears the paths and the next blur starts a clean count', () => {
  const updates = new PendingDocumentUpdates({ focused: false, viewVisible: true });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 1);

  updates.setFocused(true);
  assert.equal(updates.count, 0);

  updates.setFocused(false);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 1);
});

test('showing the view in a focused window completes "seen": it clears the paths and hiding the view starts a clean count', () => {
  const updates = new PendingDocumentUpdates({ focused: true, viewVisible: false });
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 1);

  updates.setViewVisible(true);
  assert.equal(updates.count, 0);

  updates.setViewVisible(false);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 1);
});
