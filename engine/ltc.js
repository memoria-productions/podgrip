/*
 * PodGrip — LTC (SMPTE linear timecode) decoder.
 *
 * The Zoom F6's timecode out is split and fed into each camera's mic input, so every Sony clip carries the
 * recorder's timecode as audio on channel 1 (channel 2 is noise; the cameras record no room sound). The cameras'
 * own timecode is a free-running clock per body, which is why Premiere's timecode sync fails. Decoding this
 * channel gives the same timecode Resolve's "Update timecode from media" stamps on the clip (checked on 120 of
 * 125 clips across 37 episodes, after a fixed 1-frame offset: CALIBRATE_FRAMES).
 *
 * Pure JS (decode / firstFrame); readPcm needs Node + ffmpeg.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PodLtc = api;
  else if (root) root.PodLtc = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RATE = 48000;
  /** Resolve's stamp is one frame earlier than the LTC word that starts with the clip. */
  var CALIBRATE_FRAMES = -1;
  var SYNC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];

  /** Mono 16-bit PCM of one channel, from atSec for lenSec (Node + ffmpeg). */
  function readPcm(ffmpeg, file, channel, atSec, lenSec) {
    var cp = require("child_process");
    var r = cp.spawnSync(ffmpeg, ["-v", "error", "-ss", String(atSec || 0), "-t", String(lenSec || 4), "-i", file, "-vn",
      "-af", "pan=mono|c0=c" + ((channel || 1) - 1), "-f", "s16le", "-ar", String(RATE), "-"], { maxBuffer: 1 << 28, windowsHide: true });
    if (r.error) throw r.error;
    var b = r.stdout, out = new Int16Array(Math.floor(b.length / 2));
    for (var i = 0; i < out.length; i++) out[i] = b.readInt16LE(i * 2);
    return out;
  }

  /**
   * Biphase-mark decode. Returns the timecode words found: [{ start: sample index of the word's bit 0,
   * tc: { h, m, s, f } }]. Works on any sign/polarity and level; needs a few frames of signal.
   */
  function decode(pcm) {
    var peak = 0, i;
    for (i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (!peak) return [];
    // Zero crossings, with hysteresis so noise near zero doesn't add edges.
    var th = peak * 0.2, edges = [], state = 0;
    for (i = 0; i < pcm.length; i++) {
      var s = pcm[i] > th ? 1 : pcm[i] < -th ? -1 : 0;
      if (s && s !== state) { if (state) edges.push(i); state = s; }
    }
    if (edges.length < 200) return [];
    // A "0" bit is one full-period interval; a "1" is two half-period ones.
    var iv = [];
    for (i = 1; i < edges.length; i++) iv.push(edges[i] - edges[i - 1]);
    var sorted = iv.slice().sort(function (a, b) { return a - b; }), full = sorted[Math.floor(sorted.length * 0.9)];
    // LTC has only two interval lengths (a bit, half a bit). Noise doesn't: without that shape, there's no LTC here.
    var shaped = iv.filter(function (d) { return (d > full * 0.35 && d < full * 0.65) || (d > full * 0.8 && d < full * 1.2); }).length;
    if (shaped < iv.length * 0.85) return [];
    var bits = [], at = [];
    for (i = 0; i < iv.length; i++) {
      if (iv[i] > full * 0.75) { bits.push(0); at.push(edges[i]); }
      else if (i + 1 < iv.length && iv[i + 1] <= full * 0.75) { bits.push(1); at.push(edges[i]); i++; }
    }
    var words = [];
    for (var k = 64; k + 16 <= bits.length; k++) {
      var ok = true;
      for (var j = 0; j < 16; j++) if (bits[k + j] !== SYNC[j]) { ok = false; break; }
      if (!ok) continue;
      var w = bits.slice(k - 64, k);
      var n = function (o, c) { var v = 0; for (var q = 0; q < c; q++) v |= w[o + q] << q; return v; };
      var tc = { f: n(0, 4) + 10 * n(8, 2), s: n(16, 4) + 10 * n(24, 3), m: n(32, 4) + 10 * n(40, 3), h: n(48, 4) + 10 * n(56, 2) };
      if (tc.f < 30 && tc.s < 60 && tc.m < 60 && tc.h < 24) words.push({ start: at[k - 64], tc: tc });
    }
    return words;
  }

  /** Timecode as a frame count at the nominal rate (24 for 23.976). */
  function toFrames(tc, fpsNominal) { return ((tc.h * 60 + tc.m) * 60 + tc.s) * fpsNominal + tc.f; }

  /**
   * Timecode of the media's first frame, by majority vote over the decoded words.
   *   words from decode() on PCM read from offsetSec into the file; opts.fpsNominal (24), opts.fpsReal (24000/1001).
   * Returns { frames, agree, of } or null. frames includes CALIBRATE_FRAMES unless opts.raw.
   */
  function firstFrame(words, offsetSec, opts) {
    opts = opts || {};
    var nom = opts.fpsNominal || 24, real = opts.fpsReal || 24000 / 1001, votes = {};
    words.forEach(function (w) {
      var f0 = toFrames(w.tc, nom) - Math.round((offsetSec + w.start / RATE) * real);
      votes[f0] = (votes[f0] || 0) + 1;
    });
    var best = null;
    Object.keys(votes).forEach(function (k) { if (!best || votes[k] > best.agree) best = { frames: Number(k), agree: votes[k] }; });
    if (!best) return null;
    var day = nom * 86400;
    best.frames = (((best.frames + (opts.raw ? 0 : CALIBRATE_FRAMES)) % day) + day) % day;
    best.of = words.length;
    return best;
  }

  /** Read a clip's timecode: tries channel 1, then 2. Returns { frames, channel, agree, of } or null. */
  function clipTimecode(ffmpeg, file, opts) {
    opts = opts || {};
    var at = opts.atSec || 0;
    for (var ch = 1; ch <= 2; ch++) {
      var words = decode(readPcm(ffmpeg, file, ch, at, opts.lenSec || 4));
      if (words.length >= 10) { var r = firstFrame(words, at, opts); if (r) { r.channel = ch; return r; } }
    }
    return null;
  }

  function format(frames, fpsNominal) {
    var fps = fpsNominal || 24, day = fps * 86400;
    frames = ((Math.round(frames) % day) + day) % day;
    var s = Math.floor(frames / fps);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, frames % fps].map(function (v) { return (v < 10 ? "0" : "") + v; }).join(":");
  }

  function parse(str, fpsNominal) {
    var p = String(str).split(/[:;.]/).map(Number);
    return toFrames({ h: p[0], m: p[1], s: p[2], f: p[3] || 0 }, fpsNominal || 24);
  }

  return { RATE: RATE, CALIBRATE_FRAMES: CALIBRATE_FRAMES, readPcm: readPcm, decode: decode, firstFrame: firstFrame,
    clipTimecode: clipTimecode, toFrames: toFrames, format: format, parse: parse };
});
