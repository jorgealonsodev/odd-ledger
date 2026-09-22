import * as assert from 'node:assert/strict';
import { rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { FeatureDocumentWatcher } from './feature-document-watcher';

/**
 * Runs in the workspace @vscode/test-cli profile (see .vscode-test.mjs),
 * which opens fixtures/sample-workspace — a real workspace folder is what
 * vscode.workspace.createFileSystemWatcher needs to watch anything. Every
 * test writes to a document of its own under that folder's odd/tasks/,
 * never to one of the checked-in fixture documents other suites in this
 * profile rely on, and removes it again in teardown so this suite leaves
 * no trace behind for the tests that run after it.
 */

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return predicate();
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

suite('FeatureDocumentWatcher — real workspace file events', () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'this suite requires the workspace test profile');

  const tempPath = join(folder!.uri.fsPath, 'odd', 'tasks', '__watcher-temp-doc__.md');

  let watcher: FeatureDocumentWatcher | undefined;

  teardown(() => {
    watcher?.dispose();
    watcher = undefined;
    rmSync(tempPath, { force: true });
  });

  test('creating a document under odd/tasks/ flushes, reporting it as touched', async function () {
    this.timeout(10000);
    const flushes: Array<ReadonlySet<string>> = [];
    watcher = new FeatureDocumentWatcher((flush) => flushes.push(flush.touchedPaths));
    // A freshly created native watcher needs a moment to attach before it
    // reliably observes the very first event on a path it has never seen
    // before; every other test in this suite writes to tempPath at least
    // once before the watcher under test is constructed, which is what
    // gives them that same settling time for free.
    await new Promise((resolve) => setTimeout(resolve, 500));

    writeFileSync(tempPath, '# Temp\n');

    const seen = await waitFor(
      () => flushes.some((paths) => paths.has(tempPath)),
      8000,
    );
    assert.ok(seen, 'expected a flush reporting the created document as touched');
  });

  test('changing a document under odd/tasks/ flushes, reporting it as touched', async function () {
    this.timeout(10000);
    writeFileSync(tempPath, '# Temp\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const flushes: Array<ReadonlySet<string>> = [];
    watcher = new FeatureDocumentWatcher((flush) => flushes.push(flush.touchedPaths));

    writeFileSync(tempPath, '# Temp\n\nchanged\n');

    const seen = await waitFor(
      () => flushes.some((paths) => paths.has(tempPath)),
      8000,
    );
    assert.ok(seen, 'expected a flush reporting the changed document as touched');
  });

  test('deleting a document under odd/tasks/ flushes, reporting it as touched', async function () {
    this.timeout(10000);
    writeFileSync(tempPath, '# Temp\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const flushes: Array<ReadonlySet<string>> = [];
    watcher = new FeatureDocumentWatcher((flush) => flushes.push(flush.touchedPaths));

    unlinkSync(tempPath);

    const seen = await waitFor(
      () => flushes.some((paths) => paths.has(tempPath)),
      8000,
    );
    assert.ok(seen, 'expected a flush reporting the deleted document as touched');
  });

  test('several rapid writes inside the debounce window produce exactly one flush', async function () {
    this.timeout(10000);
    writeFileSync(tempPath, '# Temp\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    let flushCount = 0;
    watcher = new FeatureDocumentWatcher(() => {
      flushCount++;
    });

    writeFileSync(tempPath, '# Temp\n\none\n');
    writeFileSync(tempPath, '# Temp\n\ntwo\n');
    writeFileSync(tempPath, '# Temp\n\nthree\n');

    await waitFor(() => flushCount > 0, 8000);
    // A further window in case a second, wrongly-uncoalesced flush was
    // about to land.
    await new Promise((resolve) => setTimeout(resolve, 600));

    assert.equal(flushCount, 1, 'expected the three rapid writes to coalesce into exactly one flush');
  });

  test('dispose stops further flushes from reaching the callback', async function () {
    this.timeout(10000);
    writeFileSync(tempPath, '# Temp\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    let flushCount = 0;
    watcher = new FeatureDocumentWatcher(() => {
      flushCount++;
    });
    watcher.dispose();
    watcher = undefined;

    writeFileSync(tempPath, '# Temp\n\nafter dispose\n');
    await new Promise((resolve) => setTimeout(resolve, 900));

    assert.equal(flushCount, 0, 'expected no flush once the watcher had been disposed');
  });

  // A live test exercising vscode.workspace.updateWorkspaceFolders (to
  // prove the onDidChangeWorkspaceFolders rebuild) was tried here and
  // dropped: adding and removing a real workspace folder in this test
  // host mutates state that outlives this test process and leaked into a
  // later @vscode/test-cli profile launch (the no-folder profile started
  // reporting a workspace folder open), breaking unrelated suites. The
  // rebuild itself (rebuildFolderWatchers, wired to
  // vscode.workspace.onDidChangeWorkspaceFolders in the constructor) is
  // a direct, narrow use of the documented API and is covered by code
  // review rather than a live folder mutation here.
});
