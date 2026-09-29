/**
 * Finds the progress tables of a feature document and reads their rows.
 *
 * A progress table is a GFM pipe table whose first-column header names a
 * task (`Task`, `ID`, `Task ID`, or `Tarea`) and that sits under a heading
 * whose slug starts with `progress` or `evidence`. Tables anywhere else
 * (scope, risks, a decision matrix) are never read as evidence: a heading
 * is required so an unrelated table can never be mistaken for proof.
 *
 * The reader is deliberately tolerant about the table syntax, because the
 * documents it reads were written by hand and by different tools: rows
 * with or without leading and trailing pipes, alignment colons in the
 * delimiter row, `\|` escapes, pipes inside backtick code spans, ragged
 * rows, CRLF endings, and several tables in one document. A table inside a
 * fenced code block is an example, not a table.
 *
 * The same headings scope a second evidence format, the progress list: each
 * top-level list item under them is one entry (see parseProgressLists). A
 * table and a list may share a section. Both are read in one pass, so the
 * heading scope, the title rule and the fenced-code skipping are one piece
 * of logic, not two.
 *
 * This module only reads the table or list. Which task a row or entry
 * belongs to, and what it proves, is decided in link-progress-evidence.ts. Plain string
 * processing over already-read text, same boundary as the rest of
 * src/domain/.
 */

import { FENCE_OPEN_RE, HEADING_RE, hasClosingFence, splitLines, stripAtxClosingSequence } from './parse-document-structure';

/** One data row of a progress table. */
export interface ProgressTableRow {
  /** 1-based index among the table's data rows (the header and delimiter
   * rows are not counted), as written: a dropped all-empty row still
   * advances it, so the number always matches what a reader counts. */
  readonly row: number;
  /** 1-based line number of the row in the document. */
  readonly line: number;
  /** The row's cells, trimmed, with `\|` unescaped. Padded with empty
   * cells up to the header's width; cells beyond it are kept. */
  readonly cells: string[];
}

/** One progress table. */
export interface ProgressTable {
  /** The text of the heading that scopes the table as evidence (the
   * nearest heading, at or above the table, whose slug starts with
   * `progress` or `evidence`). */
  readonly heading: string;
  readonly headingLine: number;
  /** 1-based line number of the table's header row. */
  readonly headerLine: number;
  /** The header cells with emphasis and code markers stripped. */
  readonly headers: string[];
  readonly rows: ProgressTableRow[];
}

/** One top-level list item under a progress or evidence heading, with its
 * continuation and nested lines. */
export interface ProgressListEntry {
  /** The text of the heading that scopes the entry as evidence. */
  readonly heading: string;
  readonly headingLine: number;
  /** 1-based index among the top-level items under that heading, as a
   * reader counts them (table rows, prose and checkbox items do not
   * count). */
  readonly item: number;
  /** 1-based line number of the item's first line in the document. */
  readonly line: number;
  /** The item's text without its list marker: the first line, then each
   * continuation or nested line with the marker's own indent removed,
   * joined by newlines. */
  readonly text: string;
}

/** Everything a progress heading scopes: its tables and its list entries. */
export interface ProgressEvidence {
  readonly tables: ProgressTable[];
  readonly lists: ProgressListEntry[];
}

const TASK_HEADER_ALIASES: ReadonlySet<string> = new Set(['task', 'id', 'task id', 'tarea']);

const DELIMITER_CELL_RE = /^:?-+:?$/;

/**
 * Removes emphasis and code markers from a cell: every `*` and backtick,
 * and `_` when it wraps the whole text. Snake-case words keep their
 * underscores.
 */
