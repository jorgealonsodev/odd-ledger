/**
 * Renders a document's own Markdown prose (evidence lines, the Objective/
 * Problem region, and the panel's other recognized sections) to HTML for
 * the detail panel. Every byte handed to this module can come from a
 * Markdown file in a repository the user merely cloned, never one they
 * wrote themselves, so the renderer is configured defensively rather than
 * trusted at its defaults:
 *
 *  - `html: false` — a raw `<tag>` in the source is escaped by the
 *    renderer's own output pass, not passed through. This is the primary
 *    control; the caller's Content-Security-Policy (no scripts at all) is
 *    a second, independent layer, not a substitute for this one.
 *  - `linkify: false` — a bare URL in the text is never auto-turned into a
 *    link. Only an explicit Markdown link (`[text](url)`) can produce one
 *    at all, and even then only through validateLink below.
 *  - `validateLink` is replaced with an allowlist (`http:`, `https:`,
 *    `mailto:`) rather than markdown-it's own default blocklist. A
 *    blocklist has to name every dangerous scheme (`javascript:`,
 *    `vbscript:`, `data:`, `file:`, `vscode:`, `command:`, ...) and stays
 *    exposed to the next one nobody thought to add; an allowlist of the
 *    three schemes this panel actually has a legitimate use for closes
 *    that gap by construction. A link with any other scheme, or no scheme
 *    at all (a relative or local path), is rejected and renders as
 *    literal, escaped text instead of an anchor.
 *  - The `image` rule is disabled outright. The CSP's `default-src 'none'`
 *    would already block an image request, but that is a reason not to
 *    rely on it being the only thing standing in the way — the renderer
 *    itself never emits an `<img>` tag in the first place.
 *
 * No dependency on vscode or the filesystem — a pure text-to-HTML
 * transform, same boundary as the rest of src/domain/.
 */

import MarkdownIt from 'markdown-it';

/** Schemes this panel treats as safe enough to link out to. Everything
 * else — including a bare relative path, which resolves to nothing
 * meaningful inside a webview anyway — is rejected. Checked against the
 * trimmed url's own leading scheme, case-insensitively, matching how
 * markdown-it's own default validator reads a link's protocol. */
const ALLOWED_LINK_PROTOCOL_RE = /^(https?|mailto):/i;

function validateLink(url: string): boolean {
  return ALLOWED_LINK_PROTOCOL_RE.test(url.trim());
}

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
});
markdown.validateLink = validateLink;
// No images: default-src 'none' would already refuse to load one, but the
// renderer itself never emits the <img> tag in the first place — defence
// in depth is the point, not a single layer relied on to hold alone.
markdown.disable(['image']);

/**
 * Renders `text` (already prepared with prepareEvidenceMarkdown, or any
 * other already-dedented Markdown source) to an HTML fragment safe to
 * embed inside this extension's script-free webview.
 */
export function renderMarkdown(text: string): string {
  return markdown.render(text);
}
