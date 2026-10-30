"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const LA = require("../lib/assembly.js"), S = require("../engine/sync.js"), A = require("../engine/assemble.js"), X = require("../engine/xml.js");
const { ep243 } = require("./ep243.js");

test("assembly: the episode folder is found above the project, by its yyyymmdd_###_title name", () => {
  const ep = path.join("M:", "2026", "20261026_245_once_idea_lit");
  assert.equal(LA.episodeDir(path.join(ep, "project_files", "premiere", "classical_et_cetera_245.prproj")), ep);
  assert.equal(LA.episodeDir(path.join(ep, "peoject_files", "premiere", "x.prproj")), ep, "typos in the subfolders don't matter");
  assert.equal(LA.episodeDir(path.join("C:", "Users", "david", "Desktop", "scratch.prproj")), null);
});

test("assembly: in the template, the ready-made sequence is '(Program)' so it doesn't clash with the renamed main sequence", () => {
  const { episode, promos } = S.split(ep243(), { date: "261012" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-"));
  try {
    const prep = { id: "243", plan: episode, promos, markers: [], inTemplate: true, names: A.names(episode, "243", true) };
    const file = LA.write(prep, dir);
    assert.equal(path.basename(file), "classical_et_cetera_243_assembly.xml");
    const names = X.kids(X.child(X.parse(fs.readFileSync(file, "utf8")), "xmeml"), "sequence").map((s) => X.textOf(s, "name"));
    assert.deepEqual(names, ["classical_et_cetera_243 (Sync)", "classical_et_cetera_243 promos (Sync)", "243_b_cam", "243_a_cam", "classical_et_cetera_243 (Program)"]);
    assert.ok(!names.includes("classical_et_cetera_243"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("assembly: ffmpeg is found from an explicit path first, and falls back to PATH", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-")), "ffmpeg.exe");
  fs.writeFileSync(f, "");
  try { assert.equal(LA.findFfmpeg(null, f), f); } finally { fs.rmSync(path.dirname(f), { recursive: true, force: true }); }
  const saved = { APPDATA: process.env.APPDATA, FFMPEG: process.env.FFMPEG };
  process.env.APPDATA = path.join(os.tmpdir(), "podgrip-no-such-appdata"); delete process.env.FFMPEG;
  try { assert.equal(LA.findFfmpeg(path.join(os.tmpdir(), "podgrip-no-ext")), "ffmpeg"); }
  finally { process.env.APPDATA = saved.APPDATA; if (saved.FFMPEG !== undefined) process.env.FFMPEG = saved.FFMPEG; }
});