export function stripInlineMarkup(text: string): string {
  let result = text.replace(/[*`]/g, '').trim();
  while (result.length > 2 && /^_+/.test(result) && /_+$/.test(result)) {
    result = result.replace(/^_+/, '').replace(/_+$/, '').trim();
  }
  return result;
}

/** Lower-cases a heading and collapses everything that is not a letter or
 * digit into single hyphens: `Progress / evidence` -> `progress-evidence`. */
function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function isEvidenceHeading(text: string): boolean {
  const slug = headingSlug(text);
  return slug.startsWith('progress') || slug.startsWith('evidence');
}

/** The end index (exclusive) of the code span opened by the backtick run
 * at `from`, or `-1` when the run never closes on this line. */
function findCodeSpanEnd(line: string, from: number, runLength: number): number {
  let i = from + runLength;
  while (i < line.length) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    let end = i;
    while (end < line.length && line[end] === '`') {
      end++;
    }
    if (end - i === runLength) {
      return end;
    }
    i = end;
  }
  return -1;
}

/**
 * Splits one table line into trimmed cells. A pipe splits unless it is
 * escaped (`\|`) or inside a backtick code span; one leading and one
 * trailing delimiter pipe are optional.
 */
function splitCells(rawLine: string): string[] {
  const line = rawLine.trim();
  const cells: string[] = [];
  let current = '';
  let endedOnDelimiter = false;
  let i = 0;

  while (i < line.length) {
    endedOnDelimiter = false;
    const ch = line[i];

    if (ch === '\\' && i + 1 < line.length) {
      current += line[i + 1] === '|' ? '|' : ch + line[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      let runEnd = i;
      while (runEnd < line.length && line[runEnd] === '`') {
        runEnd++;
      }
      const spanEnd = findCodeSpanEnd(line, i, runEnd - i);
      if (spanEnd === -1) {
        current += line.slice(i, runEnd);
        i = runEnd;
      } else {
        current += line.slice(i, spanEnd).replace(/\\\|/g, '|');
        i = spanEnd;
      }
      continue;
    }

    if (ch === '|') {
      cells.push(current);
      current = '';
      endedOnDelimiter = true;
      i++;
      continue;
    }

    current += ch;
    i++;
  }
  cells.push(current);

  if (line.startsWith('|')) {
    cells.shift();
  }
  if (endedOnDelimiter) {
    cells.pop();
  }
  return cells.map((cell) => cell.trim());
}

function isDelimiterRow(line: string): boolean {
  if (!line.includes('|') || !line.includes('-')) {
    return false;
  }
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((cell) => DELIMITER_CELL_RE.test(cell));
}

function isTaskHeader(cell: string): boolean {
  const normalised = stripInlineMarkup(cell).toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  return TASK_HEADER_ALIASES.has(normalised);
}

interface OpenHeading {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

/** The nearest heading at or above the table whose slug starts with
 * `progress` or `evidence`, or `undefined`. */
function findEvidenceHeading(stack: readonly OpenHeading[]): OpenHeading | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (isEvidenceHeading(stack[i].text)) {
      return stack[i];
    }
  }
  return undefined;
}

/** A top-level list marker: `-`, `*`, `+`, `1.` or `1)`, then its text. */
const LIST_ITEM_RE = /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]+(\S.*)$/;

/** A thematic break (`* * *`, `- - -`, `***`, `---`, `___`): never an entry,
 * and it ends the entry above it. */
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** A checkbox item is a task, not an evidence entry. */
const CHECKBOX_RE = /^\[[ xX]\](?:\s|$)/;

/** A list entry being collected: its first line's facts and its lines. */
interface OpenEntry {
  readonly heading: OpenHeading;
  readonly item: number;
  readonly line: number;
  readonly indentWidth: number;
  readonly lines: string[];
}

/**
 * Reads every progress table and progress list entry in `text`, in
 * document order.
 *
 * An entry is a top-level list item under an evidence heading, plus every
 * line up to the next top-level item, heading, table or fenced block, or a
 * blank line followed by a non-indented line that is not a list item.
 * Checkbox items are tasks, so they are never entries.
 */
