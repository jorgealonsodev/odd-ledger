/**
 * Links the rows of a document's progress tables to its checklist tasks,
 * and reads from each row what it contributes: its evidence text, its
 * commit, its route, and whether it proves anything.
 *
 * The rules follow the ledger's one principle, that a tick is not proof:
 *
 *  - A row links to a task by ID: the whole first cell (emphasis and code
 *    markers stripped) equals the ID, else its first whitespace token is a
 *    valid ID (the checklist parser's own grammar) that equals it. Several
 *    rows may link to one task; they stay in document order.
 *  - A row that could link to more than one task (a duplicated ID) is
 *    ambiguous and links to none: the ledger names it, never guesses.
 *  - A row that matches no task is unattached: shown at document level,
 *    counted toward no task.
 *  - A linked row proves its task only when a cell other than the ID cell
 *    and the Route column holds something that is neither empty, nor just a
 *    dash, nor a bare placeholder (`pending`, `n/a`, `tbd`). The route says
 *    how the work was done, not what proves it; a row with nothing else in
 *    it never turns a tick into proof.
 *
 * A progress list entry (parseProgressLists) is read the same way, as one
 * more piece of evidence in the same shape:
 *
 *  - It links by its first token, emphasis and code markers stripped and
 *    trailing `:`, `,`, `—`, `–` removed, which must equal a task ID
 *    exactly. A range (`T0.1–T0.6b`) or an ID list (`T1, T2`) is never
 *    expanded: it links to nothing and stays a note.
 *  - A note (first token names no task) is unattached, and a duplicated ID
 *    is ambiguous, exactly as for a table row.
 *  - It proves its task only when something remains after removing the ID,
 *    its separators and one leading status word (`done`, `pending`, ...)
 *    that is not empty, a dash or a bare placeholder: `- T1 done` alone is
 *    a tick's echo, not proof.
 *
 * Whether a proven row changes a task's state is decided by the caller
 * (derive-checklist-state.ts only ever consults it for a checked task), so
 * a row for an open task is evidence to show, never a state change.
 *
 * Plain data transformation, same boundary as the rest of src/domain/.
 */

import { extractCommitReference } from './derive-checklist-state';
import { isIdentifierToken } from './parse-checklist';
import { stripInlineMarkup } from './parse-progress-tables';
import type { ProgressListEntry, ProgressTable, ProgressTableRow } from './parse-progress-tables';

/** What linking needs to know about a task: its ID (if any) and the line
 * that identifies it. */
export interface EvidenceTask {
  readonly id: string | null;
  readonly startLine: number;
}

/** One `Header: cell` pair of a row. `header` is empty for a cell that
 * sits beyond the table's header row. */
export interface EvidencePair {
  readonly header: string;
  readonly value: string;
}

/** One piece of progress evidence, with everything the tree and panel
 * need: a progress-table row or, with a `list "..."` source, a progress
 * list entry (whose `row` is its item number, `pairs` a single header-less
 * value and `route` always null). */
export interface TableEvidenceRow {
  /** Where the evidence came from, e.g. `table "Progress / evidence", row 12`
   * or `list "Progress / evidence", item 3`. */
  readonly source: string;
  readonly heading: string;
  /** 1-based data-row index within its table. */
  readonly row: number;
  /** 1-based document line of the row. */
  readonly line: number;
  /** The first cell, emphasis and code markers stripped. */
  readonly idCell: string;
  /** Every non-empty cell as `Header: cell`, in column order. */
  readonly pairs: EvidencePair[];
  /** The pairs as plain text, one `Header: cell` per line. */
  readonly text: string;
  /** The first commit-like token: from a column whose header contains
   * `commit`, else from any cell other than the ID cell. */
  readonly commit: string | null;
  /** The cell under a header containing `route`, when it holds something. */
  readonly route: string | null;
  /** Whether a cell other than the ID cell and the route holds something
   * that is neither empty, nor just a dash, nor a bare placeholder. */
  readonly proves: boolean;
  /** How many tasks the row could link to: 0 unattached, 1 linked, 2+
   * ambiguous. */
  readonly matchCount: number;
}

