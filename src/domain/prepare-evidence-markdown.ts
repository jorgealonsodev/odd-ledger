/**
 * Prepares a checklist item's raw evidence text (or any other raw prose
 * pulled from a feature document) to be rendered as Markdown: currently
 * the tree's task tooltip (a vscode.MarkdownString — feature-tree-
 * provider.ts) and the detail panel's evidence and prose regions (an HTML
 * fragment via render-markdown.ts — feature-detail-panel.ts). Every
 * Markdown consumer needs the two corrections below, because rendering
 * the raw source without them would come out worse than plain text.
 *
 * Plain data transformation over an already-read text string — no
 * dependency on the editor API or the filesystem, same boundary as the
 * rest of src/domain/.
 */

import { unwrapLines } from './unwrap-wrapped-lines';

/** Matches a fence delimiter line (```` ``` ```` or `~~~`), whichever
 * opens or closes a fenced code block. */
const FENCE_RE = /^(```|~~~)/;

/** Matches a Markdown list item marker at the start of a (trimmed) line:
 * `-`, `*`, `+`, or an ordered `1.`/`1)`, each followed by whitespace. */
const LIST_ITEM_RE = /^(?:[-*+]\s+|\d+[.)]\s+)/;

/**
 * Strips the smallest leading-whitespace run shared by every non-empty
 * line of `text`. ODD documents indent a checklist item's continuation
 * lines under its marker (six spaces in this repository's own documents),
 * and Markdown reads four or more leading spaces as an indented code
 * block — the entire evidence would render as an unstyled, horizontally-
 * scrolling block, hiding the very backticks and bold text a Markdown
 * tooltip exists to show. Only the common offset is removed: a line
 * indented deeper than its neighbours (e.g. a nested list, or code inside
 * a fence) keeps that *relative* indentation, because only the source's
 * uniform checklist-continuation offset is noise, not indentation the
 * author chose deliberately.
 */
function dedent(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const indent = line.match(/^[ \t]*/)?.[0].length ?? 0;
    minIndent = Math.min(minIndent, indent);
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return text;
  }
  return lines.map((line) => line.slice(Math.min(minIndent, line.length))).join('\n');
}

/**
 * Joins hard-wrapped prose lines back into their logical line — the same
 * join unwrapLines already performs elsewhere in this codebase (the
 * "Recorded by this document" fields) — reused here rather than
 * reimplemented, because these documents wrap prose by hand and the wrap
 * points come from an editor's width, not from meaning: Markdown would
 * otherwise join them into one run-on paragraph anyway, so leaving the
 * source's own wrap in achieves nothing Markdown itself respects.
 *
 * That join is applied only to ordinary prose, never uniformly across the
 * whole evidence block, because unwrapLines has no notion of a fenced
 * code block or a Markdown list:
 *
 *  - A fenced code block (```` ``` ```` or `~~~` delimited) is passed
 *    through byte-for-byte, including its own internal line breaks —
 *    Markdown gives fenced content meaning line by line, and joining it
 *    would corrupt the very thing a fence exists to protect.
 *  - A Markdown list line is kept on its own paragraph rather than folded
 *    into its neighbour: unwrapLines would otherwise read consecutive
 *    list items as one wrapped sentence and run them together into a
 *    single line, which is not a list any more.
 */
function joinWrappedProse(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const blocks: string[] = [];
  let proseBuffer: string[] = [];

  const flushProse = (): void => {
    if (proseBuffer.length === 0) {
      return;
    }
    blocks.push(...unwrapLines(proseBuffer.join('\n')));
    proseBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (FENCE_RE.test(trimmed)) {
      flushProse();
      const fenceLines = [line];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i].trim())) {
        fenceLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        // The closing fence line.
        fenceLines.push(lines[i]);
      }
      blocks.push(fenceLines.join('\n'));
      continue;
    }

    if (LIST_ITEM_RE.test(trimmed)) {
      flushProse();
      blocks.push(trimmed);
      continue;
    }

    proseBuffer.push(line);
  }
  flushProse();

  return blocks.join('\n\n');
}

/**
 * Prepares `evidence` for embedding inside a MarkdownString: dedented
 * first (see dedent), then with its ordinary prose lines rejoined across
 * their original hard wrap (see joinWrappedProse). Both corrections are
 * about what a Markdown *renderer* does with this text, not about the
 * text's meaning, so they never change which words are present — only
 * how the whitespace around them is shaped.
 */
export function prepareEvidenceMarkdown(evidence: string): string {
  return joinWrappedProse(dedent(evidence));
}
