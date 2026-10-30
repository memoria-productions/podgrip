#!/usr/bin/env node
/*
 * Run `podgrip sync`'s planner on every episode that has a Resolve sync export, and compare: each clip's
 * position relative to its take's first WAV, ours vs Resolve's. (Takes themselves are laid out differently on
 * purpose: we always leave a short gap; David drags them by hand.)
 *
 *   node tools/sync_compare.js [season folder] [--ep 243]
 */
"use strict";
const fs = require("fs"), path = require("path");
const X = require("../engine/xml.js"), S = require("../engine/sync.js"), E = require("../lib/episode.js");
const PATHS = require("./paths.js");

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--ep") + 1]) || PATHS.SEASON_DIR;
const onlyEp = args.includes("--ep") ? args[args.indexOf("--ep") + 1] : null;

/** name -> start frame, from a Resolve export (first video item for cameras, first audio item for WAVs). */
function resolvePositions(file) {
  const seq = X.child(X.parse(fs.readFileSync(file, "utf8")), "xmeml/sequence"), pos = {};
  ["video", "audio"].forEach((kind) => X.kids(X.child(seq, "media/" + kind), "track").forEach((t) =>
    X.kids(t, "clipitem").forEach((c) => {
      const name = X.textOf(c, "name"), start = Number(X.textOf(c, "start")) - Number(X.textOf(c, "in"));
      if (!(name in pos) && (kind === "video" || /\.wav$/i.test(name))) pos[name] = start;
    })));
  return pos;
}

const tally = { same: 0, nudged: 0, ourOnly: 0, unsynced: 0 };
for (const epName of fs.readdirSync(root).sort()) {
  if (onlyEp && !epName.includes("_" + onlyEp + "_")) continue;
  const dir = path.join(root, epName);
  const xml = ["project_files", "peoject_files"].map((pf) => path.join(dir, pf, "resolve")).filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).filter((f) => /\.xml$/i.test(f)).map((f) => path.join(d, f)))[0];
  if (!xml) continue;
  const ep = E.read(dir, PATHS.FFMPEG);
  const plan = S.plan(ep.clips, { date: ep.f6Date });
  const theirs = resolvePositions(xml), notes = [];
  plan.takes.forEach((t) => {
    const ref = t.wavs[0];
    if (!(ref.name in theirs)) { notes.push("take " + t.take + " not in the Resolve export"); return; }
    t.wavs.concat(t.cams).forEach((c) => {
      if (c === ref) return;
      if (!(c.name in theirs)) { tally.ourOnly++; notes.push(c.name + " (not in Resolve's)"); return; }
      const d = (c.start - ref.start) - (theirs[c.name] - theirs[ref.name]);
      if (Math.abs(d) <= 1) tally.same++;
      else { tally.nudged++; notes.push(c.name + " differs by " + (d / 24 * 1.001).toFixed(2) + " s"); }
    });
  });
  plan.video.flatMap((v) => v.clips).filter((c) => c.unsynced).forEach((c) => { tally.unsynced++; notes.push(c.name + " NOT SYNCED"); });
  plan.warnings.filter((w) => !/no timecode|overlaps none/.test(w)).forEach((w) => notes.push("! " + w));
  console.log(epName.padEnd(40), plan.video.map((v, i) => "V" + (i + 1) + "=" + v.body + (v.wide ? "*" : "")).join(" "), "|", notes.join("; ") || "all match");
}
console.log("\nclips placed like Resolve (±1 frame):", tally.same, "| differ:", tally.nudged, "| not in Resolve's export:", tally.ourOnly, "| no timecode:", tally.unsynced);
