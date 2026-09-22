/**
 * Builds the detail panel's body regions (T11) from an already-composed
 * FeatureModel (T8: buildFeatureModel). Decides *what* renders and in what
 * order; the adapter's webview panel (feature-detail-panel.ts) only turns
 * this into HTML, it never decides section order or omission itself.
 *
 * FeatureModel.sections keeps only the sections that hold at least one
 * checklist item, so the document's non-checklist prose (Objective,
 * Problem, Constraints, and so on) is not on the model at all. That prose
 * lives on FeatureModel.structure instead — the DocumentStructure
 * buildFeatureModel already parsed out of the document's text to build
 * every other field on the model. Reading it from there, rather than
 * asking a caller to parse the document text a second time, is why this
 * function takes only a FeatureModel and not a separate DocumentStructure
 * parameter.
 *
 * Plain data transformation over an already-parsed model — no dependency
 * on the editor API or the filesystem, same boundary as the rest of
 * src/domain/.
 */

import type { FeatureModel, SectionModel } from './build-feature-model';
import type { DocumentSection, SectionKind } from './parse-document-structure';

/**
 * The sentence a done-but-unproven task states in the panel: what ODD
 * itself says is missing, not a generic "unproven" label (docs/PRD.md's
 * detail-panel wireframe carries this exact wording). A single named
 * constant so this statement is written once; any other renderer that
 * needs the same statement (e.g. a future change to the tree view's own,
 * shorter description text) imports this rather than retyping it and
 * risking the two drifting apart.
 */
export const UNPROVEN_TASK_MESSAGE =
  'Checked, but the item records no evidence and no commit. ODD treats a checkbox as no proof at all.';

/** One of the document's other optional sections (constraints, scope,
 * acceptance criteria, checks, a decision narrative, why, delivery, TDD
 * mode, or progress notes), rendered as its raw heading and body text
 * when the document has it. */
export interface PanelBodyDocumentSection {
  readonly heading: string;
  readonly body: string;
}

/** Everything the detail panel's body region needs to render. */
export interface PanelBody {
  /** The Objective and Problem sections' bodies, in that fixed order
   * (the PRD's region order, not necessarily the document's own heading
   * order) and joined by a blank line when both are present. `null` when
   * the document has neither: per the absence convention, no empty
   * region renders. */
  readonly objective: string | null;
  /** Every section that holds at least one checklist item, exactly as
   * buildFeatureModel already composed it (the same sections and items
   * the tree view renders), each with its items and their evidence. */
  readonly taskSections: readonly SectionModel[];
  /** The document's other recognized sections — every SectionKind except
   * objective, problem (folded into `objective` above), tasks (rendered
   * via `taskSections` instead), and next-step (the panel header already
   * shows it) — in document order, and only when the section is present
   * with a non-empty body. */
  readonly otherSections: readonly PanelBodyDocumentSection[];
}

const OBJECTIVE_REGION_KINDS: readonly SectionKind[] = ['objective', 'problem'];

/** Section kinds shown in the "other document sections" region: every
 * recognized SectionKind except objective, problem, tasks, and next-step,
 * which each already have their own region above. An unrecognized heading
 * (`kind === null`) is not included here — when it holds items it is
 * already rendered via `taskSections`, and when it does not, this feature
 * has nowhere else to show author-specific prose the alias table has
 * never seen. */
const OTHER_SECTION_KINDS: ReadonlySet<SectionKind> = new Set([
  'constraints',
  'scope',
  'acceptance-criteria',
  'progress',
  'tdd-mode',
  'checks',
  'decision-narrative',
  'delivery',
  'why',
]);

function findSection(sections: readonly DocumentSection[], kind: SectionKind): DocumentSection | undefined {
  return sections.find((section) => section.kind === kind);
}

/**
 * Ownership rule that keeps the three body regions an exclusive partition
 * of `model.structure.sections`, so no heading is ever assembled into two
 * regions at once.
 *
 * `model.sections` (buildFeatureModel's own item-bearing sections, already
 * excluding `next-step` — see that module) is the single source of truth
 * for "this section holds checklist items". Its `headingLine`s are the
 * claim: any structure section whose `headingLine` is claimed here belongs
 * to the taskSections region and nowhere else, because rendering an item's
 * state and evidence carries strictly more information than repeating its
 * heading's raw body as prose. Both the objective region (below) and the
 * other-sections region check this same claim before including a section,
 * so a kind added to OTHER_SECTION_KINDS in the future is excluded by
 * construction the moment it holds items, without needing its own
 * special case here.
 *
 * `headingLine` (rather than `kind`) is the identity used for the claim
 * because a kind is not unique per document — nothing stops two `##`
 * sections resolving to the same kind — while a heading's line number is.
 */
function claimedHeadingLines(taskSections: readonly SectionModel[]): ReadonlySet<number> {
  return new Set(taskSections.map((section) => section.headingLine));
}

function buildObjective(sections: readonly DocumentSection[], claimed: ReadonlySet<number>): string | null {
  const bodies = OBJECTIVE_REGION_KINDS.map((kind) => findSection(sections, kind))
    .filter((section): section is DocumentSection => section !== undefined && !claimed.has(section.headingLine))
    .map((section) => section.body)
    .filter((body) => body.length > 0);
  return bodies.length > 0 ? bodies.join('\n\n') : null;
}

function buildOtherSections(
  sections: readonly DocumentSection[],
  claimed: ReadonlySet<number>,
): PanelBodyDocumentSection[] {
  return sections
    .filter(
      (section) =>
        section.kind !== null &&
        OTHER_SECTION_KINDS.has(section.kind) &&
        section.body.length > 0 &&
        !claimed.has(section.headingLine),
    )
    .map((section) => ({ heading: section.heading, body: section.body }));
}

/**
 * Composes the detail panel's body regions from an already-built
 * FeatureModel. See PanelBody for what each region contains and when it
 * is omitted.
 */
export function buildPanelBody(model: FeatureModel): PanelBody {
  const { sections } = model.structure;
  const claimed = claimedHeadingLines(model.sections);
  return {
    objective: buildObjective(sections, claimed),
    taskSections: model.sections,
    otherSections: buildOtherSections(sections, claimed),
  };
}
