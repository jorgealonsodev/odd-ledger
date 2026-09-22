import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './render-markdown';

/**
 * renderMarkdown backs the detail panel's evidence and prose regions
 * (feature-detail-panel.ts). Every input here is content this repository's
 * owner never wrote — it comes from a Markdown file in a cloned repo — so
 * these tests hold the renderer to the security posture its own doc
 * comment describes: no raw HTML, no dangerous link scheme, no image tag,
 * alongside the ordinary rendering (inline code, bold, lists, fences) that
 * is the actual point of rendering Markdown at all.
 */

test('renders inline code as a real <code> element, not a literal backtick', () => {
  const html = renderMarkdown('See `T1` for the task id.');
  assert.match(html, /<code>T1<\/code>/);
  assert.ok(!html.includes('`T1`'), 'expected no literal backtick to survive rendering');
});

test('renders bold text as a real <strong> element, not literal asterisks', () => {
  const html = renderMarkdown('Ship the **cache warmer**.');
  assert.match(html, /<strong>cache warmer<\/strong>/);
  assert.ok(!html.includes('**cache warmer**'), 'expected no literal asterisk run to survive rendering');
});

test('renders a Markdown list as real <ul>/<li> elements', () => {
  const html = renderMarkdown('- first\n- second');
  assert.match(html, /<ul>/);
  assert.match(html, /<li>first<\/li>/);
  assert.match(html, /<li>second<\/li>/);
});

test('renders a fenced code block as a real <pre><code> element', () => {
  const html = renderMarkdown('```\nconst x = 1;\n```');
  assert.match(html, /<pre><code>/);
  assert.ok(html.includes('const x = 1;'));
});

test('escapes raw HTML in the source instead of emitting it', () => {
  const html = renderMarkdown('before <script>alert(1)</script> after');
  assert.ok(!html.includes('<script>'), 'expected the raw <script> tag to never reach the output unescaped');
  assert.match(html, /&lt;script&gt;/);
});

test('escapes a raw HTML attribute-injection attempt instead of emitting it', () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)">');
  assert.ok(!html.includes('<img'), 'expected no raw <img> tag to reach the output');
  assert.match(html, /&lt;img/);
});

test('allows an http link through as a real anchor', () => {
  const html = renderMarkdown('[docs](https://example.com/page)');
  assert.match(html, /<a href="https:\/\/example\.com\/page">docs<\/a>/);
});

test('allows a mailto link through as a real anchor', () => {
  const html = renderMarkdown('[email](mailto:dev@example.com)');
  assert.match(html, /<a href="mailto:dev@example\.com">email<\/a>/);
});

test('rejects a javascript: link: no href reaches the output', () => {
  const html = renderMarkdown('[click me](javascript:alert(1))');
  assert.ok(!/href\s*=\s*"javascript:/i.test(html), 'expected no javascript: href in the output');
  assert.ok(!html.toLowerCase().includes('<a href="javascript:'));
});

test('rejects a vscode command: link: no href reaches the output', () => {
  const html = renderMarkdown('[run it](command:workbench.action.terminal.new)');
  assert.ok(!/href\s*=\s*"command:/i.test(html), 'expected no command: href in the output');
});

test('rejects a data: link: no href reaches the output', () => {
  const html = renderMarkdown('[open](data:text/html,<script>alert(1)</script>)');
  assert.ok(!/href\s*=\s*"data:/i.test(html), 'expected no data: href in the output');
});

test('rejects a relative link with no scheme at all: no href reaches the output', () => {
  const html = renderMarkdown('[relative](./other-doc.md)');
  assert.ok(!/href\s*=/i.test(html), 'expected no href attribute for a schemeless link');
});

test('never auto-links a bare URL (linkify is off)', () => {
  const html = renderMarkdown('See https://example.com for details.');
  assert.ok(!html.includes('<a '), 'expected no anchor to be produced from a bare URL');
  assert.ok(html.includes('https://example.com'));
});

test('never emits an <img> tag, even for an otherwise well-formed image reference', () => {
  const html = renderMarkdown('![alt text](https://example.com/pic.png)');
  assert.ok(!html.includes('<img'), 'expected no <img> tag to be emitted');
});
