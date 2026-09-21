import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentStructure } from './parse-document-structure';

test('parses the H1 title and the four core sections in their real order', () => {
  const text = [
    '# widget-export-v2',
    '',
    '## Objective',
    'Ship the widget export.',
    '',
    '## Problem',
    'Nothing exports today.',
    '',
    '## Constraints',
    'Read-only.',
    '',
    '## Tasks',
    '- [ ] T1 Do the thing',
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.equal(result.title, 'widget-export-v2');
  assert.equal(result.titleLine, 1);
  assert.deepEqual(
    result.sections.map((s) => [s.heading, s.kind]),
    [
      ['Objective', 'objective'],
      ['Problem', 'problem'],
      ['Constraints', 'constraints'],
      ['Tasks', 'tasks'],
    ],
  );
});

test('does not assume a fixed order: Tasks before Constraints still parses both correctly', () => {
  const text = [
    '# reordered-doc',
    '',
    '## Objective',
    'Body.',
    '',
    '## Problem',
    'Body.',
    '',
    '## Tasks',
    '- [ ] T1 Do it',
    '',
    '## Constraints',
    'Read-only.',
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.deepEqual(
    result.sections.map((s) => [s.heading, s.kind]),
    [
      ['Objective', 'objective'],
      ['Problem', 'problem'],
      ['Tasks', 'tasks'],
      ['Constraints', 'constraints'],
    ],
  );
});

test('matches optional heading name variants through the alias table: Progress and Progress notes', () => {
  const docA = parseDocumentStructure('# a\n\n## Progress\nSome text.');
  const docB = parseDocumentStructure('# b\n\n## Progress notes\nSome text.');

  assert.equal(docA.sections[0].kind, 'progress');
  assert.equal(docB.sections[0].kind, 'progress');
});

test('matches a decision-narrative heading carrying a trailing parenthetical date', () => {
  const text = '# c\n\n## Decision taken (2026-09-21)\nWe decided.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].kind, 'decision-narrative');
  // The raw heading text, parenthetical included, is preserved for display.
  assert.equal(result.sections[0].heading, 'Decision taken (2026-09-21)');
});

test('matches a "Verified findings (...)" heading as decision-narrative', () => {
  const text = '# d\n\n## Verified findings (all measured on a clean checkout)\nDetails.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].kind, 'decision-narrative');
  assert.equal(result.sections[0].heading, 'Verified findings (all measured on a clean checkout)');
});

test('preserves an unrecognized heading with a null kind instead of dropping it', () => {
  const text = '# e\n\n## Pending\n- [ ] P1 Something not yet scheduled';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].heading, 'Pending');
  assert.equal(result.sections[0].kind, null);
});

test('matches heading kinds case-insensitively', () => {
  const text = '# f\n\n## OBJECTIVE\nBody text.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].kind, 'objective');
});

test('tolerates trailing whitespace around a heading and trims the stored heading text', () => {
  const text = '# g\n\n##  Scope   \nBody text.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].heading, 'Scope');
  assert.equal(result.sections[0].kind, 'scope');
});

