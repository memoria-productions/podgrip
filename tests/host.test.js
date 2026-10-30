"use strict";
// host/host.jsx against a fake Premiere: the ExtendScript runs in a sandbox with a stand-in `app` and `File`.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "host", "host.jsx"), "utf8").replace(/^#target.*$/m, "");

/** A project like David's template: the ### sequences, plus bins and items at the top. */
function fakePremiere(opts) {
  opts = opts || {};
  const list = (items) => { const l = items.slice(); Object.defineProperty(l, "numItems", { get: () => l.length }); return l; };
  const item = (name, type) => ({ name, type: type || 1, children: list([]) });
  const root = item("root", 3);
  root.children = list(opts.top || []);
  root.createBin = (name) => { const b = item(name, 2); root.children.push(b); return b; };
  const seqs = (opts.sequences || []).map((name) => {
    const pi = item(name);
    const s = { projectItem: pi };
    Object.defineProperty(s, "name", { get: () => pi.name, set: (v) => { if (opts.seqNameReadOnly) throw new Error("read-only"); pi.name = v; } });
    if (opts.itemNameReadOnly) Object.defineProperty(pi, "name", { value: name, writable: false });
    return s;
  });
  const sequences = Object.assign(seqs.slice(), { numSequences: seqs.length });
  const imports = [];
  const project = {
    path: opts.path === undefined ? "M:\\ep\\project_files\\premiere\\classical_et_cetera_245.prproj" : opts.path, name: "classical_et_cetera_245.prproj",
    rootItem: root, sequences,
    importFiles: (files, suppressUI, bin, stills) => {
      imports.push({ files, suppressUI, bin: bin.name, stills });
      const b = item(path.basename(files[0]), 2);
      b.children = list(["245 (Sync)", "245_b_cam", "245_a_cam"].map((n) => item(n)));
      bin.children.push(b);
      return true;
    }
  };
  const ctx = { app: { version: "25.2.0", project }, File: function (p) { this.exists = (opts.files || []).includes(p); } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const call = (fn, ...args) => JSON.parse(vm.runInContext("PG." + fn + "(" + args.map((a) => JSON.stringify(a)).join(",") + ")", ctx));
  return { call, project, imports };
}

const TEMPLATE = ["classical_et_cetera_###_promo_9x16", "classical_et_cetera_###_60_reel_9x16", "classical_et_cetera_###", "something else"];

test("host: ping gives the open project's path", () => {
  const r = fakePremiere().call("ping");
  assert.equal(r.ok, true);
  assert.equal(r.projectPath, "M:\\ep\\project_files\\premiere\\classical_et_cetera_245.prproj");
});

test("host: the template's ### sequences take the episode number; others are left alone", () => {
  const P = fakePremiere({ sequences: TEMPLATE });
  const r = P.call("renameTemplateSequences", "245");
  assert.deepEqual(r.renamed.map((x) => x.to), ["classical_et_cetera_245_promo_9x16", "classical_et_cetera_245_60_reel_9x16", "classical_et_cetera_245"]);
  assert.ok(r.renamed.every((x) => x.done));
  assert.deepEqual(P.project.sequences.map((s) => s.name), ["classical_et_cetera_245_promo_9x16", "classical_et_cetera_245_60_reel_9x16", "classical_et_cetera_245", "something else"]);
  assert.deepEqual(P.call("renameTemplateSequences", "245").renamed, [], "running it again changes nothing");
});

test("host: renaming works through either the project item or the sequence, and says when neither would", () => {
  assert.ok(fakePremiere({ sequences: TEMPLATE, seqNameReadOnly: true }).call("renameTemplateSequences", "245").renamed.every((x) => x.done));
  const stuck = fakePremiere({ sequences: ["classical_et_cetera_###"], seqNameReadOnly: true, itemNameReadOnly: true }).call("renameTemplateSequences", "245");
  assert.equal(stuck.renamed[0].done, false);
  assert.equal(fakePremiere().call("renameTemplateSequences", "2;4").ok, false);
});

test("host: the XML is imported with no dialog into a top-level PodGrip bin, made if needed", () => {
  const xml = "M:\\ep\\project_files\\premiere\\classical_et_cetera_245_assembly.xml";
  const P = fakePremiere({ files: [xml] });
  assert.equal(P.call("findBin", "PodGrip").exists, false);
  const r = P.call("importXml", xml, "PodGrip");
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(P.imports)), [{ files: [xml], suppressUI: true, bin: "PodGrip", stills: false }]);
  assert.deepEqual(r.items, ["245 (Sync)", "245_b_cam", "245_a_cam"], "items inside the XML's own sub-bin are listed");
  const again = P.call("findBin", "PodGrip");
  assert.equal(again.exists, true);
  assert.equal(again.items.length, 3);
});

