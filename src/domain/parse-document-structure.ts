/**
 * Parses the section structure of an ODD feature document: the H1 title,
 * the preamble before the first section heading, and every `##` section in
 * document order. Plain string processing over already-read document text —
 * this module, like the rest of src/domain/, has no dependency on the
 * editor API or the filesystem, and is unit-tested with plain node --test.
 *
 * This module stops at the section boundary. It does not look inside a
 * section's body for checklist items, task IDs, or checkbox states — that
 * belongs to the checklist parser (T4).
 */

/**
 * The canonical meaning of a section heading, resolved through the alias
 * table below. `null` means the heading was not recognized: it is still
 * captured with its raw text, never dropped.
 */
export type SectionKind =
  | 'objective'
  | 'problem'
  | 'constraints'
  | 'tasks'
  | 'scope'
  | 'acceptance-criteria'
  | 'progress'
  | 'next-step'
  | 'tdd-mode'
  | 'checks'
  | 'decision-narrative'
  | 'delivery'
  | 'why';

/**
 * One `##` section of a feature document, in the order it appears in the
 * source text. `headingLine` and `endLine` are 1-based line numbers into
 * the original text, so a consumer can reveal the document at this
 * section's position without re-scanning it.
 */
export interface DocumentSection {
  /** The heading text as written, with the `#` marker and any ATX closing
   * hash sequence removed, and surrounding whitespace trimmed. */
  readonly heading: string;
  /** The canonical kind resolved via the alias table, or `null` when the
   * heading is not recognized. An unrecognized section is still returned. */
  readonly kind: SectionKind | null;
  /** The heading level, i.e. the number of `#` characters. Almost always 2;
   * it is 1 only for a second (or later) H1 found after the document's
   * title, which is preserved as its own section rather than folded into
   * another one's body — see the module-level note on deeper headings for
   * why level 3-6 never appears here. */
  readonly level: number;
  /** The section body: every line between this heading and the next section
   * boundary (or the end of the document), including any deeper headings
   * (`###` and beyond), which are treated as body content, not sections. */
  readonly body: string;
  /** 1-based line number of the heading line itself. */
  readonly headingLine: number;
  /** 1-based line number of the last line belonging to this section. */
  readonly endLine: number;
}

/**
 * The parsed structure of a feature document.
 */
export interface DocumentStructure {
  /** The H1 title text, or `null` when the document has no H1. The
   * extension titles a feature from its filename regardless, since H1
   * wording varies too much across real documents — this is captured for
   * later use, not as the display title. */
  readonly title: string | null;
  /** 1-based line number of the H1, or `null` when there is none. */
  readonly titleLine: number | null;
  /** Everything between the H1 (or the start of the document, when there is
   * no H1) and the first `##` heading, trimmed. Empty when there is
   * nothing there. */
  readonly preamble: string;
  /** Every `##` section, in document order. Order is not assumed: the real
   * corpus does not keep a fixed order for the optional sections. */
  readonly sections: DocumentSection[];
}

/**
 * Maps a normalized heading text to its canonical kind. Matching is
 * case-insensitive and tolerates a trailing parenthetical remark (the
 * decision-narrative headings in the real corpus carry one, e.g.
 * `Decision taken (2026-09-21)`) and surrounding whitespace — both are
 * stripped before this table is consulted. The raw heading text stored on
 * the section keeps the parenthetical; only the lookup key drops it.
 */
const HEADING_ALIASES: ReadonlyMap<string, SectionKind> = new Map([
  ['objective', 'objective'],
  ['problem', 'problem'],
  ['constraints', 'constraints'],
  ['tasks', 'tasks'],
  ['scope', 'scope'],
  ['acceptance criteria', 'acceptance-criteria'],
  ['progress', 'progress'],
  ['progress notes', 'progress'],
  ['next step', 'next-step'],
  ['tdd mode', 'tdd-mode'],
  ['checks', 'checks'],
  ['decision taken', 'decision-narrative'],
  ['decision', 'decision-narrative'],
  ['decisions', 'decision-narrative'],
  ['verified findings', 'decision-narrative'],
  ['delivery', 'delivery'],
  ['why', 'why'],
  ['why now', 'why'],
]);

/** Matches an ATX heading line (up to 3 leading spaces, 1-6 `#`, then
 * either end of line or a space and the heading text). */
