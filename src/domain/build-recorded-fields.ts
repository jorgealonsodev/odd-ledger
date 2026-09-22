/**
 * Builds the detail panel's "Recorded by this document" table (T12) from an
 * already-composed FeatureModel. The PRD's own justification for this
 * region: the five rare contract fields it names — TDD, delivery, route,
 * line budget, review — appear in as few as one of five real documents, so
 * the region renders one honest table instead of six empty regions. Every
 * row always renders, and a field the document does not record reads
 * "not recorded" rather than vanishing, per the absence convention the rest
 * of this extension follows.
 *
 * Plain data transformation over an already-parsed FeatureModel — no
 * dependency on the editor API or the filesystem, same boundary as the rest
 * of src/domain/.
 */

import type { FeatureModel, SectionModel } from './build-feature-model';
import type { DocumentSection, SectionKind } from './parse-document-structure';

const NOT_RECORDED = 'not recorded';

/**
 * The character budget a table cell's one-line summary is truncated to.
 * A table cell holds a line, not a paragraph, and these sections
 * (`tdd-mode`, `delivery`) run to paragraphs in the real corpus.
 */
const SUMMARY_CHAR_BUDGET = 80;

/** One row of the "Recorded by this document" table. */
export interface RecordedField {
  readonly label: string;
  readonly value: string;
}

function findSectionByKind(sections: readonly DocumentSection[], kind: SectionKind): DocumentSection | undefined {
  return sections.find((section) => section.kind === kind);
}

/** Strips the Markdown emphasis and code-span markers this table cares
 * about (`**`, `*`, `` ` ``, `_`): a table cell renders as plain text, the
 * same choice the rest of the panel's body already makes for prose. */
function stripEmphasis(text: string): string {
  return text.replace(/[*`_]/g, '');
}

/** Strips one leading `Label:` prefix, e.g. `Strict TDD:` or `Route:` — the
 * row already names the field, so repeating its label inside the value
 * would say the same thing twice. */
function stripLeadingLabel(text: string): string {
  return text.replace(/^[A-Za-z][A-Za-z0-9 '-]{0,40}:\s*/, '');
}

function truncate(text: string, budget: number): string {
  if (text.length <= budget) {
    return text;
  }
  return `${text.slice(0, budget).trimEnd()}…`;
}

/** Reduces one already-identified line to a table cell's display value:
 * emphasis markers stripped, one leading label stripped, then truncated to
 * SUMMARY_CHAR_BUDGET. */
function summarizeLine(line: string): string {
  const withoutEmphasis = stripEmphasis(line.trim());
  const withoutLabel = stripLeadingLabel(withoutEmphasis).trim();
  return truncate(withoutLabel.length > 0 ? withoutLabel : withoutEmphasis, SUMMARY_CHAR_BUDGET);
}

/** The first non-empty line of a section's body, or `null` when the body
 * has none. "Short" is the first line, not the whole body: these sections
 * run to paragraphs in the real corpus and a table cell holds a line. */
function firstNonEmptyLine(body: string): string | null {
  const line = body
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? null;
}

/** Reads a section's one-line summary by its SectionKind, or "not recorded"
 * when the document has no such section or its body is empty. Used for TDD
 * (the `tdd-mode` section) and Delivery (the `delivery` section). */
function formatSectionSummary(sections: readonly DocumentSection[], kind: SectionKind): string {
  const section = findSectionByKind(sections, kind);
  if (!section) {
    return NOT_RECORDED;
  }
  const line = firstNonEmptyLine(section.body);
  return line ? summarizeLine(line) : NOT_RECORDED;
}

/** Matches a route note: a case-insensitive `Route:` label at the very
 * start of a line in an item's evidence. */
const ROUTE_NOTE_RE = /^route:/i;

function hasRouteNote(evidence: string): boolean {
  return evidence
    .split(/\r\n|\r|\n/)
    .some((line) => ROUTE_NOTE_RE.test(line.trim()));
}

/**
 * Route is recorded per task, not in a section of its own: this counts how
 * many checklist items across the model's item-bearing sections carry a
 * route note in their evidence, out of how many items there are in total.
 * A derived count over what the document does record — never a guessed or
 * computed budget figure, which is what Line budget below refuses to be.
 */
function formatRoute(sections: readonly SectionModel[]): string {
  let withNote = 0;
  let total = 0;
  for (const section of sections) {
    for (const item of section.items) {
      total += 1;
      if (hasRouteNote(item.evidence)) {
        withNote += 1;
      }
    }
  }
  if (withNote === 0) {
    return NOT_RECORDED;
  }
  return `per task, ${withNote} of ${total} recorded`;
}

/** Matches a line stating a number of lines, e.g. "roughly 400 invented
 * lines total" or "2,800 authored changed lines". Reported as written,
 * never recomputed: this only locates the sentence the document already
 * states, it does not derive a figure from anything else. */
const LINE_COUNT_RE = /\d[\d,]*\+?\s*(?:authored\s+)?(?:changed\s+)?lines?\b/i;

/**
 * Line budget comes from a figure the delivery section states in its own
 * words, or "not recorded" when the section is absent or states none. This
 * never invents or computes a figure the document does not carry.
 */
function formatLineBudget(sections: readonly DocumentSection[]): string {
  const delivery = findSectionByKind(sections, 'delivery');
  if (!delivery) {
    return NOT_RECORDED;
  }
  const lines = delivery.body.split(/\r\n|\r|\n/);
  const budgetLine = lines.find((line) => LINE_COUNT_RE.test(line));
  return budgetLine ? summarizeLine(budgetLine) : NOT_RECORDED;
}

/** Matches a review note: a case-insensitive `Review:` label at the very
 * start of a line in an item's evidence. Mirrors the route-note detection
 * above, applied to the review evidence instead. */
const REVIEW_NOTE_RE = /^review:/i;

function findReviewLine(evidence: string): string | null {
  const line = evidence
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .find((l) => REVIEW_NOTE_RE.test(l));
  return line ?? null;
}

/**
 * Review reads the most recently recorded review evidence: the last
 * `Review:`-labelled line found while walking the model's item-bearing
 * sections and their items in document order. The last one, not the
 * first, because a document records one review line per task as tasks
 * close, and the most recent is the one that describes the document's
 * current state. "not recorded" when no item names one — never a guessed
 * verdict.
 */
function formatReview(sections: readonly SectionModel[]): string {
  let last: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const line = findReviewLine(item.evidence);
      if (line) {
        last = line;
      }
    }
  }
  return last ? summarizeLine(last) : NOT_RECORDED;
}

/**
 * Builds the "Recorded by this document" table's five rows, in the PRD's
 * own order: TDD, Delivery, Route, Line budget, Review. Every row is
 * always present; a field the document does not record reads
 * "not recorded", never a blank cell.
 */
export function buildRecordedFields(model: FeatureModel): RecordedField[] {
  const { sections: documentSections } = model.structure;
  const { sections: itemSections } = model;
  return [
    { label: 'TDD', value: formatSectionSummary(documentSections, 'tdd-mode') },
    { label: 'Delivery', value: formatSectionSummary(documentSections, 'delivery') },
    { label: 'Route', value: formatRoute(itemSections) },
    { label: 'Line budget', value: formatLineBudget(documentSections) },
    { label: 'Review', value: formatReview(itemSections) },
  ];
}
