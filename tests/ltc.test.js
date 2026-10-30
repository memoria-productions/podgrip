"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../engine/ltc.js");

/** Synthesize LTC audio (biphase mark, 48 kHz) for consecutive frames starting at tc, as a camera records it. */
function synth(start, frames, opts) {
  opts = opts || {};
  const rate = 48000, fps = 24000 / 1001, spb = rate / (fps * 80), amp = opts.amp || 18000;
  const out = new Int16Array(Math.ceil((frames + 1) * 80 * spb) + (opts.lead || 0));
  let level = opts.invert ? -1 : 1, pos = opts.lead || 0, f = L.toFrames(start, 24);
  for (let k = 0; k < frames; k++, f++) {
    const s = Math.floor(f / 24), tc = { f: f % 24, s: s % 60, m: Math.floor(s / 60) % 60, h: Math.floor(s / 3600) % 24 };
    const bits = new Array(80).fill(0), put = (o, c, v) => { for (let q = 0; q < c; q++) bits[o + q] = (v >> q) & 1; };
    put(0, 4, tc.f % 10); put(8, 2, Math.floor(tc.f / 10)); put(16, 4, tc.s % 10); put(24, 3, Math.floor(tc.s / 10));
    put(32, 4, tc.m % 10); put(40, 3, Math.floor(tc.m / 10)); put(48, 4, tc.h % 10); put(56, 2, Math.floor(tc.h / 10));
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1].forEach((b, j) => { bits[64 + j] = b; });
    for (const b of bits) {
      level = -level; // a transition at the start of every bit
      const a = Math.round(pos), mid = Math.round(pos + spb / 2), e = Math.round(pos + spb);
      for (let i = a; i < mid; i++) out[i] = level * amp;
      if (b) level = -level; // and one in the middle of a "1"
      for (let i = mid; i < e; i++) out[i] = level * amp;
      pos += spb;
    }
  }
  if (opts.noise) for (let i = 0; i < out.length; i++) out[i] += Math.round((Math.random() - 0.5) * opts.noise);
  return out;
}

test("ltc: decodes the timecode words of a clean signal", () => {
  const words = L.decode(synth({ h: 10, m: 6, s: 41, f: 0 }, 40));
  // The very first word can be lost (no edge before its first bit); every one after it is read, in order.
  assert.ok(words.length >= 38, "found " + words.length);
  const first = L.toFrames(words[0].tc, 24) - L.toFrames({ h: 10, m: 6, s: 41, f: 0 }, 24);
  assert.ok(first === 0 || first === 1, "starts at frame " + first);
  words.forEach((w, i) => assert.equal(L.toFrames(w.tc, 24), L.toFrames(words[0].tc, 24) + i));
});

test("ltc: polarity, level, noise and a silent lead-in don't matter", () => {
  const words = L.decode(synth({ h: 0, m: 54, s: 15, f: 10 }, 40, { invert: true, amp: 3000, noise: 1500, lead: 4800 }));
  assert.ok(words.length >= 38, "found " + words.length);
  assert.ok(words.some((w) => w.tc.h === 0 && w.tc.m === 54 && w.tc.s === 15 && w.tc.f === 11));
});

test("ltc: first-frame timecode carries back through the clip's start, minus the calibration frame", () => {
  // A word starting 0.5 s into the read, read from 2 s into the clip: the clip began 2.5 s (≈60 frames) earlier.
  const pcm = synth({ h: 0, m: 0, s: 3, f: 14 }, 40, { lead: 24000 });
  const r = L.firstFrame(L.decode(pcm), 2.0);
  const expect = L.toFrames({ h: 0, m: 0, s: 3, f: 14 }, 24) - Math.round(2.5 * 24000 / 1001) + L.CALIBRATE_FRAMES;
  assert.equal(r.frames, expect);
  assert.equal(r.agree, r.of);
  assert.equal(L.firstFrame(L.decode(pcm), 2.0, { raw: true }).frames, expect - L.CALIBRATE_FRAMES);
});

test("ltc: wraps around midnight", () => {
  const r = L.firstFrame(L.decode(synth({ h: 0, m: 0, s: 0, f: 2 }, 30)), 1.0);
  // 00:00:00:02, 1 s (24 frames) into the clip, minus the calibration frame
  assert.equal(L.format(r.frames), "23:59:59:01");
});

test("ltc: noise alone gives no timecode", () => {
  const pcm = new Int16Array(48000 * 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round((Math.random() - 0.5) * 2000);
  assert.deepEqual(L.decode(pcm), []);
  assert.equal(L.firstFrame([], 0), null);
});

test("ltc: format and parse round-trip", () => {
  assert.equal(L.format(L.parse("23:59:59:14")), "23:59:59:14");
  assert.equal(L.format(-1), "23:59:59:23");
  assert.equal(L.parse("00:54:15:10"), ((54 * 60) + 15) * 24 + 10);
});
