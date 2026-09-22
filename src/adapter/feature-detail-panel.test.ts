import * as assert from 'node:assert/strict';
import { FeatureDetailPanel } from './feature-detail-panel';
import type { FeatureModel } from '../domain/build-feature-model';
import { buildFeatureModel, EMPTY_DOCUMENT_STRUCTURE } from '../domain/build-feature-model';
import { UNPROVEN_TASK_MESSAGE } from '../domain/build-panel-body';

/**
 * Runs in the default @vscode/test-cli configuration, which opens no
 * workspace folder — the panel only needs a FeatureModel and a
 * caller-supplied workspace root string, never the filesystem or a real
 * workspace folder, so it belongs in the unit profile alongside
 * feature-tree-provider.test.ts rather than in the *.workspace-test.ts
 * profile.
 */

const EMPTY_COUNTS = { done: 0, total: 0, percentage: 0, doneUnproven: 0 };

function model(overrides: Partial<FeatureModel> = {}): FeatureModel {
  return {
    featureName: 'cache-warm-v2',
    documentPath: '/workspace/odd/tasks/cache-warm-v2.md',
    title: 'Some unrelated H1 wording',
    branch: null,
    progress: EMPTY_COUNTS,
    sections: [],
    nextStep: null,
    structure: EMPTY_DOCUMENT_STRUCTURE,
    ...overrides,
  };
}

/**
 * Builds a real FeatureModel (including its parsed DocumentStructure) from
 * an invented document's text, via buildFeatureModel, for the body-region
 * tests below — what is under test there is how the panel renders a real
 * parsed document, not just data plumbing over a hand-built model.
 */
function modelFromText(featureName: string, text: string): FeatureModel {
  return buildFeatureModel(featureName, `/workspace/odd/tasks/${featureName}.md`, text);
}

