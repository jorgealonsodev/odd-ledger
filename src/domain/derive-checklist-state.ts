/**
 * Derives display state from parsed checklist sections (T4): whether a
 * "done" item is actually proven, and the completion counts a tree and a
 * detail panel need at the section and feature level.
 *
 * This is where the product's central claim lives: a checkbox grants no
 * approval and no receipt. A `- [x]` item that records neither evidence
 * prose nor a reference to the commit that closed it is not a completed
 * task, it is an unverified claim, and this module is what makes that
 * distinction visible instead of collapsing every checked box into the
 * same icon.
 *
 * Plain data transformation over the ChecklistSection[]/ChecklistItem[]
 * shapes T4 already produced — no re-parsing, no dependency on the editor
 * API or the filesystem, same boundary as the rest of src/domain/.
 */

import type { ChecklistItem, ChecklistItemState, ChecklistSection } from './parse-checklist';
import type { SectionKind } from './parse-document-structure';

/**
 * The state actually rendered for an item. Identical to ChecklistItemState
 * except that a `done` item with no evidence and no commit reference is
 * reclassified as `done-unproven`. Every other state passes through
 * unchanged: only a checked box can be unproven, because only a checked box
 * claims completion in the first place.
 */
export type DerivedItemState = ChecklistItemState | 'done-unproven';

/**
 * A checklist item with its derived display state attached. Every field
 * T4 produced is preserved unchanged; `derivedState` is additive.
 */
export interface DerivedChecklistItem extends ChecklistItem {
  readonly derivedState: DerivedItemState;
}

/**
 * Completion counts over a set of items.
 *
 * `total` counts every item regardless of state. `done` counts only items
 * whose original state is `done` — a `done-unproven` item still counts as
 * done here, because the checkbox itself is still checked; `doneUnproven`
 * is the separate signal for how many of those checked items are
 * unverified. `percentage` is `done / total` rounded to the nearest
 * integer, and is `0`, never `NaN`, when `total` is `0`.
 */
export interface ChecklistCounts {
  readonly done: number;
  readonly total: number;
  readonly percentage: number;
  readonly doneUnproven: number;
}

/**
 * One section with its items carrying derived state, plus this section's
 * own counts and whether it feeds the feature-level roll-up.
 *
 * A section's own `counts` are computed the same way regardless of
 * `countsTowardProgress`: an excluded section (e.g. Acceptance criteria)
 * is still fully counted for its own display, it just does not contribute
 * to the feature total below.
 */
export interface DerivedChecklistSection {
  readonly heading: string;
  readonly kind: SectionKind | null;
  readonly items: DerivedChecklistItem[];
  /**
   * Whether this section's items feed the feature-level progress roll-up.
   *
   * True only for `kind === 'tasks'` and for an unrecognized heading
   * (`kind === null`). Every other recognized kind — acceptance criteria,
   * checks, progress notes, next step, TDD mode, delivery, why, decision
   * narrative, scope, and so on — is excluded.
   *
   * This is a deliberate reading of the survey, not a guess: counting only
   * `tasks` sections undercounts real work that authors filed under a
   * heading of their own choosing (a `## Pending` section holding open
   * items reads as complete when it is excluded); counting every section
   * overcounts, because acceptance criteria are conditions to satisfy, not
   * tasks to close, and folding them in inflates the denominator with
   * items no one is going to check off task by task. An unrecognized
   * heading is treated as the author's own task section precisely because
   * the document grammar has no fixed vocabulary: something the alias
   * table does not know yet is far more likely to be a section the author
   * invented for their own work than a novel spelling of a conceptual
   * section like "Constraints" or "Why".
   */
  readonly countsTowardProgress: boolean;
  readonly counts: ChecklistCounts;
}

/**
 * The derived state of a whole feature document's checklist content.
 */
export interface DerivedFeatureState {
  readonly sections: DerivedChecklistSection[];
  /** The roll-up of every section where `countsTowardProgress` is true. */
  readonly progress: ChecklistCounts;
}

/**
 * Matches a token shaped like a git object id: 7 to 40 characters drawn
 * only from hexadecimal digits, bounded on both sides so it can never be a
 * fragment of a longer word (a backtick, a space, punctuation, or a line
 * boundary all count as bounds; a following or preceding letter/digit does
 * not).
 */
const HEX_TOKEN_RE = /\b[0-9a-f]{7,40}\b/gi;

