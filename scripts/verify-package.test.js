'use strict';

// Asserts what actually ships in the packaged extension, read from the file
// list `vsce` itself would package (honouring .vscodeignore), never from the
// working tree. A silent packaging mistake — an ignore rule that is too
// broad, or missing entirely — must fail this suite rather than surface
// later as a webview with no icons.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { listFiles } = require('@vscode/vsce');

const ROOT = path.resolve(__dirname, '..');

// The webview reads exactly this file at runtime (see
// src/adapter/feature-detail-panel.ts); nothing else under
// @vscode/codicons is loaded.
const CODICON_FONT = 'node_modules/@vscode/codicons/dist/codicon.ttf';
const BUNDLED_ENTRY_POINT = 'dist/extension.js';

let cachedFiles;

async function packagedFiles() {
  if (!cachedFiles) {
    cachedFiles = await listFiles({ cwd: ROOT });
  }
  return cachedFiles;
}

test('ships the codicon font the detail panel loads at runtime', async () => {
  const files = await packagedFiles();
  assert.ok(
    files.includes(CODICON_FONT),
    `expected ${CODICON_FONT} in the package; codicon-related entries found: ` +
      `${files.filter((file) => file.includes('codicon')).join(', ') || '(none)'}`,
  );
});

test('ships the bundled extension entry point', async () => {
  const files = await packagedFiles();
  assert.ok(files.includes(BUNDLED_ENTRY_POINT), `expected ${BUNDLED_ENTRY_POINT} in the package`);
});

test('carries no test file', async () => {
  const files = await packagedFiles();
  const testFiles = files.filter((file) => /\.(test|workspace-test|optional\.test)\.(ts|js)$/.test(file));
  assert.deepEqual(testFiles, []);
});

test('carries no fixture', async () => {
  const files = await packagedFiles();
  const fixtureFiles = files.filter((file) => file.includes('/fixtures/'));
  assert.deepEqual(fixtureFiles, []);
});

test('carries no TypeScript source', async () => {
  const files = await packagedFiles();
  const sourceFiles = files.filter((file) => file.startsWith('src/'));
  assert.deepEqual(sourceFiles, []);
});

test('carries no compiled test output', async () => {
  const files = await packagedFiles();
  const compiledTestOutput = files.filter((file) => file.startsWith('out/'));
  assert.deepEqual(compiledTestOutput, []);
});

test('carries no CodeGraph index', async () => {
  const files = await packagedFiles();
  const codegraphFiles = files.filter((file) => file.startsWith('.codegraph/'));
  assert.deepEqual(codegraphFiles, []);
});

test('carries no ODD ledger folder', async () => {
  const files = await packagedFiles();
  const oddFiles = files.filter((file) => file.startsWith('odd/'));
  assert.deepEqual(oddFiles, []);
});

test('carries no test runner configuration', async () => {
  const files = await packagedFiles();
  assert.ok(!files.includes('.vscode-test.mjs'));
});

test('carries no root PRD document', async () => {
  const files = await packagedFiles();
  assert.ok(!files.includes('PRD.md'));
});

test('carries no stray source map from a non-production build', async () => {
  const files = await packagedFiles();
  const mapFiles = files.filter((file) => file.endsWith('.js.map'));
  assert.deepEqual(mapFiles, []);
});

test('carries no other package of @vscode/codicons than its font', async () => {
  const files = await packagedFiles();
  const codiconFiles = files.filter((file) => file.startsWith('node_modules/@vscode/codicons/'));
  assert.deepEqual(codiconFiles, [CODICON_FONT]);
});
