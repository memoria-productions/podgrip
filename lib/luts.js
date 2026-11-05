/*
 * PodGrip — the show LUT (Node). The panel remembers a LUT folder and the LUT chosen in it, and puts that LUT on the
 * cameras as Lumetri's Creative Look. Until David picks a folder it's the show's own:
 *
 *   <show>\#global\media\generated\color\      next to the season folders that hold the episodes
 */
"use strict";
const fs = require("fs"), path = require("path");

const SHOW_LUT = "2024_slog3_set_custom.cube";   // on every camera from ep 243 to 246
const SATURATION = 90;                            // Creative › Saturation, as David sets it
const LUT_FILE = /\.(cube|3dl|look|itx)$/i;

/** <show>\#global\media\generated\color, from an episode folder <show>\<season>\<episode>. */
function defaultFolder(episodeDir) {
  return path.join(path.dirname(path.dirname(episodeDir)), "#global", "media", "generated", "color");
}

/** The LUT files in a folder, sorted by name ([] if the folder isn't there). */
function list(folder) {
  try { return fs.readdirSync(folder).filter((f) => LUT_FILE.test(f)).sort((a, b) => a.localeCompare(b)); }
  catch (e) { return []; }
}

/** Which LUT to offer: the one chosen before if it's still there, else the show LUT, else the first. */
function pick(names, remembered) {
  if (remembered && names.indexOf(remembered) >= 0) return remembered;
  if (names.indexOf(SHOW_LUT) >= 0) return SHOW_LUT;
  return names[0] || null;
}

/** Saturation as typed in the panel: 0–200 (Lumetri's range), or null to leave it alone. */
function saturation(text) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) && n >= 0 && n <= 200 ? n : NaN;
}

module.exports = { SHOW_LUT, SATURATION, defaultFolder, list, pick, saturation };
