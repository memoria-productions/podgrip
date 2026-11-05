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

/**
 * Premiere with the camera nests and QE. Each clip's Lumetri Color, once added, lists Basic Correction's Saturation
 * before its Look and the Creative Saturation after it, as Premiere does. `lookEcho: false` makes the Look hand back
 * something other than the path (Premiere may keep the LUT as data).
 */
function withNests(opts) {
  opts = opts || {};
  const list = (items) => { const l = items.slice(); Object.defineProperty(l, "numItems", { get: () => l.length }); return l; };
  const prop = (name, v) => {
    const p = { displayName: name, value: v, sets: 0 };
    p.getValue = () => p.value;
    p.setValue = (x) => { p.sets++; p.value = name === "Look" && opts.lookEcho === false ? "<blob>" : x; };
    return p;
  };
  const lumetri = () => ({ matchName: "AE.ADBE Lumetri", displayName: "Lumetri Color", properties: list(opts.noLook ? [prop("Saturation", 100)] :
    [prop("Exposure", 0), prop("Saturation", 100), prop("Look", ""), prop("Intensity", 100), prop("Saturation", 100), prop("Vibrance", 0)]) });
  const clip = (name, id) => ({ name, nodeId: id, components: list([{ matchName: "AE.ADBE Opacity", displayName: "Opacity", properties: list([]) }]) });
  const nest = (name, clips) => ({ name, videoTracks: Object.assign([{ clips: list(clips) }], { numTracks: 1 }) });
  const b = nest("246_b_cam", [clip("20261030_A7S3_1_5539.MP4", "n1")]);
  const a = nest("246_a_cam", [clip("20261030_A7S3-3_5390.MP4", "n2"), clip("20261030_A7S3-3_5391.MP4", "n3")]);
  if (opts.hasLumetri) a.videoTracks[0].clips[0].components.push(lumetri());
  a.getSelection = () => (opts.selection || []).map((id) => ({ nodeId: id }));
  const seqs = [b, a], added = [];
  // QE lists the gap before each clip as "Empty"; Lumetri added through QE shows up in the clip's components.
  const qeSeq = (s) => ({
    name: s.name,
    getVideoTrackAt: (t) => {
      const items = [];
      s.videoTracks[t].clips.forEach((c) => {
        items.push({ type: "Empty" });
        items.push({ type: "Clip", name: c.name, addVideoEffect: () => { added.push(c.name); if (!opts.qeFails) c.components.push(lumetri()); } });
      });
      return { numItems: items.length, getItemAt: (i) => items[i] };
    }
  });
  const lut = "M:\\show\\#global\\media\\generated\\color\\2024_slog3_set_custom.cube";
  const ctx = {
    app: { version: "25.2.0", enableQE: () => {}, project: { sequences: Object.assign(seqs.slice(), { numSequences: seqs.length }), activeSequence: a } },
    qe: { project: { numSequences: seqs.length, getSequenceAt: (i) => qeSeq(seqs[i]), getActiveSequence: () => qeSeq(a), getVideoEffectByName: (n) => ({ name: n }) } },
    File: function (p) { this.exists = p === lut; }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const call = (fn, ...args) => JSON.parse(vm.runInContext("PG." + fn + "(" + args.map((x) => JSON.stringify(x)).join(",") + ")", ctx));
  const fx = (seq, i) => seq.videoTracks[0].clips[i].components.find((c) => c.matchName === "AE.ADBE Lumetri");
  return { call, a, b, added, lut, fx };
}

test("host: the show LUT goes on every camera in the nests, as the Creative Look, with the Creative saturation", () => {
  const P = withNests();
  const r = P.call("applyLut", ["246_b_cam", "246_a_cam"], P.lut, 90);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.problems, []);
  assert.equal(r.done.length, 3);
  assert.ok(r.done.every((d) => d.added && d.confirmed && d.saturation === 90));
  assert.deepEqual(P.added, ["20261030_A7S3_1_5539.MP4", "20261030_A7S3-3_5390.MP4", "20261030_A7S3-3_5391.MP4"], "QE's gaps are skipped");
  const p = P.fx(P.a, 1).properties;
  assert.equal(p[2].value, P.lut);
  assert.equal(p[1].value, 100, "Basic Correction's saturation isn't touched");
  assert.equal(p[4].value, 90, "Creative saturation");
});

test("host: a clip that already has Lumetri Color keeps it, and running again changes nothing", () => {
  const P = withNests({ hasLumetri: true });
  P.call("applyLut", ["246_a_cam"], P.lut, 90);
  assert.deepEqual(P.added, ["20261030_A7S3-3_5391.MP4"], "no second Lumetri on the clip that had one");
  const again = P.call("applyLut", ["246_a_cam"], P.lut, 90);
  assert.ok(again.done.every((d) => d.already));
  assert.equal(P.fx(P.a, 0).properties[2].sets, 1);
  assert.equal(P.a.videoTracks[0].clips[0].components.filter((c) => c.matchName === "AE.ADBE Lumetri").length, 1);
});

test("host: an empty saturation leaves it alone", () => {
  const P = withNests();
  P.call("applyLut", ["246_b_cam"], P.lut, null);
  assert.equal(P.fx(P.b, 0).properties[4].value, 100);
});

test("host: LUT problems are reported clip by clip, not as a stop", () => {
  const E = withNests({ lookEcho: false });
  assert.equal(E.call("applyLut", ["246_b_cam"], E.lut, 90).done[0].confirmed, false);
  const P = withNests({ qeFails: true });
  const r = P.call("applyLut", ["246_b_cam", "246_x_cam"], P.lut, 90);
  assert.equal(r.ok, true);
  assert.match(r.problems[0], /246_b_cam › 20261030_A7S3_1_5539.MP4: Premiere didn't add Lumetri Color/);
  assert.deepEqual(r.missing, ["246_x_cam"]);
  const N = withNests({ noLook: true, hasLumetri: true });
  assert.match(N.call("applyLut", ["246_a_cam"], N.lut, 90).problems[0], /no Look setting.*Saturation/);
  assert.match(P.call("applyLut", ["246_b_cam"], "M:\\nope.cube", 90).error, /LUT isn't there/);
});

test("host: Apply LUT to selected clips does only the selected ones", () => {
  const P = withNests({ selection: ["n3"] });
  const r = P.call("applyLutToSelection", P.lut, 90);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.done.map((d) => d.clip), ["20261030_A7S3-3_5391.MP4"]);
  assert.deepEqual(P.added, ["20261030_A7S3-3_5391.MP4"]);
  const none = withNests();
  assert.match(none.call("applyLutToSelection", none.lut, 90).error, /No video clips are selected/);
});
