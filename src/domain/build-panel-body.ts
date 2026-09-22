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

function buildObjective(sections: readonly DocumentSection[]): string | null {
  const bodies = OBJECTIVE_REGION_KINDS.map((kind) => findSection(sections, kind)?.body).filter(
    (body): body is string => Boolean(body && body.length > 0),
  );
  return bodies.length > 0 ? bodies.join('\n\n') : null;
}

function buildOtherSections(sections: readonly DocumentSection[]): PanelBodyDocumentSection[] {
  return sections
    .filter((section) => section.kind !== null && OTHER_SECTION_KINDS.has(section.kind) && section.body.length > 0)
    .map((section) => ({ heading: section.heading, body: section.body }));
}

/**
 * Composes the detail panel's body regions from an already-built
 * FeatureModel. See PanelBody for what each region contains and when it
 * is omitted.
 */
export function buildPanelBody(model: FeatureModel): PanelBody {
  const { sections } = model.structure;
  return {
    objective: buildObjective(sections),
    taskSections: model.sections,
    otherSections: buildOtherSections(sections),
  };
}
