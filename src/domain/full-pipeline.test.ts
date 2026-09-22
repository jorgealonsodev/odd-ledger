/**
 * Integration tests over the synthetic fixture corpus (T6): the full
 * pipeline — parseDocumentStructure, then parseChecklist, then
 * deriveChecklistState — run over each complete synthetic document, with
 * explicit expected numbers asserted directly rather than recomputed from
 * the modules under test.
 *
 * This is deliberately separate from each parser's own unit test file.
 * Those exercise one module with minimal, targeted inputs; this file is
 * the first (and only) place the three parsers run composed, over
 * documents shaped like something a real project would actually produce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentStructure } from './parse-document-structure';
import { parseChecklist } from './parse-checklist';
import { deriveChecklistState } from './derive-checklist-state';
import type { DerivedFeatureState } from './derive-checklist-state';
import {
  CACHE_WARM_V2,
  CLI_FLOW_AUDIT,
  MOBILE_ONBOARDING_REVAMP,
  SIGNAGE_DISPLAY_DRIVER,
  WAREHOUSE_RELABEL_V1,
  CONVEYOR_SORT_ROUTING_V1,
  SYNTHETIC_DOCUMENTS,
} from './fixtures/synthetic-documents';

function runPipeline(text: string): DerivedFeatureState {
  const structure = parseDocumentStructure(text);
  const checklist = parseChecklist(text, structure.sections);
  return deriveChecklistState(checklist);
}

test('every synthetic document runs through the full pipeline without throwing', () => {
  for (const doc of SYNTHETIC_DOCUMENTS) {
    assert.doesNotThrow(() => runPipeline(doc.text), `${doc.id} threw somewhere in the pipeline`);
  }
});

test('cache-warm-v2: sections, IDs, states, fence suppression, and progress', () => {
  const structure = parseDocumentStructure(CACHE_WARM_V2.text);
  const checklist = parseChecklist(CACHE_WARM_V2.text, structure.sections);
  const derived = deriveChecklistState(checklist);

  assert.equal(structure.title, 'cache-warm-v2');
  assert.match(structure.preamble, /\*\*Feature\*\*: `cache-warm-v2`/);

  assert.deepEqual(
    structure.sections.map((s) => [s.heading, s.kind]),
    [
      ['Objective', 'objective'],
      ['Problem', 'problem'],
      ['Why', 'why'],
      ['Constraints', 'constraints'],
      ['Scope', 'scope'],
      ['Tasks', 'tasks'],
      ['Progress', 'progress'],
      ['Next step', 'next-step'],
    ],
  );

  // The fenced code block inside Scope must not fabricate a section named
  // "Not a real heading", and its bracketed line must not become a real
  // checklist item anywhere.
  assert.ok(!structure.sections.some((s) => s.heading === 'Not a real heading'));
  const scopeSection = derived.sections.find((s) => s.heading === 'Scope');
  assert.ok(scopeSection);
  assert.equal(scopeSection!.items.length, 0);

  const tasks = derived.sections.find((s) => s.heading === 'Tasks');
  assert.ok(tasks);
  assert.deepEqual(
    tasks!.items.map((i) => [i.id, i.state, i.derivedState]),
    [
      ['C1', 'done', 'done'],
      ['C2', 'done', 'done'],
      ['C3', 'done', 'done-unproven'],
      ['C4', 'open', 'open'],
      ['C5', 'declined', 'declined'],
      ['C6', 'unknown', 'unknown'],
    ],
  );

  // C1: bold-wrapped ID and title, evidence naming a commit.
  assert.equal(tasks!.items[0].title, 'Load the warm-set manifest at startup.');
  assert.ok(tasks!.items[0].evidence.includes('4a1c9e3'));

  // C2: title carries an inline code span; evidence present, no commit.
  assert.ok(tasks!.items[1].title.includes('`cache.get`'));
  assert.ok(tasks!.items[1].evidence.length > 0);

  // C3: done, with neither evidence nor a commit reference anywhere in the
  // item's raw text — this is what done-unproven exists to catch.
  assert.equal(tasks!.items[2].evidence, '');

  assert.equal(tasks!.counts.done, 3);
  assert.equal(tasks!.counts.total, 6);
  assert.equal(tasks!.counts.doneUnproven, 1);
  assert.equal(tasks!.counts.percentage, 50);
  assert.equal(tasks!.countsTowardProgress, true);

  assert.equal(derived.progress.done, 3);
  assert.equal(derived.progress.total, 6);
  assert.equal(derived.progress.doneUnproven, 1);
  assert.equal(derived.progress.percentage, 50);
});

test('cli-flow-audit: progress-notes alias, Checks distinct from Constraints, two ID namespaces', () => {
  const structure = parseDocumentStructure(CLI_FLOW_AUDIT.text);
  const checklist = parseChecklist(CLI_FLOW_AUDIT.text, structure.sections);
  const derived = deriveChecklistState(checklist);

  assert.equal(structure.preamble, '');

  assert.deepEqual(
    structure.sections.map((s) => [s.heading, s.kind]),
    [
      ['Objective', 'objective'],
      ['Problem', 'problem'],
      ['Constraints', 'constraints'],
      ['Scope', 'scope'],
      ['Tasks', 'tasks'],
      ['Backlog', null],
      ['Risk notes', null],
      ['Checks', 'checks'],
      ['Progress notes', 'progress'],
      ['Decision taken (2026-08-02)', 'decision-narrative'],
      ['Next step', 'next-step'],
    ],
  );

  const tasks = derived.sections.find((s) => s.heading === 'Tasks')!;
  assert.deepEqual(
    tasks.items.map((i) => [i.id, i.derivedState]),
    [
      ['F1', 'open'],
      ['F2', 'done'],
      ['F3', 'done-unproven'],
      ['F4', 'declined'],
    ],
  );
  assert.equal(tasks.counts.done, 2);
  assert.equal(tasks.counts.total, 4);
  assert.equal(tasks.countsTowardProgress, true);

  const backlog = derived.sections.find((s) => s.heading === 'Backlog')!;
  assert.deepEqual(
    backlog.items.map((i) => i.id),
    ['BK1', 'BK2'],
  );
  assert.equal(backlog.countsTowardProgress, true, 'an unrecognized heading counts toward progress');
  assert.equal(backlog.counts.done, 0);
  assert.equal(backlog.counts.total, 2);

  const riskNotes = derived.sections.find((s) => s.heading === 'Risk notes')!;
  assert.equal(riskNotes.items.length, 0, 'Risk notes is document-specific prose, not a checklist');

  const checks = derived.sections.find((s) => s.heading === 'Checks')!;
  assert.equal(checks.kind, 'checks');
  assert.equal(checks.countsTowardProgress, false);

  const constraints = derived.sections.find((s) => s.heading === 'Constraints')!;
  assert.equal(constraints.kind, 'constraints');
  assert.notEqual(constraints.kind, checks.kind, 'Constraints and Checks are distinct headings, not aliases');

  // Feature-wide roll-up combines Tasks (F*) and Backlog (BK*): 2 + 0 done
  // out of 4 + 2 total.
  assert.equal(derived.progress.done, 2);
  assert.equal(derived.progress.total, 6);
  assert.equal(derived.progress.percentage, 33);
});

test('mobile-onboarding-revamp: two ID prefixes in one section with a numbering gap, and acceptance criteria excluded', () => {
  const structure = parseDocumentStructure(MOBILE_ONBOARDING_REVAMP.text);
  const checklist = parseChecklist(MOBILE_ONBOARDING_REVAMP.text, structure.sections);
  const derived = deriveChecklistState(checklist);

  assert.deepEqual(
    structure.sections.map((s) => [s.heading, s.kind]),
    [
      ['Objective', 'objective'],
      ['Problem', 'problem'],
      ['Constraints', 'constraints'],
      ['Tasks', 'tasks'],
      ['Acceptance criteria', 'acceptance-criteria'],
      ['Open questions', null],
      ['Decisions', 'decision-narrative'],
    ],
  );

  const tasks = derived.sections.find((s) => s.heading === 'Tasks')!;
  // M1, M2, M4, R1, R2: M3 never appears (the gap), and M*/R* share one
  // section (the two-prefixes-at-once quirk).
  assert.deepEqual(
    tasks.items.map((i) => i.id),
    ['M1', 'M2', 'M4', 'R1', 'R2'],
  );
  assert.deepEqual(
    tasks.items.map((i) => i.derivedState),
    ['done', 'open', 'done-unproven', 'declined', 'open'],
  );
  assert.ok(tasks.items[0].evidence.includes('c88e4aa'), 'M1 evidence comes from same-line trailing text');
  assert.equal(tasks.counts.done, 2);
  assert.equal(tasks.counts.total, 5);
  assert.equal(tasks.counts.doneUnproven, 1);

  const acceptance = derived.sections.find((s) => s.heading === 'Acceptance criteria')!;
  assert.deepEqual(
    acceptance.items.map((i) => i.id),
    [null, null, null],
    'none of these items has an identifier-shaped leading token',
  );
  assert.equal(acceptance.counts.done, 1);
  assert.equal(acceptance.counts.total, 3);
  assert.equal(acceptance.countsTowardProgress, false);

  const openQuestions = derived.sections.find((s) => s.heading === 'Open questions')!;
  assert.equal(openQuestions.kind, null);
  assert.equal(openQuestions.items.length, 0);

  // The feature roll-up must be Tasks alone (2/5): if Acceptance criteria's
  // one done item leaked in, this would be 3/8 instead.
  assert.equal(derived.progress.done, 2);
  assert.equal(derived.progress.total, 5);
  assert.equal(derived.progress.percentage, 40);
});

