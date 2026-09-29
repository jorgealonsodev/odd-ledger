/**
 * Turns a task's evidence into source-labelled Markdown pieces: its inline
 * text first, then each progress-table row that links to it, in document
 * order. The tree tooltip and the detail panel both render exactly these
 * pieces, so the two views never disagree about what a task's evidence is
 * or where it came from.
 *
 * Every piece is Markdown prepared with prepareEvidenceMarkdown, the same
 * path inline evidence has always taken, so a table cell is rendered with
 * raw HTML escaped, images off and the same link allow-list as any other
 * document text. Table cells are never trusted more than inline prose.
 *
 * Plain data transformation, same boundary as the rest of src/domain/.
 */

import type { TableEvidenceRow } from './link-progress-evidence';
import { prepareEvidenceMarkdown } from './prepare-evidence-markdown';

/** The source label of evidence written under the checkbox itself. */
export const INLINE_EVIDENCE_SOURCE = 'inline';

/** One piece of evidence and where it came from. `source` is plain text
 * (the caller escapes it); `markdown` is ready for a Markdown renderer. */
export interface EvidencePiece {
  readonly source: string;
  readonly markdown: string;
}

/** Backslash-escapes the characters that would let a header cell open
 * emphasis, a link or a code span inside the bold label built around it. */
function escapeMarkdownLabel(text: string): string {
  return text.replace(/[\\`*_[\]<>]/g, (ch) => `\\${ch}`);
}

/**
 * A table row as a Markdown list, one `- **Header**: cell` item per
 * non-empty cell, in column order. A cell beyond the header row has no
 * label. A list, not prose lines, because prepareEvidenceMarkdown would
 * otherwise re-join consecutive prose lines into one paragraph.
 */
export function formatEvidenceRowMarkdown(row: TableEvidenceRow): string {
  return row.pairs
    .map((pair) => (pair.header ? `- **${escapeMarkdownLabel(pair.header)}**: ${pair.value}` : `- ${pair.value}`))
    .join('\n');
}

/** The pieces of one row, prepared like any other evidence. */
export function buildRowPiece(row: TableEvidenceRow): EvidencePiece {
  return { source: row.source, markdown: prepareEvidenceMarkdown(formatEvidenceRowMarkdown(row)) };
}

/**
 * A task's evidence pieces: inline text first (when it has any), then its
 * table rows. Empty when it has neither.
 */
export function buildEvidencePieces(item: {
  readonly evidence: string;
  readonly tableEvidence: readonly TableEvidenceRow[];
}): EvidencePiece[] {
  const pieces: EvidencePiece[] = [];
  if (item.evidence.trim().length > 0) {
    pieces.push({ source: INLINE_EVIDENCE_SOURCE, markdown: prepareEvidenceMarkdown(item.evidence) });
  }
  for (const row of item.tableEvidence) {
    pieces.push(buildRowPiece(row));
  }
  return pieces;
}