/**
 * Decides whether text contains a reference to a commit: a bare hex token,
 * a backticked one, or one following a word like `DONE` or `Commit` — all
 * three shapes reduce to the same underlying token once markup and prose
 * around it are ignored, so one rule covers all of them.
 *
 * The rule requires at least one base-10 digit inside the token. A run of
 * 7+ characters drawn only from `a`-`f` can coincide with an English word
 * or a made-up placeholder (`deadbeef`, `facade`, `cafeteria`'s "cafe"
 * fragment does not even reach the boundary) precisely because `a`-`f`
 * spells real letters. A real git object id is derived from binary content
 * unrelated to spelling, so the chance that 7 or more hex characters in a
 * row contain no digit at all is small (roughly (6/16)^7, well under a
 * tenth of a percent) and shrinks further as the hash gets longer. The
 * digit requirement is what keeps this predicate from firing on ordinary
 * prose while still catching every reference actually seen in the corpus,
 * including short 7-character hashes and full 40-character ones.
 */
export function hasCommitReference(text: string): boolean {
  return extractCommitReference(text) !== null;
}

/**
 * Returns the first commit-shaped hex token found in `text`, or `null` when
 * none is present. Shares the exact rule `hasCommitReference` uses (see its
 * doc comment for why the digit requirement matters) so a caller that needs
 * the literal token — e.g. to show it as a task's commit reference — never
 * has to re-implement or re-derive it from a boolean.
 */
export function extractCommitReference(text: string): string | null {
  for (const match of text.matchAll(HEX_TOKEN_RE)) {
    if (/[0-9]/.test(match[0])) {
      return match[0];
    }
  }
  return null;
}

const PROGRESS_KINDS: ReadonlySet<SectionKind | null> = new Set<SectionKind | null>(['tasks', null]);

function countsTowardProgress(kind: SectionKind | null): boolean {
  return PROGRESS_KINDS.has(kind);
}

/**
 * An item is proven when it records evidence text on its own — the
 * document grammar does not distinguish genuine evidence from wrapped
 * title prose, and either is enough on its own to back a completion claim
 * — or when a commit reference appears anywhere in its literal source
 * text. Neither is required to already appear inside `evidence`
 * specifically: a reference occasionally lands in the title line itself,
 * so the full item text is checked, while the "evidence text alone is
 * enough" rule is checked against the `evidence` field precisely, so an
 * item is never marked unproven for lacking a reference it does not need.
 */
function isProven(item: ChecklistItem): boolean {
  if (item.evidence.trim().length > 0) {
    return true;
  }
  return hasCommitReference(item.rawText);
}

function deriveItemState(item: ChecklistItem): DerivedItemState {
  if (item.state === 'done' && !isProven(item)) {
    return 'done-unproven';
  }
  return item.state;
}

function deriveItem(item: ChecklistItem): DerivedChecklistItem {
  return { ...item, derivedState: deriveItemState(item) };
}

/**
 * Counts a set of items.
 *
 * Every item counts in `total`, regardless of state. Only `state ===
 * 'done'` counts in `done`. A `declined` item (`[~]`) therefore counts in
 * the total but never as done: its author recorded a decision, not a
 * completion, and dropping it from the total would erase that decision
 * from the ratio entirely.
 *
 * An `unknown`-marker item counts exactly the same way: in the total, not
 * as done. An unrecognized marker asserts nothing about completion — the
 * document contains a real, deliberately recorded item, but reading an
 * unfamiliar marker as done would be a guess the document itself never
 * made, and "absence is displayed, never guessed" rules that out. Treating
 * it like `declined` keeps it visible in the denominator without
 * fabricating a completion the source text does not state.
 */
function countItems(items: readonly DerivedChecklistItem[]): ChecklistCounts {
  let done = 0;
  let doneUnproven = 0;
  for (const item of items) {
    if (item.state === 'done') {
      done++;
      if (item.derivedState === 'done-unproven') {
        doneUnproven++;
      }
    }
  }
  const total = items.length;
  // A feature or section with no countable items reports 0%, not NaN and
  // not 100%: zero items is the absence of measured progress, and 100%
  // would falsely claim completion the document never recorded.
  const percentage = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percentage, doneUnproven };
}

function sumCounts(counts: readonly ChecklistCounts[]): ChecklistCounts {
  let done = 0;
  let total = 0;
  let doneUnproven = 0;
  for (const c of counts) {
    done += c.done;
    total += c.total;
    doneUnproven += c.doneUnproven;
  }
  const percentage = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percentage, doneUnproven };
}

/**
 * Derives display state and completion counts from T4's parsed checklist
 * sections: which "done" items are actually unproven, per-section counts,
 * and a per-feature roll-up over the sections that count toward progress.
 */
export function deriveChecklistState(sections: readonly ChecklistSection[]): DerivedFeatureState {
  const derivedSections: DerivedChecklistSection[] = sections.map((section) => {
    const items = section.items.map(deriveItem);
    return {
      heading: section.heading,
      kind: section.kind,
      items,
      countsTowardProgress: countsTowardProgress(section.kind),
      counts: countItems(items),
    };
  });

  const progress = sumCounts(derivedSections.filter((s) => s.countsTowardProgress).map((s) => s.counts));

  return { sections: derivedSections, progress };
}
