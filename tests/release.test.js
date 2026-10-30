"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const { VERSION, REPO } = require("../lib/version.js"), U = require("../lib/updater.js");
const root = path.join(__dirname, "..");

test("release: one version everywhere: lib/version.js, the manifest and package.json", () => {
  const manifest = fs.readFileSync(path.join(root, "CSXS", "manifest.xml"), "utf8");
  assert.match(manifest, new RegExp('ExtensionBundleVersion="' + VERSION.replace(/\./g, "\\.") + '"'));
  assert.match(manifest, new RegExp('Extension Id="com\\.memoriapress\\.podgrip\\.panel" Version="' + VERSION.replace(/\./g, "\\.") + '"'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version, VERSION);
  assert.equal(REPO, "memoria-productions/podgrip");
});

test("updater: version order, and only PodGrip packages count", () => {
  assert.equal(U.compare("0.10.0", "0.9.9"), 1);
  assert.equal(U.compare("v0.1.0", "0.1.0"), 0);
  assert.ok(U.ZIP_RE.test("PodGrip-1.2.3-Windows.zip"));
  assert.ok(!U.ZIP_RE.test("PodCutter-1.2.3-Windows.zip"));
});

test("updater: an update folder offers its newest package", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-upd-"));
  try {
    ["PodGrip-0.1.0-Windows.zip", "PodGrip-0.10.0-Windows.zip", "PodGrip-0.2.0-Windows.zip", "PodCutter-9.0.0-Windows.zip"].forEach((f) => fs.writeFileSync(path.join(dir, f), ""));
    const r = await U.check({ current: "0.2.0", folder: dir, github: false });
    assert.equal(r.latest.version, "0.10.0");
    assert.equal(r.newer, true);
    assert.equal((await U.check({ current: "0.10.0", folder: dir, github: false })).newer, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("updater: only a manifest change beyond its version numbers needs a Premiere restart", () => {
  const m = fs.readFileSync(path.join(root, "CSXS", "manifest.xml"), "utf8");
  assert.equal(U.manifestSignature(m), U.manifestSignature(m.replace(/0\.1\.0/g, "0.2.0")));
  assert.notEqual(U.manifestSignature(m), U.manifestSignature(m.replace("<Height>620</Height>", "<Height>700</Height>")));
});
