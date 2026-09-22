/**
 * Reduces a block of prose to its logical lines, undoing the source's own
 * hard line wrap: a Markdown paragraph split across several physical lines
 * is one sentence to a reader, and a consumer that reads "a line" out of
 * this text needs to see the whole sentence rather than stopping at
 * wherever the author happened to wrap it.
 *
 * A new logical line starts at the beginning of the text, right after a
 * blank line, or at a physical line that itself opens a fresh statement —
 * a line starting with a bold span (`**...**`) or a `Label:` prefix, the
 * two ways this corpus marks a new point without a blank line in between.
 * Every other non-blank physical line is a continuation of the current
 * logical line and is joined onto it with a single space.
 */

/** A bold span or a short `Label:` prefix opening at the very start of a
 * (trimmed) line — the two in-paragraph markers this corpus uses instead
 * of a blank line to start a fresh point. */
const OPENS_NEW_LOGICAL_LINE_RE = /^(\*\*|[A-Za-z][A-Za-z0-9 '-]{0,40}:)/;

/**
 * Splits `text` into logical lines: physical lines joined back together
 * across a hard wrap, and reset at a blank line or at a physical line that
 * opens a new statement. Blank lines are dropped; nothing else is.
 */
export function unwrapLines(text: string): string[] {
  const logicalLines: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      logicalLines.push(current.join(' '));
      current = [];
    }
  };

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      flush();
      continue;
    }
    if (current.length === 0 || OPENS_NEW_LOGICAL_LINE_RE.test(trimmed)) {
      flush();
    }
    current.push(trimmed);
  }
  flush();

  return logicalLines;
}