/** The result of linking every progress-table row of a document. */
export interface LinkedProgressEvidence {
  /** Linked rows by the task's `startLine`, in document order. */
  readonly byTask: ReadonlyMap<number, TableEvidenceRow[]>;
  /** Rows that match no task: shown at document level, counted nowhere. */
  readonly unattached: TableEvidenceRow[];
  /** Rows that match more than one task: linked to none. */
  readonly ambiguous: TableEvidenceRow[];
  /** The `startLine` of every task that has at least one proving row. */
  readonly provenStartLines: ReadonlySet<number>;
}

/** The label naming where a table row's evidence came from. */
export function tableSourceLabel(heading: string, row: number): string {
  return `table "${heading}", row ${row}`;
}

/** The label naming where a list entry's evidence came from. */
export function listSourceLabel(heading: string, item: number): string {
  return `list "${heading}", item ${item}`;
}

const DASH_ONLY_RE = /^[—–-]+$/;
const PLACEHOLDER_RE = /^(pending|n\/a|tbd)$/i;

/** Whether a cell says nothing: empty, nothing but dashes, or a bare
 * placeholder (`pending`, `n/a`, `tbd`). */
function isBlankCell(cell: string): boolean {
  const stripped = stripInlineMarkup(cell).trim();
  return stripped.length === 0 || DASH_ONLY_RE.test(stripped) || PLACEHOLDER_RE.test(stripped);
}

/** Whether the column's header marks it as the route: it says how the work
 * was done, not what proves it. */
function isRouteHeader(header: string | undefined): boolean {
  return (header ?? '').toLowerCase().includes('route');
}

function firstToken(text: string): string {
  return text.split(/\s+/)[0] ?? '';
}

function findCommit(table: ProgressTable, cells: readonly string[]): string | null {
  const commitColumns: number[] = [];
  table.headers.forEach((header, index) => {
    if (index > 0 && header.toLowerCase().includes('commit')) {
      commitColumns.push(index);
    }
  });
  for (const index of commitColumns) {
    const found = extractCommitReference(cells[index] ?? '');
    if (found) {
      return found;
    }
  }
  for (let index = 1; index < cells.length; index++) {
    const found = extractCommitReference(cells[index]);
    if (found) {
      return found;
    }
  }
  return null;
}

function findRoute(table: ProgressTable, cells: readonly string[]): string | null {
  for (let index = 1; index < table.headers.length; index++) {
    if (isRouteHeader(table.headers[index]) && !isBlankCell(cells[index] ?? '')) {
      return cells[index].trim();
    }
  }
  return null;
}

function buildRow(table: ProgressTable, row: ProgressTableRow, matchCount: number): TableEvidenceRow {
  const pairs: EvidencePair[] = [];
  row.cells.forEach((value, index) => {
    if (value.length > 0) {
      pairs.push({ header: table.headers[index] ?? '', value });
    }
  });
  return {
    source: tableSourceLabel(table.heading, row.row),
    heading: table.heading,
    row: row.row,
    line: row.line,
    idCell: stripInlineMarkup(row.cells[0] ?? ''),
    pairs,
    text: pairs.map((pair) => (pair.header ? `${pair.header}: ${pair.value}` : pair.value)).join('\n'),
    commit: findCommit(table, row.cells),
    route: findRoute(table, row.cells),
    proves: row.cells.some((cell, index) => index > 0 && !isRouteHeader(table.headers[index]) && !isBlankCell(cell)),
    matchCount,
  };
}

