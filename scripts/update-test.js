#!/usr/bin/env node
// CI: exercise the in-panel updater on Windows: find the package in a folder and install it silently.
//   node scripts/update-test.js <folder-with-PodGrip-x.y.z-Windows.zip>
"use strict";
const path = require("path"), fs = require("fs");
const U = require(path.join(__dirname, "..", "lib", "updater.js"));
const { VERSION } = require(path.join(__dirname, "..", "lib", "version.js"));
(async () => {
  const r = await U.check({ current: "0.0.1", folder: path.resolve(process.argv[2]), github: false });
  if (!r.newer || r.latest.version !== VERSION) throw new Error("expected to find " + VERSION + ", got " + JSON.stringify(r));
  const t0 = Date.now();
  const res = await U.install(r.latest, (stage) => console.log("  " + stage));
  const installed = require(path.join(process.env.APPDATA, "Adobe", "CEP", "extensions", "PodGrip", "lib", "version.js")).VERSION;
  console.log("installed " + res.version + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s; panel reports " + installed);
  if (installed !== VERSION) throw new Error("installed version mismatch");
  if (!fs.existsSync(path.join(process.env.APPDATA, "Adobe", "CEP", "extensions", "PodGrip", "vendor", "ffmpeg", "win32-x64", "ffmpeg.exe"))) throw new Error("ffmpeg not installed");
  console.log("UPDATE TEST PASSED");
})().catch((e) => { console.error("UPDATE TEST FAILED:", e.message); process.exit(1); });
