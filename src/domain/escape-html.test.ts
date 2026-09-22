import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from './escape-html';

/**
 * escapeHtml backs the detail panel's (T10) HTML interpolation: every value
 * that ultimately comes from a file on disk (a feature name, a path, a
 * branch name, a next-step line) is escaped through this function before
 * it reaches the webview, so none of it can inject markup.
 */

test('escapeHtml escapes an ampersand', () => {
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});

test('escapeHtml escapes a less-than sign', () => {
  assert.equal(escapeHtml('a < b'), 'a &lt; b');
});

test('escapeHtml escapes a greater-than sign', () => {
  assert.equal(escapeHtml('a > b'), 'a &gt; b');
});

test('escapeHtml escapes a double quote', () => {
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
});

test('escapeHtml escapes a single quote', () => {
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml escapes an injected script tag with no raw angle bracket left', () => {
  const result = escapeHtml('<script>alert(1)</script>');
  assert.equal(result, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.ok(!result.includes('<'));
  assert.ok(!result.includes('>'));
});

test('escapeHtml does not double-escape the ampersand introduced by escaping another character', () => {
  // If '<' were escaped before '&', the '&' in '&lt;' would itself be
  // escaped into '&amp;lt;'. Escaping '&' first is what this test pins.
  assert.equal(escapeHtml('<'), '&lt;');
});

test('escapeHtml leaves ordinary text untouched', () => {
  assert.equal(escapeHtml('cache-warm-v2'), 'cache-warm-v2');
});
