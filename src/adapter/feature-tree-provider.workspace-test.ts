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
 *   section, and only proven done tasks (all carrying a commit reference) —
 *   every task is done, so this feature is fully closed (T9). Its name
 *   sorts first alphabetically but last once closed features sort to the
 *   bottom, which is what makes the tree's ordering externally observable:
 *   deleting the sort call would leave it in discovery (alphabetical)
 *   order instead.
 * - beta-notification-hub: a bold "**Branch**: `...`" metadata line, a
 *   Next step section, a done-unproven task, a declined ([~]) task, and
 *   two sections that both carry checklist items (Tasks, Acceptance
 *   criteria). Stays open (not every task is done).
 * - zeta-report-export: no Branch line and no Next step section, so the
 *   tree must state that absence rather than rendering nothing. Carries
 *   one done and one open task, so it also stays open.
 */
suite('FeatureTreeDataProvider — workspace with odd/tasks/', () => {
  test('the fixture workspace folder is actually open (sanity check for this suite)', () => {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length === 1, 'expected exactly one workspace folder in this test profile');
    assert.match(folders![0].uri.fsPath, /sample-workspace$/);
  });

  test('getChildren returns one feature node per discovered document, closed features sorted last (T9)', () => {
    // Discovery (and this fixture's own alphabetical names) would produce
    // alpha, beta, zeta. alpha-widget-cache is fully closed, so it must
    // move to the end: an implementation that dropped the sort, or kept
    // sorting by name alone, would fail this assertion.
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];

    assert.deepEqual(
      children.map((c) => c.model.featureName),
      ['beta-notification-hub', 'zeta-report-export', 'alpha-widget-cache'],
    );
  });

  test('each feature node shows its done/total counts derived from the domain layer', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];

    const alpha = children.find((c) => c.model.featureName === 'alpha-widget-cache');
    assert.ok(alpha);
    assert.equal(alpha!.description, '3/3 · feat/alpha-widget-cache');

    const zeta = children.find((c) => c.model.featureName === 'zeta-report-export');
    assert.ok(zeta);
    assert.equal(zeta!.description, '1/2');
  });

  test('a fully-closed, fully-proven feature renders green with the pass icon (T9, extended)', () => {
    const provider = new FeatureTreeDataProvider();
    const children = provider.getChildren() as FeatureNode[];
    const alpha = children.find((c) => c.model.featureName === 'alpha-widget-cache');
    assert.ok(alpha);
    assert.equal((alpha!.iconPath as vscode.ThemeIcon).id, 'pass');
    const color = (alpha!.iconPath as vscode.ThemeIcon).color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.equal(color!.id, 'testing.iconPassed');

    const beta = children.find((c) => c.model.featureName === 'beta-notification-hub');
    assert.ok(beta);
    assert.equal((beta!.iconPath as vscode.ThemeIcon).color, undefined);
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
    assert.ok(zeta!.tooltip instanceof vscode.MarkdownString);
    assert.match((zeta!.tooltip as vscode.MarkdownString).value, /no branch recorded/);
  });

  test('a feature with a Next step section shows it as the last child, after every section', () => {
    const provider = new FeatureTreeDataProvider();
    const alpha = (provider.getChildren() as FeatureNode[]).find(
      (c) => c.model.featureName === 'alpha-widget-cache',
    )!;
    const children = provider.getChildren(alpha);

    const last = children[children.length - 1];
    assert.ok(last instanceof NextStepNode, 'the last child must be the next-step node');
    assert.equal((last as NextStepNode).label, 'Next: Watch cache hit-rate metrics in production for a week.');
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
    const alpha = (provider.getChildren() as FeatureNode[]).find(
      (c) => c.model.featureName === 'alpha-widget-cache',
    )!;
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
    const alpha = (provider.getChildren() as FeatureNode[]).find(
      (c) => c.model.featureName === 'alpha-widget-cache',
    )!;
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

  // --- setFilter (T9) --------------------------------------------------------

  test('setFilter("open") drops the fully-closed feature and narrows the others to their open/declined/unknown items', () => {
    const provider = new FeatureTreeDataProvider();
    provider.setFilter('open');
    const children = provider.getChildren() as FeatureNode[];

    // alpha-widget-cache has no open item at all once every task is done,
    // so it disappears entirely under this filter rather than rendering an
    // empty shell.
    assert.deepEqual(
      children.map((c) => c.model.featureName),
      ['beta-notification-hub', 'zeta-report-export'],
    );

    const beta = children.find((c) => c.model.featureName === 'beta-notification-hub')!;
    const betaTasks = provider.getChildren(beta).find((c) => c instanceof SectionNode) as SectionNode;
    const betaTaskIds = (provider.getChildren(betaTasks) as TaskNode[]).map((n) => n.model.id);
    assert.deepEqual(betaTaskIds, ['B3', 'B4']);

    // Header counts are untouched by the filter: beta is still 2/4, not
    // recomputed down to the 2 items this filter happens to show.
    assert.equal(beta.description, '2/4 · 1 unproven · feat/beta-notification-hub');

    const zeta = children.find((c) => c.model.featureName === 'zeta-report-export')!;
    const zetaTasks = provider.getChildren(zeta)[0] as SectionNode;
    const zetaTaskIds = (provider.getChildren(zetaTasks) as TaskNode[]).map((n) => n.model.id);
    assert.deepEqual(zetaTaskIds, ['Z2']);
  });

  test('setFilter("unproven") keeps only beta-notification-hub, narrowed to its done-unproven items', () => {
    const provider = new FeatureTreeDataProvider();
    provider.setFilter('unproven');
    const children = provider.getChildren() as FeatureNode[];

    // alpha (every task proven by a commit reference) and zeta (its one
    // done task also carries a commit reference; its other task is still
    // open, not unproven) both have nothing to show under this filter.
    assert.deepEqual(
      children.map((c) => c.model.featureName),
      ['beta-notification-hub'],
    );

    const beta = children[0];
    const betaTasks = provider.getChildren(beta).find((c) => c instanceof SectionNode) as SectionNode;
    const betaTaskIds = (provider.getChildren(betaTasks) as TaskNode[]).map((n) => n.model.id);
    assert.deepEqual(betaTaskIds, ['B2']);
  });

  test('setFilter("all") after a narrower filter restores every feature and every item', () => {
    const provider = new FeatureTreeDataProvider();
    provider.setFilter('unproven');
    provider.setFilter('all');
    const children = provider.getChildren() as FeatureNode[];
    assert.deepEqual(
      children.map((c) => c.model.featureName),
      ['beta-notification-hub', 'zeta-report-export', 'alpha-widget-cache'],
    );
  });
});
