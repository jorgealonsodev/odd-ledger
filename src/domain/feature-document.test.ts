import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFeatureDocumentPath } from './feature-document';

test('accepts a relative odd/tasks/<name>.md path', () => {
  assert.equal(isFeatureDocumentPath('odd/tasks/ledger-view-v1.md'), true);
});

test('accepts an absolute odd/tasks/<name>.md path', () => {
  assert.equal(isFeatureDocumentPath('/repo/odd/tasks/ledger-view-v1.md'), true);
});

test('accepts a Windows-style backslash path', () => {
  assert.equal(isFeatureDocumentPath('C:\\repo\\odd\\tasks\\ledger-view-v1.md'), true);
});

test('rejects a file directly under odd/, outside tasks/', () => {
  assert.equal(isFeatureDocumentPath('odd/ledger-view-v1.md'), false);
});

test('rejects a non-markdown file inside odd/tasks/', () => {
  assert.equal(isFeatureDocumentPath('odd/tasks/ledger-view-v1.txt'), false);
});

test('rejects a file nested in a subdirectory of odd/tasks/', () => {
  assert.equal(isFeatureDocumentPath('odd/tasks/archive/ledger-view-v1.md'), false);
});

test('rejects a path with no odd/tasks/ segment at all', () => {
  assert.equal(isFeatureDocumentPath('src/domain/feature-document.ts'), false);
});
