// Runs every hook in .claude/hooks/ the way Claude Code does: a JSON payload
// on stdin, a decision (or nothing) on stdout, exit code checked. Each test
// gets a throwaway copy of the workspace in the OS temp folder, because the
// hooks locate the workspace root from their own path and version-snapshot
// writes files.
//
// Run: node --test tests/hooks.test.js   (Node 18+, no dependencies)

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..");
const EM = "\u2014";
const EN = "\u2013";

// Every temp folder a test creates is removed when the run ends.
const tempDirs = [];
process.on("exit", () => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});
function tempDir(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tempDirs.push(d);
  return d;
}

function makeWorkspace() {
  const root = tempDir("hooks-test-");
  fs.cpSync(path.join(REPO, ".claude", "hooks"), path.join(root, ".claude", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(root, "Feedback"), { recursive: true });
  fs.mkdirSync(path.join(root, "Inventory"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# index\n");
  fs.writeFileSync(path.join(root, "Feedback", "INDEX.md"), "# Feedback index\n");
  fs.writeFileSync(path.join(root, "Inventory", "inventory-status.md"), "# status\n");
  return root;
}

function run(root, hook, payload) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [path.join(root, ".claude", "hooks", hook)], {
    input,
    encoding: "utf8",
    cwd: os.tmpdir(), // hooks must not depend on the caller's working directory
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function decision(result) {
  assert.equal(result.code, 0, `hook exited ${result.code}: ${result.stderr}`);
  if (result.stdout.trim() === "") return "none";
  const out = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.ok(out.permissionDecisionReason, "a deny must carry a reason");
  return out.permissionDecision;
}

const preToolUse = (root, tool_name, tool_input) => ({
  session_id: "test",
  transcript_path: path.join(root, "transcript.jsonl"),
  cwd: root,
  hook_event_name: "PreToolUse",
  tool_name,
  tool_input,
});

describe("scope-guard.js", () => {
  const root = makeWorkspace();
  const outside = tempDir("hooks-outside-");
  const check = (tool, input) => decision(run(root, "scope-guard.js", preToolUse(root, tool, input)));

  test("absolute path inside the workspace passes silently", () => {
    assert.equal(check("Read", { file_path: path.join(root, "CLAUDE.md") }), "none");
  });
  test("relative path inside the workspace passes", () => {
    assert.equal(check("Write", { file_path: "Inventory/new.md", content: "x" }), "none");
  });
  test("absolute path outside the workspace is denied", () => {
    assert.equal(check("Read", { file_path: path.join(outside, "secret.txt") }), "deny");
  });
  test("../ traversal out of the workspace is denied", () => {
    assert.equal(check("Edit", { file_path: "Inventory/../../elsewhere.md", old_string: "a", new_string: "b" }), "deny");
  });
  test("Grep with a path outside is denied", () => {
    assert.equal(check("Grep", { pattern: "x", path: outside }), "deny");
  });
  test("Glob with an absolute pattern outside is denied", () => {
    assert.equal(check("Glob", { pattern: outside.split(path.sep).join("/") + "/**/*.md" }), "deny");
  });
  test("Glob with a relative pattern passes", () => {
    assert.equal(check("Glob", { pattern: "**/*.md" }), "none");
  });
  test("NotebookEdit outside is denied", () => {
    assert.equal(check("NotebookEdit", { notebook_path: path.join(outside, "n.ipynb"), new_source: "x" }), "deny");
  });
  test("a sibling folder sharing the root's name prefix is denied", () => {
    assert.equal(check("Read", { file_path: root + "-evil" + path.sep + "x.md" }), "deny");
  });
  test("symlink inside the workspace pointing outside is denied", (t) => {
    const link = path.join(root, "escape");
    try {
      fs.symlinkSync(outside, link, "junction");
    } catch (e) {
      t.skip(`cannot create a symlink here: ${e.code}`);
      return;
    }
    assert.equal(check("Read", { file_path: path.join(link, "secret.txt") }), "deny");
  });
  test("Windows: drive letter case does not matter", { skip: process.platform !== "win32" }, () => {
    const lower = root[0].toLowerCase() + root.slice(1);
    assert.equal(check("Read", { file_path: path.join(lower, "CLAUDE.md") }), "none");
  });
  test("malformed stdin does not block (exit 0, no output)", () => {
    assert.equal(decision(run(root, "scope-guard.js", "{not json")), "none");
  });
});

describe("style-guard.js", () => {
  const root = makeWorkspace();
  const check = (tool, input) => decision(run(root, "style-guard.js", preToolUse(root, tool, input)));
  const write = (file, content) => check("Write", { file_path: path.join(root, file), content });

  test("banned superlative in a Write is denied", () => {
    assert.equal(write("Inventory/listing.md", "A truly best-in-class vase."), "deny");
  });
  for (const word of ["revolutionary", "game-changing", "Game changer", "must have", "unparalleled"]) {
    test(`"${word}" is denied`, () => assert.equal(write("Inventory/listing.md", `It is ${word}.`), "deny"));
  }
  test("em dash is denied", () => {
    assert.equal(write("Inventory/listing.md", `Vase ${EM} excellent condition.`), "deny");
  });
  test("en dash is denied", () => {
    assert.equal(write("Inventory/listing.md", `Active 1920s${EN}1950s.`), "deny");
  });
  test("the deny reason names the problem", () => {
    const r = run(root, "style-guard.js", preToolUse(root, "Write", { file_path: "a.md", content: `x ${EM} y` }));
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /em dash \(U\+2014\)/);
  });
  test("clean copy passes silently", () => {
    assert.equal(write("Inventory/listing.md", "Hollowbrook Pottery vase, excellent condition, documented maker mark."), "none");
  });
  test("Edit checks new_string, not old_string", () => {
    const f = path.join(root, "Inventory/listing.md");
    assert.equal(check("Edit", { file_path: f, old_string: "x", new_string: "a must-have piece" }), "deny");
    assert.equal(check("Edit", { file_path: f, old_string: "a must-have piece", new_string: "a marked piece" }), "none");
  });
  test("NotebookEdit new_source is checked", () => {
    assert.equal(check("NotebookEdit", { notebook_path: path.join(root, "n.ipynb"), new_source: `a ${EM} b` }), "deny");
  });
  test("code files are out of scope", () => {
    assert.equal(write("tools/banned.js", "const BANNED = /revolutionary/;"), "none");
  });
  test("the rule file itself may quote the banned list", () => {
    assert.equal(write("Feedback/no-marketing-superlatives.md", "Never write revolutionary."), "none");
  });
  test("malformed stdin does not block", () => {
    assert.equal(decision(run(root, "style-guard.js", "")), "none");
  });
});

describe("version-snapshot.js", () => {
  const snap = (root, file) => run(root, "version-snapshot.js", preToolUse(root, "Edit", { file_path: file }));
  const versions = (root, rel) => {
    const dir = path.join(root, ".versions", ...rel.split("/"));
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== "index.jsonl") : [];
  };

  test("protected file: one version per distinct content, never any stdout", () => {
    const root = makeWorkspace();
    const file = path.join(root, "Feedback", "INDEX.md");
    for (let i = 0; i < 2; i++) {
      const r = snap(root, file);
      assert.equal(r.code, 0);
      assert.equal(r.stdout, "");
    }
    assert.equal(versions(root, "Feedback/INDEX.md").length, 1, "identical content must not be copied twice");

    fs.writeFileSync(file, "# Feedback index\n\n- changed\n");
    snap(root, file);
    const kept = versions(root, "Feedback/INDEX.md").sort();
    assert.equal(kept.length, 2);
    assert.equal(fs.readFileSync(path.join(root, ".versions", "Feedback", "INDEX.md", kept[1]), "utf8"), "# Feedback index\n\n- changed\n");
    assert.match(kept[0], /^\d{8}-\d{6}-\d{3}\.md$/);
    const index = fs.readFileSync(path.join(root, ".versions", "Feedback", "INDEX.md", "index.jsonl"), "utf8").trim().split("\n");
    assert.equal(index.length, 2);
  });
  test("relative path works the same as absolute", () => {
    const root = makeWorkspace();
    snap(root, "CLAUDE.md");
    assert.equal(versions(root, "CLAUDE.md").length, 1);
  });
  test("unprotected file: nothing kept", () => {
    const root = makeWorkspace();
    snap(root, path.join(root, "Inventory", "inventory-status.md"));
    assert.equal(fs.existsSync(path.join(root, ".versions")), false);
  });
  test("new protected file that does not exist yet: nothing kept", () => {
    const root = makeWorkspace();
    snap(root, path.join(root, "Feedback", "new-rule.md"));
    assert.equal(fs.existsSync(path.join(root, ".versions")), false);
  });
  test("malformed stdin does not block", () => {
    const root = makeWorkspace();
    const r = run(root, "version-snapshot.js", "garbage");
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  });
});

describe("tuning-ledger-check.js", () => {
  const sessionStart = (root) => ({
    session_id: "test",
    transcript_path: path.join(root, "t.jsonl"),
    cwd: root,
    hook_event_name: "SessionStart",
    source: "startup",
  });
  const ledger = (root, body) => fs.writeFileSync(path.join(root, ".claude", "TUNING-LEDGER.md"), body);

  test("unresolved entry: adds context telling the session to run procedure-tuner", () => {
    const root = makeWorkspace();
    ledger(root, "# Tuning ledger\n\n- [x] 2026-01-01: a - done\n- [ ] 2026-01-02: b - open\n");
    const r = run(root, "tuning-ledger-check.js", sessionStart(root));
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, "SessionStart");
    assert.match(out.additionalContext, /procedure-tuner/);
  });
  test("only resolved entries: no output", () => {
    const root = makeWorkspace();
    ledger(root, "# Tuning ledger\n\n- [x] 2026-01-01: a - done\n");
    const r = run(root, "tuning-ledger-check.js", sessionStart(root));
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  });
  test("no ledger file: no output", () => {
    const root = makeWorkspace();
    const r = run(root, "tuning-ledger-check.js", sessionStart(root));
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  });
});

describe(".claude/settings.json", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, ".claude", "settings.json"), "utf8"));
  const EVENTS = new Set(["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"]);

  test("every registered command points at an existing hook via $CLAUDE_PROJECT_DIR", () => {
    let count = 0;
    for (const [event, groups] of Object.entries(settings.hooks)) {
      assert.ok(EVENTS.has(event), `unexpected event ${event}`);
      for (const group of groups) {
        if (event.endsWith("ToolUse")) assert.equal(typeof group.matcher, "string");
        for (const h of group.hooks) {
          assert.equal(h.type, "command");
          const m = h.command.match(/^node "\$CLAUDE_PROJECT_DIR\/(\.claude\/hooks\/[\w-]+\.js)"$/);
          assert.ok(m, `command not in the expected form: ${h.command}`);
          assert.ok(fs.existsSync(path.join(REPO, m[1])), `${m[1]} does not exist`);
          count++;
        }
      }
    }
    assert.equal(count, fs.readdirSync(path.join(REPO, ".claude", "hooks")).filter((f) => f.endsWith(".js")).length,
      "every hook file is registered exactly once");
  });
});
