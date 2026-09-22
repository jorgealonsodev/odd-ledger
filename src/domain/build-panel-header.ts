/**
 * Builds the detail panel's header and tile-row data (T10) from an
 * already-composed FeatureModel (T8: buildFeatureModel). Plain data
 * transformation over strings and paths — no dependency on the editor API
 * or the filesystem, same boundary as the rest of src/domain/. The
 * adapter's webview panel (feature-detail-panel.ts) renders this, it does
 * not derive any of it itself.
 */

import { basename, relative } from 'node:path';
import type { FeatureModel, NextStepModel } from './build-feature-model';

const NOT_RECORDED = 'not recorded';

/** One of the panel's three summary tiles: a short label and its already
 * formatted display value. Every tile states absence in words — "not
 * recorded" or "none" — rather than rendering blank or a misleading zero,
 * per the PRD's absence convention. */
export interface PanelTile {
  readonly label: string;
  readonly value: string;
}

/** Everything the detail panel's header region and tile row need to
 * render, built from a FeatureModel plus the workspace root its document
 * was discovered under. */
export interface PanelHeader {
  readonly title: string;
  readonly project: string;
  readonly relativePath: string;
  readonly branch: string | null;
  readonly nextStep: NextStepModel | null;
  readonly tiles: readonly [PanelTile, PanelTile, PanelTile];
}

/** The document path relative to the workspace root, with forward slashes
 * on every platform. `node:path`'s `relative` uses the host's separator
 * (`\` on Windows), and the rendered subtitle must not change shape
 * between platforms, so any backslash is normalized to `/` regardless of
 * which platform this code is actually running on. */
function relativeSlashPath(workspaceRoot: string, documentPath: string): string {
  return relative(workspaceRoot, documentPath).replace(/\\/g, '/');
}

function formatProgressTile(model: FeatureModel): PanelTile {
  const { done, total, percentage } = model.progress;
  // Zero items is the absence of measured progress, not a measurement of
  // zero: rendering "0/0 · 0%" would claim a ratio the document never
  // recorded. deriveChecklistState already refuses to call zero items
  // 100%; this tile refuses to call it a measured 0% either.
  const value = total === 0 ? NOT_RECORDED : `${done}/${total} · ${percentage}%`;
  return { label: 'PROGRESS', value };
}

function formatUnprovenTile(model: FeatureModel): PanelTile {
  const count = model.progress.doneUnproven;
  const value = count === 0 ? 'none' : `${count} task${count === 1 ? '' : 's'}`;
  return { label: 'UNPROVEN', value };
}

/** `lastWork` is the seam T13 fills with a git-derived date (`git log
 * --follow` over the document, per the PRD). Left absent, the tile states
 * "not recorded" rather than guessing a date or rendering blank — git
 * history is not read anywhere in this task. */
function formatLastWorkTile(lastWork: string | null): PanelTile {
  return { label: 'LAST WORK', value: lastWork ?? NOT_RECORDED };
}

/**
 * Builds the detail panel's header data. `workspaceRoot` is the folder the
 * document was discovered under (see discoverFeatureDocuments), used for
 * the subtitle's project name and repo-relative path.
 *
 * `lastWork` is T13's seam: an optional already-formatted date string,
 * defaulting to `null` so the LAST WORK tile states its absence until git
 * history is read.
 */
export function buildPanelHeader(
  model: FeatureModel,
  workspaceRoot: string,
  lastWork: string | null = null,
): PanelHeader {
  return {
    // The document's H1 wording varies too much across the real corpus to
    // use as a title (docs/PRD.md's survey evidence backs this). The
    // feature name from the filename is what discovery and the tree
    // already key on, so the panel's title stays the same identity as the
    // tree node that opened it, never the document's own free-text H1.
    title: model.featureName,
    project: basename(workspaceRoot),
    relativePath: relativeSlashPath(workspaceRoot, model.documentPath),
    branch: model.branch,
    nextStep: model.nextStep,
    tiles: [formatProgressTile(model), formatUnprovenTile(model), formatLastWorkTile(lastWork)],
  };
}
