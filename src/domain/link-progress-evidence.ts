/**
 * Links the rows of a document's progress tables to its checklist tasks,
 * and reads from each row what it contributes: its evidence text, its
 * commit, its route, and whether it proves anything.
 *
 * The rules follow the ledger's one principle, that a tick is not proof:
 *
 *  - A row links by its first cell (emphasis and code markers stripped):
 *    the whole cell equals a task ID, else the cell starts with a run of
 *    known task IDs joined by `,`, `/`, `&`, `+`, ` and ` or ` y `
 *    (`T1, T2`, `T1/T2`). The run ends at the first word that is not a
 *    known ID or a joiner. The row links to EVERY task it names and is
 *    listed once per task. Several rows may link to one task; they stay in
 *    document order.
 *  - An ID that could match more than one task (a duplicated ID) is
 *    ambiguous per ID: the row is named as ambiguous once and linked to
 *    none of those tasks, while the other IDs it names still link.
 *  - A row that names no task, or whose ID run is a range (`T1 - T3`,
 *    `T1..T3`, `T1 to T3`, never expanded), is unattached: shown at
 *    document level, counted toward no task.
 *  - A linked row proves its task only when a cell other than the ID cell
 *    and the Route column holds something that is neither empty, nor just a
 *    dash, nor a bare placeholder (`pending`, `n/a`, `tbd`). The route says
 *    how the work was done, not what proves it; a row with nothing else in
 *    it never turns a tick into proof.
 *
 * A progress list entry (parseProgressLists) is read the same way, as one
 * more piece of evidence in the same shape. It links to every task it
 * names in two positions, and only these:
 *
 *  - Its leading ID group, read as for a table's first cell
 *    (`- T1.3/T1.4 + follow-ups: ...`, `- T1, T2 done: ...`).
 *  - A known task ID that is the first word of a clause: right after a `,`
 *    or `;` outside parentheses, brackets and code spans
 *    (`- T1.1 \`22deb08\` (RED), T1.2 \`7a87dcf\` (GREEN)`).
 *
 *  An ID mentioned mid-sentence never links, and a range never expands:
 *  a leading range makes the whole entry a note. A note is unattached; an
 *  entry naming a duplicated ID is ambiguous for that ID, as for a row.
 *  Each linked task receives the whole entry (for a single-ID entry, the
 *  text after the ID) with the same source label. The commit shown is the
 *  first commit-like token after the leading ID group; a clause-start ID
 *  prefers the first one inside its own clause.
 *
 *  It proves its tasks only when something remains after removing the
 *  leading ID group, its separators and one leading status word (`done`,
 *  `pending`, ...) that is not empty, a dash or a bare placeholder:
 *  `- T1, T2 done` alone is a tick's echo for both, not proof. Clause-start
 *  IDs do not change what counts as content.
 *
 * Whether a proven row changes a task's state is decided by the caller
 * (derive-checklist-state.ts only ever consults it for a checked task), so
 * a row for an open task is evidence to show, never a state change.
 *
 * Plain data transformation, same boundary as the rest of src/domain/.
 */

import { extractCommitReference } from './derive-checklist-state';
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
const STATUS_WORD_RE = /^(?:done|closed|completed?|finished|pending|in progress|not started|wip|todo|blocked)(?![\p{L}\p{N}])/iu;
const LEADING_SEPARATOR_RE = /^[\s:,—–-]+/;
/** What may sit between an ID group and the text after it: separators plus
 * a joiner left dangling because no known ID followed it. */
