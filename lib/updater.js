/*
 * PodGrip — self-updater (Windows, Node), adapted from PodCutter's.
 *
 * Looks for a newer PodGrip-x.y.z-Windows.zip in the GitHub releases of memoria-productions/podgrip (public), or in
 * an update folder, and installs it by unzipping the package and running its install.ps1 -Silent, which mirrors the
 * new files over the installed panel. Reopening the panel loads them; Premiere only needs a restart when the
 * manifest changed beyond its version numbers, since it reads that at startup.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), https = require("https");
const { REPO } = require("./version.js");

const ZIP_RE = /^PodGrip-(\d+\.\d+\.\d+)-Windows\.zip$/i;

function compare(a, b) {
  const x = String(a).replace(/^v/, "").split("."), y = String(b).replace(/^v/, "").split(".");
  for (let i = 0; i < 3; i++) { const d = (+x[i] || 0) - (+y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const r = https.get(url, { headers: { "User-Agent": "PodGrip-updater", Accept: "application/vnd.github+json" } }, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => {
        if (res.statusCode === 404) return reject(new Error("No release published yet."));
        if (res.statusCode !== 200) return reject(new Error("GitHub answered " + res.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    r.on("error", reject);
    r.setTimeout(15000, () => r.destroy(new Error("GitHub did not respond")));
  });
}

/** Latest release on GitHub: { version, url, notes, page, source } */
function checkGitHub(repo) {
  return getJson("https://api.github.com/repos/" + (repo || REPO) + "/releases/latest").then((rel) => {
    const asset = (rel.assets || []).find((a) => ZIP_RE.test(a.name));
    if (!asset) throw new Error("The latest release has no Windows package attached yet.");
    return { version: ZIP_RE.exec(asset.name)[1], url: asset.browser_download_url, size: asset.size, notes: rel.body || "", page: rel.html_url, source: "GitHub" };
  });
}

/** Newest PodGrip-x.y.z-Windows.zip in a folder: { version, file, source } */
function checkFolder(dir) {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) return reject(new Error("Can't read update folder " + dir + ": " + err.message));
      let best = null;
      files.forEach((f) => { const m = ZIP_RE.exec(f); if (m && (!best || compare(m[1], best.version) > 0)) best = { version: m[1], file: path.join(dir, f), source: "update folder" }; });
      best ? resolve(best) : reject(new Error("No PodGrip-x.y.z-Windows.zip in " + dir));
    });
  });
}

/** opts: { current, folder, github (true), repo }. Resolves { current, latest, newer, errors }. */
function check(opts) {
  const jobs = [];
  const soft = (p) => p.then((r) => r, (e) => ({ error: e.message }));
  if (opts.folder) jobs.push(soft(checkFolder(opts.folder)));
  if (opts.github !== false) jobs.push(soft(checkGitHub(opts.repo)).then((r) => (r.error ? { error: "GitHub: " + r.error } : r)));
  return Promise.all(jobs).then((rs) => {
    const latest = rs.filter((r) => r.version).sort((a, b) => compare(b.version, a.version))[0] || null;
    return { current: opts.current, latest, newer: !!(latest && compare(latest.version, opts.current) > 0), errors: rs.filter((r) => r.error).map((r) => r.error) };
  });
}

function download(url, dest, onProgress, hops) {
  return new Promise((resolve, reject) => {
    if ((hops || 0) > 5) return reject(new Error("Too many redirects"));
    https.get(url, { headers: { "User-Agent": "PodGrip-updater" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(download(res.headers.location, dest, onProgress, (hops || 0) + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("Download failed (" + res.statusCode + ")")); }
      const total = +res.headers["content-length"] || 0, out = fs.createWriteStream(dest);
      let got = 0;
      res.on("data", (d) => { got += d.length; if (onProgress && total) onProgress(got / total); });
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(dest)));
      out.on("error", reject);
    }).on("error", reject);
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(out.trim().split(/\r?\n/).slice(-4).join(" ") || "exit " + code))));
  });
}

/** The manifest without its version numbers and layout: two equal signatures need no Premiere restart. */
function manifestSignature(xml) {
  return String(xml).replace(/(ExtensionBundleVersion|Version)="\d+\.\d+\.\d+"/g, '$1=""').replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
}

function needsRestart(installedManifest, newManifest) {
  try { return manifestSignature(fs.readFileSync(installedManifest, "utf8")) !== manifestSignature(fs.readFileSync(newManifest, "utf8")); }
  catch (e) { return true; }
}

/**
 * Download (or copy), unpack and install an update. release: check().latest; onProgress(stage, fraction);
 * opts.extensionRoot: the installed panel, to tell whether Premiere needs a restart. Resolves { version, log, needsRestart }.
 */
function install(release, onProgress, opts) {
  opts = opts || {};
  onProgress = onProgress || (() => {});
  if (process.platform !== "win32") return Promise.reject(new Error("Automatic install is only available on Windows."));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-update-")), zip = path.join(work, "PodGrip-" + release.version + "-Windows.zip");
  const q = (s) => "'" + s.replace(/'/g, "''") + "'";
  let restart = true;
  const get = release.file ? (onProgress("copy", 0), fs.promises.copyFile(release.file, zip)) : download(release.url, zip, (f) => onProgress("download", f));
  return get.then(() => {
    onProgress("unpack", 0);
    return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Expand-Archive -LiteralPath " + q(zip) + " -DestinationPath " + q(path.join(work, "x")) + " -Force"]);
  }).then(() => {
    const top = fs.readdirSync(path.join(work, "x")).map((f) => path.join(work, "x", f)).find((f) => fs.existsSync(path.join(f, "install.ps1")));
    if (!top) throw new Error("The update package has no installer in it.");
    if (opts.extensionRoot) restart = needsRestart(path.join(opts.extensionRoot, "CSXS", "manifest.xml"), path.join(top, "PodGrip", "CSXS", "manifest.xml"));
    onProgress("install", 0);
    return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(top, "install.ps1"), "-Silent"]);
  }).then((log) => {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* temp cleanup is best-effort */ }
    onProgress("done", 1);
    return { version: release.version, log, needsRestart: restart };
  });
}

module.exports = { ZIP_RE, compare, check, checkGitHub, checkFolder, install, manifestSignature, needsRestart };
