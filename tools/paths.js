// Where things live on David's machine. Override any of them with an environment variable of the same name.
"use strict";
const path = require("path"), os = require("os");
const home = os.homedir();
const env = (k, d) => process.env[k] || d;

module.exports = {
  // Episode folders: <SEASON_DIR>\<yyyymmdd>_<ep>_<slug>\
  SEASON_DIR: env("SEASON_DIR", "M:\\@PRODUCTION\\memoria_press\\video\\#serial\\classical_et_cetera\\2026"),
  GLOBAL_MEDIA: env("GLOBAL_MEDIA", "M:\\@PRODUCTION\\memoria_press\\video\\#serial\\classical_et_cetera\\#global\\media"),
  // ffmpeg: PodCutter's bundled copy (PodDirector's before the rename); ffmpeg isn't on PATH on David's PC
  FFMPEG: env("FFMPEG", require("../lib/assembly.js").findFfmpeg()),
  EXIFTOOL: env("EXIFTOOL", path.join(home, "AppData", "Local", "Programs", "ExifTool", "ExifTool.exe")),
  // Data gathered from past episodes (see PROJECT.md section 8)
  EDITS_DIR: env("EDITS_DIR", path.join(home, "Documents", "PodDirector", "edits")),       // tools/prproj.js output
  MOTION_DIR: env("MOTION_DIR", path.join(home, "Documents", "PodDirector", "motion")),     // tools/analyze_past.js output
  AUDIO_DIR: env("AUDIO_DIR", path.join(home, "Music", "poddirector_audio_analyze")),       // local copies of the F6 WAVs
  SEATING: env("SEATING", path.join(home, "Music", "poddirector_audio_analyze", "seating.json")),
  // A PodDirector analysis export, used for its base cutting config
  BASE_CONFIG: env("BASE_CONFIG", path.join(home, "Documents", "PodDirector", "classical_et_cetera_244 Copy 02.poddirector.json")),
  WORK_DIR: env("WORK_DIR", path.join(home, "Documents", "PodGrip"))                   // caches and reports
};
