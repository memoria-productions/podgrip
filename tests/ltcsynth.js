"use strict";
// Shared test helper: synthetic LTC audio, as the F6 feeds it into a camera's audio channel 1.
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

module.exports = { synth };