test('warehouse-relabel-v1: an unterminated fence and a second H1 do not swallow or drop the rest of the document', () => {
  const structure = parseDocumentStructure(WAREHOUSE_RELABEL_V1.text);
  const checklist = parseChecklist(WAREHOUSE_RELABEL_V1.text, structure.sections);
  const derived = deriveChecklistState(checklist);

  assert.equal(structure.title, 'warehouse-relabel-v1');
  assert.deepEqual(
    structure.sections.map((s) => [s.heading, s.kind, s.level]),
    [
      ['Objective', 'objective', 2],
      ['Constraints', 'constraints', 2],
      ['Superseded plan, kept for reference', null, 1],
      ['Tasks', 'tasks', 2],
    ],
  );

  // The unterminated fence's own text survives, as literal content, in the
  // section that was open when it was opened.
  assert.match(structure.sections[1].body, /BIN-042 :: SKU 88213/);

  // Constraints itself has no checklist items: the fence's content never
  // becomes real structure.
  const constraints = derived.sections.find((s) => s.heading === 'Constraints')!;
  assert.equal(constraints.items.length, 0);

  // Tasks, which only exists because the fence stopped swallowing the
  // document, is parsed with both of its real items.
  const tasks = derived.sections.find((s) => s.heading === 'Tasks')!;
  assert.deepEqual(
    tasks.items.map((i) => [i.id, i.derivedState]),
    [
      ['W1', 'open'],
      ['W2', 'done'],
    ],
  );
});