/** A leading status word an entry may carry before its real content. */
const STATUS_WORD_RE = /^(?:done|closed|completed?|finished|pending|in progress|wip|todo|blocked)(?![\p{L}\p{N}])/iu;
const LEADING_SEPARATOR_RE = /^[\s:,—–-]+/;
const TRAILING_ID_PUNCTUATION_RE = /[:,—–_]+$/;
const ENTRY_TOKEN_RE = /^[\s*_`]*([^\s*`]+)[*`_]*/;

/** An entry's first token and what follows it. */
interface EntryHead {
  /** The first token with markup and trailing `:`, `,`, `—`, `–` removed. */
  readonly token: string;
  /** The text after the token and its separators, markup left as written. */
  readonly rest: string;
  /** Whether a `,` or dash follows the token and leads to another known
   * task ID: an ID list or a range, which is never expanded. */
  readonly listLike: boolean;
}

function readEntryHead(text: string, byId: ReadonlyMap<string, number[]>): EntryHead {
  const match = ENTRY_TOKEN_RE.exec(text);
  if (!match) {
    return { token: '', rest: text.trim(), listLike: false };
  }
  const rawToken = match[1];
  const token = rawToken.replace(TRAILING_ID_PUNCTUATION_RE, '');
  const rest = text.slice(match[0].length).replace(LEADING_SEPARATOR_RE, '');
  const afterToken = text.slice(match[0].length);
  const separated = /,$/.test(rawToken) || /^\s*[—–-]/.test(afterToken);
  const next = ENTRY_TOKEN_RE.exec(afterToken.replace(LEADING_SEPARATOR_RE, ''));
  const nextToken = next ? next[1].replace(TRAILING_ID_PUNCTUATION_RE, '') : '';
  return { token, rest, listLike: separated && byId.has(nextToken) };
}

/** Whether what an entry says after its ID proves anything: something is
 * left once one leading status word is removed, and it is not a dash or a
 * bare placeholder. */
function entryProves(rest: string): boolean {
  const withoutStatus = stripInlineMarkup(rest).replace(STATUS_WORD_RE, '').replace(LEADING_SEPARATOR_RE, '');
  return !isBlankCell(withoutStatus);
}

function buildEntryRow(entry: ProgressListEntry, idCell: string, shown: string, evidenceText: string, proves: boolean, matchCount: number): TableEvidenceRow {
  return {
    source: listSourceLabel(entry.heading, entry.item),
    heading: entry.heading,
    row: entry.item,
    line: entry.line,
    idCell,
    pairs: [{ header: '', value: shown }],
    text: shown,
    commit: extractCommitReference(evidenceText),
    route: null,
    proves,
    matchCount,
  };
}

/** The `startLine`s of the tasks whose ID is `id` (empty for no match). */
function tasksWithId(byId: ReadonlyMap<string, number[]>, id: string): number[] {
  return byId.get(id) ?? [];
}

/**
 * Links every row of `tables` to `tasks`. See the module note for the
 * rules; tables and rows are visited in document order, so each task's
 * rows come out in document order too.
 */
export function linkProgressEvidence(
  tables: readonly ProgressTable[],
  tasks: readonly EvidenceTask[],
  lists: readonly ProgressListEntry[] = [],
): LinkedProgressEvidence {
  const byId = new Map<string, number[]>();
  for (const task of tasks) {
    if (task.id !== null) {
      byId.set(task.id, [...(byId.get(task.id) ?? []), task.startLine]);
    }
  }

  const byTask = new Map<number, TableEvidenceRow[]>();
  const unattached: TableEvidenceRow[] = [];
  const ambiguous: TableEvidenceRow[] = [];
  const provenStartLines = new Set<number>();

  const place = (row: TableEvidenceRow, matches: readonly number[]): void => {
    if (matches.length === 0) {
      unattached.push(row);
    } else if (matches.length > 1) {
      ambiguous.push(row);
    } else {
      const startLine = matches[0];
      byTask.set(startLine, [...(byTask.get(startLine) ?? []), row]);
      if (row.proves) {
        provenStartLines.add(startLine);
      }
    }
  };

  for (const table of tables) {
    for (const tableRow of table.rows) {
      const idCell = stripInlineMarkup(tableRow.cells[0] ?? '');
      let matches = tasksWithId(byId, idCell);
      if (matches.length === 0) {
        const token = firstToken(idCell);
        if (token !== idCell && isIdentifierToken(token)) {
          matches = tasksWithId(byId, token);
        }
      }
      place(buildRow(table, tableRow, matches.length), matches);
    }
  }

  // List entries come after every table row, so a task's evidence reads
  // inline, then table rows, then list entries.
  for (const entry of lists) {
    const head = readEntryHead(entry.text, byId);
    const matches = !head.listLike && isIdentifierToken(head.token) ? tasksWithId(byId, head.token) : [];
    const proves = entryProves(head.rest);
    if (matches.length === 1) {
      const shown = head.rest.trim().length > 0 ? head.rest : entry.text;
      place(buildEntryRow(entry, head.token, shown, head.rest, proves, 1), matches);
    } else {
      place(buildEntryRow(entry, head.token, entry.text, entry.text, proves, matches.length), matches);
    }
  }

  return { byTask, unattached, ambiguous, provenStartLines };
}
