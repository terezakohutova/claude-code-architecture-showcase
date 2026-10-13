// Shared house-style rules: which files count as customer-facing copy, and
// what is banned inside them. Used by two callers so they can never drift
// apart:
//   - .claude/hooks/style-guard.js   (blocks a Write/Edit at write time)
//   - scripts/style-check.js         (the same check on demand, run by the
//                                     brand-voice-reviewer agent and by hand)
// The banned list itself is data, in Feedback/banned-phrases.json, so adding
// a phrase is an edit to one JSON file, not to code. See
// Feedback/no-marketing-superlatives.md for why the rules exist.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PHRASES_FILE = path.join(ROOT, "Feedback", "banned-phrases.json");

// Customer-facing copy lives here and nowhere else. A path outside these
// folders (Log/, TODO.md, Feedback/, Inventory/inventory-*.md, docs) is
// internal writing and is not checked: a log entry may quote a buyer, a
// rule file has to quote the list it bans.
const COPY_DIRS = ["Inventory/listings/", "Copy/"];
const COPY_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".csv", ".json", ".ipynb"]);
// Never copy, even if someone later adds a copy folder that overlaps them.
const EXEMPT_PREFIXES = ["Log/", "Feedback/", ".claude/"];
const EXEMPT_FILES = new Set(["TODO.md"]);

// Loaded on first use. A missing or broken file throws: the callers decide
// what an internal error means (see GUARD_FAIL_CLOSED in style-guard.js).
let phrases = null;
function bannedPhrases() {
  if (!phrases) {
    const data = JSON.parse(fs.readFileSync(PHRASES_FILE, "utf8"));
    if (!Array.isArray(data.phrases) || data.phrases.length === 0) throw new Error(`${PHRASES_FILE} has no phrases`);
    phrases = data.phrases.map((p) => ({ label: p.label, re: new RegExp(p.pattern, "gi") }));
  }
  return phrases;
}

// Built from character codes (8211 = en dash, 8212 = em dash) so no source
// file contains the glyphs it bans.
const DASHES = [
  { label: "en dash (U+2013)", ch: String.fromCharCode(8211) },
  { label: "em dash (U+2014)", ch: String.fromCharCode(8212) },
];

function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

// Windows and macOS file systems ignore case by default, so "copy/x.md" is
// the same file as "Copy/x.md" there and has to be checked the same way.
function caseInsensitive(platform) {
  return platform === "win32" || platform === "darwin";
}

// rel: path relative to the workspace root, forward slashes.
function isCustomerCopy(rel, platform = process.platform) {
  if (!rel || path.isAbsolute(rel)) return false;
  let p = path.posix.normalize(rel);
  if (p.startsWith("../") || p === "..") return false;
  const fold = caseInsensitive(platform) ? (s) => s.toLowerCase() : (s) => s;
  p = fold(p);
  if ([...EXEMPT_FILES].some((f) => fold(f) === p) || EXEMPT_PREFIXES.some((x) => p.startsWith(fold(x)))) return false;
  if (!COPY_EXTENSIONS.has(path.extname(p).toLowerCase())) return false;
  return COPY_DIRS.some((d) => p.startsWith(fold(d)));
}

// Quoted material is not the shop speaking: fenced code and inline code
// spans are blanked out (same length, newlines kept, so line numbers in
// findings stay right). Markdown blockquotes are blanked only when
// blockquotesAreQuotes is set, which callers do for internal notes. In
// customer copy a blockquote is rendered to the buyer as part of the
// listing, so it is checked like any other line.
function stripQuoted(text, { blockquotesAreQuotes = false } = {}) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  let out = text.replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, blank).replace(/`[^`\n]*`/g, blank);
  if (blockquotesAreQuotes) out = out.replace(/^ {0,3}>.*$/gm, blank);
  return out;
}

function lineOf(text, idx) {
  return text.slice(0, idx).split("\n").length;
}

function snippet(text, idx, len) {
  return text.slice(Math.max(0, idx - 30), idx + len + 30).replace(/\s+/g, " ").trim();
}

// Returns every finding as {line, kind, label, near}. original is used for
// the snippet so the message quotes what was actually written.
function findViolations(original, options = {}) {
  const text = stripQuoted(original, options);
  const out = [];
  for (const d of DASHES) {
    let idx = text.indexOf(d.ch);
    while (idx !== -1) {
      out.push({ line: lineOf(text, idx), kind: "dash", label: d.label, near: snippet(original, idx, 1), index: idx });
      idx = text.indexOf(d.ch, idx + 1);
    }
  }
  for (const p of bannedPhrases()) {
    for (const m of text.matchAll(p.re)) {
      out.push({ line: lineOf(text, m.index), kind: "phrase", label: p.label, near: snippet(original, m.index, m[0].length), index: m.index, match: m[0] });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// The text of the markdown cells of a notebook (.ipynb JSON). Code cells
// are not copy. Not a notebook, or not parseable: the raw text is checked.
function notebookMarkdown(raw) {
  let nb;
  try {
    nb = JSON.parse(raw);
  } catch (e) {
    return raw;
  }
  if (!nb || !Array.isArray(nb.cells)) return raw;
  return nb.cells
    .filter((c) => c && c.cell_type === "markdown")
    .map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source || "")))
    .join("\n\n");
}

function describe(v) {
  return v.kind === "dash"
    ? `${v.label} found near: "${v.near}"`
    : `banned superlative "${v.match}" found near: "${v.near}"`;
}

module.exports = { COPY_DIRS, COPY_EXTENSIONS, PHRASES_FILE, isCustomerCopy, findViolations, notebookMarkdown, describe, toPosix, stripQuoted, bannedPhrases };
