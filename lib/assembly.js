/*
 * PodGrip — "Begin episode assembly" (Node): from an open episode project to an assembly XML ready to import.
 * Used by the panel (client/panel.js) and the command line (podgrip assemble), so both build the same thing.
 *
 *   episodeDir(projectPath)   the episode folder a project lives in: <season>\<yyyymmdd>_<ep>_<slug>\project_files\premiere\x.prproj
 *   showFromProject(p, ep)    the show's name from the project file: margin_notes_015.prproj -> margin_notes
 *   showFromFolder(dir)       the show's name from <show>\<season>\<episode>, when there's no project (the CLI)
 *   findFfmpeg(extRoot)       ffmpeg: PodGrip's own, then PodCutter's (formerly PodDirector) bundled copy, then PATH
 *   prepare(dir, ffmpeg, o)   read and sync the episode: { info, show, plan, promos, names, markers, warnings }
 *   write(prep, outDir)       writes <show>_<ep>_assembly.xml into outDir and returns its path
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

/**
 * The show's name, from the project file: what comes before the episode number (or ###), so
 * margin_notes_015.prproj -> "margin_notes" and classical_et_cetera_245_25.2.prproj -> "classical_et_cetera".
 * With no number in the name, a trailing version ("_25.2") is dropped. Null if nothing is left.
 */
function showFromProject(projectPath, ep) {
  const base = path.basename(projectPath).replace(/\.prproj$/i, "");
  const at = (tok) => { const m = new RegExp("^(.+?)_" + tok + "(?=$|[_. ])").exec(base); return m ? m[1] : null; };
  const show = (ep && at(ep)) || at("###") || base.replace(/(_[\d.]+)+$/, "");
  return show || null;
}

/** The show's name from its folders, <show>\<season>\<episode> ("margin_notes"), for when there's no project. */
function showFromFolder(episodeDir) { return path.basename(path.dirname(path.dirname(episodeDir))) || null; }

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
 * Read and sync an episode folder. o: { leadSec (10), gapSec (2), log, show (the show's name: from the project
 * file in the panel, else from the folders), inTemplate (the XML goes into the show's template project: its
 * ready-made sequence is "<show>_<ep> (Program)") }.
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
  const show = o.show || showFromFolder(dir);
  return { info: ep, id, show, plan, promos, inTemplate: !!o.inTemplate, names: A.names(plan, id, o.inTemplate, show), markers, warnings: plan.warnings };
}

function xmlName(id, show) { return (show ? show + "_" : "") + id + "_assembly.xml"; }

/** Write the assembly XML into outDir; returns its path. */
function write(prep, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, xmlName(prep.id, prep.show));
  fs.writeFileSync(file, A.xml(prep.plan, { ep: prep.id, show: prep.show, markers: prep.markers, promos: prep.promos, inTemplate: prep.inTemplate }));
  return file;
}

module.exports = { episodeDir, showFromProject, showFromFolder, findFfmpeg, prepare, write, xmlName };
