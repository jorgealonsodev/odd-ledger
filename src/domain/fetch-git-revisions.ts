/**
 * Runs `git log` and `git show` to gather a feature document's revisions for
 * the History region (T13): the process-execution seam build-history.ts's
 * pure buildHistory() is deliberately kept out of, so that function stays
 * testable with hand-made revisions and no repository at all.
 *
 * This is the first code in this extension that executes an external
 * process, so it is also the first that can be attacked through its
 * arguments. Every argument is passed as its own literal element of an
 * array to execFile — never assembled into a shell command string, and
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
 * empty result (or skipping just that one revision), never by throwing. The
 * detail panel still renders the rest of the document either way.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGitLogOutput } from './parse-git-log';
import type { HistoryRevisionInput } from './build-history';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Caps fetched revisions so spawns, memory and chart points stay bounded. */
export const MAX_FETCHED_REVISIONS = 50;

/** `quotePath=false` keeps a non-ASCII path unquoted; the rest neutralise repo-local config keys that could spawn a command. */
const GIT_CONFIG_OVERRIDES = ['-c', 'core.quotePath=false', '-c', 'core.fsmonitor=false', '-c', 'core.sshCommand=', '-c', 'diff.external='];

/** Deleted from the child env: git resolves these before `-C`. */
const GIT_LOCATION_ENV_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CEILING_DIRECTORIES'];

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' };
  for (const key of GIT_LOCATION_ENV_VARS) {
    delete env[key];
  }
  return env;
}

/** Runs one git subcommand under `repoRoot`; `null` on any failure. */
async function runGit(repoRoot: string, args: readonly string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, ...GIT_CONFIG_OVERRIDES, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      encoding: 'utf-8',
      env: gitEnv(),
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Revisions read, whether the cap truncated a longer history, and how many
 * in-range revisions could not be read back. */
export interface FetchedRevisions {
  readonly revisions: HistoryRevisionInput[];
  readonly truncated: boolean;
  readonly skippedCount: number;
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
 * rename. `--max-count` asks one more than MAX_FETCHED_REVISIONS, so an
 * exact cap is told apart from a history exactly that long.
 *
 * Returns an empty result for every state that is not "a readable history
 * exists": no repository, no commits yet, the document never committed,
 * git not installed, or a log whose output did not parse into any usable
 * record. A revision whose content could not be read back with `git show`
 * (a corrupt object, for instance) is skipped and counted in
 * `skippedCount`, rather than discarding every other revision that did
 * read back cleanly.
 */
export async function fetchDocumentRevisions(repoRoot: string, documentPath: string): Promise<FetchedRevisions> {
  const logOutput = await runGit(repoRoot, [
    'log',
    '--follow',
    '--name-only',
    '--pretty=format:%H%x09%cI',
    `--max-count=${MAX_FETCHED_REVISIONS + 1}`,
    '--',
    documentPath,
  ]);
  if (logOutput === null) {
    return { revisions: [], truncated: false, skippedCount: 0 };
  }

  const records = parseGitLogOutput(logOutput);
  const truncated = records.length > MAX_FETCHED_REVISIONS;
  const boundedRecords = truncated ? records.slice(0, MAX_FETCHED_REVISIONS) : records;

  const revisions: HistoryRevisionInput[] = [];
  let skippedCount = 0;
  for (const record of boundedRecords) {
    const text = await runGit(repoRoot, ['show', `${record.hash}:${record.path}`]);
    if (text === null) {
      skippedCount++;
      continue;
    }
    revisions.push({ hash: record.hash, date: record.date, text });
  }
  return { revisions, truncated, skippedCount };
}
