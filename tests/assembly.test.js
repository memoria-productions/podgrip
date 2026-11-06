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
    const prep = { id: "243", show: "classical_et_cetera", plan: episode, promos, markers: [], inTemplate: true, names: A.names(episode, "243", true, "classical_et_cetera") };
    const file = LA.write(prep, dir);
    assert.equal(path.basename(file), "classical_et_cetera_243_assembly.xml");
    const names = X.kids(X.child(X.parse(fs.readFileSync(file, "utf8")), "xmeml"), "sequence").map((s) => X.textOf(s, "name"));
    assert.deepEqual(names, ["classical_et_cetera_243 (Sync)", "classical_et_cetera_243 promos (Sync)", "243_b_cam", "243_a_cam", "classical_et_cetera_243 (Program)"]);
    assert.ok(!names.includes("classical_et_cetera_243"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("assembly: another show's episode is named after that show, not Classical et cetera", () => {
  const { episode, promos } = S.split(ep243(), { date: "261012" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-"));
  try {
    const prep = { id: "015", show: "margin_notes", plan: episode, promos, markers: [], inTemplate: true, names: A.names(episode, "015", true, "margin_notes") };
    const file = LA.write(prep, dir);
    assert.equal(path.basename(file), "margin_notes_015_assembly.xml");
    const text = fs.readFileSync(file, "utf8");
    assert.deepEqual(X.kids(X.child(X.parse(text), "xmeml"), "sequence").map((s) => X.textOf(s, "name")),
      ["margin_notes_015 (Sync)", "margin_notes_015 promos (Sync)", "015_b_cam", "015_a_cam", "margin_notes_015 (Program)"]);
    assert.ok(!/classical_et_cetera/.test(text));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("assembly: the show's name comes from the project file, before the episode number", () => {
  assert.equal(LA.showFromProject("M:\\x\\margin_notes_015_25.2.prproj", "015"), "margin_notes");
  assert.equal(LA.showFromProject("M:\\x\\classical_et_cetera_245.prproj", "245"), "classical_et_cetera");
  assert.equal(LA.showFromProject("M:\\x\\classical_et_cetera_247_25.2.prproj", "247"), "classical_et_cetera", "a copy of the renamed template");
  assert.equal(LA.showFromProject("M:\\x\\classical_et_ceterea_243_25.2.prproj", "243"), "classical_et_ceterea", "past episodes: as typed in the file name");
  assert.equal(LA.showFromProject("M:\\x\\margin_notes_###_25.2.prproj", "015"), "margin_notes", "an unrenamed template copy");
  assert.equal(LA.showFromProject("M:\\x\\margin_notes_25.2.prproj", "015"), "margin_notes", "no number: the version is dropped");
  assert.equal(LA.showFromProject("M:\\x\\margin_notes_0150.prproj", "015"), "margin_notes", "015 must stand alone, else the trailing number goes");
  assert.equal(LA.showFromFolder(path.join("M:", "#serial", "margin_notes", "2026", "20260811_015_nightingale")), "margin_notes");
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
