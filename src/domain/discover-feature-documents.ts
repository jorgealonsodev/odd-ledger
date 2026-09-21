/**
 * Discovers ODD feature documents under a workspace root. Plain Node fs/path
 * over strings and paths — no dependency on the editor API, same as the rest
 * of src/domain/. Content is not parsed here; that is T3/T4's job.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isFeatureDocumentPath } from './feature-document';

/**
 * What is known about a feature document at discovery time: where it lives
 * and the feature name derived from its filename. Everything about its
 * structure, tasks, and state is parsed later (T3 onward).
 */
export interface DiscoveredFeatureDocument {
  readonly path: string;
  readonly featureName: string;
}

/**
 * Finds every ODD feature document directly under `<workspaceRoot>/odd/tasks/`.
 *
 * The verified layout is flat: `odd/` contains only `tasks/`, and every
 * feature document sits directly inside it, one file per feature. A missing
 * `odd/`, a missing `tasks/`, an empty `tasks/`, a missing or unreadable
 * workspace root, non-`.md` files, and files nested in a subdirectory of
 * `tasks/` are all normal states, not errors: this function returns an empty
 * array rather than throwing, because a workspace with no ODD folder is the
 * common case and must render welcome content, not an error.
 *
 * Results are ordered alphabetically by feature name. Directory read order
 * is filesystem- and OS-dependent and not guaranteed stable across calls, so
 * sorting is what keeps a tree view from reshuffling between refreshes.
 */
export function discoverFeatureDocuments(workspaceRoot: string): DiscoveredFeatureDocument[] {
  const tasksDir = join(workspaceRoot, 'odd', 'tasks');

  let entries;
  try {
    entries = readdirSync(tasksDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const documents: DiscoveredFeatureDocument[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const path = join(tasksDir, entry.name);
    if (!isFeatureDocumentPath(path)) {
      continue;
    }

    const featureName = entry.name.slice(0, -'.md'.length);
    documents.push({ path, featureName });
  }

  documents.sort((a, b) => a.featureName.localeCompare(b.featureName));
  return documents;
}
