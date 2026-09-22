/**
 * Parses the output of
 * `git log --follow --name-only --pretty=format:%H%x09%cI -- <path>`
 * into structured revision records (T13): one per commit, each carrying the
 * commit hash, its committer date (ISO 8601, from `%cI`), and the document's
 * own path at that commit.
 *
 * The path matters because `--follow` tracks a document across a rename: an
 * older commit recorded the file under a different name than a newer one
 * does, and that per-commit name is exactly what `git show <hash>:<path>`
 * needs to read the file's content back out at that revision (see
 * fetch-git-revisions.ts, the impure module that runs both commands and
 * calls this parser on the first one's output).
 *
 * Pure string parsing: no process, no filesystem, so this is testable with
 * hand-written strings and no repository. An empty or unparseable result
 * yields an empty array, never a thrown error — "no revisions" is a normal
 * state the caller already treats as "history not available".
 */

/** One revision record parsed from `git log`'s output: a commit hash, its
 * committer date exactly as `%cI` rendered it, and the document's path at
 * that commit. */
export interface GitLogRecord {
  readonly hash: string;
  readonly date: string;
  readonly path: string;
}

/**
 * A record's header line: a 40-character hex commit hash, a tab (`%x09`),
 * then the committer date. The date is required to be non-empty so this
 * pattern can never match a bare filename line, which never contains a tab.
 */
const HEADER_LINE_RE = /^([0-9a-f]{40})\t(\S.*)$/;

/**
 * Parses `git log --follow --name-only --pretty=format:%H%x09%cI -- <path>`
 * output into one record per commit.
 *
 * The format repeats, per commit: one header line (hash, tab, date), then
 * one or more filename lines from `--name-only`, then a blank line before
 * the next header. Only the first filename line after a header becomes that
 * record's `path` — with a single-file pathspec this is normally the only
 * line anyway, and taking just the first keeps an unexpected extra line
 * from silently attaching a second file's name to the same revision.
 *
 * A header with no filename line before the next header (or before the
 * input ends) produces no record for that commit: a revision this parser
 * cannot name a path for is not usable by fetch-git-revisions.ts, which
 * needs the path to read the content back with `git show`.
 */
export function parseGitLogOutput(stdout: string): GitLogRecord[] {
  const records: GitLogRecord[] = [];
  let pendingHash: string | null = null;
  let pendingDate: string | null = null;

  for (const line of stdout.split(/\r\n|\r|\n/)) {
    const headerMatch = HEADER_LINE_RE.exec(line);
    if (headerMatch) {
      pendingHash = headerMatch[1];
      pendingDate = headerMatch[2];
      continue;
    }
    if (pendingHash !== null && pendingDate !== null && line.trim().length > 0) {
      records.push({ hash: pendingHash, date: pendingDate, path: line.trim() });
      pendingHash = null;
      pendingDate = null;
    }
  }

  return records;
}
