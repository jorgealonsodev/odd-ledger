'use strict';

// Asserts what actually ships in the packaged extension, read from the file
// list `vsce` itself would package (honouring .vscodeignore), never from the
// working tree. A silent packaging mistake — an ignore rule that is too
// broad, or missing entirely — must fail this suite rather than surface
// later as a webview with no icons.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listFiles } = require('@vscode/vsce');

const ROOT = path.resolve(__dirname, '..');

// The webview reads exactly this file at runtime (see
// src/adapter/feature-detail-panel.ts); nothing else under
// @vscode/codicons is loaded.
const CODICON_FONT = 'node_modules/@vscode/codicons/dist/codicon.ttf';
const BUNDLED_ENTRY_POINT = 'dist/extension.js';

// markdown-it ships a different way than the codicon font: it is imported
// TypeScript (src/domain/render-markdown.ts) that esbuild statically
// bundles straight into BUNDLED_ENTRY_POINT, not a binary asset read from
// disk at runtime by path. So it needs no node_modules carve-out of its
// own — node_modules/** stays ignored wholesale for it — but the bundle
// itself has to actually contain its code, not just its type
// declarations, or the panel's Markdown rendering silently breaks at
// runtime the moment a document has any evidence to render.
//
// Every one of these is a literal string argument markdown-it's own
// source passes to its rule registries (`ruler.push('backticks', ...)`
// and similar) so its Ruler can look rules up by name at runtime — esbuild
// minifies identifiers, never the contents of a string literal a running
// program still reads by value, so these survive a production build
// unchanged and are direct evidence the library's own code, not just its
// name in package.json, made it into the shipped bundle.
const MARKDOWN_IT_RULE_NAME_LITERALS = ['backticks', 'linkify', 'strikethrough', 'html_block'];

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

test('ships a licence file, so the installable artifact carries its own terms', async () => {
  const files = await packagedFiles();
  const licenceFiles = files.filter((file) => /^licen[sc]e(\.|$)/i.test(file));
  assert.ok(
    licenceFiles.length > 0,
    `expected a licence file in the package; files found at the root: ${files.filter((file) => !file.includes('/')).join(', ') || '(none)'}`,
  );
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

test('carries no README screenshot: the Marketplace reads images/ over HTTPS from the repository, not from the package', async () => {
  const files = await packagedFiles();
  const imageFiles = files.filter((file) => file.startsWith('images/'));
  assert.deepEqual(imageFiles, []);
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

test('declares markdown-it as a runtime dependency, not a dev dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  assert.ok(pkg.dependencies && pkg.dependencies['markdown-it'], 'expected "markdown-it" under package.json dependencies');
  assert.ok(
    !pkg.devDependencies || !pkg.devDependencies['markdown-it'],
    'expected "markdown-it" not to also be a devDependency',
  );
});

test('bundles markdown-it\'s own code into the shipped entry point, not just its dependency declaration', async () => {
  const files = await packagedFiles();
  assert.ok(files.includes(BUNDLED_ENTRY_POINT), `expected ${BUNDLED_ENTRY_POINT} in the package`);
  const bundleSource = fs.readFileSync(path.join(ROOT, BUNDLED_ENTRY_POINT), 'utf-8');
  for (const ruleName of MARKDOWN_IT_RULE_NAME_LITERALS) {
    assert.ok(
      bundleSource.includes(`'${ruleName}'`) || bundleSource.includes(`"${ruleName}"`),
      `expected the markdown-it rule name literal "${ruleName}" inside ${BUNDLED_ENTRY_POINT}; the library may have been externalized instead of bundled`,
    );
  }
});

test('carries no raw markdown-it package under node_modules: it ships bundled into the entry point, not as its own files', async () => {
  const files = await packagedFiles();
  const markdownItFiles = files.filter((file) => file.startsWith('node_modules/markdown-it/'));
  assert.deepEqual(markdownItFiles, []);
});

// git-spawn-hardening R1: without an explicit capabilities.untrustedWorkspaces
// declaration, VS Code's default treats the extension as unsupported in
// Restricted Mode, which is the wrong default to leave implicit for an
// extension that spawns git processes as soon as a workspace opens — this
// asserts the declaration is explicit and says "not supported" in words, not
// just by omission.
test('declares itself unsupported in untrusted (Restricted Mode) workspaces, explicitly', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  assert.ok(pkg.capabilities && pkg.capabilities.untrustedWorkspaces, 'expected "capabilities.untrustedWorkspaces" in package.json');
  assert.equal(pkg.capabilities.untrustedWorkspaces.supported, false);
  assert.equal(
    typeof pkg.capabilities.untrustedWorkspaces.description,
    'string',
    'expected a human-readable description explaining why untrusted workspaces are unsupported',
  );
  assert.ok(pkg.capabilities.untrustedWorkspaces.description.length > 0);
});