const GROUP_TAIL_SEPARATOR_RE = /^[\s:,;+/&—–-]+/;
const TRAILING_PUNCTUATION_RE = /[\s.!?;:,…]+$/u;
const TRAILING_ID_PUNCTUATION_RE = /[:,—–_]+$/;
const ENTRY_TOKEN_RE = /^[\s*_`]*([^\s*`]+)[*`_]*/;

const ID_CANDIDATE_RE = /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*/;
const MARKUP_AND_SPACE_RE = /^[\s*_`]*/;
const MARKUP_RE = /^[*_`]*/;
/** What may follow an ID for it to be a whole token rather than a prefix. */
const ID_BOUNDARY_RE = /^(?:$|[\s:,;/&+—–])/;
/** What joins two IDs of one group. */
const JOINER_RE = /^(?:\s*[,/&+]\s*|\s+(?:and|y)\s+)/i;
/** A range operator glued to the ID and to what follows (`T1–T3`, `T1..T3`). */
const TIGHT_RANGE_RE = /^(?:[—–-]|\.\.|…)(?=[A-Za-z0-9])/;
/** A spaced range operator (`T1 - T3`, `T1 – T3`, `T1 to T3`). */
const SPACED_RANGE_RE = /^\s+(?:(?:[—–-]|\.\.|…)\s*|to\s+)/i;

/** The known task IDs an entry or an ID cell names in one position. */
interface IdGroup {
  /** Distinct known IDs, in the order written. */
  readonly ids: string[];
  /** Offset in the text just after the last ID (and its markup). */
  readonly end: number;
  /** Whether the group is, or starts, a range: never expanded, so the
   * whole position names nothing. */
  readonly range: boolean;
}

const NO_GROUP = (start: number, range: boolean): IdGroup => ({ ids: [], end: start, range });

/** Whether an ID-shaped word that is not a task ID is a range written with
 * a hyphen and a known ID in front of it (`T1-T3`). */
function isHyphenRange(candidate: string, byId: ReadonlyMap<string, number[]>): boolean {
  for (let i = candidate.indexOf('-'); i !== -1; i = candidate.indexOf('-', i + 1)) {
    if (byId.has(candidate.slice(0, i))) {
      return true;
    }
  }
  return false;
}

/** Whether a range operator follows an ID and leads to something that reads
 * as its other end: glued on both sides, or spaced and naming a known ID. */
function rangeFollows(tail: string, byId: ReadonlyMap<string, number[]>): boolean {
  if (TIGHT_RANGE_RE.test(tail)) {
    return true;
  }
  const spaced = SPACED_RANGE_RE.exec(tail);
  if (!spaced) {
    return false;
  }
  const next = ID_CANDIDATE_RE.exec(tail.slice(spaced[0].length));
  return next !== null && byId.has(next[0]);
}

/**
 * Reads the run of known task IDs that starts at `start` (after any
 * whitespace and emphasis or code markers), joined by `,`, `/`, `&`, `+`,
 * ` and ` or ` y `. The run ends at the first token that is not a known ID
 * or a joiner. A range inside the run makes the whole position a range.
 */
function readIdGroup(text: string, start: number, byId: ReadonlyMap<string, number[]>): IdGroup {
  const ids: string[] = [];
  let pos = start;
  let end = start;
  for (;;) {
    const idStart = pos + (MARKUP_AND_SPACE_RE.exec(text.slice(pos)) as RegExpExecArray)[0].length;
    const candidate = ID_CANDIDATE_RE.exec(text.slice(idStart));
    if (!candidate) {
      break;
    }
    if (!byId.has(candidate[0])) {
      if (ids.length === 0 && isHyphenRange(candidate[0], byId)) {
        return NO_GROUP(start, true);
      }
      break;
    }
    const afterId = idStart + candidate[0].length;
    const idEnd = afterId + (MARKUP_RE.exec(text.slice(afterId)) as RegExpExecArray)[0].length;
    const tail = text.slice(idEnd);
    if (!ID_BOUNDARY_RE.test(tail)) {
      break;
    }
    if (rangeFollows(tail, byId)) {
      return NO_GROUP(start, true);
    }
    if (!ids.includes(candidate[0])) {
      ids.push(candidate[0]);
    }
    end = idEnd;
    const joiner = JOINER_RE.exec(tail);
    if (!joiner) {
      break;
    }
    pos = idEnd + joiner[0].length;
  }
  return { ids, end, range: false };
}

/** The offsets just after each `,` or `;` that is outside parentheses,
 * brackets and code spans: where a clause of an entry starts. */
function clauseStarts(text: string, from: number): number[] {
  const starts: number[] = [];
  let depth = 0;
  let inCode = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '`') {
      inCode = !inCode;
    } else if (inCode) {
      continue;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
    } else if ((ch === ',' || ch === ';') && depth === 0) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/** A task ID an entry names, with the commit inside its own clause when
 * it starts one, and whether its own text proves its task. */
interface NamedId {
  readonly id: string;
  readonly clauseCommit: string | null;
  readonly proves: boolean;
}

/** What a list entry names: the IDs it links to and the text after its
 * leading ID group. */
interface EntryNames {
  readonly named: NamedId[];
  /** The text after the leading ID group and its separators. */
  readonly rest: string;
}

