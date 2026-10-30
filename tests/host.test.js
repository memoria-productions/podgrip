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
