/**
 * Fetches one feature document's creation date for sort mode `created`
 * (feature-sort-modes): the author date of the first git commit that added
 * it, read with `git log --follow --diff-filter=A --format=%aI -- <path>`.
 *
 * Shares its execFile safety pattern (git-process.ts) with
 * fetch-git-revisions.ts (git-spawn-hardening R2 — the two started as
 * independently maintained, byte-for-byte-identical copies of the same
 * constants, until a proven live vulnerability in one of them needed
 * fixing in both at once; see git-process.ts's own doc comment for what
 * each override neutralises and why): every argument is its own literal
 * execFile array element, never assembled into a shell string; repo-local
 * config keys that could run an external command are neutralised;
 * environment variables that could redirect git away from `repoRoot` are
 * stripped; and any failure — no repository, no commits, the document
 * never committed, git not installed, or output that did not parse into a
 * usable date — is treated as "no known creation date" by returning
 * `null`, never by throwing.
 *
 * `--diff-filter=A` keeps only commits where this document's path (as
 * `--follow` traces it back through renames) was added, so a document
 * edited many times still resolves to its very first commit rather than
 * its most recent one. Multiple add records are theoretically possible
 * (e.g. deleted then re-added under the same name); the earliest one by
 * parsed timestamp is used, not merely the last line of output, so the
 * result does not depend on git's exact ordering guarantees here.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GIT_TIMEOUT_MS, GIT_MAX_BUFFER_BYTES, gitConfigOverrides, gitEnv } from './git-process';

const execFileAsync = promisify(execFile);

/**
 * The earliest (oldest) author date this document was added under, across
 * every name `--follow` can trace it through, as an ISO 8601 string
 * (`%aI`'s own format) — or `null` when no add commit could be found: no
 * repository, no commits, the document never committed, git not
 * installed, or a log whose output did not parse into any usable date.
 */
export async function fetchFeatureCreationDate(repoRoot: string, documentPath: string): Promise<string | null> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, ...gitConfigOverrides(), 'log', '--follow', '--diff-filter=A', '--format=%aI', '--', documentPath],
      {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        encoding: 'utf-8',
        env: gitEnv(),
      },
    ));
  } catch {
    return null;
  }

  let earliestDate: string | null = null;
  let earliestTime = Number.POSITIVE_INFINITY;
  for (const line of stdout.split(/\r\n|\r|\n/)) {
    const date = line.trim();
    if (date.length === 0) {
      continue;
    }
    const time = Date.parse(date);
    if (Number.isNaN(time)) {
      continue;
    }
    if (time < earliestTime) {
      earliestTime = time;
      earliestDate = date;
    }
  }
  return earliestDate;
}
