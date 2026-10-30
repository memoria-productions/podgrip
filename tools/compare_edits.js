#!/usr/bin/env node
/*
 * Line up David's finished multicam edits with the mic audio, measure how he cuts, and run the cutting engine on
 * the same audio for comparison (PROJECT.md sections 4 and 8).
 *
 *   node tools/compare_edits.js [ep ...]
 *
 * Paths come from tools/paths.js. Environment:
 *   PRESET=handoff        engine mode (default: the base config's)
 *   STYLE='{"minWideSec":9}'  style overrides (with PRESET: replaces the base style)
 *   MOTION=1              feed the dolly's motion (MOTION_DIR) and framing; MOTION_ONLY=1 skips episodes without it;
 *                         IGNORE_MOTION=1 measures with motion but doesn't feed it; NO_FRAMING=1 skips framing
 *   QUIET=1               print one JSON line of medians instead of a line per episode
 * Writes WORK_DIR/compare/compare.json (and caches loudness curves in WORK_DIR/compare/curves).
 */
"use strict";
const fs = require("fs"), path = require("path");
const PATHS = require("./paths.js");
const only = process.argv.slice(2);
const ffmpeg = PATHS.FFMPEG, audioDir = PATHS.AUDIO_DIR, seatFile = PATHS.SEATING, editsDir = PATHS.EDITS_DIR, cfgFile = PATHS.BASE_CONFIG;
const outDir = path.join(PATHS.WORK_DIR, "compare");
const A = require("../engine/analyzer.js");
const D = require("../engine/director.js");
const seating = JSON.parse(fs.readFileSync(seatFile, "utf8"));
const baseCfg = JSON.parse(fs.readFileSync(cfgFile, "utf8")).config;
const HOP = 0.1;
const motionFor = process.env.MOTION ? require("./motion_map.js")(PATHS.MOTION_DIR) : null;
const F = require("../engine/framing.js");
const motionCache = {};
fs.mkdirSync(path.join(outDir, "curves"), { recursive: true });

const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

