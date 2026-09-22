import * as assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshOpenPanelIfTouched, type RefreshablePanel } from './refresh-open-panel';
import type { FeatureModel } from '../domain/build-feature-model';

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
} {
  let openDocumentPath = initialOpenPath;
  const showCalls: FeatureModel[] = [];
  const removedCalls: string[] = [];
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
    showCalls,
    removedCalls,
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
});