function readEntryNames(text: string, byId: ReadonlyMap<string, number[]>): EntryNames {
  const leading = readIdGroup(text, 0, byId);
  const rest = text.slice(leading.end).replace(GROUP_TAIL_SEPARATOR_RE, '');
  if (leading.range) {
    return { named: [], rest };
  }
  const starts = clauseStarts(text, leading.end);
  const clauses = starts.flatMap((start, index) => {
    const clauseEnd = index + 1 < starts.length ? starts[index + 1] - 1 : text.length;
    const group = readIdGroup(text.slice(0, clauseEnd), start, byId);
    return group.range || group.ids.length === 0 ? [] : [{ start, clauseEnd, group }];
  });
  // A clause's own text runs to the boundary that starts another linked ID.
  const ownText = (from: number, index: number): string => text.slice(from, index + 1 < clauses.length ? clauses[index + 1].start - 1 : text.length);
  const leadingProves = entryProves(text.slice(leading.end, clauses.length > 0 ? clauses[0].start - 1 : text.length).replace(GROUP_TAIL_SEPARATOR_RE, ''));
  const named: NamedId[] = leading.ids.map((id) => ({ id, clauseCommit: null, proves: leadingProves }));
  clauses.forEach(({ clauseEnd, group }, index) => {
    const proves = entryProves(ownText(group.end, index).replace(GROUP_TAIL_SEPARATOR_RE, ''));
    const clauseCommit = extractCommitReference(text.slice(group.end, clauseEnd));
    for (const id of group.ids) {
      if (!named.some((n) => n.id === id)) {
        named.push({ id, clauseCommit, proves });
      }
    }
  });
  return { named, rest };
}

/** An entry's first token, for the note and ambiguous cases, and what
 * follows it. */
function readFirstToken(text: string): { token: string; rest: string } {
  const match = ENTRY_TOKEN_RE.exec(text);
  if (!match) {
    return { token: '', rest: text.trim() };
  }
  return {
    token: match[1].replace(TRAILING_ID_PUNCTUATION_RE, ''),
    rest: text.slice(match[0].length).replace(LEADING_SEPARATOR_RE, ''),
  };
}

/** Whether what an entry says after its ID proves anything: something is
 * left once one leading status word is removed, and it is not a dash or a
 * bare placeholder. Trailing punctuation left by a bare status word
 * (`done.`, `done!`) is not content. */
function entryProves(rest: string): boolean {
  const withoutStatus = stripInlineMarkup(rest).replace(STATUS_WORD_RE, '').replace(LEADING_SEPARATOR_RE, '').replace(TRAILING_PUNCTUATION_RE, '');
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
 * Links every row of `tables` and every entry of `lists` to `tasks`. See
 * the module note for the rules; tables and rows are visited in document
 * order, so each task's rows come out in document order too.
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

  const linkTo = (startLine: number, row: TableEvidenceRow): void => {
    byTask.set(startLine, [...(byTask.get(startLine) ?? []), row]);
    if (row.proves) {
      provenStartLines.add(startLine);
    }
  };

  /** How many tasks the IDs that name several tasks (a duplicated ID)
   * could link to; the sum over those IDs. */
  const ambiguousCount = (ids: readonly string[]): number =>
    ids.reduce((sum, id) => sum + (tasksWithId(byId, id).length > 1 ? tasksWithId(byId, id).length : 0), 0);

  for (const table of tables) {
    for (const tableRow of table.rows) {
      // The whole cell equal to an ID wins over reading it as a group.
      const wholeCell = stripInlineMarkup(tableRow.cells[0] ?? '');
      const group: IdGroup = byId.has(wholeCell) ? { ids: [wholeCell], end: 0, range: false } : readIdGroup(tableRow.cells[0] ?? '', 0, byId);
      const single = group.ids.length === 1;
      const linkable = group.ids.filter((id) => tasksWithId(byId, id).length === 1);
      for (const id of linkable) {
        const row = buildRow(table, tableRow, 1);
        linkTo(tasksWithId(byId, id)[0], single ? row : { ...row, idCell: id });
      }
      const dupCount = ambiguousCount(group.ids);
      if (dupCount > 0) {
        ambiguous.push(buildRow(table, tableRow, dupCount));
      } else if (linkable.length === 0) {
        unattached.push(buildRow(table, tableRow, 0));
      }
    }
  }

  // List entries come after every table row, so a task's evidence reads
  // inline, then table rows, then list entries.
  for (const entry of lists) {
    const { named, rest } = readEntryNames(entry.text, byId);
    const ids = named.map((n) => n.id);
    if (named.length === 0) {
      const first = readFirstToken(entry.text);
      unattached.push(buildEntryRow(entry, first.token, entry.text, entry.text, entryProves(first.rest), 0));
      continue;
    }
    const shown = named.length === 1 && rest.trim().length > 0 ? rest : entry.text;
    const entryCommit = extractCommitReference(rest);
    for (const { id, clauseCommit, proves } of named) {
      const matches = tasksWithId(byId, id);
      if (matches.length === 1) {
        const row = buildEntryRow(entry, id, shown, rest, proves, 1);
        linkTo(matches[0], { ...row, commit: clauseCommit ?? entryCommit });
      }
    }
    const dupCount = ambiguousCount(ids);
    if (dupCount > 0) {
      const firstDup = named.find((n) => tasksWithId(byId, n.id).length > 1) as NamedId;
      ambiguous.push(buildEntryRow(entry, firstDup.id, entry.text, entry.text, firstDup.proves, dupCount));
    }
  }

  return { byTask, unattached, ambiguous, provenStartLines };
}
