import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FeatureNode, FeatureTreeDataProvider, NextStepNode, SectionNode, TaskNode } from './feature-tree-provider';

/**
 * These tests run in the second @vscode/test-cli configuration, which
 * opens `fixtures/sample-workspace` as the workspace folder (see
 * .vscode-test.mjs). That fixture is a synthetic, invented workspace with
 * an odd/tasks/ folder holding three synthetic feature documents — no real
 * project content, per this feature's privacy constraint.
 *
 * - alpha-widget-cache: a plain "Branch: ..." metadata line, a Next step
 *   section, and only proven done tasks (all carrying a commit reference).
 * - beta-notification-hub: a bold "**Branch**: `...`" metadata line, a
 *   Next step section, a done-unproven task, a declined ([~]) task, and
 *   two sections that both carry checklist items (Tasks, Acceptance
 *   criteria).
 * - zeta-report-export: no Branch line and no Next step section, so the
 *   tree must state that absence rather than rendering nothing.
 */
suite('FeatureTreeDataProvider — workspace with odd/tasks/', () => {
  test('the fixture workspace folder is actually open (sanity check for this suite)', () => {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length === 1, 'expected exactly one workspace folder in this test profile');
    assert.match(folders![0].uri.fsPath, /sample-workspace$/);
  });

  test('getChildren returns one feature node per discovered document, sorted by name', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];

    assert.deepEqual(
      children.map((c) => c.model.featureName),
      ['alpha-widget-cache', 'beta-notification-hub', 'zeta-report-export'],
    );
  });

  test('each feature node shows its done/total counts derived from the domain layer', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];

    const alpha = children.find((c) => c.model.featureName === 'alpha-widget-cache');
    assert.ok(alpha);
    assert.equal(alpha!.description, '2/3 · feat/alpha-widget-cache');

    const zeta = children.find((c) => c.model.featureName === 'zeta-report-export');
    assert.ok(zeta);
    assert.equal(zeta!.description, '1/1');
  });

  test('a feature with an unproven task shows the unproven badge in its description', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const beta = children.find((c) => c.model.featureName === 'beta-notification-hub');
    assert.ok(beta);
    assert.equal(beta!.description, '2/4 · 1 unproven · feat/beta-notification-hub');
  });

  test("a feature with no Branch line states its absence in the tooltip, never a blank", () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const zeta = children.find((c) => c.model.featureName === 'zeta-report-export');
    assert.ok(zeta);
    assert.match(zeta!.tooltip as string, /no branch recorded/);
  });

  test('a feature with a Next step section shows it as the last child, after every section', () => {
    const provider = new FeatureTreeDataProvider();
    const [alpha] = provider.getChildren() as FeatureNode[];
    const children = provider.getChildren(alpha);

    const last = children[children.length - 1];
    assert.ok(last instanceof NextStepNode, 'the last child must be the next-step node');
    assert.equal(
      (last as NextStepNode).label,
      'Next: Add the TTL eviction policy, then re-measure cold-start latency.',
    );
    // Every node before the last one must be a section, never another
    // next-step node ahead of it.
    for (const child of children.slice(0, -1)) {
      assert.ok(child instanceof SectionNode);
    }
  });

  test('a feature with no Next step section renders sections only, no trailing next-step node', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const zeta = children.find((c) => c.model.featureName === 'zeta-report-export')!;
    const zetaChildren = provider.getChildren(zeta);
    assert.ok(zetaChildren.every((c) => c instanceof SectionNode));
  });

  test('beta-notification-hub renders two section nodes: Tasks and Acceptance criteria', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const beta = children.find((c) => c.model.featureName === 'beta-notification-hub')!;
    const betaChildren = provider.getChildren(beta);
    const sectionLabels = betaChildren.filter((c) => c instanceof SectionNode).map((c) => c.label);
    assert.deepEqual(sectionLabels, ['Tasks', 'Acceptance criteria']);
  });

  test('the feature -> section -> task hierarchy matches the document, with getParent round-tripping every level', () => {
    const provider = new FeatureTreeDataProvider();
    const [alpha] = provider.getChildren() as FeatureNode[];
    const [tasksSection, nextStepNode] = provider.getChildren(alpha);
    assert.ok(tasksSection instanceof SectionNode);
    assert.equal(provider.getParent(tasksSection), alpha);
    assert.equal(provider.getParent(nextStepNode), alpha);
    assert.equal(provider.getParent(alpha), undefined);

    const taskNodes = provider.getChildren(tasksSection) as TaskNode[];
    assert.deepEqual(
      taskNodes.map((n) => n.label),
      [
        'T1 Add an in-memory cache in front of the widget lookup',
        'T2 Add a cache-hit metric',
        'T3 Add a TTL eviction policy',
      ],
    );
    for (const taskNode of taskNodes) {
      assert.equal(provider.getParent(taskNode), tasksSection);
      assert.equal(provider.getChildren(taskNode).length, 0);
    }
  });

  test('a task node carries the commit reference from its evidence as its description', () => {
    const provider = new FeatureTreeDataProvider();
    const [alpha] = provider.getChildren() as FeatureNode[];
    const [tasksSection] = provider.getChildren(alpha);
    const [t1] = provider.getChildren(tasksSection) as TaskNode[];
    assert.equal(t1.description, '1a2b3c4');
    assert.equal(t1.documentPath, alpha.model.documentPath);
    assert.equal(t1.startLine, 22);
  });

  test('a declined task ([~]) renders with the circle-slash icon and counts in the section total', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const beta = children.find((c) => c.model.featureName === 'beta-notification-hub')!;
    const [tasksSection] = provider.getChildren(beta);
    const taskNodes = provider.getChildren(tasksSection) as TaskNode[];
    const declined = taskNodes.find((n) => n.model.id === 'B3');
    assert.ok(declined);
    assert.equal((declined!.iconPath as vscode.ThemeIcon).id, 'circle-slash');
    assert.equal(tasksSection.description, '2/4');
  });

  test('a done-unproven task renders the warning icon and its "checked, no evidence recorded" description', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const beta = children.find((c) => c.model.featureName === 'beta-notification-hub')!;
    const [tasksSection] = provider.getChildren(beta);
    const taskNodes = provider.getChildren(tasksSection) as TaskNode[];
    const unproven = taskNodes.find((n) => n.model.id === 'B2');
    assert.ok(unproven);
    assert.equal((unproven!.iconPath as vscode.ThemeIcon).id, 'warning');
    assert.equal(unproven!.description, 'checked, no evidence recorded');
  });
});
