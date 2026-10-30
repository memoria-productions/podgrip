#!/usr/bin/env node
/*
 * PodAssembler command line.
 *
 *   podassembler timecode <file|episode folder> ...   timecode of camera clips (LTC on their audio) and F6 WAVs (BWF)
 *   podassembler sync <episode folder> [--out file.xml] [--gap seconds]
 *       lays the cameras and F6 audio out by timecode and writes an FCP7 XML sequence for Premiere, in place of the
 *       Resolve round trip. Default output: <WORK_DIR>\sync\classical_et_cetera_<ep>_sync.xml
 */
"use strict";
const fs = require("fs"), path = require("path");
const L = require("../engine/ltc.js"), B = require("../engine/bwf.js");
const S = require("../engine/sync.js"), XM = require("../engine/xmeml.js"), E = require("../lib/episode.js");
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
  if (!targets.length) { console.error("usage: podassembler timecode <file|episode folder> ..."); process.exit(1); }
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

function sync(args) {
  const dir = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!dir || !fs.existsSync(dir)) { console.error("usage: podassembler sync <episode folder> [--out file.xml] [--gap seconds]"); process.exit(1); }
  const ep = E.read(dir, PATHS.FFMPEG, (m) => process.stderr.write(m + "\n"));
  const plan = S.plan(ep.clips, { date: ep.f6Date, gapFrames: Math.round(Number(opt(args, "--gap", 2)) * 24) });
  const id = ep.ep || ep.slug, name = "classical_et_cetera_" + id + " (Sync)";
  const markers = plan.video.flatMap((t) => t.clips).filter((c) => c.unsynced)
    .map((c) => ({ frame: c.start, name: "Not synced: " + c.name, comment: "No timecode on this clip's audio, or it overlaps none of the F6 audio. Line it up by hand." }));
  const out = opt(args, "--out", path.join(PATHS.WORK_DIR, "sync", "classical_et_cetera_" + id + "_sync.xml"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, XM.write(plan, { name, markers }));

  const min = (f) => (f / 24 * 1.001 / 60).toFixed(1) + " min";
  console.log("\n" + name + ": " + min(plan.durationFrames));
  plan.video.forEach((t, i) => console.log("  V" + (i + 1) + "  " + t.body + (t.wide ? " (wide, 24-70)" : t.lens ? " (" + t.lens + ")" : "") + ": " +
    t.clips.map((c) => c.name + (c.unsynced ? " NOT SYNCED" : " @" + L.format(c.tc))).join(", ")));
  console.log("  A1-A" + plan.channels + "  " + plan.takes.map((t) => "take " + t.take + ": " + t.wavs.map((w) => w.name).join(" + ")).join("; "));
  plan.warnings.forEach((w) => console.log("  ! " + w));
  console.log("Wrote " + out);
}

if (cmd === "timecode") timecode(rest);
else if (cmd === "sync") sync(rest);
else {
  console.log("usage:\n  podassembler timecode <file|episode folder> ...\n  podassembler sync <episode folder> [--out file.xml] [--gap seconds]");
  process.exit(cmd ? 1 : 0);
}
