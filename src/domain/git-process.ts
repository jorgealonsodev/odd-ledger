/**
 * The one shared safety pattern every `execFile('git', ...)` call site in
 * this extension builds its argument list and environment from
 * (fetch-git-revisions.ts's History reads, fetch-feature-creation-date.ts's
 * `created` sort mode). Extracted from what were two independently
 * maintained, byte-for-byte-identical copies of the same constants
 * (git-spawn-hardening R2) so a safety fix — like the `log.showSignature`
 * override below (R1) — lands once and covers both callers instead of
 * needing to be remembered twice.
 *
 * Every argument passed to git is its own literal `execFile` array element,
 * never assembled into a shell string, so a document path that begins with
 * a dash or contains spaces can never be read as a flag or split into more
 * than one argument. `GIT_CONFIG_OVERRIDES` neutralises every repo-local
 * config key found, by investigation, to be able to make git run an
 * arbitrary program on behalf of a workspace this extension does not
 * control:
 *
 * - `core.fsmonitor` / `core.sshCommand` / `diff.external`: config keys that
 *   directly name a program git will run.
 * - `log.showSignature=false`: the one proven live vector (see the
 *   git-spawn-hardening task's own investigation notes for the empirical
 *   proof). A repository whose local config sets `log.showSignature=true`
 *   and `gpg.program`/`gpg.ssh.program`/`gpg.x509.program` makes `git log`
 *   invoke that program to "verify" any commit it displays that merely
 *   carries a `gpgsig` header — a bogus, never-actually-verified header is
 *   enough — regardless of whether the `--format`/`--pretty=format:` string
 *   in use asks for any signature field at all. A command-line `-c` always
 *   wins over repo-local config, so disabling signature verification here
 *   closes the vector without needing to also override which program a
 *   verification would have used.
 */

const GIT_CONFIG_OVERRIDES: readonly string[] = [
  '-c',
  'core.quotePath=false',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.sshCommand=',
  '-c',
  'diff.external=',
  '-c',
  'log.showSignature=false',
];

/** Deleted from the child env: git resolves these before `-C`. */
const GIT_LOCATION_ENV_VARS: readonly string[] = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CEILING_DIRECTORIES'];

export const GIT_TIMEOUT_MS = 5000;
export const GIT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** The `-c ...` arguments every git invocation in this extension is
 * prefixed with, right after `-C <repoRoot>`. See the module doc for what
 * each override neutralises and why. */
export function gitConfigOverrides(): readonly string[] {
  return GIT_CONFIG_OVERRIDES;
}

/** The environment every git child process runs under: `process.env` minus
 * the location variables git would otherwise resolve before `-C` takes
 * effect, plus a pager/prompt setup safe for a non-interactive child. */
export function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' };
  for (const key of GIT_LOCATION_ENV_VARS) {
    delete env[key];
  }
  return env;
}