export function parseProgressEvidence(text: string): ProgressEvidence {
  const lines = splitLines(text);
  const tables: ProgressTable[] = [];
  const lists: ProgressListEntry[] = [];
  const itemCounts = new Map<number, number>();
  let open: OpenEntry | null = null;
  let blankPending = 0;

  const flush = (): void => {
    if (open) {
      lists.push({
        heading: open.heading.text,
        headingLine: open.heading.line,
        item: open.item,
        line: open.line,
        text: open.lines.join('\n'),
      });
    }
    open = null;
    blankPending = 0;
  };
  const headings: OpenHeading[] = [];
  let titleSeen = false;

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFence) {
      const closing = /^(`{3,}|~{3,})$/.exec(line.trim());
      if (closing && closing[1][0] === fenceChar && closing[1].length >= fenceLen) {
        inFence = false;
      }
      continue;
    }

    const fenceOpen = FENCE_OPEN_RE.exec(line);
    if (fenceOpen && hasClosingFence(lines, i + 1, fenceOpen[1][0], fenceOpen[1].length)) {
      flush();
      inFence = true;
      fenceChar = fenceOpen[1][0];
      fenceLen = fenceOpen[1].length;
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      while (headings.length > 0 && headings[headings.length - 1].level >= level) {
        headings.pop();
      }
      if (level === 1 && !titleSeen) {
        // The document title scopes nothing, but it still closes every
        // heading above it.
        titleSeen = true;
        continue;
      }
      headings.push({ level, text: stripAtxClosingSequence(headingMatch[2] ?? ''), line: i + 1 });
      continue;
    }

    if (!line.includes('|') || i + 1 >= lines.length || !isDelimiterRow(lines[i + 1])) {
      const scope = findEvidenceHeading(headings);
      if (!scope) {
        continue;
      }
      if (line.trim() === '') {
        if (open) {
          blankPending++;
        }
        continue;
      }
      if (THEMATIC_BREAK_RE.test(line)) {
        flush();
        continue;
      }
      const item = LIST_ITEM_RE.exec(line);
      const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
      if (item && (indent === 0 || (open === null && indent <= 3))) {
        flush();
        if (!CHECKBOX_RE.test(item[3])) {
          const count = (itemCounts.get(scope.line) ?? 0) + 1;
          itemCounts.set(scope.line, count);
          const markerWidth = item[1].length + item[2].length + (/^[ \t]*/.exec(line.slice(item[1].length + item[2].length))?.[0].length ?? 1);
          open = { heading: scope, item: count, line: i + 1, indentWidth: markerWidth, lines: [item[3].trimEnd()] };
        }
      } else if (open) {
        if (blankPending > 0 && indent === 0) {
          flush();
        } else {
          for (; blankPending > 0; blankPending--) {
            open.lines.push('');
          }
          open.lines.push(line.replace(new RegExp(`^[ \\t]{0,${open.indentWidth}}`), '').trimEnd());
        }
      }
      continue;
    }

    flush();
    const rawHeaders = splitCells(line);
    const scope = findEvidenceHeading(headings);
    if (rawHeaders.length === 0 || !isTaskHeader(rawHeaders[0]) || !scope) {
      i += 1; // step over the delimiter row; the rows are never read as a table
      continue;
    }

    const headers = rawHeaders.map(stripInlineMarkup);
    const rows: ProgressTableRow[] = [];
    let j = i + 2;
    while (j < lines.length) {
      const rowLine = lines[j];
      if (rowLine.trim() === '' || !rowLine.includes('|') || HEADING_RE.test(rowLine) || FENCE_OPEN_RE.test(rowLine)) {
        break;
      }
      const cells = splitCells(rowLine);
      while (cells.length < headers.length) {
        cells.push('');
      }
      if (cells.some((cell) => cell.length > 0)) {
        rows.push({ row: j - (i + 2) + 1, line: j + 1, cells });
      }
      j++;
    }

    tables.push({ heading: scope.text, headingLine: scope.line, headerLine: i + 1, headers, rows });
    i = j - 1;
  }

  flush();
  return { tables, lists };
}

/** Reads every progress table in `text`, in document order. */
export function parseProgressTables(text: string): ProgressTable[] {
  return parseProgressEvidence(text).tables;
}

/** Reads every progress list entry in `text`, in document order. */
export function parseProgressLists(text: string): ProgressListEntry[] {
  return parseProgressEvidence(text).lists;
}
