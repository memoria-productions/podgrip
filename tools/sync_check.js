#!/usr/bin/env node
/*
 * Check PodGrip's timecode sync against David's Resolve sync exports.
 *
 * For every <episode>\project_files\resolve\*.xml (FCP7 XML), reads our own timecode for each clip (LTC on the
 * camera's audio, BWF on the F6 WAVs), compares it with the timecode Resolve stamped, then checks that laying the
 * clips out by timecode puts them where Resolve did.
 *
 *   node tools/sync_check.js [season folder] [--ep 243]
 */
"use strict";
const fs = require("fs"), path = require("path");
const L = require("../engine/ltc.js"), B = require("../engine/bwf.js");
const PATHS = require("./paths.js");

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--")) || PATHS.SEASON_DIR;
const onlyEp = args.includes("--ep") ? args[args.indexOf("--ep") + 1] : null;
const FPS = 24, DAY = FPS * 86400;
const wrap = (d) => { d = ((d % DAY) + DAY) % DAY; return d > DAY / 2 ? d - DAY : d; };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

/** Clips in a Resolve FCP7 XML: [{ name, start, in, tc, file }] (positions in timeline frames). */
function resolveClips(xml) {
  const files = {}, out = [], seen = new Set();
  let m;
  const fre = /<file id="([^"]*)">[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<pathurl>([^<]*)<\/pathurl>[\s\S]*?<timecode>\s*<string>([^<]*)<\/string>/g;
  while ((m = fre.exec(xml))) files[m[2]] = { tc: m[4], file: decodeURIComponent(m[3].replace("file://localhost/", "")) };
  const cre = /<clipitem id="([^"]*)">\s*<name>([^<]*)<\/name>[\s\S]*?<start>(-?\d+)<\/start>\s*<end>(-?\d+)<\/end>\s*<enabled>[^<]*<\/enabled>\s*<in>(-?\d+)<\/in>/g;
  while ((m = cre.exec(xml))) {
    const k = m[2] + "@" + m[3];
    if (seen.has(k) || !files[m[2]]) continue;
    seen.add(k);
    out.push(Object.assign({ name: m[2], start: +m[3], in: +m[5] }, files[m[2]]));
  }
  return out;
}

const xmls = [];
for (const ep of fs.readdirSync(root)) {
  if (onlyEp && !ep.includes("_" + onlyEp + "_")) continue;
  for (const pf of ["project_files", "peoject_files"]) {
    const d = path.join(root, ep, pf, "resolve");
    if (fs.existsSync(d)) fs.readdirSync(d).filter((f) => /\.xml$/i.test(f)).forEach((f) => xmls.push({ ep: path.join(root, ep), xml: path.join(d, f) }));
  }
}

const camDiff = {}, wavDiff = {}, placed = {};
for (const { ep, xml } of xmls) {
  const clips = resolveClips(fs.readFileSync(xml, "utf8"));
  const notes = [path.basename(ep)];
  clips.forEach((c) => {
    // Episode folders get renamed after the export (typos, numbers): find the file by name in this episode.
    if (!fs.existsSync(c.file)) for (const sub of ["footage", "footage/theater", "sync_sound"]) {
      const p = path.join(ep, "media", "captured", sub, c.name);
      if (fs.existsSync(p)) { c.file = p; break; }
    }
    c.ours = null;
    if (!fs.existsSync(c.file)) { notes.push(c.name + " MISSING"); return; }
    if (/\.wav$/i.test(c.name)) {
      c.ours = B.timecodeFrames(B.read(c.file));
      if (c.ours !== null) bump(wavDiff, wrap(c.ours - L.parse(c.tc)));
    } else {
      const r = L.clipTimecode(PATHS.FFMPEG, c.file, { atSec: c.in / 24 * 1.001 });
      if (r && r.channel === 2) notes.push(c.name + " LTC on ch2");
      c.ours = r ? r.frames : null;
      bump(camDiff, c.ours === null ? "no LTC" : wrap(c.ours - L.parse(c.tc)));
      if (c.ours === null) notes.push(c.name + " NO LTC");
    }
  });
  // Resolve lays clips out by timecode, so (timecode − position) is one constant per take. Take the most common
  // value as the episode's and list clips sitting elsewhere (second takes are moved on purpose).
  const off = (c) => wrap((c.ours - c.in) - c.start);
  const votes = {};
  clips.forEach((c) => { if (c.ours !== null) bump(votes, off(c)); });
  const mode = Number((Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [0])[0]);
  clips.forEach((c) => {
    if (c.ours === null) return;
    const d = mode - off(c);
    bump(placed, Math.abs(d) <= 1 ? "on timecode" : "moved");
    if (Math.abs(d) > 1) notes.push(c.name + " moved " + (d > 0 ? "+" : "") + (d / 24 * 1.001).toFixed(2) + " s");
  });
  console.log(notes.join("  "));
}
console.log("\ncamera LTC − Resolve (frames):", camDiff);
console.log("F6 BWF − Resolve (frames):", wavDiff);
console.log("placement vs Resolve:", placed);