const HEADING_RE = /^ {0,3}(#{1,6})(?:\s(.*))?$/;

/** Matches the start of a fenced code block: 3+ backticks or 3+ tildes,
 * optionally indented up to 3 spaces. An opening fence may carry an info
 * string (e.g. ```bash); a closing fence must not. */
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;

function normalizeForMatch(headingText: string): string {
  return headingText
    .replace(/\s*\([^()]*\)\s*$/, '') // drop one trailing parenthetical remark
    .trim()
    .toLowerCase();
}

function matchHeadingKind(rawHeadingText: string): SectionKind | null {
  return HEADING_ALIASES.get(normalizeForMatch(rawHeadingText)) ?? null;
}

function stripAtxClosingSequence(text: string): string {
  return text.replace(/\s+#+\s*$/, '').trim();
}

/** Splits document text into lines, tolerating CRLF, LF, and lone CR. */
function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') {
    // A trailing line terminator ends the document's last physical line;
    // it does not open an empty one after it (this is how VS Code's own
    // line model counts lines). String.split leaves a spurious empty
    // final element whenever the text ends in \r\n, \r or \n, which would
    // otherwise inflate endLine by one for every document saved with a
    // trailing newline — the common case for a file tracked in git.
    // Dropping it here keeps endLine anchored to the real last line
    // regardless of whether the source has a trailing newline.
    lines.pop();
  }
  return lines;
}

/**
 * Whether a fence opened with `fenceChar`/`fenceLen` closes anywhere in
 * `lines` from `fromIndex` onward. Per CommonMark, an opening fence with no
 * matching close before the end of input still starts a code block that
 * runs to the end of the document — but treating it that way here would
 * silently fold every later heading and checklist item into whatever
 * section happened to be open, which is unacceptable for a ledger whose
 * only job is to show a document's real content. Checking for an actual
 * close before committing to fence mode means every well-formed fence
 * (including one that legitimately contains a Markdown example with its
 * own headings, as this corpus does) parses exactly as before: this only
 * ever changes behavior for a fence that truly never closes.
 */
function hasClosingFence(lines: readonly string[], fromIndex: number, fenceChar: string, fenceLen: number): boolean {
  for (let i = fromIndex; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = /^(`{3,}|~{3,})$/.exec(trimmed);
    if (match && match[1][0] === fenceChar && match[1].length >= fenceLen) {
      return true;
    }
  }
  return false;
}

interface OpenSection {
  heading: string;
  kind: SectionKind | null;
  level: number;
  headingLine: number;
  bodyLines: string[];
}

/**
 * Parses the section structure of a feature document's text.
 */
export function parseDocumentStructure(text: string): DocumentStructure {
  const lines = splitLines(text);

  let title: string | null = null;
  let titleLine: number | null = null;
  let titleConsumed = false;

  const preambleLines: string[] = [];
  const sections: DocumentSection[] = [];
  let currentSection: OpenSection | null = null;

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  function appendBodyLine(line: string): void {
    if (currentSection) {
      currentSection.bodyLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  function finalizeCurrentSection(endLine: number): void {
    if (!currentSection) {
      return;
    }
    sections.push({
      heading: currentSection.heading,
      kind: currentSection.kind,
      level: currentSection.level,
      body: currentSection.bodyLines.join('\n').trim(),
      headingLine: currentSection.headingLine,
      endLine: Math.max(endLine, currentSection.headingLine),
    });
    currentSection = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];

    if (inFence) {
      const trimmed = line.trim();
      const closingMatch = /^(`{3,}|~{3,})$/.exec(trimmed);
      if (closingMatch && closingMatch[1][0] === fenceChar && closingMatch[1].length >= fenceLen) {
        inFence = false;
      }
      appendBodyLine(line);
      continue;
    }

    const fenceOpenMatch = FENCE_OPEN_RE.exec(line);
    if (fenceOpenMatch) {
      const candidateChar = fenceOpenMatch[1][0];
      const candidateLen = fenceOpenMatch[1].length;
      if (hasClosingFence(lines, i + 1, candidateChar, candidateLen)) {
        inFence = true;
        fenceChar = candidateChar;
        fenceLen = candidateLen;
        appendBodyLine(line);
        continue;
      }
      // No closing fence exists anywhere later in the document: this
      // marker never actually opens a fenced block (see hasClosingFence
      // above), so fall through and parse the rest of the line normally
      // instead of swallowing everything after it as body text.
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawText = stripAtxClosingSequence(headingMatch[2] ?? '');

      if (!titleConsumed && level === 1) {
        title = rawText;
        titleLine = lineNumber;
        titleConsumed = true;
        continue;
      }

      if (level === 1 || level === 2) {
        // A second (or later) H1 is unexpected — the document format
        // assumes exactly one title — but it is still a real heading, not
        // prose, and this parser's convention is that an unexpected thing
        // is preserved, never folded silently into whatever section
        // happens to be open. It gets the same section treatment as a
        // `##` heading, so it stays visible in the parsed structure.
        finalizeCurrentSection(lineNumber - 1);
        currentSection = {
          heading: rawText,
          kind: matchHeadingKind(rawText),
          level,
          headingLine: lineNumber,
          bodyLines: [],
        };
        continue;
      }

      // A level 3-6 heading does not open a new section: see the
      // module-level note on why deeper headings stay in their parent's
      // body.
      appendBodyLine(line);
      continue;
    }

    appendBodyLine(line);
  }

  finalizeCurrentSection(lines.length);

  return {
    title,
    titleLine,
    preamble: preambleLines.join('\n').trim(),
    sections,
  };
}
