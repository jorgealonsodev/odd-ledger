import * as assert from 'node:assert/strict';
import { FeatureDetailPanel } from './feature-detail-panel';
import type { FeatureModel } from '../domain/build-feature-model';

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
    ...overrides,
  };
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
        branch: 'feat/cache-warm-v2',
        progress: { done: 7, total: 10, percentage: 70, doneUnproven: 1 },
      }),
      '/home/dev/checkout-service',
    );

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /cache-warm-v2/);
    assert.match(html, /checkout-service/);
    assert.match(html, /odd\/tasks\/cache-warm-v2\.md/);
    assert.match(html, /feat\/cache-warm-v2/);
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

  test('declares a Content-Security-Policy and styles all three VS Code theme classes', () => {
    panel = new FeatureDetailPanel();
    panel.show(model(), '/home/dev/checkout-service');

    const html = panel.webviewPanel?.webview.html ?? '';
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /body\.vscode-light/);
    assert.match(html, /body\.vscode-dark/);
    assert.match(html, /body\.vscode-high-contrast/);
  });
});
