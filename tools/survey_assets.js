#!/usr/bin/env node
// node tools/survey_assets.js [edits dir]
// Survey what goes into a finished episode besides the multicam: graphics, music, stingers, and where assets live.
const fs = require("fs"), path = require("path");
const dir = process.argv[2] || require("./paths.js").EDITS_DIR; const agg = {}; let n = 0; const paths = {};
const BS = String.fromCharCode(92);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".edit.json"))) {
  const j = require(path.join(dir, f)); const e = j.edit;
  if (!e || /Copy/.test(j.summary.edit)) continue; n++;
  const D = e.durationSec;
  const add = (kind, t, i) => {
    if (i.angle) return;
    const src = i.source || {};
    let raw = src.sequence || path.basename(src.media || src.title || i.name || "?");
    if (/^\d{6}_\d{3}_\d{4}\.WAV$/i.test(raw)) return;
    if (src.media) {
      const parts = path.dirname(src.media).split(BS);
      const at = parts.indexOf("2026");
      const p = at >= 0 ? "<ep>" + BS + parts.slice(at + 2).join(BS) : parts.join(BS);
      paths[p] = (paths[p] || 0) + 1;
    }
    raw = raw.replace(/lower_third_.*\.mov/i, "lower_third_<name>.mov").replace(/^\d{8}_/, "<date>_");
    const k = kind + " " + raw; (agg[k] = agg[k] || []).push({ t: t.index + 1, s: i.start, fromEnd: D - i.start, d: i.end - i.start });
  };
  e.video.forEach((t) => t.items.forEach((i) => add("V", t, i)));
  e.audio.forEach((t) => t.items.forEach((i) => add("A", t, i)));
}
console.log("episodes", n);
const med = (a) => { a = a.slice().sort((x, y) => x - y); return Math.round(a[a.length >> 1] * 10) / 10; };
Object.entries(agg).filter(([k, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) =>
  console.log(v.length, k, "| trk", [...new Set(v.map((x) => x.t))].join(","), "| start", med(v.map((x) => x.s)), "| fromEnd", med(v.map((x) => x.fromEnd)), "| dur", med(v.map((x) => x.d))));
Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([p, c]) => console.log(c, p));
