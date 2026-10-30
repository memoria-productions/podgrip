#!/usr/bin/env node
/*
 * PodGrip command line.
 *
 *   podgrip timecode <file|episode folder> ...   timecode of camera clips (LTC on their audio) and F6 WAVs (BWF)
 *   podgrip sync <episode folder> [--out file.xml] [--gap seconds] [--lead seconds]
 *       lays the cameras and F6 audio out by timecode and writes an FCP7 XML sequence for Premiere, in place of the
 *       Resolve round trip. Default output: <WORK_DIR>\sync\classical_et_cetera_<ep>_sync.xml
 *       The promo takes (the short recordings besides the episode) get their own "promos (Sync)" sequence.
 *       --lead: space before the first clip (10 s), so a sync nudge never pushes media off the left edge.
 *   podgrip assemble <episode folder> [--out file.xml] [--gap seconds] [--lead seconds]
 *       the synced sequences plus the camera nests (<ep>_b_cam = wide, <ep>_a_cam = dolly) and the main sequence
 *       classical_et_cetera_<ep> with mics 1–4 on A1–A4. The <ep>_mc multicam is made from the nests in Premiere
 *       (one step; printed at the end) and goes on V1.
 *       Default output: <WORK_DIR>\assemble\classical_et_cetera_<ep>_assembly.xml
 */
"use strict";
const fs = require("fs"), path = require("path");
const L = require("../engine/ltc.js"), B = require("../engine/bwf.js");
const XM = require("../engine/xmeml.js"), A = require("../engine/assemble.js");
const LA = require("../lib/assembly.js");
const PATHS = require("../tools/paths.js");

const [cmd, ...rest] = process.argv.slice(2);

function mediaIn(target) {
  if (!fs.statSync(target).isDirectory()) return [target];
  const out = [];
  for (const sub of ["", "media/captured/footage", "media/captured/footage/theater", "media/captured/sync_sound"]) {
    const d = path.join(target, sub);
    if (fs.existsSync(d) && fs.statSync(d).isDirectory())
      fs.readdirSync(d).filter((f) => /\.(mp4|mov|wav)$/i.test(f)).forEach((f) => out.push(path.join(d, f)));
  }
  return out;
}

function timecode(targets) {
  if (!targets.length) { console.error("usage: podgrip timecode <file|episode folder> ..."); process.exit(1); }
  targets.flatMap(mediaIn).forEach((f) => {
    const name = path.basename(f);
    if (/\.wav$/i.test(f)) {
      const w = B.read(f), tc = B.timecodeFrames(w);
      console.log(name.padEnd(30), tc === null ? "no BWF timecode" : L.format(tc),
        w.channels + " ch", (w.durationSec / 60).toFixed(1) + " min");
    } else {
      const r = L.clipTimecode(PATHS.FFMPEG, f);
      console.log(name.padEnd(30), r ? L.format(r.frames) : "no LTC found", r ? "LTC on ch" + r.channel + " (" + r.agree + "/" + r.of + " frames agree)" : "");
    }
  });
}

function opt(args, k, d) { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }

/** Read an episode folder and lay it out by timecode; prints what went where. Shared by sync and assemble. */
function synced(args, usage) {
  const dir = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!dir || !fs.existsSync(dir)) { console.error("usage: " + usage); process.exit(1); }
  const prep = LA.prepare(dir, PATHS.FFMPEG, { gapSec: Number(opt(args, "--gap", 2)), leadSec: Number(opt(args, "--lead", 10)),
    log: (m) => process.stderr.write(m + "\n") });
  const { plan, promos, id, markers } = prep, name = prep.names.sync;

  const min = (f) => (f / 24 * 1.001 / 60).toFixed(1) + " min";
  const show = (title, p) => {
    console.log("\n" + title + ": " + min(p.durationFrames));
    p.video.forEach((t, i) => console.log("  V" + (i + 1) + "  " + t.body + (t.wide ? " (wide, 24-70)" : t.lens ? " (" + t.lens + ")" : "") + ": " +
      t.clips.map((c) => c.name + (c.unsynced ? " NOT SYNCED" : " @" + L.format(c.tc))).join(", ")));
    console.log("  A1-A" + p.channels + "  " + p.takes.map((t) => "take " + t.take + ": " + t.wavs.map((w) => w.name).join(" + ")).join("; "));
  };
  show(name, plan);
  if (promos) show("Promos, kept apart from the episode", promos);
  plan.warnings.forEach((w) => console.log("  ! " + w));
  return { prep, plan, promos, id, name, markers };
}

function writeOut(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log("Wrote " + file);
}

function sync(args) {
  const { plan, promos, id, name, markers } = synced(args, "podgrip sync <episode folder> [--out file.xml] [--gap seconds] [--lead seconds]");
  const p = promos && { plan: promos, name: "classical_et_cetera_" + id + " promos (Sync)" };
  writeOut(opt(args, "--out", path.join(PATHS.WORK_DIR, "sync", "classical_et_cetera_" + id + "_sync.xml")), XM.write(plan, { name, markers, promos: p }));
}

function assemble(args) {
  const { prep, plan, id } = synced(args, "podgrip assemble <episode folder> [--out file.xml] [--gap seconds] [--lead seconds]");
  const n = prep.names;
  console.log("\n  Nests " + n.nests.join(", ") + "; " + n.main + " with mics 1-" + Math.min(4, plan.channels) + " on A1-A" + Math.min(4, plan.channels));
  const out = opt(args, "--out", null);
  if (out) writeOut(out, A.xml(plan, { ep: id, markers: prep.markers, promos: prep.promos }));
  else console.log("Wrote " + LA.write(prep, path.join(PATHS.WORK_DIR, "assemble")));
  console.log("\nIn Premiere, after importing it: " + A.mcStep(n));
}

const USAGE = "usage:\n  podgrip timecode <file|episode folder> ...\n  podgrip sync <episode folder> [--out file.xml] [--gap seconds] [--lead seconds]\n" +
  "  podgrip assemble <episode folder> [--out file.xml] [--gap seconds] [--lead seconds]";
if (cmd === "timecode") timecode(rest);
else if (cmd === "sync") sync(rest);
else if (cmd === "assemble") assemble(rest);
else {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
