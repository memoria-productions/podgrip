/*
 * PodGrip — "Begin episode assembly" (Node): from an open episode project to an assembly XML ready to import.
 * Used by the panel (client/panel.js) and the command line (podgrip assemble), so both build the same thing.
 *
 *   episodeDir(projectPath)   the episode folder a project lives in: <season>\<yyyymmdd>_<ep>_<slug>\project_files\premiere\x.prproj
 *   findFfmpeg(extRoot)       ffmpeg: PodGrip's own, then PodCutter's (formerly PodDirector) bundled copy, then PATH
 *   prepare(dir, ffmpeg, o)   read and sync the episode: { info, plan, promos, names, markers, warnings }
 *   write(prep, outDir)       writes classical_et_cetera_<ep>_assembly.xml into outDir and returns its path
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const S = require("../engine/sync.js"), A = require("../engine/assemble.js"), E = require("./episode.js");

const FPS = 24;

/** The episode folder: the nearest folder above the project named <yyyymmdd>_<ep>_…, or null. */
function episodeDir(projectPath) {
  let d = path.dirname(projectPath);
  for (let i = 0; i < 4; i++) {
    if (E.folderInfo(d).ep) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

/** First ffmpeg that exists: an explicit path, PodGrip's vendor copy, PodCutter's or PodDirector's, else "ffmpeg". */
function findFfmpeg(extRoot, explicit) {
  const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const vendor = (root) => path.join(root, "vendor", "ffmpeg", "win32-x64", "ffmpeg.exe");
  const list = [explicit, process.env.FFMPEG, extRoot && vendor(extRoot)]
    .concat(["PodCutter", "PodDirector"].map((n) => vendor(path.join(appdata, "Adobe", "CEP", "extensions", n))))
    .filter(Boolean);
  return list.find((p) => fs.existsSync(p)) || "ffmpeg";
}

/**
 * Read and sync an episode folder. o: { leadSec (10), gapSec (2), log, inTemplate (the XML goes into David's
 * template project: its ready-made sequence is "classical_et_cetera_<ep> (Program)") }.
 * The episode take and the promo takes are laid out apart (sync.split); everything starts leadSec in.
 */
function prepare(dir, ffmpeg, o) {
  o = o || {};
  const ep = E.read(dir, ffmpeg, o.log);
  if (!ep.clips.some((c) => c.kind === "camera")) throw new Error("No camera clips in " + path.join(dir, "media", "captured", "footage"));
  if (!ep.clips.some((c) => c.kind === "wav")) throw new Error("No F6 WAVs in " + path.join(dir, "media", "captured", "sync_sound"));
  const lead = o.leadSec === undefined ? 10 : o.leadSec, gap = o.gapSec === undefined ? 2 : o.gapSec;
  const { episode: plan, promos } = S.split(ep.clips, { date: ep.f6Date, gapFrames: Math.round(gap * FPS), leadFrames: Math.round(lead * FPS) });
  const id = ep.ep || ep.slug;
  const markers = plan.video.flatMap((t) => t.clips).filter((c) => c.unsynced)
    .map((c) => ({ frame: c.start, name: "Not synced: " + c.name, comment: "No timecode on this clip's audio, or it overlaps none of the F6 audio. Line it up by hand." }));
  return { info: ep, id, plan, promos, inTemplate: !!o.inTemplate, names: A.names(plan, id, o.inTemplate), markers, warnings: plan.warnings };
}

function xmlName(id) { return "classical_et_cetera_" + id + "_assembly.xml"; }

/** Write the assembly XML into outDir; returns its path. */
function write(prep, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, xmlName(prep.id));
  fs.writeFileSync(file, A.xml(prep.plan, { ep: prep.id, markers: prep.markers, promos: prep.promos, inTemplate: prep.inTemplate }));
  return file;
}

module.exports = { episodeDir, findFfmpeg, prepare, write, xmlName };
