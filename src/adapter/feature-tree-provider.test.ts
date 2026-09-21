import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FeatureTreeDataProvider, FeatureTreeItem } from './feature-tree-provider';

/**
 * These tests run in the default @vscode/test-cli configuration, which
 * opens no workspace folder at all. That is deliberate: it is the
 * mandatory "no folder" case from the task brief, and it doubles as the
 * simplest reproduction of "nothing to show" the welcome content in
 * package.json is written for.
 */
suite('FeatureTreeDataProvider — no workspace folder', () => {
  test('reports no workspace folders open, matching this suite\'s premise', () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined);
  });

  test('getChildren returns an empty list at the root when no workspace folder is open', async () => {
    const provider = new FeatureTreeDataProvider();
    const children = await provider.getChildren();
    assert.deepEqual(children, []);
  });

  test('getChildren returns an empty list for any element (no nesting yet)', async () => {
    const provider = new FeatureTreeDataProvider();
    const fakeElement = new FeatureTreeItem('placeholder', '/does/not/matter.md', {
      done: 0,
      total: 0,
      percentage: 0,
      doneUnproven: 0,
    });
    const children = await provider.getChildren(fakeElement);
    assert.deepEqual(children, []);
  });

  test('getTreeItem returns the element itself', () => {
    const provider = new FeatureTreeDataProvider();
    const item = new FeatureTreeItem('sample-feature', '/tmp/sample-feature.md', {
      done: 1,
      total: 2,
      percentage: 50,
      doneUnproven: 0,
    });
    assert.equal(provider.getTreeItem(item), item);
  });

  test('getParent always returns undefined: there is no nesting until T8', () => {
    const provider = new FeatureTreeDataProvider();
    const item = new FeatureTreeItem('sample-feature', '/tmp/sample-feature.md', {
      done: 1,
      total: 2,
      percentage: 50,
      doneUnproven: 0,
    });
    assert.equal(provider.getParent(item), undefined);
  });

  test('a feature tree item shows its name and its done/total counts', () => {
    const item = new FeatureTreeItem('sample-feature', '/tmp/sample-feature.md', {
      done: 2,
      total: 3,
      percentage: 67,
      doneUnproven: 1,
    });
    assert.equal(item.label, 'sample-feature');
    assert.equal(item.description, '2/3');
    assert.equal(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
  });

  test('refresh() fires onDidChangeTreeData', () => {
    const provider = new FeatureTreeDataProvider();
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.refresh();
    assert.equal(fired, true);
  });
});
