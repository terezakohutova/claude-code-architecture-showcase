// Shared house-style rules: which files count as customer-facing copy, and
// what is banned inside them. Used by two callers so they can never drift
// apart:
//   - .claude/hooks/style-guard.js   (blocks a Write/Edit at write time)
//   - scripts/style-check.js         (the same check on demand, run by the
//                                     brand-voice-reviewer agent and by hand)
// See Feedback/no-marketing-superlatives.md for why the rules exist.

const path = require("path");

// Customer-facing copy lives here and nowhere else. A path outside these
// folders (Log/, TODO.md, Feedback/, Inventory/inventory-*.md, docs) is
// internal writing and is not checked: a log entry may quote a buyer, a
// rule file has to quote the list it bans.
const COPY_DIRS = ["Inventory/listings/", "Copy/"];
const COPY_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".csv", ".json"]);
// Never copy, even if someone later adds a copy folder that overlaps them.
const EXEMPT_PREFIXES = ["Log/", "Feedback/", ".claude/"];
const EXEMPT_FILES = new Set(["TODO.md"]);

// Phrase-level, not bare words, where the bare word has an honest use in
// this trade: "Revolutionary War era" is a provenance fact, "you must have
// the receipt" is an instruction. Only the editorializing use is banned.
const BANNED_PHRASES = [
  { label: "best in class", re: /\bbest[- ]in[- ]class\b/i },
  { label: "revolutionary", re: /\brevolutionary\b(?!\s+(war|era|period|army|france|french|america|american)\b)/i },
  { label: "game changer", re: /\bgame[- ]chang(er|ers|ing)\b/i },
  { label: "must-have", re: /\b(?:(?:a|an|the|this|your|real|true|ultimate|absolute)\s+must[- ]have|must[- ]have\s+(?:piece|item|addition|accessory|for))\b/i },
  { label: "unparalleled", re: /\bunparalleled\b/i },
];

// Built from character codes (8211 = en dash, 8212 = em dash) so no source
// file contains the glyphs it bans.
const DASHES = [
  { label: "en dash (U+2013)", ch: String.fromCharCode(8211) },
  { label: "em dash (U+2014)", ch: String.fromCharCode(8212) },
];

function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

// rel: path relative to the workspace root, forward slashes.
function isCustomerCopy(rel) {
  if (!rel || rel.startsWith("../") || rel === ".." || path.isAbsolute(rel)) return false;
  if (EXEMPT_FILES.has(rel) || EXEMPT_PREFIXES.some((p) => rel.startsWith(p))) return false;
  if (!COPY_EXTENSIONS.has(path.extname(rel).toLowerCase())) return false;
  return COPY_DIRS.some((d) => rel.startsWith(d));
}

// Quoted material is not the shop speaking: fenced code, inline code spans
// and Markdown blockquotes are blanked out (same length, newlines kept, so
// line numbers in findings stay right).
function stripQuoted(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return text
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/^ {0,3}>.*$/gm, blank);
}

function lineOf(text, idx) {
  return text.slice(0, idx).split("\n").length;
}

function snippet(text, idx, len) {
  return text.slice(Math.max(0, idx - 30), idx + len + 30).replace(/\s+/g, " ").trim();
}

// Returns every finding as {line, kind, label, near}. original is used for
// the snippet so the message quotes what was actually written.
function findViolations(original) {
  const text = stripQuoted(original);
  const out = [];
  for (const d of DASHES) {
    let idx = text.indexOf(d.ch);
    while (idx !== -1) {
      out.push({ line: lineOf(text, idx), kind: "dash", label: d.label, near: snippet(original, idx, 1), index: idx });
      idx = text.indexOf(d.ch, idx + 1);
    }
  }
  for (const p of BANNED_PHRASES) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
    for (const m of text.matchAll(re)) {
      out.push({ line: lineOf(text, m.index), kind: "phrase", label: p.label, near: snippet(original, m.index, m[0].length), index: m.index, match: m[0] });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function describe(v) {
  return v.kind === "dash"
    ? `${v.label} found near: "${v.near}"`
    : `banned superlative "${v.match}" found near: "${v.near}"`;
}

module.exports = { COPY_DIRS, COPY_EXTENSIONS, isCustomerCopy, findViolations, describe, toPosix, stripQuoted };
