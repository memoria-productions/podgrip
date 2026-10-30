/*
 * PodAssembler — reading an episode folder (Node): what was shot, and each clip's timecode and length.
 *
 *   <season>\<yyyymmdd>_<ep>_<slug>\media\captured\footage\     Sony clips <yyyymmdd>_<body>_<nnnn>.MP4 + <clip>M01.XML
 *                                     \footage\theater\         (some episodes)
 *                                     \sync_sound\              F6 WAVs <yymmdd>_<take>[_<part>].WAV (audio_test\ skipped)
 */
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const L = require("../engine/ltc.js"), B = require("../engine/bwf.js"), X = require("../engine/xml.js");

/** "20261012_243_mailbag" -> { date: "20261012", ep: "243", slug: "mailbag" } */
function folderInfo(dir) {
  const m = /^(\d{8})_(\d{3})_?(.*)$/.exec(path.basename(dir));
  return m ? { date: m[1], ep: m[2], slug: m[3] } : { date: null, ep: null, slug: path.basename(dir) };
}

function listMedia(dir) {
  const files = (sub, re) => {
    const d = path.join(dir, "media", "captured", sub);
    return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f)).map((f) => path.join(d, f)) : [];
  };
  return {
    cameras: files("footage", /\.(mp4|mov)$/i).concat(files(path.join("footage", "theater"), /\.(mp4|mov)$/i)),
    wavs: files("sync_sound", /\.wav$/i)
  };
}

/** Sony sidecar facts: { frames, lens, model } (nulls when there's no sidecar). */
function sidecar(file) {
  const xmlFile = file.replace(/\.(mp4|mov)$/i, "M01.XML");
  if (!fs.existsSync(xmlFile)) return { frames: null, lens: null, model: null };
  const doc = X.parse(fs.readFileSync(xmlFile, "utf8"));
  const attr = (name, a) => { const e = X.all(doc, name)[0]; return e ? e.attrs[a] : null; };
  const frames = Number(attr("Duration", "value"));
  return { frames: frames > 0 ? frames : null, lens: attr("Lens", "modelName"), model: attr("Device", "modelName") };
}

/** Length in 23.976 frames from ffmpeg's Duration line (fallback when there's no sidecar). */
function probeFrames(ffmpeg, file) {
  const r = cp.spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || "");
  return m ? Math.round((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 24000 / 1001) : null;
}

function cameraClip(ffmpeg, file) {
  const name = path.basename(file), sc = sidecar(file);
  const body = (/^\d{8}_(.+)_\d+\.(mp4|mov)$/i.exec(name) || [])[1] || name.replace(/\.[^.]+$/, "");
  const ltc = L.clipTimecode(ffmpeg, file);
  return { kind: "camera", name, path: file, body, lens: sc.lens, model: sc.model,
    frames: sc.frames || probeFrames(ffmpeg, file), tc: ltc ? ltc.frames : null, ltcChannel: ltc ? ltc.channel : null };
}

function wavClip(file) {
  const name = path.basename(file), h = B.read(file), np = B.nameParts(name) || { date: null, take: null, part: 1 };
  return { kind: "wav", name, path: file, date: np.date, take: np.take, part: np.part, channels: h.channels,
    frames: Math.round(h.durationSec * 24000 / 1001), tc: B.timecodeFrames(h) };
}

/** Everything about an episode folder that the sync needs. */
function read(dir, ffmpeg, log) {
  const media = listMedia(dir), clips = [];
  media.wavs.forEach((f) => { clips.push(wavClip(f)); });
  media.cameras.forEach((f) => { if (log) log("reading timecode: " + path.basename(f)); clips.push(cameraClip(ffmpeg, f)); });
  const info = folderInfo(dir);
  return Object.assign(info, { dir, clips, f6Date: info.date ? info.date.slice(2) : null });
}

module.exports = { folderInfo, listMedia, sidecar, cameraClip, wavClip, read };
