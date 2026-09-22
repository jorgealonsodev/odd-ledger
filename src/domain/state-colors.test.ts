import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLLUP_COLOR_TOKEN, ROLLUP_ICON_ID, STATE_COLOR_TOKEN, themeColorCssVar } from './state-colors';

/**
 * STATE_COLOR_TOKEN and ROLLUP_COLOR_TOKEN are the single source of truth
 * for which VS Code colour-registry token, if any, each derived checklist
 * state and each rollup state renders with. Both the tree (feature-tree-
 * provider.ts, via vscode.ThemeColor) and the detail panel (feature-
 * detail-panel.ts, via themeColorCssVar) read these same maps rather than
 * each carrying its own copy.
 */

test('open carries no colour token: outstanding work stays neutral', () => {
  assert.equal(STATE_COLOR_TOKEN.open, undefined);
});

test('done is coloured with the success token', () => {
  assert.equal(STATE_COLOR_TOKEN.done, 'testing.iconPassed');
});

test('done-unproven is coloured with a warning token, never the success one', () => {
  assert.equal(STATE_COLOR_TOKEN['done-unproven'], 'problemsWarningIcon.foreground');
  assert.notEqual(STATE_COLOR_TOKEN['done-unproven'], STATE_COLOR_TOKEN.done);
});

test('declined is coloured with the muted token', () => {
  assert.equal(STATE_COLOR_TOKEN.declined, 'disabledForeground');
});

test('unknown is coloured, and distinctly from done-unproven', () => {
  assert.ok(STATE_COLOR_TOKEN.unknown);
  assert.notEqual(STATE_COLOR_TOKEN.unknown, STATE_COLOR_TOKEN['done-unproven']);
});

// --- rollup colour/icon maps -----------------------------------------------

test('the "proven" rollup reuses done\'s own success token', () => {
  assert.equal(ROLLUP_COLOR_TOKEN.proven, STATE_COLOR_TOKEN.done);
});

test('the "unproven" rollup reuses done-unproven\'s own warning token, never the success one', () => {
  assert.equal(ROLLUP_COLOR_TOKEN.unproven, STATE_COLOR_TOKEN['done-unproven']);
  assert.notEqual(ROLLUP_COLOR_TOKEN.unproven, ROLLUP_COLOR_TOKEN.proven);
});

test('the "open" rollup carries no colour token', () => {
  assert.equal(ROLLUP_COLOR_TOKEN.open, undefined);
});

test('a closed rollup (proven or unproven) borrows a task-state icon glyph, never a generic one', () => {
  assert.equal(ROLLUP_ICON_ID.proven, 'pass');
  assert.equal(ROLLUP_ICON_ID.unproven, 'warning');
});

test('the "open" rollup carries no icon override, so a node keeps its own default glyph', () => {
  assert.equal(ROLLUP_ICON_ID.open, undefined);
});

// --- themeColorCssVar --------------------------------------------------------

test('themeColorCssVar turns a dotted token into VS Code\'s own --vscode-<id> substitution', () => {
  assert.equal(themeColorCssVar('editorWarning.foreground'), 'var(--vscode-editorWarning-foreground)');
});

test('themeColorCssVar leaves a token with no dot as-is, only adding the var() wrapper', () => {
  assert.equal(themeColorCssVar('disabledForeground'), 'var(--vscode-disabledForeground)');
});
