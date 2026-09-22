/**
 * Composes the three domain parsers (parseDocumentStructure, parseChecklist,
 * deriveChecklistState) into one plain `FeatureModel`: the shape the
 * adapter's tree view (T8) and, later, the detail panel (T10-T12) render
 * from directly. This is the domain/adapter boundary for T8 — the adapter
 * only maps this model to `vscode.TreeItem`s, it never re-parses text or
 * re-derives state itself.
 *
 * Plain data transformation over already-read document text — no
 * dependency on the editor API or the filesystem, same boundary as the
 * rest of src/domain/.
 */

import { extractCommitReference } from './derive-checklist-state';
import type { ChecklistCounts, DerivedChecklistItem, DerivedItemState } from './derive-checklist-state';
import { deriveChecklistState } from './derive-checklist-state';
import { parseChecklist } from './parse-checklist';
import type { DocumentSection, DocumentStructure, SectionKind } from './parse-document-structure';
import { parseDocumentStructure } from './parse-document-structure';

/** A DocumentStructure describing a document with no H1 and no sections,
 * used as the FeatureModel.structure fallback for a document that could
 * not be read or parsed (see feature-tree-provider.ts's emptyFeatureModel)
 * and reused by test fixtures that hand-build a FeatureModel without
 * routing it through buildFeatureModel. */
export const EMPTY_DOCUMENT_STRUCTURE: DocumentStructure = {
  title: null,
  titleLine: null,
  preamble: '',
  sections: [],
};

/** The document's `## Next step` line, reduced to what the tree needs: the
 * text to show and the line to reveal when it is clicked (T9). */
export interface NextStepModel {
  readonly line: string;
  readonly headingLine: number;
}

/** One checklist item, with everything a tree or detail-panel node needs to
 * render it: the ID as written (or `null`), the derived state (including
 * `done-unproven`), the first commit reference found, and the source lines
 * to reveal on selection. */
export interface ItemModel {
  readonly id: string | null;
  readonly title: string;
  readonly derivedState: DerivedItemState;
  /** The first commit-shaped hex token found in this item's evidence, or,
   * when evidence names none, in its full raw source text. `null` when
   * neither names one. See extractCommitReference (derive-checklist-state)
   * for the exact shape a token must have. */
  readonly commitReference: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly evidence: string;
}

/** One `##` section that holds at least one checklist item. A section with
 * no items (prose-only, or a fenced example with no real items) is never
 * represented here — see buildFeatureModel's section filter. */
export interface SectionModel {
  readonly heading: string;
  readonly kind: SectionKind | null;
  readonly counts: ChecklistCounts;
  readonly countsTowardProgress: boolean;
  readonly headingLine: number;
  readonly items: ItemModel[];
}

/** One feature document, fully composed: title, branch (when named), the
 * feature-level progress roll-up, its item-bearing sections, and its next
 * step (when the document records one).
 *
 * `structure` is the DocumentStructure buildFeatureModel already parsed
 * out of the document's text to build every other field above. It is
 * carried here, rather than dropped once the checklist and derived state
 * are computed, so a later consumer that needs the document's non-
 * checklist prose (T11's detail-panel body: Objective, Problem, and the
 * document's other optional sections) can read it straight off the model
 * instead of parsing the same text a second time. */
export interface FeatureModel {
  readonly featureName: string;
  readonly documentPath: string;
  readonly title: string | null;
  readonly branch: string | null;
  readonly progress: ChecklistCounts;
  readonly sections: SectionModel[];
  readonly nextStep: NextStepModel | null;
  readonly structure: DocumentStructure;
}

/** Matches a metadata line naming the `Branch` label, tolerating every bold
 * placement the real corpus and the survey turned up: the colon outside the
 * closing `**` (`**Branch**: value`), the colon inside it (`**Branch:**
 * value`), and no bold at all (`Branch: value`). Case-insensitive: the
 * label's exact capitalization is not a contract the real corpus keeps for
 * any other field either. */
const BRANCH_LABEL_RE = /^\*{0,2}Branch\*{0,2}:\*{0,2}\s*(.*)$/i;

/** The first inline code span on a line, e.g. `` `feat/x` `` -> `feat/x`. */
const CODE_SPAN_RE = /`([^`]+)`/;

/** One trailing parenthetical remark, e.g. ` (to be created; never commit
 * this on \`main\`)` at the end of a value. Mirrors the same stripping
 * parseDocumentStructure already does for a section heading's trailing
 * parenthetical, applied here to a branch value instead. */
function stripTrailingParenthetical(value: string): string {
  return value.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:]+$/, '').trim();
}

