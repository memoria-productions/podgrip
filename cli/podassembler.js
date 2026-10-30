#!/usr/bin/env node
/*
 * PodAssembler command line.
 *
 *   podassembler timecode <file|episode folder> ...   timecode of camera clips (LTC on their audio) and F6 WAVs (BWF)
 */
"use strict";
const fs = require("fs"), path = require("path");
const L = require("../engine/ltc.js"), B = require("../engine/bwf.js");
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

if (cmd === "timecode") timecode(rest);
else {
  console.log("usage:\n  podassembler timecode <file|episode folder> ...");
  process.exit(cmd ? 1 : 0);
}
