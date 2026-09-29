/**
 * Optional, local-only check against the real ODD documents this codebase
 * was designed from (T6, Part 3).
 *
 * The feature document's original wording described this check as reading
 * the real documents' "absolute paths" directly. That wording is
 * superseded here: this project's own privacy constraint forbids any real
 * document, name, path, or excerpt from entering this repository, and a
 * literal path would be exactly that if it were ever pasted into a task
 * brief, a commit message, or this file.
 *
 * Instead, the location is supplied entirely from outside the repository,
 * through the ODD_LEDGER_REAL_CORPUS_DIR environment variable: a directory
 * of *.md files, provided only on a machine that actually has them. This
 * file contains no real path, and nothing this test discovers is written
 * back to disk or asserted about its content — only that parsing does not
 * throw and produces a plausible shape. When the variable is unset, or
 * points at a missing or empty directory, the test skips cleanly so the
 * suite stays green on every other machine, including CI.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocumentStructure } from './parse-document-structure';
import { parseChecklist } from './parse-checklist';
import { deriveChecklistState } from './derive-checklist-state';
import { buildFeatureModel } from './build-feature-model';

const REAL_CORPUS_DIR_ENV = 'ODD_LEDGER_REAL_CORPUS_DIR';

test('the real ODD documents on this machine parse without throwing (opt-in, local only)', (t) => {
  const dir = process.env[REAL_CORPUS_DIR_ENV];

  if (!dir || !existsSync(dir)) {
    t.skip(
      `${REAL_CORPUS_DIR_ENV} is not set, or does not point to an existing directory; ` +
        'skipping the real-corpus check. Set it to a local directory of *.md documents ' +
        'to run this check on a machine that has them. This is expected and correct on ' +
        'any other machine, including CI.',
    );
    return;
  }

  const files = readdirSync(dir).filter((name) => name.endsWith('.md') && statSync(join(dir, name)).isFile());

  assert.ok(files.length > 0, `${REAL_CORPUS_DIR_ENV} is set to a directory with no .md files in it`);

  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');

    // Asserting only that the pipeline does not throw and yields a
    // plausible structure. Never assert anything about what these
    // documents actually say: their content is private and may change.
    const structure = parseDocumentStructure(text);
    const checklist = parseChecklist(text, structure.sections);
    deriveChecklistState(checklist);

    assert.ok(structure.title !== null, `expected an H1 title in a real document`);
    assert.ok(structure.sections.length > 0, `expected at least one section in a real document`);
  }
});

/**
 * A second, separate opt-in: a directory of real documents that record
 * their evidence in a progress table (one row per closed task). Kept apart
 * from the corpus above because it asserts something about content that
 * only such documents satisfy: the ledger must read every closed task as
 * proven through its table row, and must read the same tasks as unproven
 * again once the table is removed, which proves the table is the source of
 * the evidence. Nothing about what a document says is asserted or written
 * anywhere; only counts.
 */
const REAL_TABLE_CORPUS_DIR_ENV = 'ODD_LEDGER_REAL_TABLE_CORPUS_DIR';

/** The document without its progress-table sections: every line from a
 * heading that starts with `progress` or `evidence` up to the next heading
 * of the same or a higher level. */
function withoutProgressTables(text: string): string {
  const kept: string[] = [];
  let skippingLevel: number | null = null;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (skippingLevel !== null && level <= skippingLevel) {
        skippingLevel = null;
      }
      if (skippingLevel === null && /^(progress|evidence)/i.test(heading[2].trim())) {
        skippingLevel = level;
      }
    }
    if (skippingLevel === null) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

test('real table-format documents read every closed task as proven, and unproven again without the table (opt-in, local only)', (t) => {
  const dir = process.env[REAL_TABLE_CORPUS_DIR_ENV];

  if (!dir || !existsSync(dir)) {
    t.skip(
      `${REAL_TABLE_CORPUS_DIR_ENV} is not set, or does not point to an existing directory; ` +
        'skipping the real table-format check. Set it to a local directory of *.md documents ' +
        'that record their evidence in a progress table. Expected and correct on any other machine, including CI.',
    );
    return;
  }

  const files = readdirSync(dir).filter((name) => name.endsWith('.md') && statSync(join(dir, name)).isFile());
  assert.ok(files.length > 0, `${REAL_TABLE_CORPUS_DIR_ENV} is set to a directory with no .md files in it`);

  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');

    const withTable = buildFeatureModel('real', join(dir, file), text);
    assert.ok(withTable.progress.done > 0, 'expected the document to have closed tasks');
    assert.equal(withTable.progress.doneUnproven, 0, 'expected every closed task to be proven through its table row');

    const withoutTable = buildFeatureModel('real', join(dir, file), withoutProgressTables(text));
    assert.equal(
      withoutTable.progress.doneUnproven,
      withoutTable.progress.done,
      'expected every closed task to be unproven again once the table is removed',
    );
    assert.equal(withoutTable.progress.done, withTable.progress.done, 'removing the table must not change which tasks are closed');
  }
});
