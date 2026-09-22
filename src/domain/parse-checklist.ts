/**
 * Parses checklist items out of a document's sections, grouped by the
 * section they came from, with IDs scoped per section.
 *
 * Built directly on parseDocumentStructure (T3): this module takes the
 * original document text plus the sections T3 already found, and looks
 * only inside each section's line range for checklist items. It does not
 * re-detect headings or re-split the document into sections.
 *
 * Plain string processing over already-read document text — this module,
 * like the rest of src/domain/, has no dependency on the editor API or the
 * filesystem, and is unit-tested with plain node --test.
 */

import type { DocumentSection, SectionKind } from './parse-document-structure';

/**
 * The state of a checklist item, read from its `[ ]` marker.
 *
 * `declined` is `- [~]`: observed in the real corpus for a declined-but-
 * recorded item, and not defined by the ODD contract. Any marker other than
 * the four recognized ones (including an empty or multi-character marker)
 * is `unknown` — reported, never silently dropped or coerced into one of
 * the others.
 */
export type ChecklistItemState = 'open' | 'done' | 'declined' | 'unknown';

/**
 * One checklist item (`- [ ] ...`) parsed from a section's body.
 */
export interface ChecklistItem {
  /** The state read from the checkbox marker. */
  readonly state: ChecklistItemState;
  /** The exact character(s) found between the checkbox brackets, e.g. `'x'`,
   * `' '`, `'~'`, or `'?'`. Kept so a caller can see precisely what was
   * found even when the state is `unknown`. */
  readonly rawMarker: string;
  /**
   * The item's ID, or `null` when the leading token of the item's text is
   * not identifier-shaped. IDs are scoped to the section they were found
   * in: two sections may both contain a `T1` without conflict.
   */
  readonly id: string | null;
  /** The item's title: the text on the item's first line, after the ID and
   * one optional separator are removed (or the full first-line text, when
   * there is no ID). Bold markers wrapping the ID and title are stripped;
   * inline code spans and other Markdown are left untouched. */
  readonly title: string;
  /** Evidence or continuation prose gathered from indented lines under the
   * item, plus any text left over on the first line after a bold span that
   * closes mid-line. Empty when the item carries none. This is the same
   * field regardless of whether the continuation reads as genuine evidence
   * or as the wrapped remainder of the title's sentence — the document
   * grammar does not distinguish the two, so this parser does not either. */
  readonly evidence: string;
  /** The item's literal source text, from its first line through its last
   * content line, exactly as written (including original indentation and
   * markers). */
  readonly rawText: string;
  /** 1-based line number of the item's first (marker) line. */
  readonly startLine: number;
  /** 1-based line number of the item's last content line. Trailing blank
   * lines before the next item or the end of the section are excluded. */
  readonly endLine: number;
}

/**
 * One section's checklist items, carrying the heading and canonical kind
 * that T3 resolved for it. Sections are not classified here: a document's
 * `## Tasks` and `## Acceptance criteria` are both parsed the same way, and
 * deciding which ones count toward progress is later work.
 */
export interface ChecklistSection {
  readonly heading: string;
  readonly kind: SectionKind | null;
  readonly items: ChecklistItem[];
}

/**
 * Matches a checklist item's marker line: up to 3 leading spaces (the same
 * tolerance parseDocumentStructure gives ATX headings), a `-`, `*` or `+`
 * bullet, a checkbox with any content between the brackets, and the rest of
 * the line.
 */
const ITEM_START_RE = /^ {0,3}[-*+][ \t]+\[([^\]]*)\][ \t]*(.*)$/;

