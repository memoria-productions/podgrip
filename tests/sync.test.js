"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine/sync.js"), XM = require("../engine/xmeml.js"), X = require("../engine/xml.js");
const { tc, WIDE, TELE, wav, cam, ep243 } = require("./ep243.js");

test("sync: lays clips out by timecode across midnight, like David's Resolve export of ep 243", () => {
  const p = S.plan(ep243(), { date: "261012" });
  const at = (n) => p.video.flatMap((t) => t.clips).concat(p.wavs).find((c) => c.name === n).start;
  assert.equal(at("261012_001_0001.WAV"), 0);
  assert.equal(at("20261012_A7S3_1_5524.MP4") - at("261012_001_0001.WAV"), 86);   // Resolve: 3094 − 3008
  assert.equal(at("261012_001_0002.WAV"), 53616);                                    // butts onto _0001
  assert.equal(at("20261012_A7S3-3_5219.MP4") - at("261012_002.WAV"), 82);          // Resolve: 79391 − 79309
  assert.ok(at("261012_002.WAV") >= 74352 + 48, "take 2 after take 1, with a gap");
  assert.deepEqual(p.warnings, []);
});

test("sync: the wide (24-70) is V1; the F6 channels give the audio tracks", () => {
  const p = S.plan(ep243(), { date: "261012" });
  assert.equal(p.video[0].body, "A7S3_1"); assert.ok(p.video[0].wide);
  assert.deepEqual(p.video[1].clips.map((c) => c.name), ["20261012_A7S3-3_5218.MP4", "20261012_A7S3-3_5219.MP4"]);
  assert.equal(p.channels, 5);
});

test("sync: two cameras sharing a body name are told apart by lens", () => {
  const clips = [wav("261012_001.WAV", tc(9, 0, 0), 50000),
    cam("20261012_A7S3-3_2985.MP4", "A7S3-3", WIDE, tc(9, 0, 1), 49000),
    cam("20261012_A7S3-3_3657.MP4", "A7S3-3", TELE, tc(9, 0, 2), 49000)];
  const p = S.plan(clips);
  assert.equal(p.video.length, 2);
  assert.ok(p.video[0].wide && p.video[0].clips[0].name.endsWith("2985.MP4"));
});

test("sync: clips without timecode, audio from another day and leftover WAVs are set aside, with warnings", () => {
  const clips = ep243().concat([
    cam("20261012_A7S3_1_5525.MP4", "A7S3_1", WIDE, null, 500),
    wav("261011_001.WAV", tc(14, 0, 0), 1000, { date: "261011" }),
    wav("261012_001_0001 Audio Extracted.wav", null, 1000, { take: null, date: null })
  ]);
  const p = S.plan(clips, { date: "261012" });
  const loose = p.video[0].clips.find((c) => c.name.endsWith("5525.MP4"));
  assert.ok(loose.unsynced && loose.start >= p.wavs[p.wavs.length - 1].start + 2952, "no-timecode clip goes at the end");
  assert.ok(!p.wavs.some((w) => /261011|Extracted/.test(w.name)));
  assert.equal(p.warnings.length, 3);
});

test("sync: a gap between F6 split files is reported", () => {
  const p = S.plan([wav("261012_001_0001.WAV", tc(10, 0, 0), 1000), wav("261012_001_0002.WAV", tc(10, 0, 0) + 1100, 1000)]);
  assert.ok(p.warnings.some((w) => /_0002\.WAV starts 4\.17 s from the end/.test(w)), p.warnings.join("; "));
});

test("xmeml: writes a sequence Premiere can read: tracks, files once, linked audio channels", () => {
  const p = S.plan(ep243(), { date: "261012" });
  const xml = XM.write(p, { name: "classical_et_cetera_243 (Sync)", markers: [{ frame: 10, name: "Check" }] });
  const doc = X.parse(xml), seq = X.child(doc, "xmeml/sequence");
  assert.equal(X.textOf(seq, "name"), "classical_et_cetera_243 (Sync)");
  assert.equal(X.textOf(seq, "rate/timebase"), "24"); assert.equal(X.textOf(seq, "rate/ntsc"), "TRUE");
  assert.equal(X.kids(X.child(seq, "media/video"), "track").length, 2);
  const audio = X.kids(X.child(seq, "media/audio"), "track");
  assert.equal(audio.length, 5);
  const a1 = X.kids(audio[0], "clipitem")[0];
  assert.equal(X.textOf(a1, "sourcetrack/trackindex"), "1");
  assert.equal(X.kids(a1, "link").length, 5);
  // Every file is described once, then referenced by id.
  const files = X.all(seq, "file"), full = files.filter((f) => f.children.length);
  assert.equal(full.length, 6);
  assert.equal(new Set(full.map((f) => f.attrs.id)).size, 6);
  assert.ok(files.every((f) => full.some((g) => g.attrs.id === f.attrs.id)));
  assert.equal(X.textOf(full.find((f) => /5524/.test(f.attrs.id)), "timecode/string"), "23:59:59:14");
  assert.equal(X.textOf(seq, "marker/name"), "Check");
});

test("xmeml: path URLs are escaped the way Resolve writes them", () => {
  assert.equal(XM.pathUrl("M:\\@PRODUCTION\\video\\#serial\\a b\\x.MP4"), "file://localhost/M:/@PRODUCTION/video/%23serial/a%20b/x.MP4");
});

test("xml: parses attributes, entities, self-closing elements and nesting", () => {
  const d = X.parse("<?xml version=\"1.0\"?><a x=\"1 &amp; 2\"><b/><c>t &lt; u</c><c>v</c></a>");
  const a = X.child(d, "a");
  assert.equal(a.attrs.x, "1 & 2");
  assert.equal(X.kids(a, "c").length, 2);
  assert.equal(X.textOf(a, "c"), "t < u");
  assert.ok(X.child(a, "b"));
});