test('captures a bold metadata block in the preamble between the H1 and the first section', () => {
  const text = [
    '# h-doc',
    '',
    '**Feature**: `h-doc`',
    '**Branch**: `feat/h-doc`',
    '',
    '## Objective',
    'Body.',
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.match(result.preamble, /\*\*Feature\*\*: `h-doc`/);
  assert.match(result.preamble, /\*\*Branch\*\*: `feat\/h-doc`/);
});

test('preamble is empty when the H1 is immediately followed by the first section', () => {
  const text = '# i-doc\n\n## Objective\nBody.';

  const result = parseDocumentStructure(text);

  assert.equal(result.preamble, '');
});

test('a "#" at the start of a line inside a fenced code block is not parsed as a heading', () => {
  const text = [
    '# j-doc',
    '',
    '## Constraints',
    'Run this:',
    '',
    '```bash',
    '# this is a shell comment, not a heading',
    'ls odd/tasks',
    '```',
    '',
    '## Tasks',
    '- [ ] T1 Do it',
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.deepEqual(
    result.sections.map((s) => s.heading),
    ['Constraints', 'Tasks'],
  );
  assert.match(result.sections[0].body, /# this is a shell comment, not a heading/);
});

test('a "#" at the start of a line inside a tilde-fenced code block is not parsed as a heading', () => {
  const text = [
    '# k-doc',
    '',
    '## Constraints',
    '~~~',
    '# not a heading either',
    '~~~',
    '',
    '## Tasks',
    '- [ ] T1 Do it',
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.deepEqual(
    result.sections.map((s) => s.heading),
    ['Constraints', 'Tasks'],
  );
});

test('an ATX heading with a trailing closing hash sequence is recognized and trimmed', () => {
  const text = '# l-doc\n\n## Scope ##\nBody text.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].heading, 'Scope');
  assert.equal(result.sections[0].kind, 'scope');
});

test('a deeper heading (###) is treated as part of its parent section body, not its own section', () => {
  const text = [
    '# m-doc',
    '',
    '## Constraints',
    'Top-level constraint text.',
    '',
    '### A sub-point',
    'More detail nested under the constraint.',
    '',
    '## Tasks',
    '- [ ] T1 Do it',
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.deepEqual(
    result.sections.map((s) => s.heading),
    ['Constraints', 'Tasks'],
  );
  assert.match(result.sections[0].body, /### A sub-point/);
  assert.match(result.sections[0].body, /More detail nested under the constraint\./);
});

test('a document with no H1 at all still parses its sections, with a null title', () => {
  const text = '## Objective\nBody.\n\n## Tasks\n- [ ] T1 Do it';

  const result = parseDocumentStructure(text);

  assert.equal(result.title, null);
  assert.equal(result.titleLine, null);
  assert.deepEqual(
    result.sections.map((s) => s.heading),
    ['Objective', 'Tasks'],
  );
});

test('an empty document parses to no title, no preamble, and no sections', () => {
  const result = parseDocumentStructure('');

  assert.equal(result.title, null);
  assert.equal(result.titleLine, null);
  assert.equal(result.preamble, '');
  assert.deepEqual(result.sections, []);
});

test('parses correctly with CRLF line endings', () => {
  const text = '# n-doc\r\n\r\n## Objective\r\nBody.\r\n\r\n## Tasks\r\n- [ ] T1 Do it\r\n';

  const result = parseDocumentStructure(text);

  assert.equal(result.title, 'n-doc');
  assert.deepEqual(
    result.sections.map((s) => s.heading),
    ['Objective', 'Tasks'],
  );
  assert.equal(result.sections[0].headingLine, 3);
  assert.equal(result.sections[1].headingLine, 6);
});

test('matches the singular "Decision" heading, with its parenthetical, as decision-narrative', () => {
  const text = '# p-doc\n\n## Decision (user-owned, confirmed 2026-09-21)\nWe decided.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].kind, 'decision-narrative');
  assert.equal(result.sections[0].heading, 'Decision (user-owned, confirmed 2026-09-21)');
});

test('matches "Delivery" as its own canonical kind', () => {
  const text = '# q-doc\n\n## Delivery\nStrategy: ask-on-risk.';

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].heading, 'Delivery');
  assert.equal(result.sections[0].kind, 'delivery');
});

test('matches "Why" and "Why now" as the same canonical kind', () => {
  const docA = parseDocumentStructure('# r-doc\n\n## Why\nBecause reasons.');
  const docB = parseDocumentStructure('# s-doc\n\n## Why now\nBecause timing.');

  assert.equal(docA.sections[0].kind, 'why');
  assert.equal(docB.sections[0].kind, 'why');
});

test('reports accurate heading and end line numbers per section', () => {
  const text = [
    '# o-doc', // line 1
    '', // 2
    '## Objective', // 3
    'First line of body.', // 4
    'Second line of body.', // 5
    '', // 6
    '## Tasks', // 7
    '- [ ] T1 Do it', // 8
  ].join('\n');

  const result = parseDocumentStructure(text);

  assert.equal(result.sections[0].headingLine, 3);
  assert.equal(result.sections[0].endLine, 6);
  assert.equal(result.sections[1].headingLine, 7);
  assert.equal(result.sections[1].endLine, 8);
});
