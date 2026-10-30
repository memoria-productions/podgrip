/*
 * PodAssembler — timecode sync planner.
 *
 * Lays an episode's camera clips and F6 WAVs out on one timeline by timecode, the way David's Resolve routine
 * does, without Resolve:
 *   - each F6 take (_001, _002, …) is a group; its WAV splits (_0001, _0002) sit end to end at their own timecode
 *     (the F6 splits seamlessly, so that's the same as chaining by length);
 *   - camera clips join the take whose audio they overlap, at their LTC timecode;
 *   - take 1 starts the timeline; each later take follows the one before after a short gap (as David drags them);
 *   - clips with no timecode, or that overlap no take, go at the end, flagged.
 * One video track per camera body, the wide (24-70 lens) first. Pure: the caller supplies clip facts.
 *
 * plan(clips, opts) where clips are
 *   { kind: "camera", name, path, body, lens, tc (frames, null = no LTC), frames (length) }
 *   { kind: "wav", name, path, date (yymmdd), take, part, tc, frames, channels }   (take null = not an F6 file)
 * opts: { date: the episode day (yymmdd), gapFrames between takes (2 s) }
 * Positions are in timeline frames at 23.976 (timecode frames at 24 nominal map 1:1 onto them).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PodSync = api;
  else if (root) root.PodSync = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FPS = 24, DAY = FPS * 86400;
  /** b − a in frames, across midnight: the shorter way round. */
  function delta(a, b) { var d = (((b - a) % DAY) + DAY) % DAY; return d > DAY / 2 ? d - DAY : d; }

  function isWide(lens) { return /24-70/.test(lens || ""); }

  function plan(clips, opts) {
    opts = opts || {};
    var gap = opts.gapFrames !== undefined ? opts.gapFrames : 2 * FPS;
    var warnings = [];
    var cams = clips.filter(function (c) { return c.kind === "camera"; });
    // Only the F6's own files: leftovers like "… Audio Extracted.wav" have no take number. Files from another day
    // (opts.date, yymmdd) are left out too, when the episode's own day has audio.
    var wavs = clips.filter(function (c) { return c.kind === "wav"; }), stray = wavs.filter(function (w) { return !w.take; });
    if (stray.length) warnings.push(stray.length + " WAV file(s) that aren't F6 recordings left out (" + stray.map(function (w) { return w.name; }).slice(0, 3).join(", ") + (stray.length > 3 ? "…" : "") + ")");
    wavs = wavs.filter(function (w) { return w.take; });
    if (opts.date && wavs.some(function (w) { return w.date === opts.date; })) {
      wavs.filter(function (w) { return w.date && w.date !== opts.date; }).forEach(function (w) { warnings.push(w.name + ": recorded on another day, left out"); });
      wavs = wavs.filter(function (w) { return !w.date || w.date === opts.date; });
    }

    // Takes: WAVs grouped by take number, each placed at its own timecode relative to the take's first part.
    var takes = {};
    wavs.forEach(function (w) {
      if (w.tc === null || w.tc === undefined) { warnings.push(w.name + ": no BWF timecode, left out"); return; }
      var key = (w.date || "") + "_" + (1000 + w.take);
      (takes[key] = takes[key] || { take: w.take, date: w.date || null, wavs: [], cams: [] }).wavs.push(w);
    });
    var takeList = Object.keys(takes).sort().map(function (k) { return takes[k]; });
    takeList.forEach(function (t) {
      t.wavs.sort(function (a, b) { return a.part - b.part; });
      t.tc0 = t.wavs[0].tc;
      t.wavs.forEach(function (w) { w.rel = delta(t.tc0, w.tc); });
      t.lo = 0; t.hi = Math.max.apply(null, t.wavs.map(function (w) { return w.rel + w.frames; }));
      // Splits should butt up exactly; say so if they don't.
      for (var i = 1; i < t.wavs.length; i++) {
        var p = t.wavs[i - 1], d = t.wavs[i].rel - (p.rel + p.frames);
        if (Math.abs(d) > 1) warnings.push(t.wavs[i].name + " starts " + (d / FPS * 1.001).toFixed(2) + " s from the end of " + p.name);
      }
    });

    // Cameras join the take whose audio they overlap most.
    var loose = [];
    cams.forEach(function (c) {
      if (c.tc === null || c.tc === undefined) { loose.push(c); warnings.push(c.name + ": no timecode on its audio (not on the F6 splitter?), put at the end"); return; }
      var best = null;
      takeList.forEach(function (t) {
        var a = delta(t.tc0, c.tc), ov = Math.min(a + c.frames, t.hi) - Math.max(a, t.lo);
        if (ov > 0 && (!best || ov > best.ov)) best = { t: t, a: a, ov: ov };
      });
      if (!best) { loose.push(c); warnings.push(c.name + ": overlaps none of the audio, put at the end"); return; }
      c.rel = best.a; best.t.cams.push(c);
    });

    // Take extents (cameras can start before or run past the audio), then lay the takes end to end.
    var pos = 0;
    takeList.forEach(function (t) {
      t.cams.forEach(function (c) { t.lo = Math.min(t.lo, c.rel); t.hi = Math.max(t.hi, c.rel + c.frames); });
      t.offset = pos - t.lo;
      t.wavs.forEach(function (w) { w.start = t.offset + w.rel; });
      t.cams.forEach(function (c) { c.start = t.offset + c.rel; });
      pos = t.offset + t.hi + gap;
    });
    loose.forEach(function (c) { c.start = pos; c.unsynced = true; pos += c.frames + gap; });

    // Video tracks: one per camera. Two cameras can share a body name (two "A7S3-3"s), so a camera is body + lens;
    // if that still overlaps itself, the overlapping clips get a track of their own. The wide (24-70) goes first,
    // then by how much synced footage each has.
    var groups = {};
    cams.forEach(function (c) { var k = c.body + "|" + (c.lens || ""); (groups[k] = groups[k] || []).push(c); });
    var tracks = [];
    Object.keys(groups).forEach(function (k) {
      var mine = [];
      groups[k].sort(function (a, b) { return a.start - b.start; }).forEach(function (c) {
        var t = mine.filter(function (x) { var last = x.clips[x.clips.length - 1]; return last.start + last.frames <= c.start; })[0];
        if (!t) { t = { body: c.body, lens: c.lens || null, clips: [] }; mine.push(t); tracks.push(t); }
        t.clips.push(c);
      });
    });
    tracks.forEach(function (t) {
      t.wide = isWide(t.lens);
      t.synced = t.clips.reduce(function (s, c) { return s + (c.unsynced ? 0 : c.frames); }, 0);
    });
    tracks.sort(function (a, b) {
      return (b.synced > 0) - (a.synced > 0) || (b.wide ? 1 : 0) - (a.wide ? 1 : 0) || b.synced - a.synced || (a.body < b.body ? -1 : 1);
    });
    var wides = tracks.filter(function (t) { return t.wide && t.synced; });
    if (tracks.length && !tracks[0].wide) warnings.push("no camera has the 24-70 lens: couldn't tell which is the wide, so V1 is " + tracks[0].body);
    if (wides.length > 1) warnings.push("more than one camera has the 24-70 lens; V1 is the one with the most footage (" + wides[0].body + ")");

    var allWavs = takeList.reduce(function (a, t) { return a.concat(t.wavs); }, []);
    var channels = allWavs.reduce(function (m, w) { return Math.max(m, w.channels || 0); }, 0);
    var duration = pos > 0 ? pos - gap : 0;
    return { video: tracks, wavs: allWavs, channels: channels, takes: takeList, durationFrames: duration, warnings: warnings };
  }

  return { FPS: FPS, plan: plan, delta: delta, isWide: isWide };
});