/** Matches the start of a fenced code block: 3+ backticks or 3+ tildes,
 * optionally indented up to 3 spaces. Mirrors parseDocumentStructure's own
 * fence detection, so a checklist-shaped line inside a top-level fenced
 * code block (e.g. a documentation example) is never read as a real item. */
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^(`{3,}|~{3,})$/;

/** An identifier token: letters and/or digits, optionally split into more
 * segments by a single `.` or `-` between each pair, with at least one
 * digit somewhere in the token. This shape accepts `T1`, `P3`, `RF-12`, and
 * `4.1`, and rejects ordinary prose words such as `A` or `The`, because a
 * word with no digit at all is indistinguishable from real text without
 * one — the corpus's actual IDs always carry a number, and its prose
 * never does. */
const ID_TOKEN_RE = /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/;

function isIdentifierToken(token: string): boolean {
  return ID_TOKEN_RE.test(token) && /[0-9]/.test(token);
}

/** Splits document text into lines, tolerating CRLF, LF, and lone CR. */
function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') {
    // Mirrors parseDocumentStructure's own splitLines: a trailing line
    // terminator ends the last physical line rather than opening an empty
    // one after it, and String.split otherwise leaves a spurious empty
    // final element for a document saved with a trailing newline.
    lines.pop();
  }
  return lines;
}

/**
 * Whether a fence opened with `fenceChar`/`fenceLen` closes anywhere in
 * `lines` within [`fromLine`, `toLine`] (1-based, inclusive). Mirrors
 * parseDocumentStructure's hasClosingFence: an opening fence with no
 * matching close before the end of its section is treated as not a fence
 * at all, so it cannot swallow the rest of the section's checklist items.
 * A well-formed, properly closed fence is completely unaffected.
 */
function hasClosingFence(
  lines: readonly string[],
  fromLine: number,
  toLine: number,
  fenceChar: string,
  fenceLen: number,
): boolean {
  for (let ln = fromLine; ln <= toLine; ln++) {
    const trimmed = (lines[ln - 1] ?? '').trim();
    const match = FENCE_CLOSE_RE.exec(trimmed);
    if (match && match[1][0] === fenceChar && match[1].length >= fenceLen) {
      return true;
    }
  }
  return false;
}

function classifyMarker(rawMarker: string): ChecklistItemState {
  if (rawMarker === ' ') {
    return 'open';
  }
  if (rawMarker === 'x' || rawMarker === 'X') {
    return 'done';
  }
  if (rawMarker === '~') {
    return 'declined';
  }
  return 'unknown';
}

interface ParsedFirstLine {
  readonly id: string | null;
  readonly title: string;
  readonly trailingText: string;
}

/**
 * Splits the text after the checkbox marker into an optional ID, a title,
 * and any trailing text left on the same line. Handles the two real shapes:
 * a bare `T1 Title` and a bold-wrapped `**T1 — Title.** trailing text`,
 * where the bold closes mid-line after the title.
 */
function parseFirstLine(rest: string): ParsedFirstLine {
  let s = rest;

  const boldMatch = /^(\*\*|__)/.exec(s);
  const boldDelim = boldMatch ? boldMatch[1] : null;
  if (boldDelim) {
    s = s.slice(boldDelim.length);
  }

  let id: string | null = null;
  let afterToken = s;

  const tokenMatch = /^(\S+)(\s*)([\s\S]*)$/.exec(s);
  if (tokenMatch && isIdentifierToken(tokenMatch[1])) {
    id = tokenMatch[1];
    afterToken = tokenMatch[3];
    const sepMatch = /^[—–-][ \t]*/.exec(afterToken);
    if (sepMatch) {
      afterToken = afterToken.slice(sepMatch[0].length);
    }
  }

  let title: string;
  let trailingText = '';

  if (boldDelim) {
    const closeIdx = afterToken.indexOf(boldDelim);
    if (closeIdx >= 0) {
      title = afterToken.slice(0, closeIdx).trim();
      trailingText = afterToken.slice(closeIdx + boldDelim.length).trim();
    } else {
      // The bold span never closes on this line: tolerate it rather than
      // throwing away the text, and leave the stray marker in place.
      title = afterToken.trim();
    }
  } else {
    title = afterToken.trim();
  }

  return { id, title, trailingText };
}

interface OpenItem {
  state: ChecklistItemState;
  rawMarker: string;
  id: string | null;
  title: string;
  evidenceParts: string[];
  startLine: number;
  lastContentLine: number;
}

/**
 * Scans lines [startLine, endLine] (1-based, inclusive) of an already-split
 * document for checklist items. Blank lines mid-continuation are tolerated;
 * a fenced code block at top level (0-3 space indent) suppresses item
 * matching inside it, exactly like parseDocumentStructure does for
 * headings, but only when that fence actually closes before endLine (see
 * hasClosingFence): an unterminated fence is not treated as a fence at
 * all, so it cannot swallow the rest of the section's items. A fenced code
 * block nested under an item's own continuation indentation is simply
 * carried along as continuation text, since it never matches the
 * item-start pattern at that depth.
 */
function parseSectionItems(lines: readonly string[], startLine: number, endLine: number): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let current: OpenItem | null = null;

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  function closeCurrent(): void {
    if (!current) {
      return;
    }
    const evidence = current.evidenceParts.join('\n').trim();
    items.push({
      state: current.state,
      rawMarker: current.rawMarker,
      id: current.id,
      title: current.title,
      evidence,
      rawText: lines.slice(current.startLine - 1, current.lastContentLine).join('\n'),
      startLine: current.startLine,
      endLine: current.lastContentLine,
    });
    current = null;
  }

  for (let ln = startLine; ln <= endLine; ln++) {
    const line = lines[ln - 1] ?? '';

    if (inFence) {
      const closingMatch = FENCE_CLOSE_RE.exec(line.trim());
      if (closingMatch && closingMatch[1][0] === fenceChar && closingMatch[1].length >= fenceLen) {
        inFence = false;
      }
      if (current) {
        current.evidenceParts.push(line);
        current.lastContentLine = ln;
      }
      continue;
    }

    const fenceOpenMatch = FENCE_OPEN_RE.exec(line);
    if (fenceOpenMatch) {
      const candidateChar = fenceOpenMatch[1][0];
      const candidateLen = fenceOpenMatch[1].length;
      if (hasClosingFence(lines, ln + 1, endLine, candidateChar, candidateLen)) {
        inFence = true;
        fenceChar = candidateChar;
        fenceLen = candidateLen;
        if (current) {
          current.evidenceParts.push(line);
          current.lastContentLine = ln;
        }
        continue;
      }
      // No closing fence exists before this section ends: this marker
      // never actually opens a fenced block (see hasClosingFence above),
      // so fall through and let the rest of the loop read this line
      // normally instead of swallowing every item after it.
    }

    const itemMatch = ITEM_START_RE.exec(line);
    if (itemMatch) {
      closeCurrent();
      const rawMarker = itemMatch[1];
      const parsed = parseFirstLine(itemMatch[2]);
      current = {
        state: classifyMarker(rawMarker),
        rawMarker,
        id: parsed.id,
        title: parsed.title,
        evidenceParts: parsed.trailingText ? [parsed.trailingText] : [],
        startLine: ln,
        lastContentLine: ln,
      };
      continue;
    }

    if (line.trim() === '') {
      if (current) {
        current.evidenceParts.push('');
      }
      continue;
    }

    if (current && /^[ \t]/.test(line)) {
      current.evidenceParts.push(line);
      current.lastContentLine = ln;
      continue;
    }

    // Non-blank, non-indented, non-item text (e.g. an informal grouping
    // label between runs of items) belongs to neither the current item nor
    // a new one: close what is open and move on without fabricating a node.
    closeCurrent();
  }

  closeCurrent();
  return items;
}

/**
 * Parses checklist items from every section T3 found, grouped by section.
 *
 * @param text The full original document text (the same text passed to
 * parseDocumentStructure), used to recover exact source lines within each
 * section's boundaries.
 * @param sections The sections returned by parseDocumentStructure(text).
 */
export function parseChecklist(text: string, sections: readonly DocumentSection[]): ChecklistSection[] {
  const lines = splitLines(text);

  return sections.map((section) => ({
    heading: section.heading,
    kind: section.kind,
    items: parseSectionItems(lines, section.headingLine + 1, section.endLine),
  }));
}
