"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine/sync.js"), A = require("../engine/assemble.js"), XM = require("../engine/xmeml.js"), X = require("../engine/xml.js");
const { tc, WIDE, TELE, wav, cam, ep243 } = require("./ep243.js");

const split243 = () => S.split(ep243(), { date: "261012" });

test("assemble: angles are named as David names his nests: b = the wide, a = the dolly, then c, d…", () => {
  assert.deepEqual(A.angleNames(split243().episode, "243"), ["243_b_cam", "243_a_cam"]);
  const three = S.plan([wav("261012_001.WAV", tc(9, 0, 0), 50000), cam("x_1.MP4", "A7S3_1", WIDE, tc(9, 0, 1), 49000),
    cam("x_2.MP4", "A7S3_2", TELE, tc(9, 0, 1), 48000), cam("x_3.MP4", "A7S3-3", TELE, tc(9, 0, 1), 40000)]);
  assert.deepEqual(A.angleNames(three, "250"), ["250_b_cam", "250_a_cam", "250_c_cam"]);
});

test("assemble: the synced episode, the promos apart, and a multicam of camera clips on the main sequence", () => {
  const { episode, promos } = split243();
  const doc = X.parse(A.xml(episode, { ep: "243", promos }));
  const seqs = X.kids(X.child(doc, "xmeml"), "sequence");
  assert.deepEqual(seqs.map((s) => X.textOf(s, "name")),
    ["classical_et_cetera_243 (Sync)", "classical_et_cetera_243 promos (Sync)", "classical_et_cetera_243"]);
  const main = seqs[2], mc = X.child(main, "media/video/track/clipitem/multiclip");
  assert.equal(X.textOf(mc, "name"), "243_mc");
  const angles = X.kids(mc, "angle");
  assert.deepEqual(angles.map((a) => X.textOf(a, "name")), ["243_b_cam", "243_a_cam"]);
  assert.equal(X.textOf(angles[0], "activevideoangle"), "TRUE");
  // Premiere fails on nested sequences as angles: each angle holds its camera's clips at their synced positions.
  assert.equal(X.all(mc, "sequence").length, 0);
  const items = X.kids(X.child(angles[1], "clip/media/video/track"), "clipitem");
  assert.deepEqual(items.map((c) => X.textOf(c, "name")), ["20261012_A7S3-3_5218.MP4"], "the promo clip _5219 stays out of the episode");
  assert.equal(X.textOf(items[0], "start"), String(episode.video[1].clips[0].start));
  const audio = X.kids(X.child(main, "media/audio"), "track");
  assert.equal(audio.length, 4, "mics 1–4 on A1–A4; the empty channel 5 left off");
  assert.deepEqual(X.kids(audio[0], "clipitem").map((c) => X.textOf(c, "name")), ["261012_001_0001.WAV", "261012_001_0002.WAV"]);
  const ids = X.all(doc, "clipitem").map((c) => c.attrs.id);
  assert.equal(new Set(ids).size, ids.length, "clipitem ids are unique across the document");
  assert.equal(X.all(doc, "file").filter((f) => f.children.length).length, 6, "each file defined once");
});

test("assemble: the synced sequence inside is the same one sync writes", () => {
  const { episode } = split243();
  const alone = X.child(X.parse(XM.write(episode, { name: "classical_et_cetera_243 (Sync)" })), "xmeml/sequence");
  const inside = X.kids(X.child(X.parse(A.xml(episode, { ep: "243" })), "xmeml"), "sequence")[0];
  const shape = (s) => X.all(s, "clipitem").map((c) => X.textOf(c, "name") + "@" + X.textOf(c, "start"));
  assert.deepEqual(shape(inside), shape(alone));
});
