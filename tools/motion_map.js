// Map past-episode camera motion (tools/analyze_past.js output) (analyzed per camera file) onto a finished edit's timeline.
"use strict";
const fs = require("fs"), path = require("path");
module.exports = function (motionDir) {
  const P = require("./prproj.js");
  const M = require("../engine/motion.js");
  const manifest = JSON.parse(fs.readFileSync(path.join(motionDir, "manifest.json"), "utf8"));
  const loaded = {};
  function load(media) {
    if (loaded[media] !== undefined) return loaded[media];
    const m = manifest[media];
    if (!m || !m.done) return (loaded[media] = null);
    const b = fs.readFileSync(m.files.motion), t = fs.readFileSync(m.files.thumbs);
    return (loaded[media] = { values: new Float32Array(b.buffer, b.byteOffset, b.length / 4), thumbs: new Uint8Array(t.buffer, t.byteOffset, t.length), hop: m.hopSec, tw: m.thumbs.w, th: m.thumbs.h });
  }
  /** (sequence, time) -> { media, t } for the given video track index of that sequence, following nests. */
  function resolve(project, seq, trackIdx, t, depth) {
    if (!seq || depth > 4) return null;
    const tracks = trackIdx === null ? seq.video : [seq.video[trackIdx]];
    for (const tr of tracks) {
      if (!tr) continue;
      const it = tr.items.find((i) => t >= i.start && t < i.end);
      if (!it || !it.source) continue;
      const tt = it.inPoint + (t - it.start);
      if (it.source.media) return { media: it.source.media, t: tt };
      const s = it.source.sequenceId && project.sequences.find((q) => q.id === it.source.sequenceId);
      const r = resolve(project, s, null, tt, depth + 1);
      if (r) return r;
    }
    return null;
  }
  /** Returns { angle, motion: {hopSec, values}, thumbs: {w,h,hopSec,data,valid} } on the edit timeline, or null. */
  return function motionFor(summary, edit) {
    const project = P.readProject(summary.file);
    const pieces = edit.video.flatMap((t) => t.items).filter((i) => i.angle && i.source && i.source.sequenceId);
    if (!pieces.length) return null;
    const mc = project.sequences.find((s) => s.id === pieces[0].source.sequenceId);
    const angles = mc.video.map((t) => t.index + 1).filter((a) => a !== summary.wideAngle);
    let best = null;
    for (const angle of angles) {
      const n = Math.ceil(edit.durationSec / M.HOP), values = new Float32Array(n).fill(NaN);
      const secs = Math.ceil(edit.durationSec), tw = 32, th = 18, size = tw * th * 3;
      const data = new Uint8Array(secs * size), valid = new Uint8Array(secs);
      let hits = 0;
      const at = (t) => { const p = pieces.find((x) => t >= x.start && t < x.end); return p ? resolve(project, mc, angle - 1, p.inPoint + (t - p.start), 0) : null; };
      for (let k = 0; k < n; k++) {
        const r = at(k * M.HOP); if (!r) continue;
        const m = load(r.media); if (!m) continue;
        const j = Math.round(r.t / m.hop);
        if (j >= 0 && j < m.values.length) { values[k] = m.values[j]; hits++; }
      }
      for (let s = 0; s < secs; s++) {
        const r = at(s + 0.5); if (!r) continue;
        const m = load(r.media); if (!m) continue;
        const j = Math.floor(r.t);
        if (j >= 0 && (j + 1) * size <= m.thumbs.length) { data.set(m.thumbs.subarray(j * size, (j + 1) * size), s * size); valid[s] = 1; }
      }
      if (!best || hits > best.hits) best = { angle, hits, motion: { hopSec: M.HOP, values }, thumbs: { w: tw, h: th, hopSec: 1, data, valid } };
    }
    return best && best.hits ? best : null;
  };
};
