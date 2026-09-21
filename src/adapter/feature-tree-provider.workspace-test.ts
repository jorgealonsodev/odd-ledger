import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FeatureTreeDataProvider } from './feature-tree-provider';

/**
 * These tests run in the second @vscode/test-cli configuration, which
 * opens `fixtures/sample-workspace` as the workspace folder (see
 * .vscode-test.mjs). That fixture is a synthetic, invented workspace with
 * an odd/tasks/ folder holding two synthetic feature documents — no real
 * project content, per this feature's privacy constraint.
 */
suite('FeatureTreeDataProvider — workspace with odd/tasks/', () => {
  test('the fixture workspace folder is actually open (sanity check for this suite)', () => {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length === 1, 'expected exactly one workspace folder in this test profile');
    assert.match(folders![0].uri.fsPath, /sample-workspace$/);
  });

  test('getChildren returns one node per discovered feature document, sorted by name', async () => {
    const provider = new FeatureTreeDataProvider();
    const children = await provider.getChildren();

    assert.deepEqual(
      children.map((c) => c.featureName),
      ['alpha-widget-cache', 'zeta-report-export'],
    );
  });

  test('each feature node shows its done/total counts derived from the domain layer', async () => {
    const provider = new FeatureTreeDataProvider();
    const children = await provider.getChildren();

    const alpha = children.find((c) => c.featureName === 'alpha-widget-cache');
    assert.ok(alpha);
    assert.equal(alpha!.description, '2/3');

    const zeta = children.find((c) => c.featureName === 'zeta-report-export');
    assert.ok(zeta);
    assert.equal(zeta!.description, '1/1');
  });
});