test('signage-display-driver-v1: sparse document with only the four core headings', () => {
  const structure = parseDocumentStructure(SIGNAGE_DISPLAY_DRIVER.text);
  const checklist = parseChecklist(SIGNAGE_DISPLAY_DRIVER.text, structure.sections);
  const derived = deriveChecklistState(checklist);

  assert.equal(structure.title, 'signage-display-driver-v1');
  assert.equal(structure.preamble, '');
  assert.deepEqual(
    structure.sections.map((s) => s.heading),
    ['Objective', 'Problem', 'Constraints', 'Tasks'],
  );
  assert.ok(!structure.sections.some((s) => s.kind === 'scope'));
  assert.ok(!structure.sections.some((s) => s.kind === 'progress'));
  assert.ok(!structure.sections.some((s) => s.kind === 'next-step'));
  assert.ok(!structure.sections.some((s) => s.kind === 'acceptance-criteria'));

  const tasks = derived.sections.find((s) => s.heading === 'Tasks')!;
  assert.deepEqual(
    tasks.items.map((i) => [i.id, i.derivedState]),
    [
      ['S1', 'open'],
      ['S2', 'done'],
      ['S3', 'done-unproven'],
    ],
  );
  assert.equal(derived.progress.done, 2);
  assert.equal(derived.progress.total, 3);
  assert.equal(derived.progress.percentage, 67);
});

test('conveyor-sort-routing-v1: two sections, a mixed-prefix gap, and an identifier scoped per section', () => {
  const structure = parseDocumentStructure(CONVEYOR_SORT_ROUTING_V1.text);
  const checklist = parseChecklist(CONVEYOR_SORT_ROUTING_V1.text, structure.sections);
  const derived = deriveChecklistState(checklist);

  // Tasks and Pending render as two distinct sections, not one merged list.
  assert.deepEqual(
    structure.sections.map((s) => [s.heading, s.kind]),
    [
      ['Objective', 'objective'],
      ['Problem', 'problem'],
      ['Constraints', 'constraints'],
      ['Tasks', 'tasks'],
      ['Pending', null],
    ],
  );

  const tasks = derived.sections.find((s) => s.heading === 'Tasks')!;
  assert.deepEqual(
    tasks.items.map((i) => [i.id, i.derivedState]),
    [
      ['Q1', 'done'],
      ['Q2', 'open'],
      ['Q3', 'done-unproven'],
    ],
  );

  const pending = derived.sections.find((s) => s.heading === 'Pending')!;
  // Pending mixes the Tasks section's own prefix (Q) with a second prefix
  // (H), and its Q-numbering has a gap: Q11 never appears between Q10 and
  // Q12.
  assert.deepEqual(
    pending.items.map((i) => i.id),
    ['Q1', 'H1', 'Q10', 'Q12', 'H2'],
  );
  assert.deepEqual(
    pending.items.map((i) => i.derivedState),
    ['open', 'done', 'open', 'open', 'declined'],
  );

  // The two sections' own "Q1" items are distinct: Tasks's Q1 is the done,
  // proven item; Pending's Q1 is a separate, still-open item. If IDs were
  // not scoped per section, one of these two would be lost or merged into
  // the other instead of both surviving with their own state.
  assert.equal(tasks.items[0].id, 'Q1');
  assert.equal(pending.items[0].id, 'Q1');
  assert.notEqual(tasks.items[0].derivedState, pending.items[0].derivedState);
  assert.notEqual(tasks.items[0].title, pending.items[0].title);

  assert.equal(tasks.counts.total, 3);
  assert.equal(pending.counts.total, 5);
});