async function curvesFor(ep, edit) {
  const cacheFile = path.join(outDir, "curves", ep + ".json");
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  // Tracks A1..A4 play the F6 polyWAV, one mic channel each.
  const wavItems = (t) => t.items.filter((i) => i.source && i.source.media && /sync_sound/i.test(i.source.media));
  const tracks = edit.audio.filter((t) => wavItems(t).length).slice(0, 6);
  if (!tracks.length) return null;
  const date = path.basename(wavItems(tracks[0])[0].source.media).slice(0, 6);
  const seat = seating[date];
  if (!seat) return { error: "no seating for " + date };
  const voices = Object.entries(seat.people).map(([name, ch]) => ({ id: name, ch })).concat((seat.guests || []).map((ch, k) => ({ id: "Guest" + (k + 1), ch })));
  const dur = edit.durationSec, curves = {}, missing = new Set();
  for (const v of voices) {
    const t = tracks[v.ch - 1];
    if (!t) continue;
    const clips = wavItems(t).map((i) => {
      const local = path.join(audioDir, path.basename(i.source.media));
      if (!fs.existsSync(local)) { missing.add(path.basename(i.source.media)); return null; }
      return { startSec: i.start, endSec: i.end, inPointSec: i.inPoint, mediaPath: local, speed: 1 };
    }).filter(Boolean);
    if (!clips.length) continue;
    const c = await A.analyzeTrack({ clips }, dur, { hopSec: HOP, channel: v.ch - 1 });
    curves[v.id] = Array.from(c, (x) => Math.round(x));
  }
  const out = { date, voices, curves, missing: [...missing] };
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

/** Camera kind per 0.1 s: "W" wide, "S" solo, null nothing. */
function kindGrid(pieces, isWide, n) {
  const g = new Array(n).fill(null);
  pieces.forEach((p) => { for (let f = Math.round(p.start / HOP); f < Math.min(n, Math.round(p.end / HOP)); f++) g[f] = isWide(p) ? "W" : "S"; });
  return g;
}
function shotsOf(g) {
  const out = [];
  for (let f = 0; f < g.length;) { let e = f; while (e < g.length && g[e] === g[f]) e++; if (g[f]) out.push({ k: g[f], a: f * HOP, b: e * HOP }); f = e; }
  return out;
}

function measure(g, talk, a0, a1) {
  // talk: per frame list of speakers talking (main runs)
  const n = g.length, lo = Math.round(a0 / HOP), hi = Math.round(a1 / HOP);
  const shots = shotsOf(g.slice(lo, hi)).filter((s) => s.b - s.a > 0.2);
  const minutes = (hi - lo) * HOP / 60;
  const res = { cutsPerMin: r1((shots.length - 1) / minutes), widePct: 0, wideMed: null, soloMed: null, sit: {}, turnWide: {} };
  let w = 0, tot = 0;
  for (let f = lo; f < hi; f++) if (g[f]) { tot++; if (g[f] === "W") w++; }
  res.widePct = Math.round(100 * w / tot);
  res.wideMed = r1(pct(shots.filter((s) => s.k === "W").map((s) => s.b - s.a), 0.5));
  res.soloMed = r1(pct(shots.filter((s) => s.k === "S").map((s) => s.b - s.a), 0.5));
  res.wideP90 = r1(pct(shots.filter((s) => s.k === "W").map((s) => s.b - s.a), 0.9));
  res.soloP90 = r1(pct(shots.filter((s) => s.k === "S").map((s) => s.b - s.a), 0.9));
  // Situations: silence / one speaker / overlap
  const acc = {};
  const add = (k, isW) => { acc[k] = acc[k] || [0, 0]; acc[k][1]++; if (isW) acc[k][0]++; };
  for (let f = lo; f < hi; f++) {
    if (!g[f]) continue;
    const k = talk[f].length === 0 ? "silence" : talk[f].length === 1 ? "one" : "overlap";
    add(k, g[f] === "W");
  }
  Object.keys(acc).forEach((k) => { res.sit[k] = { widePct: Math.round(100 * acc[k][0] / acc[k][1]), sharePct: Math.round(100 * acc[k][1] / tot) }; });
  return res;
}

/** Turns: maximal stretches where one person holds the floor (others' bits under 1.5 s ignored, gaps under 1 s bridged). */
function turnsOf(runs, n) {
  const owner = new Array(n).fill(-1);
  const ids = Object.keys(runs);
  ids.forEach((id, k) => runs[id].forEach((r) => { if (r[1] - r[0] < 1.5) return; for (let f = Math.round(r[0] / HOP); f < Math.min(n, Math.round(r[1] / HOP)); f++) owner[f] = owner[f] === -1 ? k : (owner[f] === k ? k : -2); }));
  const turns = [];
  for (let f = 0; f < n;) {
    let e = f; while (e < n && owner[e] === owner[f]) e++;
    if (owner[f] >= 0) {
      const last = turns[turns.length - 1];
      if (last && last.who === owner[f] && f * HOP - last.b < 1.0) last.b = e * HOP; else turns.push({ who: owner[f], a: f * HOP, b: e * HOP });
    }
    f = e;
  }
  return turns;
}

function timing(g, turns, a0, a1) {
  // For each turn >= 4 s that starts after a different person: when does the edit first show a solo / change camera?
  const lags = [], toWide = [], stayed = [];
  const byLen = { "<5": [0, 0], "5-15": [0, 0], "15-30": [0, 0], "30+": [0, 0] };
  turns.forEach((t, i) => {
    if (t.a < a0 || t.b > a1) return;
    const len = t.b - t.a, bin = len < 5 ? "<5" : len < 15 ? "5-15" : len < 30 ? "15-30" : "30+";
    let w = 0, n = 0;
    for (let f = Math.round(t.a / HOP); f < Math.round(t.b / HOP); f++) if (g[f]) { n++; if (g[f] === "W") w++; }
    byLen[bin][0] += w; byLen[bin][1] += n;
    const prev = turns[i - 1];
    if (!prev || prev.who === t.who || len < 4) return;
    // first camera change within [-3, +8] s of the turn start
    const s = Math.round((t.a - 3) / HOP), e = Math.round((t.a + 8) / HOP);
    let cut = null;
    for (let f = Math.max(1, s); f < e && f < g.length; f++) if (g[f] && g[f - 1] && g[f] !== g[f - 1]) { cut = { at: f * HOP - t.a, to: g[f] }; break; }
    if (cut) (cut.to === "S" ? lags : toWide).push(cut.at); else stayed.push(1);
  });
  return {
    turnWidePct: Object.fromEntries(Object.entries(byLen).map(([k, v]) => [k, v[1] ? Math.round(100 * v[0] / v[1]) : null])),
    turnChanges: lags.length + toWide.length + stayed.length,
    cutToSoloLag: { n: lags.length, p25: r1(pct(lags, 0.25)), med: r1(pct(lags, 0.5)), p75: r1(pct(lags, 0.75)) },
    cutToWideLag: { n: toWide.length, med: r1(pct(toWide, 0.5)) },
    noCutPct: Math.round(100 * stayed.length / Math.max(1, lags.length + toWide.length + stayed.length))
  };
}

(async () => {
  const found = await A.findFfmpeg({ customPath: ffmpeg });
  if (!found.ok) throw new Error("ffmpeg not found");
  const files = fs.readdirSync(editsDir).filter((f) => f.endsWith(".edit.json")).sort();
  const results = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(editsDir, f), "utf8"));
    const sum = j.summary, edit = j.edit;
    if (!edit || !sum.wideAngle || /Copy/.test(sum.edit)) continue;
    const ep = (sum.edit.match(/\d{3}/) || [f])[0];
    if (only.length && !only.includes(ep)) continue;
    const t0 = Date.now();
    let cv;
    try { cv = await curvesFor(ep + "_" + path.basename(f, ".edit.json").slice(-6), edit); } catch (e) { console.log(ep, "audio error", e.message); continue; }
    if (!cv || cv.error || !Object.keys(cv.curves).length) { console.log(ep, "no audio", cv && (cv.error || cv.missing.join(","))); continue; }
    const n = Math.ceil(edit.durationSec / HOP);
    const ids = Object.keys(cv.curves);
    const curves = {}; ids.forEach((id) => { curves[id] = Float32Array.from(cv.curves[id]); });
    const speakers = ids.map((id) => ({ id, name: id }));
    // PodDirector with David's current settings, a static wide plus the dolly (no motion / framing readings here).
    const cameras = [{ id: "W", name: "Wide", videoTrack: 0, shows: ids }, { id: "F", name: "Solo", videoTrack: 1, shows: [], follows: true }];
    const cfg = Object.assign({}, baseCfg, { speakers, cameras, overrides: [] });
    if (process.env.STYLE) cfg.style = Object.assign({}, baseCfg.style, JSON.parse(process.env.STYLE));
    if (process.env.PRESET) { cfg.preset = process.env.PRESET; cfg.style = process.env.STYLE ? JSON.parse(process.env.STYLE) : {}; }
    const input = { durationSec: edit.durationSec, hopSec: HOP, fps: 23.976, curves };
    let mo = null;
    if (motionFor) {
      if (!(ep in motionCache)) { try { motionCache[ep] = motionFor(sum, edit); } catch (e) { motionCache[ep] = null; } }
      mo = motionCache[ep];
      if (!mo) { if (!process.env.QUIET) console.log(ep, "no motion"); if (process.env.MOTION_ONLY) continue; }
    }
    let r;
    if (mo && !process.env.IGNORE_MOTION) {
      cameras[1].moving = true;
      input.cameraMotion = { F: mo.motion };
      const r0 = D.plan(input, cfg);
      if (!process.env.NO_FRAMING) {
        const fr = F.analyze({ thumbs: mo.thumbs, motion: mo.motion, speech: r0.speech, speakers, steadyMaxPct: 1.5 });
        const names = {}; fr.groups.forEach((g) => { names[g.id] = g.guess; });
        input.framing = { F: F.timeline(fr, names) };
        r = D.plan(input, cfg);
      } else r = r0;
    } else r = D.plan(input, cfg);
    const runs = {}; r.speech.forEach((s) => { runs[s.speakerId] = s.runs; });
    const talk = Array.from({ length: n }, () => []);
    ids.forEach((id) => (runs[id] || []).forEach((x) => { for (let k = Math.round(x[0] / HOP); k < Math.min(n, Math.round(x[1] / HOP)); k++) talk[k].push(id); }));
    const v1 = edit.video.flatMap((t) => t.items).filter((i) => i.angle);
    const gD = kindGrid(v1, (p) => p.angle === sum.wideAngle, n);
    const gP = kindGrid(r.shots.map((s) => ({ start: s.startSec, end: s.endSec, cam: s.cameraId })), (p) => p.cam === "W", n);
    // Skip the intro (welcome + name cards) and the outro: from 90 s in to 30 s before the end.
    const a0 = 90, a1 = edit.durationSec - 30;
    const turns = turnsOf(runs, n);
    let same = 0, both = 0;
    for (let k = Math.round(a0 / HOP); k < Math.round(a1 / HOP); k++) if (gD[k] && gP[k]) { both++; if (gD[k] === gP[k]) same++; }
    const row = { ep, date: cv.date, people: ids, minutes: Math.round(edit.durationSec / 60),
      david: Object.assign(measure(gD, talk, a0, a1), timing(gD, turns, a0, a1)),
      pd: Object.assign(measure(gP, talk, a0, a1), timing(gP, turns, a0, a1)),
      agreePct: Math.round(100 * same / Math.max(1, both)), missingAudio: cv.missing };
    // Moving-camera check: share of solo time where the dolly is moving (needs the mapped motion; same for both edits).
    const mv = mo ? motionCache[ep].motion : (motionFor && motionCache[ep] ? motionCache[ep].motion : null);
    if (mv) {
      const moving = (k) => { const v = mv.values[Math.floor(k * HOP / mv.hopSec)]; return v > 1.2; };
      const share = (g) => { let a = 0, b = 0; for (let k = Math.round(a0 / HOP); k < Math.round(a1 / HOP); k++) if (g[k] === "S") { b++; if (moving(k)) a++; } return Math.round(1000 * a / Math.max(1, b)) / 10; };
      row.david.soloMovingPct = share(gD); row.pd.soloMovingPct = share(gP);
    }
    results.push(row);
    if (!process.env.STYLE) fs.writeFileSync(path.join(outDir, "compare.json"), JSON.stringify(results, null, 1));
    if (!process.env.QUIET) console.log(ep, ((Date.now() - t0) / 1000).toFixed(0) + "s", "David", row.david.cutsPerMin + "/min", row.david.widePct + "% wide",
      "lag", row.david.cutToSoloLag.med, "| PD", row.pd.cutsPerMin + "/min", row.pd.widePct + "% wide", "lag", row.pd.cutToSoloLag.med, "| agree", row.agreePct + "%",
      row.missingAudio.length ? "missing " + row.missingAudio.join(",") : "");
  }
  if (process.env.QUIET) {
    const u = results.filter((r, i, a) => a.findIndex((x) => x.ep === r.ep) === i);
    const med = (f) => { const a = u.map(f).filter((x) => x !== null && x !== undefined).sort((x, y) => x - y); return a[a.length >> 1]; };
    console.log(JSON.stringify({ style: process.env.STYLE || "{}", agree: med((r) => r.agreePct), cuts: med((r) => r.pd.cutsPerMin), wide: med((r) => r.pd.widePct), wideMed: med((r) => r.pd.wideMed), soloMed: med((r) => r.pd.soloMed), lag: med((r) => r.pd.cutToSoloLag.med), t5: med((r) => r.pd.turnWidePct["<5"]), t15: med((r) => r.pd.turnWidePct["5-15"]), t30: med((r) => r.pd.turnWidePct["15-30"]), t30p: med((r) => r.pd.turnWidePct["30+"]), dWide: med((r) => r.david.widePct), dCuts: med((r) => r.david.cutsPerMin), dMove: med((r) => r.david.soloMovingPct), move: med((r) => r.pd.soloMovingPct), moveMean: Math.round(10 * u.reduce((a, r) => a + (r.pd.soloMovingPct || 0), 0) / u.length) / 10 }));
  }
})().catch((e) => { console.error(e); process.exit(1); });
