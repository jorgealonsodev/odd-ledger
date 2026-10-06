import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PendingDocumentUpdates } from './pending-document-updates';

test('initial focus state controls whether a batch is counted', () => {
  const updates = new PendingDocumentUpdates(true);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 0);

  updates.setFocused(false);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 1);
});

test('counts distinct paths across batches and repeated saves count once', () => {
  const updates = new PendingDocumentUpdates(false);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md', '/workspace/odd/tasks/beta.md']));
  updates.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));

  assert.equal(updates.count, 2);
});

test('empty batches and batches received while focused do not increment the count', () => {
  const updates = new PendingDocumentUpdates(false);
  updates.recordBatch(new Set());
  assert.equal(updates.count, 0);

  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  updates.setFocused(true);
  updates.recordBatch(new Set(['/workspace/odd/tasks/beta.md']));
  assert.equal(updates.count, 0);
});

test('refocusing clears accumulated paths and the next blur starts a clean count', () => {
  const updates = new PendingDocumentUpdates(false);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  updates.setFocused(true);
  assert.equal(updates.count, 0);

  updates.setFocused(false);
  updates.recordBatch(new Set(['/workspace/odd/tasks/alpha.md']));
  assert.equal(updates.count, 1);
});
