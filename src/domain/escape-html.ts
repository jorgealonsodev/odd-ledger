/**
 * Escapes the five characters that matter for safe interpolation into HTML
 * text content and attribute values: `&`, `<`, `>`, `"` and `'`. The detail
 * panel (T10) uses this for every value that ultimately comes from a file
 * on disk — a feature name, a path, a branch name, a next-step line — so
 * none of it can inject markup into the webview.
 *
 * Plain string transformation, no dependency on the editor API or the
 * filesystem, same boundary as the rest of src/domain/. Lives here rather
 * than in the adapter so it is unit-tested with `node --test`.
 *
 * `&` is replaced first, and before every other replacement: escaping any
 * other character first would leave its own replacement's `&` to be
 * escaped a second time.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
