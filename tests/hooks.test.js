// Runs every hook in .claude/hooks/ the way Claude Code does: a JSON payload
// on stdin, a decision (or nothing) on stdout, exit code checked. Each test
// gets a throwaway copy of the workspace in the OS temp folder, because the
// hooks locate the workspace root from their own path and version-snapshot
// writes files.
//
// Run: node --test tests/hooks.test.js   (Node 18.17+, no dependencies)

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
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
  fs.mkdirSync(path.join(root, "Inventory", "listings"), { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# index\n");
  fs.writeFileSync(path.join(root, "Feedback", "INDEX.md"), "# Feedback index\n");
  fs.writeFileSync(path.join(root, "Inventory", "inventory-status.md"), "# status\n");
  return root;
}

// The hooks look at Claude Code's config folder (~/.claude) and the OS temp
// folder. Tests point both at throwaway folders, so a developer's real
// ~/.claude and temp layout can't change a result.
const FAKE_CLAUDE = tempDir("hooks-claude-config-");
const FAKE_TMP = tempDir("hooks-tmp-");
const HOOK_ENV = { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE, TMPDIR: FAKE_TMP, TEMP: FAKE_TMP, TMP: FAKE_TMP };
delete HOOK_ENV.CLAUDE_PROJECT_DIR;
delete HOOK_ENV.VERSION_SNAPSHOT_KEEP;

function run(root, hook, payload, extraEnv = {}) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [path.join(root, ".claude", "hooks", hook)], {
    input,
    encoding: "utf8",
    cwd: os.tmpdir(), // hooks must not depend on the process working directory
    env: { ...HOOK_ENV, ...extraEnv },
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

const preToolUse = (root, tool_name, tool_input, cwd = root) => ({
  session_id: "test",
  transcript_path: path.join(root, "transcript.jsonl"),
  cwd,
  hook_event_name: "PreToolUse",
  tool_name,
  tool_input,
});

// Regression test for the bug that made the style rule a paper rule: an
// early version of the hooks printed {"permissionDecision":"deny"} at the
// top level, which Claude Code ignores, so nothing was ever blocked. Every
// deny must use exactly the documented hookSpecificOutput shape.
describe("deny output format", () => {
  test("a deny is exactly {hookSpecificOutput:{hookEventName, permissionDecision, permissionDecisionReason}}", () => {
    const root = makeWorkspace();
    const cases = [
      ["style-guard.js", preToolUse(root, "Write", { file_path: "Inventory/listings/a.md", content: "A revolutionary vase." })],
      ["scope-guard.js", preToolUse(root, "Read", { file_path: "../../x.md" })],
    ];
    for (const [hook, payload] of cases) {
      const out = JSON.parse(run(root, hook, payload).stdout);
      assert.deepEqual(Object.keys(out), ["hookSpecificOutput"], hook);
      assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ["hookEventName", "permissionDecision", "permissionDecisionReason"], hook);
      assert.equal(out.hookSpecificOutput.permissionDecision, "deny", hook);
    }
  });
});

describe("scope-guard.js", () => {
  const root = makeWorkspace();
  const outside = tempDir("hooks-outside-");
  const check = (tool, input, cwd) => decision(run(root, "scope-guard.js", preToolUse(root, tool, input, cwd)));

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
  test("relative paths resolve against the session cwd, not the root", () => {
    const sub = path.join(root, "Inventory");
    assert.equal(check("Read", { file_path: "../CLAUDE.md" }, sub), "none");
    assert.equal(check("Read", { file_path: "../../x.md" }, sub), "deny");
  });
  test("~ expands to the home folder and is denied there", () => {
    assert.equal(check("Read", { file_path: "~/.ssh/id_rsa" }), "deny");
  });
  test("Grep with a path outside is denied", () => {
    assert.equal(check("Grep", { pattern: "x", path: outside }), "deny");
  });
  test("Grep with a relative path climbing out is denied", () => {
    assert.equal(check("Grep", { pattern: "x", path: "../.." }), "deny");
  });
  test("Grep glob filter climbing out is denied", () => {
    assert.equal(check("Grep", { pattern: "x", glob: "../../**" }), "deny");
  });
  test("Grep glob filter inside passes", () => {
    assert.equal(check("Grep", { pattern: "x", glob: "*.md" }), "none");
  });
  test("Glob with an absolute pattern outside is denied", () => {
    assert.equal(check("Glob", { pattern: outside.split(path.sep).join("/") + "/**/*.md" }), "deny");
  });
  test("Glob with a relative pattern inside passes", () => {
    assert.equal(check("Glob", { pattern: "**/*.md" }), "none");
    assert.equal(check("Glob", { pattern: "Inventory/*.md" }), "none");
  });
  test("Glob with a relative ../ pattern is denied", () => {
    assert.equal(check("Glob", { pattern: "../../../**/*.md" }), "deny");
  });
  test("Glob with ../ before the wildcard that stays inside passes", () => {
    assert.equal(check("Glob", { pattern: "Inventory/../Feedback/*.md" }), "none");
  });
  test("Glob with .. after a wildcard is denied (cannot be bounded)", () => {
    assert.equal(check("Glob", { pattern: "**/../../*.md" }), "deny");
  });
  test("Glob with .. inside a brace alternative is denied", () => {
    assert.equal(check("Glob", { pattern: "{Inventory,..}/**" }), "deny");
  });
  test("Glob relative to a path param outside is denied", () => {
    assert.equal(check("Glob", { pattern: "*.md", path: outside }), "deny");
  });
  test("Glob relative to an inside path that climbs out is denied", () => {
    assert.equal(check("Glob", { pattern: "../../**", path: "Inventory" }), "deny");
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

  describe("Claude Code's own files outside the project", () => {
    test("tool results under <config>/projects can be read", () => {
      const toolResult = path.join(FAKE_CLAUDE, "projects", "some-project", "session-1", "tool-results", "out.txt");
      assert.equal(check("Read", { file_path: toolResult }), "none");
    });
    test("memory under <config>/projects can be written", () => {
      assert.equal(check("Write", { file_path: path.join(FAKE_CLAUDE, "projects", "p", "memory", "MEMORY.md"), content: "x" }), "none");
    });
    test("plans and todos can be read and written", () => {
      assert.equal(check("Write", { file_path: path.join(FAKE_CLAUDE, "plans", "plan.md"), content: "x" }), "none");
      assert.equal(check("Read", { file_path: path.join(FAKE_CLAUDE, "todos", "t.json") }), "none");
    });
    test("user-level skills can be read and searched but not written", () => {
      const skill = path.join(FAKE_CLAUDE, "skills", "x", "SKILL.md");
      assert.equal(check("Read", { file_path: skill }), "none");
      assert.equal(check("Glob", { pattern: "**/SKILL.md", path: path.join(FAKE_CLAUDE, "skills") }), "none");
      assert.equal(check("Edit", { file_path: skill, old_string: "a", new_string: "b" }), "deny");
    });
    test("user-level CLAUDE.md can be read", () => {
      assert.equal(check("Read", { file_path: path.join(FAKE_CLAUDE, "CLAUDE.md") }), "none");
    });
    test("settings and credentials under the config folder stay denied", () => {
      assert.equal(check("Read", { file_path: path.join(FAKE_CLAUDE, "settings.json") }), "deny");
      assert.equal(check("Read", { file_path: path.join(FAKE_CLAUDE, ".credentials.json") }), "deny");
      assert.equal(check("Glob", { pattern: "**", path: FAKE_CLAUDE }), "deny");
    });
    test("Claude Code's temp folders (screenshots, scratch) are allowed", () => {
      assert.equal(check("Read", { file_path: path.join(FAKE_TMP, "claude", "shot.png") }), "none");
      assert.equal(check("Write", { file_path: path.join(FAKE_TMP, "claude-123", "x.txt"), content: "x" }), "none");
    });
    test("other temp folders stay denied", () => {
      assert.equal(check("Read", { file_path: path.join(FAKE_TMP, "other", "x.txt") }), "deny");
      assert.equal(check("Read", { file_path: path.join(FAKE_TMP, "x.txt") }), "deny");
      assert.equal(check("Read", { file_path: path.join(FAKE_TMP, "notclaude", "x.txt") }), "deny");
    });
  });
});

describe("style-guard.js", () => {
  const root = makeWorkspace();
  const check = (tool, input, cwd) => decision(run(root, "style-guard.js", preToolUse(root, tool, input, cwd)));
  const write = (file, content) => check("Write", { file_path: path.join(root, file), content });
  const LISTING = "Inventory/listings/MF-0041.md";

  test("banned superlative in a listing is denied", () => {
    assert.equal(write(LISTING, "A truly best-in-class vase."), "deny");
  });
  for (const phrase of ["revolutionary design", "game-changing", "Game changer", "a must have", "a must-have piece", "unparalleled"]) {
    test(`"${phrase}" is denied`, () => assert.equal(write(LISTING, `It is ${phrase}.`), "deny"));
  }
  test("em dash is denied", () => {
    assert.equal(write(LISTING, `Vase ${EM} excellent condition.`), "deny");
  });
  test("en dash is denied", () => {
    assert.equal(write(LISTING, `Active 1920s${EN}1950s.`), "deny");
  });
  test("the deny reason names the problem", () => {
    const r = run(root, "style-guard.js", preToolUse(root, "Write", { file_path: "Copy/reply.md", content: `x ${EM} y` }));
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /em dash \(U\+2014\)/);
  });
  test("clean copy passes silently", () => {
    assert.equal(write(LISTING, "Hollowbrook Pottery vase, excellent condition, documented maker mark."), "none");
  });
  test("honest uses of a banned word pass (phrase-level matching)", () => {
    assert.equal(write(LISTING, "Pewter tankard, Revolutionary War era, maker unknown."), "none");
    assert.equal(write(LISTING, "You must have the original receipt to return it."), "none");
  });
  test("Edit checks new_string, not old_string", () => {
    const f = path.join(root, LISTING);
    assert.equal(check("Edit", { file_path: f, old_string: "x", new_string: "a must-have piece" }), "deny");
    assert.equal(check("Edit", { file_path: f, old_string: "a must-have piece", new_string: "a marked piece" }), "none");
  });
  test("other copy formats under copy folders are checked (.html, .txt, .csv, .json)", () => {
    assert.equal(write("Copy/social/post.html", "<p>An unparalleled lamp</p>"), "deny");
    assert.equal(write("Copy/replies/r.txt", "Thanks! It's revolutionary."), "deny");
    assert.equal(write("Inventory/listings/export.csv", `id,title\nMF-1,Lamp ${EM} brass`), "deny");
    assert.equal(write("Inventory/listings/feed.json", '{"title":"A game changer lamp"}'), "deny");
  });
  test("NotebookEdit new_source under a copy folder is checked", () => {
    assert.equal(check("NotebookEdit", { notebook_path: path.join(root, "Copy", "n.json"), new_source: `a ${EM} b` }), "deny");
  });
  test("internal files are out of scope: Log/, TODO.md, Feedback/, status notes, docs", () => {
    for (const f of ["Log/2026-01.md", "TODO.md", "Feedback/new-rule.md", "Inventory/inventory-status.md", "README.md", "notes.txt"]) {
      assert.equal(write(f, `Buyer wrote: revolutionary ${EM} must-have.`), "none", f);
    }
  });
  test("the rule file itself may quote the banned list", () => {
    assert.equal(write("Feedback/no-marketing-superlatives.md", "Never write revolutionary."), "none");
  });
  test("code files are out of scope, even in a copy folder", () => {
    assert.equal(write("Copy/banned.js", "const BANNED = /revolutionary/;"), "none");
  });
  test("quoted text in backticks, fenced blocks and blockquotes is not the shop speaking", () => {
    assert.equal(write(LISTING, "The maker's 1931 ad called it `revolutionary`."), "none");
    assert.equal(write(LISTING, "Original box text:\n\n> The revolutionary kitchen jar\n\nCondition: good."), "none");
    assert.equal(write(LISTING, "```\nrevolutionary\n```\nCondition: good."), "none");
    assert.equal(write(LISTING, "> quoted\nBut this line is revolutionary."), "deny");
  });
  test("relative path resolves against the session cwd", () => {
    assert.equal(check("Write", { file_path: "MF-1.md", content: "unparalleled" }, path.join(root, "Inventory", "listings")), "deny");
  });
  test("malformed stdin does not block", () => {
    assert.equal(decision(run(root, "style-guard.js", "")), "none");
  });
});

describe("scripts/style-check.js (shared rules, used by brand-voice-reviewer)", () => {
  const script = path.join(REPO, "scripts", "style-check.js");
  const runCheck = (args, input) => spawnSync(process.execPath, [script, ...args], { input, encoding: "utf8", cwd: REPO });

  test("finds every violation with its line number, exit 1", () => {
    const r = runCheck(["-"], `Fine first line.\nA revolutionary vase ${EM} a must-have piece.\n`);
    assert.equal(r.status, 1);
    const lines = r.stdout.trim().split("\n");
    assert.equal(lines.length, 3, r.stdout);
    for (const l of lines) assert.match(l, /^stdin:2: /);
  });
  test("clean text exits 0", () => {
    const r = runCheck(["-"], "Hollowbrook vase, excellent condition.\n");
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  test("the published voice examples pass their own check", () => {
    const r = runCheck([path.join("Brand", "voice-examples.md")]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  test("a missing file exits 2", () => {
    assert.equal(runCheck(["does-not-exist.md"]).status, 2);
  });
});

describe("version-snapshot.js", () => {
  const snap = (root, file, env) => run(root, "version-snapshot.js", preToolUse(root, "Edit", { file_path: file }), env);
  const dirOf = (root, rel) => path.join(root, ".versions", ...rel.split("/"));
  const versions = (root, rel) => {
    const dir = dirOf(root, rel);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== "index.jsonl").sort() : [];
  };
  const read = (root, rel, v) => fs.readFileSync(path.join(dirOf(root, rel), v), "utf8");
  const indexOf = (root, rel) =>
    fs.readFileSync(path.join(dirOf(root, rel), "index.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

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
    const kept = versions(root, "Feedback/INDEX.md");
    assert.equal(kept.length, 2);
    assert.equal(read(root, "Feedback/INDEX.md", kept[1]), "# Feedback index\n\n- changed\n");
  });
  test("version names are UTC ISO timestamps, and name order is time order", () => {
    const root = makeWorkspace();
    const file = path.join(root, "CLAUDE.md");
    const before = Date.now();
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(file, `# index ${i}\n`);
      snap(root, file);
    }
    const kept = versions(root, "CLAUDE.md");
    assert.equal(kept.length, 3);
    for (const k of kept) {
      const m = k.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}\.\d{3})Z\.md$/);
      assert.ok(m, k);
      const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
      assert.ok(Math.abs(t - before) < 60000, `${k} is not UTC now`);
    }
    assert.deepEqual(kept.map((k) => read(root, "CLAUDE.md", k)), ["# index 0\n", "# index 1\n", "# index 2\n"]);
  });
  test("index.jsonl records version, time, tool, file, reason, hash, size, session", () => {
    const root = makeWorkspace();
    snap(root, path.join(root, "CLAUDE.md"));
    const [entry] = indexOf(root, "CLAUDE.md");
    assert.equal(entry.event, "snapshot");
    assert.equal(entry.version, versions(root, "CLAUDE.md")[0]);
    assert.ok(entry.at.endsWith("Z") && !Number.isNaN(Date.parse(entry.at)));
    assert.equal(entry.tool, "Edit");
    assert.equal(entry.file, "CLAUDE.md");
    assert.equal(entry.reason, "content before Edit");
    assert.equal(entry.sha256, crypto.createHash("sha256").update("# index\n").digest("hex"));
    assert.equal(entry.bytes, 8);
    assert.equal(entry.session, "test");
  });
  test("retention: keeps only the newest N per file (VERSION_SNAPSHOT_KEEP)", () => {
    const root = makeWorkspace();
    const file = path.join(root, "CLAUDE.md");
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `# v${i}\n`);
      snap(root, file, { VERSION_SNAPSHOT_KEEP: "2" });
    }
    assert.deepEqual(versions(root, "CLAUDE.md").map((k) => read(root, "CLAUDE.md", k)), ["# v3\n", "# v4\n"]);
    const events = indexOf(root, "CLAUDE.md");
    assert.equal(events.filter((e) => e.event === "snapshot").length, 5);
    assert.equal(events.filter((e) => e.event === "pruned").length, 3);
  });
  test("retention default keeps 20", () => {
    const root = makeWorkspace();
    const file = path.join(root, "CLAUDE.md");
    for (let i = 0; i < 22; i++) {
      fs.writeFileSync(file, `# v${i}\n`);
      snap(root, file);
    }
    const kept = versions(root, "CLAUDE.md");
    assert.equal(kept.length, 20);
    assert.equal(read(root, "CLAUDE.md", kept[0]), "# v2\n");
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

  test("unresolved entry: adds context offering procedure-tuner, with approval required", () => {
    const root = makeWorkspace();
    ledger(root, "# Tuning ledger\n\n- [x] 2026-01-01: a - done\n- [ ] 2026-01-02: b - open\n");
    const r = run(root, "tuning-ledger-check.js", sessionStart(root));
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, "SessionStart");
    assert.match(out.additionalContext, /procedure-tuner/);
    assert.match(out.additionalContext, /explicitly approves/);
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
  test("SessionStart fires on a new session only (matcher: startup)", () => {
    assert.deepEqual(settings.hooks.SessionStart.map((g) => g.matcher), ["startup"]);
  });
  test("has a $schema and a permissions block with allow and deny rules", () => {
    assert.equal(settings.$schema, "https://json.schemastore.org/claude-code-settings.json");
    const rule = /^(Bash|Read|Edit|Write|WebFetch|Glob|Grep)(\(.+\))?$/;
    for (const key of ["allow", "deny"]) {
      assert.ok(Array.isArray(settings.permissions[key]) && settings.permissions[key].length > 0, key);
      for (const r of settings.permissions[key]) assert.match(r, rule);
    }
    assert.ok(settings.permissions.deny.includes("Bash(curl:*)"));
    assert.ok(settings.permissions.allow.includes("Bash(node scripts/style-check.js:*)"), "brand-voice-reviewer's one command");
  });
});

describe("agents", () => {
  const tools = (name) =>
    fs.readFileSync(path.join(REPO, ".claude", "agents", name), "utf8")
      .match(/^tools:\s*(.*)$/m)[1].split(",").map((t) => t.trim());
  test("procedure-tuner has no write tools (it proposes diffs, a person approves)", () => {
    for (const t of ["Edit", "Write", "NotebookEdit", "Bash"]) assert.ok(!tools("procedure-tuner.md").includes(t), t);
  });
});
