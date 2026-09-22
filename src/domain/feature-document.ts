/**
 * Pure predicate over paths and strings. This module, and everything under
 * src/domain/, stays free of any dependency on the editor API — it is
 * unit-tested with plain node --test, with no editor launched.
 */

/**
 * Decides whether the given path points at an ODD feature document, i.e. a
 * flat file directly under an `odd/tasks/` directory named `<feature>.md`.
 *
 * Accepts both forward-slash and backslash path separators, absolute or
 * relative paths. Rejects files nested in a subdirectory of `tasks/`, files
 * outside `tasks/` (even under `odd/`), and non-`.md` files.
 */
export function isFeatureDocumentPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((segment) => segment.length > 0);

  if (segments.length < 3) {
    return false;
  }

  const fileName = segments[segments.length - 1];
  const parentDir = segments[segments.length - 2];
  const grandparentDir = segments[segments.length - 3];

  return parentDir === 'tasks' && grandparentDir === 'odd' && fileName.endsWith('.md') && fileName.length > '.md'.length;
}
