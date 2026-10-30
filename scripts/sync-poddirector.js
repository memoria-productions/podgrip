#!/usr/bin/env node
/*
 * Refresh the engine modules and tools shared with PodDirector (copied, not linked, so the plugin bundles cleanly).
 *
 *   node scripts/sync-poddirector.js [path to the poddirector repo]
 *
 * Copies them from the poddirector working tree and records its commit (and whether it had local changes) in
 * engine/PODDIRECTOR.txt. Don't edit the copied files here: change them in PodDirector and sync again.
 */
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");

const src = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "#poddirector"));
const dst = path.join(__dirname, "..");
const FILES = ["engine/analyzer.js", "engine/director.js", "engine/motion.js", "engine/framing.js", "engine/transcript.js",
  "engine/transcriber.js", "engine/keys.js", "tools/prproj.js", "tools/analyze_past.js"];

if (!fs.existsSync(path.join(src, "engine", "director.js"))) { console.error("PodDirector not found at " + src); process.exit(1); }
const git = (a) => { try { return cp.execFileSync("git", a, { cwd: src, encoding: "utf8" }).trim(); } catch (e) { return ""; } };
const commit = git(["rev-parse", "--short", "HEAD"]);
const dirty = git(["status", "--short", "--", "engine", "tools"]);
let changed = 0;
FILES.forEach((f) => {
  const a = fs.readFileSync(path.join(src, f)), to = path.join(dst, f);
  if (fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0) return;
  fs.writeFileSync(to, a); changed++; console.log("updated " + f);
});
const version = (/VERSION\s*[:=]\s*"([^"]+)"/.exec(fs.readFileSync(path.join(src, "engine", "director.js"), "utf8")) || [])[1];
fs.writeFileSync(path.join(dst, "engine", "PODDIRECTOR.txt"),
  "Shared files copied from PodDirector " + version + " (commit " + commit + (dirty ? ", with uncommitted changes:\n" + dirty : "") + ")\n" +
  "Refresh with: node scripts/sync-poddirector.js\n\n" + FILES.join("\n") + "\n");
console.log(changed + " file(s) updated from PodDirector " + version + " (" + commit + (dirty ? ", uncommitted changes" : "") + ")");
