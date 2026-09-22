/**
 * The single source of truth for which VS Code colour-registry token, if
 * any, each derived checklist state and each rollup state (see filter-
 * and-order-features.ts) renders with. A token here is a plain colour-
 * registry id (e.g. `'testing.iconPassed'`), never a literal colour: the
 * tree's TaskNode/SectionNode/FeatureNode turn a token into a
 * `vscode.ThemeColor`, and the detail panel's CSS turns the same token
 * into the matching `--vscode-<id>` custom property via themeColorCssVar
 * below, so neither adapter carries its own copy of this mapping and the
 * tree and the panel always agree on what a state looks like.
 *
 * Plain data — no dependency on the editor API or the filesystem, same
 * boundary as the rest of src/domain/.
 */

import type { DerivedItemState } from './derive-checklist-state';
import type { RollupState } from './filter-and-order-features';

/** A VS Code colour-registry token id, e.g. `'testing.iconPassed'` or
 * `'editorWarning.foreground'`. Never a hex value, an `rgb()` triple, or a
 * named CSS colour — only a token another VS Code theme can re-map. */
export type ThemeColorToken = string;

/**
 * `open` carries no token on purpose: outstanding work should read
 * neutral rather than draw the eye, so it inherits whatever foreground
 * colour its node would otherwise have.
 *
 * `done` gets the same green VS Code's own test explorer uses for a
 * passing test — the closest existing "this succeeded" vocabulary VS Code
 * ships, and one every theme (including every high-contrast theme) already
 * has to define a value for.
 *
 * `done-unproven` deliberately does not share `done`'s green. A checked
 * box that records no evidence and no commit is exactly the gap this
 * product exists to surface, so it takes the warning family instead — a
 * caution about missing proof, not a failure.
 *
 * `declined` reuses `disabledForeground`, the same muted token this
 * codebase already uses elsewhere for "as close to archived as this gets".
 *
 * `unknown` takes the sibling error family to done-unproven's warning one.
 * An unrecognized checklist marker is a genuine parsing anomaly — this
 * item asserts nothing the tree can classify at all, a stronger anomaly
 * than a checked-but-unproven box — while still reading as "this was not
 * understood", the way a Problems-panel error icon does for a marker the
 * grammar has no name for, rather than "a build failed".
 */
export const STATE_COLOR_TOKEN: Record<DerivedItemState, ThemeColorToken | undefined> = {
  open: undefined,
  done: 'testing.iconPassed',
  'done-unproven': 'problemsWarningIcon.foreground',
  declined: 'disabledForeground',
  unknown: 'problemsErrorIcon.foreground',
};

/**
 * The rollup colour a section or feature node takes once every item
 * beneath it is closed (see deriveSectionRollupState/
 * deriveFeatureRollupState in filter-and-order-features.ts).
 *
 * `unproven` deliberately reuses `done-unproven`'s own warning token,
 * never `done`'s green: a node whose children are all closed but include
 * a done-unproven item is hiding exactly the gap this product exists to
 * surface, and colouring it the same green as a genuinely proven node
 * would repeat the checkbox's own lie one level up.
 */
export const ROLLUP_COLOR_TOKEN: Record<RollupState, ThemeColorToken | undefined> = {
  open: STATE_COLOR_TOKEN.open,
  proven: STATE_COLOR_TOKEN.done,
  unproven: STATE_COLOR_TOKEN['done-unproven'],
};

/**
 * The task-state codicon glyph name a rollup node borrows once it is
 * closed, so a glance down the tree reads the same "done" or "still
 * missing proof" shape its leaves already earned, rather than a generic
 * list/checklist glyph that only a colour distinguishes. `open` is left
 * undefined so a node keeps its own default glyph.
 */
export const ROLLUP_ICON_ID: Record<RollupState, string | undefined> = {
  open: undefined,
  proven: 'pass',
  unproven: 'warning',
};

/**
 * Converts a colour-registry token id into the `--vscode-<id>` custom
 * property VS Code injects into every webview — the same substitution
 * rule VS Code itself applies: each `.` in the id becomes a `-`, and
 * nothing else about the id's casing changes (e.g. `editorWarning.
 * foreground` -> `--vscode-editorWarning-foreground`, already the exact
 * convention this panel's stylesheet uses elsewhere). Exported so the
 * detail panel's CSS-string renderer and this module's own tests share
 * one conversion instead of each re-deriving VS Code's naming rule.
 */
export function themeColorCssVar(token: ThemeColorToken): string {
  return `var(--vscode-${token.replace(/\./g, '-')})`;
}