suite('FeatureDetailPanel', () => {
  let panel: FeatureDetailPanel;

  teardown(() => {
    panel?.dispose();
  });

  test('renders a title, a subtitle and three tiles', () => {
    panel = new FeatureDetailPanel();
    panel.show(
      model({
        featureName: 'cache-warm-v2',
        // Nested under the workspaceRoot passed to show() below, unlike an
        // earlier version of this fixture: an unrelated document path made
        // the subtitle assertion below pass no matter what relativePath
        // buildPanelHeader computed, because the substring it checked for
        // survives even a relative path prefixed with stray "../" segments.
        documentPath: '/home/dev/checkout-service/odd/tasks/cache-warm-v2.md',
        branch: 'feat/cache-warm-v2',
        progress: { done: 7, total: 10, percentage: 70, doneUnproven: 1 },
      }),
      '/home/dev/checkout-service',
    );

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /cache-warm-v2/);
    // Anchored to the exact subtitle content, not a loose substring: this
    // fails if relativePath is computed wrong in a way a looser match
    // would have missed (e.g. ignoring workspaceRoot and leaking the raw
    // absolute path, or dropping the branch text).
    assert.match(
      html,
      /<div class="subtitle">checkout-service · odd\/tasks\/cache-warm-v2\.md · feat\/cache-warm-v2<\/div>/,
    );
    assert.match(html, /PROGRESS/);
    assert.match(html, /7\/10 · 70%/);
    assert.match(html, /UNPROVEN/);
    assert.match(html, /1 task\b/);
    assert.match(html, /LAST WORK/);
    assert.match(html, /not recorded/);
  });

  test('opening a second feature reuses the same panel instead of creating a new one', () => {
    panel = new FeatureDetailPanel();
    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const firstPanel = panel.webviewPanel;
    assert.ok(firstPanel);

    panel.show(model({ featureName: 'other-feature' }), '/home/dev/checkout-service');
    const secondPanel = panel.webviewPanel;

    assert.equal(secondPanel, firstPanel);
    assert.match(secondPanel!.webview.html, /other-feature/);
  });

  test('an empty title falls back to the same tab title on the reuse path as on the creation path', () => {
    panel = new FeatureDetailPanel();
    panel.show(model({ featureName: '' }), '/home/dev/checkout-service');
    const createdTitle = panel.webviewPanel?.title;
    assert.equal(createdTitle, 'ODD Ledger');

    // Same empty-title model, shown again: this hits the reuse branch
    // (an existing panel is revealed and re-rendered) rather than the
    // creation branch above.
    panel.show(model({ featureName: '' }), '/home/dev/checkout-service');
    assert.equal(panel.webviewPanel?.title, createdTitle);
  });

  test('a disposed panel is not reused: a later show() creates a fresh one', () => {
    panel = new FeatureDetailPanel();
    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const firstPanel = panel.webviewPanel;
    assert.ok(firstPanel);

    firstPanel!.dispose();
    assert.equal(panel.webviewPanel, undefined);

    panel.show(model({ featureName: 'cache-warm-v2' }), '/home/dev/checkout-service');
    const secondPanel = panel.webviewPanel;
    assert.ok(secondPanel);
    assert.notEqual(secondPanel, firstPanel);
  });

  test('escapes a feature name containing markup: no unescaped angle bracket reaches the HTML', () => {
    panel = new FeatureDetailPanel();
    const maliciousName = '<img src=x onerror=alert(1)>';
    panel.show(model({ featureName: maliciousName }), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes(maliciousName));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('renders the next step block, escaped, when the document records one', () => {
    panel = new FeatureDetailPanel();
    panel.show(
      model({ nextStep: { line: 'Ship the <remaining> task next.', headingLine: 40 } }),
      '/home/dev/checkout-service',
    );

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /NEXT STEP/);
    assert.ok(html.includes('Ship the &lt;remaining&gt; task next.'));
    assert.ok(!html.includes('Ship the <remaining> task next.'));
  });

  test('renders no next-step block at all when the document records none', () => {
    panel = new FeatureDetailPanel();
    panel.show(model({ nextStep: null }), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('NEXT STEP'));
  });

  test('declares a Content-Security-Policy and styles all three VS Code theme classes', () => {
    panel = new FeatureDetailPanel();
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /body\.vscode-light/);
    assert.match(html, /body\.vscode-dark/);
    assert.match(html, /body\.vscode-high-contrast/);
  });

  // --- body: objective, tasks, other sections (T11) -----------------------

  test('renders the objective region from the Objective and Problem sections\' prose, as escaped preformatted text, not Markdown', () => {
    const text = [
      '# sample',
      '',
      '## Objective',
      '',
      'Ship the **cache** warmer.',
      '',
      '## Problem',
      '',
      'Reconciled *by hand* today.',
      '',
      '## Tasks',
      '',
      '- [ ] T1 Do it',
    ].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('cache-warm-v2', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Objective<\/h2>/);
    assert.ok(html.includes('Ship the **cache** warmer.'));
    assert.ok(html.includes('Reconciled *by hand* today.'));
    // Markdown is not rendered to HTML: the literal asterisks survive and
    // no <strong> or <em> tag is produced from them.
    assert.ok(!html.includes('<strong>'));
    assert.ok(!html.includes('<em>'));
  });

  test('renders no objective region when the document has neither Objective nor Problem', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('<h2>Objective</h2>'));
  });

  test('renders a task section with its items, IDs and evidence inline', () => {
    const text = [
      '# sample',
      '',
      '## Tasks',
      '',
      '- [x] T1 Ship it',
      '      DONE `4b7c1e9`',
      '- [ ] T2 Not started yet',
    ].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Tasks<\/h2>/);
    assert.ok(html.includes('T1'));
    assert.ok(html.includes('Ship it'));
    assert.ok(html.includes('DONE `4b7c1e9`'));
    assert.ok(html.includes('T2'));
    assert.ok(html.includes('Not started yet'));
  });

  test('a done-unproven task states the ODD unproven message inline, not a generic label', () => {
    const text = ['# sample', '', '## Tasks', '', '- [x] T6 Document the signing step'].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(html.includes(UNPROVEN_TASK_MESSAGE));
  });

  test('renders the document\'s other recognized sections when present, escaped and unrendered as Markdown', () => {
    const text = [
      '# sample',
      '',
      '## Constraints',
      '',
      'Read-only, `never` writes.',
      '',
      '## Tasks',
      '',
      '- [ ] T1 Do it',
    ].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /<h2>Constraints<\/h2>/);
    assert.ok(html.includes('Read-only, `never` writes.'));
  });

  test('omits an other-section region for a kind the document does not carry', () => {
    const text = ['# sample', '', '## Tasks', '', '- [ ] T1 Do it'].join('\n');
    panel = new FeatureDetailPanel();
    panel.show(modelFromText('sample', text), '/workspace');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.ok(!html.includes('<h2>Constraints</h2>'));
    assert.ok(!html.includes('<h2>Scope</h2>'));
  });

  test('the CSP style-src nonce matches the nonce on the <style> element, and is non-empty', () => {
    panel = new FeatureDetailPanel();
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    const cspMatch = /style-src 'nonce-([^']+)'/.exec(html);
    const styleMatch = /<style nonce="([^"]+)">/.exec(html);

    assert.ok(cspMatch, 'expected a style-src nonce in the Content-Security-Policy');
    assert.ok(styleMatch, 'expected a nonce attribute on the <style> element');
    assert.ok(cspMatch![1].length > 0);
    assert.equal(cspMatch![1], styleMatch![1]);
  });
});
