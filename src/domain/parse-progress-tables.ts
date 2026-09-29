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
 * This module only reads the table. Which task a row belongs to, and what
 * it proves, is decided in link-progress-evidence.ts. Plain string
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

/**
 * Reads every progress table in `text`, in document order.
 */
export function parseProgressTables(text: string): ProgressTable[] {
  const lines = splitLines(text);
  const tables: ProgressTable[] = [];
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
      inFence = true;
      fenceChar = fenceOpen[1][0];
      fenceLen = fenceOpen[1].length;
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (level === 1 && !titleSeen) {
        // The document title scopes nothing: it sits above every section.
        titleSeen = true;
        continue;
      }
      while (headings.length > 0 && headings[headings.length - 1].level >= level) {
        headings.pop();
      }
      headings.push({ level, text: stripAtxClosingSequence(headingMatch[2] ?? ''), line: i + 1 });
      continue;
    }

    if (!line.includes('|') || i + 1 >= lines.length || !isDelimiterRow(lines[i + 1])) {
      continue;
    }

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

  return tables;
}