/**
 * Reads a document's `Branch` field from its preamble (the text before the
 * first `##` section), or `null` when no such line is present. The value is
 * the first inline code span when the line has one, otherwise the first
 * whitespace-delimited token after the label — with a trailing
 * parenthetical and trailing punctuation stripped either way. Never guesses
 * a branch name from anywhere else (e.g. git): absence is displayed, never
 * inferred.
 */
export function extractBranch(preamble: string): string | null {
  const lines = preamble.split(/\r\n|\r|\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = BRANCH_LABEL_RE.exec(line);
    if (!match) {
      continue;
    }

    const rest = match[1].trim();
    if (rest.length === 0) {
      continue;
    }

    const codeSpanMatch = CODE_SPAN_RE.exec(rest);
    const rawValue = codeSpanMatch ? codeSpanMatch[1] : stripTrailingParenthetical(rest).split(/\s+/)[0];
    const value = stripTrailingPunctuation(stripTrailingParenthetical(rawValue ?? ''));
    return value.length > 0 ? value : null;
  }

  return null;
}

/** Strips one leading Markdown list marker (`- `, `* `, `+ `). Bold/emphasis
 * wrappers such as `**...**` are deliberately left as-is: they still read
 * fine as plain text in a tree label, and a full inline-Markdown stripper
 * would be more machinery than one label line justifies. */
function stripLeadingListMarker(line: string): string {
  return line.replace(/^[-*+][ \t]+/, '');
}

/**
 * Reads a `## Next step` section's first non-empty body line, or `null`
 * when the section's body is empty. The PRD is explicit that this case
 * "shows no Next step line rather than an empty one" — an empty section is
 * the same absence as no section at all, from this function's point of
 * view.
 */
export function extractNextStep(section: DocumentSection): NextStepModel | null {
  const lines = section.body.split(/\r\n|\r|\n/);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }
    return { line: stripLeadingListMarker(trimmed), headingLine: section.headingLine };
  }

  return null;
}

/** The first commit-shaped hex token in the item's evidence, falling back
 * to its full raw source text (which also covers a reference that lands on
 * the item's title line rather than in a continuation line). Mirrors the
 * same evidence-then-rawText order deriveChecklistState's own `isProven`
 * check uses, reusing the one exported regex-backed helper rather than
 * re-deriving the rule. */
function findCommitReference(item: DerivedChecklistItem): string | null {
  return extractCommitReference(item.evidence) ?? extractCommitReference(item.rawText);
}

function toItemModel(item: DerivedChecklistItem): ItemModel {
  return {
    id: item.id,
    title: item.title,
    derivedState: item.derivedState,
    commitReference: findCommitReference(item),
    startLine: item.startLine,
    endLine: item.endLine,
    evidence: item.evidence,
  };
}

/**
 * Composes an already-read feature document's text into a plain
 * `FeatureModel`. `featureName` and `documentPath` come from discovery
 * (T2); everything else is derived from `text` by the three existing
 * parsers.
 */
export function buildFeatureModel(featureName: string, documentPath: string, text: string): FeatureModel {
  const structure = parseDocumentStructure(text);
  const checklistSections = parseChecklist(text, structure.sections);
  const derived = deriveChecklistState(checklistSections);

  // structure.sections, checklistSections, and derived.sections are all the
  // same length and in the same order: parseChecklist and
  // deriveChecklistState both map their input 1:1, so the i-th entry of
  // each always describes the same section.
  const sections: SectionModel[] = [];
  for (let i = 0; i < structure.sections.length; i++) {
    const derivedSection = derived.sections[i];
    if (derivedSection.items.length === 0) {
      // "One heading that contains checklist items" (PRD): a prose-only or
      // fenced-example-only section never becomes a tree node.
      continue;
    }
    if (derivedSection.kind === 'next-step') {
      // Ownership: the next-step region belongs to the tree's NextStepNode
      // and the panel header's "NEXT STEP" block (both built from `nextStep`
      // below), never to the ordinary task-section list, regardless of
      // whether its body happens to be written as a checklist item. Those
      // two regions already exist specifically to surface this line, so an
      // item-bearing `## Next step` section would otherwise render a third
      // time here with nothing left to distinguish it from an ordinary task.
      continue;
    }
    sections.push({
      heading: derivedSection.heading,
      kind: derivedSection.kind,
      counts: derivedSection.counts,
      countsTowardProgress: derivedSection.countsTowardProgress,
      headingLine: structure.sections[i].headingLine,
      items: derivedSection.items.map(toItemModel),
    });
  }

  const nextStepSection = structure.sections.find((section) => section.kind === 'next-step');
  const nextStep = nextStepSection ? extractNextStep(nextStepSection) : null;

  return {
    featureName,
    documentPath,
    title: structure.title,
    branch: extractBranch(structure.preamble),
    progress: derived.progress,
    sections,
    nextStep,
    structure,
  };
}