test("host: a missing XML or no open project is reported, not imported", () => {
  const P = fakePremiere();
  assert.match(P.call("importXml", "M:\\nope.xml", "PodGrip").error, /isn't there/);
  assert.equal(P.imports.length, 0);
});

/**
 * Premiere with a (Program) sequence: mics on A1–A4 from 10 s, V1 empty, and 246_mc made. `audio` says what placing
 * the multicam does with its empty audio: "none", "skip-locked" (lands on A1 unless it's locked), or "cuts" (lands
 * on A1 even when locked, cutting Martin's mic).
 */
function withProgram(audio, opts) {
  opts = opts || {};
  const time = (s) => ({ seconds: s, ticks: String(Math.round(s * 254016000000)) });
  const clipList = (items) => { const l = items.slice(); Object.defineProperty(l, "numItems", { get: () => l.length }); return l; };
  const clip = (name, s, e, list) => { const c = { name, start: time(s), end: time(e), remove: () => list.splice(list.indexOf(c), 1) }; return c; };
  const track = () => { const t = { clips: clipList([]), locked: false }; t.isLocked = () => t.locked; t.setLocked = (v) => { t.locked = !!v; }; return t; };
  const tracks = (n) => Object.assign(Array.from({ length: n }, track), { numTracks: n });
  const program = { name: "classical_et_cetera_246 (Program)", sequenceID: "p1", videoTracks: tracks(1), audioTracks: tracks(4) };
  program.audioTracks.forEach((t, i) => t.clips.push(clip("261026_001.WAV", 10, 3110, t.clips)));
  if (opts.v1Busy) program.videoTracks[0].clips.push(clip("something", 0, 5, program.videoTracks[0].clips));
  const mc = { name: "246_mc", sequenceID: "m1", projectItem: { name: "246_mc" } };
  program.videoTracks[0].overwriteClip = (pi, at) => {
    const v = program.videoTracks[0].clips;
    v.push(clip(pi.name, at, 3110, v));
    const a1 = program.audioTracks[0];
    if (audio === "none" || (audio === "skip-locked" && a1.locked)) return;
    a1.clips[0].end = time(0); a1.clips[0].start = time(3110);   // the overwrite eats the mic underneath
    a1.clips.push(clip(pi.name, at, 3110, a1.clips));
  };
  const seqs = (opts.noMc ? [program] : [program, mc]);
  const opened = [];
  const ctx = { app: { version: "25.2.0", project: { sequences: Object.assign(seqs.slice(), { numSequences: seqs.length }), openSequence: (id) => opened.push(id) } }, File: function () {} };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const call = (fn, ...args) => JSON.parse(vm.runInContext("PG." + fn + "(" + args.map((a) => JSON.stringify(a)).join(",") + ")", ctx));
  return { call, program, opened };
}

const PLACE = ["246_mc", "classical_et_cetera_246 (Program)"];

test("host: Place multicam puts 246_mc on V1 at the start and leaves the mics alone", () => {
  const P = withProgram("none");
  const r = P.call("placeMulticam", ...PLACE);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.placedAt, 0);
  assert.deepEqual(P.opened, ["p1"], "the program sequence is opened");
  assert.equal(P.program.videoTracks[0].clips[0].name, "246_mc");
  assert.ok(P.program.audioTracks.every((t) => t.clips.length === 1 && t.clips[0].start.seconds === 10 && !t.locked), "mics as they were, tracks unlocked again");
});

test("host: with the audio tracks locked, the multicam's empty audio doesn't land on the mics", () => {
  const P = withProgram("skip-locked");
  const r = P.call("placeMulticam", ...PLACE);
  assert.equal(r.ok, true, r.error);
  assert.equal(P.program.audioTracks[0].clips.length, 1);
  assert.equal(P.program.audioTracks[0].clips[0].name, "261026_001.WAV");
});

test("host: if placing cut into a mic anyway, it says so and how to undo", () => {
  const r = withProgram("cuts").call("placeMulticam", ...PLACE);
  assert.equal(r.ok, false);
  assert.match(r.error, /Ctrl\+Z/);
});

test("host: no multicam yet, or something already on V1, stops before touching anything", () => {
  assert.match(withProgram("none", { noMc: true }).call("placeMulticam", ...PLACE).error, /no 246_mc yet.*Custom/);
  const busy = withProgram("none", { v1Busy: true });
  assert.match(busy.call("placeMulticam", ...PLACE).error, /already has something on V1/);
  assert.equal(busy.program.videoTracks[0].clips.length, 1);
});
