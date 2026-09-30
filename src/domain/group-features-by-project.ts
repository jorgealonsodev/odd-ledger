/**
 * Groups the features a multi-root workspace shows by the workspace folder
 * ("project") they came from. Plain data in, plain data out — no dependency
 * on the editor API, same as the rest of src/domain/ — so the grouping rule
 * and the aggregate counts a project node displays are testable without an
 * extension host. The adapter (feature-tree-provider.ts) turns each group
 * into a tree node.
 */

import type { FeatureModel } from './build-feature-model';
import type { ChecklistCounts } from './derive-checklist-state';

/** One visible feature together with the workspace folder it was found in. */
export interface ProjectFeatureEntry {
  readonly folderPath: string;
  readonly model: FeatureModel;
}

/** All the visible features of one workspace folder, with their summed progress. */
export interface ProjectGroup {
  readonly folderPath: string;
  readonly models: FeatureModel[];
  readonly progress: ChecklistCounts;
}

/**
 * Sums the progress of several features into one set of counts. The
 * percentage is derived from the summed done/total rather than averaged
 * from each feature's own percentage: a 1/2 feature and a 3/4 feature are
 * 4/6 done together (67%), not the 62.5% an average of 50% and 75% would
 * suggest, and a project with a tiny feature and a large one must weigh
 * them by task count.
 */
export function sumProgress(models: readonly FeatureModel[]): ChecklistCounts {
  let done = 0;
  let total = 0;
  let doneUnproven = 0;
  for (const model of models) {
    done += model.progress.done;
    total += model.progress.total;
    doneUnproven += model.progress.doneUnproven;
  }
  return { done, total, percentage: total === 0 ? 0 : Math.round((done / total) * 100), doneUnproven };
}

/**
 * Groups entries by `folderPath`. Groups come out in the order each folder
 * first appears in `entries`, and models keep their input order inside a
 * group, so a caller that feeds entries folder by folder (workspace-folder
 * order) gets groups in that same order, and a caller that has already
 * ordered each folder's models keeps that order. A folder with no entries
 * never produces a group: an empty project is not shown.
 */
export function groupFeaturesByProject(entries: readonly ProjectFeatureEntry[]): ProjectGroup[] {
  const modelsByFolder = new Map<string, FeatureModel[]>();
  for (const { folderPath, model } of entries) {
    const models = modelsByFolder.get(folderPath);
    if (models) {
      models.push(model);
    } else {
      modelsByFolder.set(folderPath, [model]);
    }
  }
  return [...modelsByFolder].map(([folderPath, models]) => ({
    folderPath,
    models,
    progress: sumProgress(models),
  }));
}
