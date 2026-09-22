/**
 * Runs `git log` and `git show` to gather a feature document's revisions for
 * the History region (T13): the process-execution seam build-history.ts's
 * pure buildHistory() is deliberately kept out of, so that function stays
 * testable with hand-made revisions and no repository at all.
 *
 * This is the first code in this extension that executes an external
 * process, so it is also the first that can be attacked through its
 * arguments. Every argument is passed as its own literal element of an
 * array to execFileSync — never assembled into a shell command string, and
 * `exec`/`execSync` are never used — so a document path that begins with a
 * dash or contains spaces can never be read as a git flag or split into
 * more than one argument. The repository directory is passed with git's own
 * `-C <dir>` flag, and the document path is always a separate argument
 * after `--`, per the same rule.
 *
 * A file not yet committed, a directory that is not a git repository, and
 * git not being installed are all normal states, not errors: any failure
 * here — a non-zero exit, a timeout, or output that does not parse into a
 * usable revision — is treated as "no history available" by returning an
 * empty array (or skipping just that one revision), never by throwing. The
 * detail panel still renders the rest of the document either way.
 */

import { execFileSync } from 'node:child_process';
import { parseGitLogOutput } from './parse-git-log';
import type { HistoryRevisionInput } from './build-history';

const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Runs one git subcommand under `repoRoot` and returns its stdout, or
 * `null` for any failure: a non-zero exit (not a repository, no commits
 * yet, an unreadable object), a timeout, or git not being installed at all
 * (`ENOENT`). Never throws.
 *
 * `GIT_PAGER` and `GIT_TERMINAL_PROMPT` are overridden so a `core.pager`
 * setting or a credential prompt can never make this call interactive or
 * wait on a terminal that does not exist here; nothing else about the
 * caller's environment or git configuration is touched, and no shell is
 * invoked, so no alias or hook a shell profile might define is ever
 * consulted.
 */
function runGit(repoRoot: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      encoding: 'utf-8',
      env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
    });
  } catch {
    return null;
  }
}

/**
 * Fetches every git revision of `documentPath` under `repoRoot`, newest
 * first (the order `git log` itself returns), each carrying its commit
 * hash, committer date, and the document's full text at that revision —
 * enough for build-history.ts's buildHistory() to recompute the completion
 * ratio at each point without reading anything else.
 *
 * `--follow` tracks the document across a rename; `git log`'s `--name-only`
 * reports the document's own path at each commit, which is what makes a
 * renamed document's earlier revisions readable: `git show <hash>:<path>`
 * below uses that per-commit path exactly as git reported it (relative to
 * the repository's top level, which `git show` resolves correctly
 * regardless of what directory `-C` pointed at), never a path recomputed
 * from `documentPath`, which would be wrong for any commit before the
 * rename.
 *
 * Returns an empty array for every state that is not "a readable history
 * exists": no repository, no commits yet, the document never committed,
 * git not installed, or a log whose output did not parse into any usable
 * record. A revision whose content could not be read back with `git show`
 * (a corrupt object, for instance) is skipped rather than discarding every
 * other revision that did read back cleanly.
 */
export function fetchDocumentRevisions(repoRoot: string, documentPath: string): HistoryRevisionInput[] {
  const logOutput = runGit(repoRoot, [
    'log',
    '--follow',
    '--name-only',
    '--pretty=format:%H%x09%cI',
    '--',
    documentPath,
  ]);
  if (logOutput === null) {
    return [];
  }

  const records = parseGitLogOutput(logOutput);
  const revisions: HistoryRevisionInput[] = [];
  for (const record of records) {
    const text = runGit(repoRoot, ['show', `${record.hash}:${record.path}`]);
    if (text === null) {
      continue;
    }
    revisions.push({ hash: record.hash, date: record.date, text });
  }
  return revisions;
}
