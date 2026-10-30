"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine/sync.js"), A = require("../engine/assemble.js"), XM = require("../engine/xmeml.js"), X = require("../engine/xml.js");
const { tc, WIDE, TELE, wav, cam, ep243 } = require("./ep243.js");

const split243 = () => S.split(ep243(), { date: "261012" });
const sequences = (xml) => X.kids(X.child(X.parse(xml), "xmeml"), "sequence");

test("assemble: nests are named as David names them: b = the wide, a = the dolly, then c, d…", () => {
  assert.deepEqual(A.nestNames(split243().episode, "243"), ["243_b_cam", "243_a_cam"]);
  const three = S.plan([wav("261012_001.WAV", tc(9, 0, 0), 50000), cam("x_1.MP4", "A7S3_1", WIDE, tc(9, 0, 1), 49000),
    cam("x_2.MP4", "A7S3_2", TELE, tc(9, 0, 1), 48000), cam("x_3.MP4", "A7S3-3", TELE, tc(9, 0, 1), 40000)]);
  assert.deepEqual(A.nestNames(three, "250"), ["250_b_cam", "250_a_cam", "250_c_cam"]);
});

test("assemble: the synced episode, the promos apart, a nest per camera and the main sequence", () => {
  const { episode, promos } = split243();
  const seqs = sequences(A.xml(episode, { ep: "243", promos }));
  assert.deepEqual(seqs.map((s) => X.textOf(s, "name")), ["classical_et_cetera_243 (Sync)", "classical_et_cetera_243 promos (Sync)",
    "243_b_cam", "243_a_cam", "classical_et_cetera_243"]);
  // No multiclip: Premiere starts every XML angle at its file's first frame, which puts staggered cameras out of sync.
  assert.equal(seqs.flatMap((s) => X.all(s, "multiclip")).length, 0);
});

test("assemble: each nest holds its camera at its synced position from the audio's 0, so In Points sync (no marks) lines them up", () => {
  const { episode } = split243();
  const seqs = sequences(A.xml(episode, { ep: "243" }));
  [["243_b_cam", 0], ["243_a_cam", 1]].forEach(([name, i]) => {
    const nest = seqs.find((s) => X.textOf(s, "name") === name);
    assert.equal(X.kids(X.child(nest, "media/audio"), "track").length, 0, "the nests carry no audio");
    assert.equal(X.textOf(nest, "duration"), String(episode.durationFrames), "every nest runs the episode's length");
    const items = X.kids(X.child(nest, "media/video/track"), "clipitem");
    assert.deepEqual(items.map((c) => [X.textOf(c, "name"), +X.textOf(c, "start"), +X.textOf(c, "in")]),
      episode.video[i].clips.map((c) => [c.name, c.start, 0]));
  });
  // The dolly starts 36 frames (1.50 s) after the wide; David's hand-built 243_mc has 1.46 s.
  assert.equal(episode.video[1].clips[0].start - episode.video[0].clips[0].start, 36);
});

test("assemble: the main sequence has the mics from the audio's 0, V1 left for the multicam, and says how to make it", () => {
  const { episode } = split243();
  const main = sequences(A.xml(episode, { ep: "243" })).pop();
  assert.equal(X.kids(X.child(main, "media/video/track"), "clipitem").length, 0);
  const audio = X.kids(X.child(main, "media/audio"), "track");
  assert.equal(audio.length, 4, "mics 1–4 on A1–A4; the empty channel 5 left off");
  assert.deepEqual(X.kids(audio[1], "clipitem").map((c) => +X.textOf(c, "start")), episode.wavs.map((w) => w.start));
  assert.equal(X.textOf(main, "marker/name"), "Put 243_mc here");
  assert.match(X.textOf(main, "marker/comment"), /243_b_cam and 243_a_cam.*Create Multi-Camera Source Sequence.*In Points/);
});

test("assemble: the synced sequence inside is the same one sync writes", () => {
  const { episode } = split243();
  const alone = X.child(X.parse(XM.write(episode, { name: "classical_et_cetera_243 (Sync)" })), "xmeml/sequence");
  const inside = sequences(A.xml(episode, { ep: "243" }))[0];
  const shape = (s) => X.all(s, "clipitem").map((c) => X.textOf(c, "name") + "@" + X.textOf(c, "start"));
  assert.deepEqual(shape(inside), shape(alone));
});
