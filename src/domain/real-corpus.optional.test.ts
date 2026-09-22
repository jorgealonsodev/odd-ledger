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
