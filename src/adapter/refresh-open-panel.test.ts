import * as assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshOpenPanelIfTouched, type RefreshablePanel } from './refresh-open-panel';
import type { FeatureModel } from '../domain/build-feature-model';
import type { FetchedRevisions } from '../domain/fetch-git-revisions';

/**
 * Runs in the default @vscode/test-cli configuration (no workspace folder
 * open), the same profile feature-detail-panel.test.ts and
 * extension-activation.test.ts use: this module only ever needs a real
 * file on disk and a fake panel, never a workspace folder — the no-folder
 * case is what exercises resolveWorkspaceRoot's own fallback.
 */

function fakePanel(initialOpenPath: string | undefined): RefreshablePanel & {
  showCalls: FeatureModel[];
  removedCalls: string[];
  refreshFailedCalls: string[];
} {
  let openDocumentPath = initialOpenPath;
  const showCalls: FeatureModel[] = [];
  const removedCalls: string[] = [];
  const refreshFailedCalls: string[] = [];
  return {
    get openDocumentPath() {
      return openDocumentPath;
    },
    show(model) {
      openDocumentPath = model.documentPath;
      showCalls.push(model);
    },
    showRemoved(featureName) {
      removedCalls.push(featureName);
      openDocumentPath = undefined;
    },
    showRefreshFailed(featureName) {
      // Unlike showRemoved, this does not clear openDocumentPath.
      refreshFailedCalls.push(featureName);
    },
    showCalls,
    removedCalls,
    refreshFailedCalls,
  };
}

suite('refreshOpenPanelIfTouched', () => {
  let tempDir: string;
  let documentPath: string;

  setup(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'odd-ledger-refresh-'));
    const tasksDir = join(tempDir, 'odd', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    documentPath = join(tasksDir, 'temp-feature.md');
    writeFileSync(documentPath, '# temp-feature\n\n## Tasks\n\n- [ ] T1 do it\n');
  });

  teardown(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('does nothing when no panel is open', async () => {
    const panel = fakePanel(undefined);

    await refreshOpenPanelIfTouched(panel, new Set([documentPath]));

    assert.equal(panel.showCalls.length, 0);
    assert.equal(panel.removedCalls.length, 0);
  });

  test('does nothing when the touched paths do not include the open document', async () => {
    const panel = fakePanel(documentPath);

    await refreshOpenPanelIfTouched(panel, new Set(['/somewhere/else/odd/tasks/other-feature.md']));

    assert.equal(panel.showCalls.length, 0);
    assert.equal(panel.removedCalls.length, 0);
  });

  test('re-renders the open panel from the document\'s current content when it changed', async () => {
    const panel = fakePanel(documentPath);
    writeFileSync(documentPath, '# temp-feature\n\n## Tasks\n\n- [x] T1 do it\n');

    await refreshOpenPanelIfTouched(panel, new Set([documentPath]));

    assert.equal(panel.showCalls.length, 1, 'expected exactly one re-render');
    assert.equal(
      panel.showCalls[0].progress.done,
      1,
      'expected the updated document text to have been re-read, not the stale one the panel already had',
    );
  });

  test('shows the removed state, naming the feature, when the open document was deleted', async () => {
    const panel = fakePanel(documentPath);
    rmSync(documentPath);

    await refreshOpenPanelIfTouched(panel, new Set([documentPath]));

    assert.deepEqual(panel.removedCalls, ['temp-feature']);
    assert.equal(panel.showCalls.length, 0, 'expected no re-render for a document that no longer exists');
  });

  test('shows the refresh-failed state, not the removed state, when the document still exists but cannot be read back', async () => {
    // A directory of the same name makes existsSync true but readFileSync
    // throw (EISDIR) — a real, unmocked read failure after the check.
    rmSync(documentPath);
    mkdirSync(documentPath);
    const panel = fakePanel(documentPath);

    await refreshOpenPanelIfTouched(panel, new Set([documentPath]));

    assert.deepEqual(panel.refreshFailedCalls, ['temp-feature']);
    assert.equal(panel.removedCalls.length, 0, 'a document that still exists, even unreadably, is not the same case as a confirmed deletion');
    assert.equal(panel.showCalls.length, 0, 'expected no re-render from a read that failed');
  });

  test('shows the refresh-failed state, and keeps the document tracked as open, when re-fetching its history rejects', async () => {
    const panel = fakePanel(documentPath);
    const failingFetch = async (): Promise<FetchedRevisions> => {
      throw new Error('git fetch boom');
    };

    await refreshOpenPanelIfTouched(panel, new Set([documentPath]), failingFetch);

    assert.deepEqual(panel.refreshFailedCalls, ['temp-feature']);
    assert.equal(panel.showCalls.length, 0, 'expected no re-render from a fetch that rejected');
    assert.equal(panel.openDocumentPath, documentPath, 'a failed refresh must not stop the next touch from retrying');
  });

  test('produces no unhandled rejection when the watcher\'s void-discarded call hits a fetch that rejects', async () => {
    const panel = fakePanel(documentPath);
    const failingFetch = async (): Promise<FetchedRevisions> => {
      throw new Error('git fetch boom');
    };
    let sawUnhandledRejection = false;
    const onUnhandledRejection = () => {
      sawUnhandledRejection = true;
    };
    process.once('unhandledRejection', onUnhandledRejection);

    try {
      // Mirrors extension.ts's watcher callback: `void
      // refreshOpenPanelIfTouched(...)`, deliberately not awaited here
      // either, so this only passes if the rejection is truly handled
      // inside the function itself.
      void refreshOpenPanelIfTouched(panel, new Set([documentPath]), failingFetch);

      // Two macrotask ticks give 'unhandledRejection' room to fire.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }

    assert.equal(
      sawUnhandledRejection,
      false,
      'expected the rejection to be handled inside refreshOpenPanelIfTouched, not to escape the void-discarded call site',
    );
    assert.deepEqual(panel.refreshFailedCalls, ['temp-feature'], 'expected the failure to still have reached the panel');
  });
});
