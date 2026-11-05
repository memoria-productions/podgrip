"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const LUT = require("../lib/luts.js");

test("luts: the show's color folder is #global, next to the season folders", () => {
  const ep = path.join("M:", "classical_et_cetera", "2026", "20261030_246_old_jack");
  assert.equal(LUT.defaultFolder(ep), path.join("M:", "classical_et_cetera", "#global", "media", "generated", "color"));
});

test("luts: the LUTs in a folder, and which one is offered", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-lut-"));
  try {
    ["cetc_showlut_v2.cube", "2024_slog3_set_custom.cube", "notes.txt", "CinemaGamut_CanonLog3-to-Canon709_65_Ver.1.0.cube"].forEach((f) => fs.writeFileSync(path.join(dir, f), ""));
    const names = LUT.list(dir);
    assert.deepEqual(names, ["2024_slog3_set_custom.cube", "cetc_showlut_v2.cube", "CinemaGamut_CanonLog3-to-Canon709_65_Ver.1.0.cube"]);
    assert.equal(LUT.pick(names, null), "2024_slog3_set_custom.cube", "the show LUT by default");
    assert.equal(LUT.pick(names, "cetc_showlut_v2.cube"), "cetc_showlut_v2.cube", "the one chosen before");
    assert.equal(LUT.pick(names, "gone.cube"), "2024_slog3_set_custom.cube");
    assert.equal(LUT.pick(["a.cube"], null), "a.cube");
    assert.equal(LUT.pick([], null), null);
    assert.deepEqual(LUT.list(path.join(dir, "missing")), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("luts: saturation is 0–200, or empty to leave it alone", () => {
  assert.equal(LUT.saturation("90"), 90);
  assert.equal(LUT.saturation(" "), null);
  assert.ok(isNaN(LUT.saturation("250")));
  assert.ok(isNaN(LUT.saturation("lots")));
});
