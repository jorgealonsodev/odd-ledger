import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareEvidenceMarkdown } from './prepare-evidence-markdown';

/**
 * prepareEvidenceMarkdown prepares a checklist item's evidence text to be
 * embedded inside a vscode.MarkdownString (the tree's task tooltip): it
 * dedents the document's own checklist-continuation indent (which
 * Markdown would otherwise read as an indented code block) and rejoins
 * hard-wrapped prose across its source line breaks, while leaving a
 * fenced code block or a Markdown list untouched line by line.
 */

/** Real-shaped evidence: six-space indentation (this repository's own
 * checklist-continuation indent), a hard-wrapped prose paragraph with an
 * inline code span, a fenced example, and a two-item list — every corner
 * this module exists to get right, not a one-line string that would pass
 * whether or not any of the logic actually ran. */
const REAL_SHAPED_EVIDENCE = [
  '      Verified locally against staging and confirmed the endpoint',
  '      returns `200` with the expected payload.',
  '',
  '      Example:',
  '      ```',
  '      curl -s https://example.test/api',
  '      ```',
  '',
  '      Follow-ups:',
  '      - Check retries',
  '      - Check logging',
].join('\n');

// --- dedent: the indented-code-block trap -----------------------------------

test('strips the document\'s six-space checklist-continuation indent, so evidence does not render as an indented code block', () => {
  const result = prepareEvidenceMarkdown(REAL_SHAPED_EVIDENCE);
  // Markdown reads four or more leading spaces as an indented code block;
  // no line here may still open with that much indentation, or the
  // trap this test exists to catch is still live.
  for (const line of result.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    const leadingSpaces = line.match(/^ */)![0].length;
    assert.ok(leadingSpaces < 4, `expected no line to open with an indented-code-block amount of whitespace, got: ${JSON.stringify(line)}`);
  }
  // The inline code span survives as itself, not swallowed into a block.
  assert.ok(result.includes('`200`'));
});

test('preserves relative indentation deeper than the shared offset, inside a fenced block', () => {
  // Ordinary hard-wrapped prose is deliberately reflowed by
  // joinWrappedProse (unwrapLines works from each trimmed line, the same
  // way it already does for every other caller in this codebase), so a
  // fenced block — the one place this pipeline still emits a line
  // verbatim — is what actually proves dedent keeps relative indentation
  // rather than flattening everything to zero.
  const withFence = ['      ```', '      function example() {', '        return 1;', '      }', '      ```'].join('\n');
  const result = prepareEvidenceMarkdown(withFence);
  const nestedLine = result.split('\n').find((line) => line.includes('return 1;'));
  assert.ok(nestedLine, 'expected the nested line to survive');
  assert.equal(nestedLine!.match(/^ */)![0].length, 2, 'expected the 2-space relative indent inside the fence to survive dedent');
});

test('leaves already-flush evidence (no shared indentation) unchanged by dedent', () => {
  const flush = 'No shared indentation here.';
  assert.equal(prepareEvidenceMarkdown(flush), flush);
});

// --- joinWrappedProse: the hard-wrap trap -----------------------------------

test('joins a hard-wrapped prose paragraph into one logical line', () => {
  const result = prepareEvidenceMarkdown(REAL_SHAPED_EVIDENCE);
  assert.ok(
    result.includes('Verified locally against staging and confirmed the endpoint returns `200` with the expected payload.'),
    `expected the wrapped paragraph joined into one line, got: ${JSON.stringify(result)}`,
  );
  // The source's own wrap point must not survive as a mid-sentence break.
  assert.ok(!result.includes('endpoint\nreturns'));
});

// --- fenced code block must not be flattened --------------------------------

test('leaves a fenced code block untouched, including its own internal line breaks', () => {
  const result = prepareEvidenceMarkdown(REAL_SHAPED_EVIDENCE);
  assert.ok(
    result.includes('```\ncurl -s https://example.test/api\n```'),
    `expected the fenced block preserved verbatim with its own line breaks, got: ${JSON.stringify(result)}`,
  );
});

test('a fenced block is not merged into the surrounding prose paragraph', () => {
  const result = prepareEvidenceMarkdown(REAL_SHAPED_EVIDENCE);
  // "Example:" (the label right before the fence) and the fenced content
  // must not have been joined onto the same line the way ordinary
  // hard-wrapped prose is.
  assert.ok(!result.includes('Example: ```'));
  assert.ok(!/Example:\s+curl -s/.test(result));
});

// --- Markdown list must not be flattened ------------------------------------

test('keeps each list item on its own line rather than folding it into a single run-on sentence', () => {
  const result = prepareEvidenceMarkdown(REAL_SHAPED_EVIDENCE);
  assert.ok(result.includes('- Check retries'), `expected the first list item intact, got: ${JSON.stringify(result)}`);
  assert.ok(result.includes('- Check logging'), `expected the second list item intact, got: ${JSON.stringify(result)}`);
  // The specific failure mode this test exists to catch: unwrapLines has
  // no notion of a list item, so a naive "unwrap the whole block" would
  // read these two items as one wrapped sentence and run them together.
  assert.ok(!result.includes('- Check retries - Check logging'));
  assert.ok(!result.includes('- Check retries Check logging'));
});
