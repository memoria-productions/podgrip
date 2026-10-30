"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine/sync.js"), A = require("../engine/assemble.js"), X = require("../engine/xml.js");
const { tc, WIDE, TELE, wav, cam, ep243 } = require("./ep243.js");

test("assemble: nests are named as David names them: b = the wide, a = the dolly, then c, d…", () => {
  assert.deepEqual(A.nestNames(S.plan(ep243(), { date: "261012" }), "243"), ["243_b_cam", "243_a_cam"]);
  const three = S.plan([wav("261012_001.WAV", tc(9, 0, 0), 50000), cam("x_1.MP4", "A7S3_1", WIDE, tc(9, 0, 1), 49000),
    cam("x_2.MP4", "A7S3_2", TELE, tc(9, 0, 1), 48000), cam("x_3.MP4", "A7S3-3", TELE, tc(9, 0, 1), 40000)]);
  assert.deepEqual(A.nestNames(three, "250"), ["250_b_cam", "250_a_cam", "250_c_cam"]);
});

test("assemble: one XML holds the synced sequence, the camera nests, the multicam and the main sequence", () => {
  const p = S.plan(ep243(), { date: "261012" });
  const doc = X.parse(A.xml(p, { ep: "243" }));
  const seqs = X.kids(X.child(doc, "xmeml"), "sequence");
  assert.deepEqual(seqs.map((s) => X.textOf(s, "name")), ["classical_et_cetera_243 (Sync)", "classical_et_cetera_243"]);
  const main = seqs[1], mc = X.child(main, "media/video/track/clipitem/multiclip");
  assert.equal(X.textOf(mc, "name"), "243_mc");
  const angles = X.kids(mc, "angle");
  assert.deepEqual(angles.map((a) => X.textOf(a, "name")), ["243_b_cam", "243_a_cam"]);
  assert.equal(X.textOf(angles[0], "activevideoangle"), "TRUE");
  const nest = X.child(angles[1], "clip/media/video/track/clipitem/sequence");
  assert.equal(X.textOf(nest, "name"), "243_a_cam");
  assert.equal(X.kids(X.child(nest, "media/audio"), "track").length, 0, "the nests carry no audio");
  assert.deepEqual(X.kids(X.child(nest, "media/video/track"), "clipitem").map((c) => X.textOf(c, "start")),
    p.video[1].clips.map((c) => String(c.start)), "camera clips keep their synced positions");
  const audio = X.kids(X.child(main, "media/audio"), "track");
  assert.equal(audio.length, 4, "mics 1–4 on A1–A4; the empty channel 5 left off");
  assert.equal(X.kids(X.kids(audio[0], "clipitem")[0], "link").length, 4);
  const ids = X.all(doc, "clipitem").map((c) => c.attrs.id);
  assert.equal(new Set(ids).size, ids.length, "clipitem ids are unique across the document");
  assert.equal(X.all(doc, "file").filter((f) => f.children.length).length, 6, "each file defined once");
});

test("assemble: the synced sequence inside is the same one sync writes", () => {
  const XM = require("../engine/xmeml.js");
  const p = S.plan(ep243(), { date: "261012" });
  const alone = X.child(X.parse(XM.write(p, { name: "classical_et_cetera_243 (Sync)" })), "xmeml/sequence");
  const inside = X.kids(X.child(X.parse(A.xml(p, { ep: "243" })), "xmeml"), "sequence")[0];
  const shape = (s) => X.all(s, "clipitem").map((c) => X.textOf(c, "name") + "@" + X.textOf(c, "start"));
  assert.deepEqual(shape(inside), shape(alone));
});
