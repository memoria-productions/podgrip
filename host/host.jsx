/*
 * PodGrip — ExtendScript host (runs inside Premiere Pro). ES3: no let, no arrow functions, no built-in JSON.
 *
 * Everything returns a JSON string: { ok: true, ... } or { ok: false, error }.
 *
 *   PG.ping()                         Premiere version and the open project's path
 *   PG.renameTemplateSequences(ep)    "classical_et_cetera_###…" -> "classical_et_cetera_<ep>…" (David's template)
 *   PG.findBin(name)                  is there already a bin of that name at the top of the project? (and what's in it)
 *   PG.importXml(file, binName)       import an FCP7 XML into a top-level bin, with no dialog
 */

#target premierepro

if (typeof JSON === "undefined") {
  JSON = {
    parse: function (s) { return eval("(" + s + ")"); },
    stringify: function (v) {
      var t = typeof v;
      if (v === null || t === "undefined") return "null";
      if (t === "number" || t === "boolean") return isFinite(v) || t === "boolean" ? String(v) : "null";
      if (t === "string") return '"' + v.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
      var out = [], k;
      if (v instanceof Array) { for (k = 0; k < v.length; k++) out.push(JSON.stringify(v[k])); return "[" + out.join(",") + "]"; }
      for (k in v) if (v.hasOwnProperty(k) && typeof v[k] !== "function") out.push(JSON.stringify(k) + ":" + JSON.stringify(v[k]));
      return "{" + out.join(",") + "}";
    }
  };
}

var PG = (function () {
  var BIN = 2; // ProjectItemType.BIN

  function ok(o) { o = o || {}; o.ok = true; return JSON.stringify(o); }
  function fail(msg) { return JSON.stringify({ ok: false, error: String(msg) }); }

  function ping() {
    if (!app.project) return fail("No project is open.");
    return ok({ version: app.version, projectPath: app.project.path || null, projectName: app.project.name || null });
  }

  /** Names in David's template carry ### for the episode number: sequences and their project items. */
  function renameTemplateSequences(ep) {
    if (!app.project) return fail("No project is open.");
    if (!/^\w+$/.test(String(ep))) return fail("Not an episode number: " + ep);
    var renamed = [], seqs = app.project.sequences, i;
    for (i = 0; i < seqs.numSequences; i++) {
      var s = seqs[i], from = s.name;
      if (from.indexOf("###") < 0) continue;
      var to = from.split("###").join(String(ep));
      // Renaming the project item renames the sequence; set both in case one is read-only in this version.
      try { if (s.projectItem) s.projectItem.name = to; } catch (e1) { /* try the sequence */ }
      try { if (s.name !== to) s.name = to; } catch (e2) { /* checked below */ }
      renamed.push({ from: from, to: to, done: s.name === to || (s.projectItem && s.projectItem.name === to) });
    }
    return ok({ renamed: renamed });
  }

  function topBin(name) {
    var root = app.project.rootItem, i;
    for (i = 0; i < root.children.numItems; i++) {
      var c = root.children[i];
      if (c.type === BIN && c.name === name) return c;
    }
    return null;
  }

  /** Names inside a bin, one level of sub-bins deep (an imported XML can land in a bin of its own). */
  function contents(bin) {
    var names = [], i, j;
    for (i = 0; i < bin.children.numItems; i++) {
      var c = bin.children[i];
      if (c.type === BIN) { for (j = 0; j < c.children.numItems; j++) names.push(c.children[j].name); }
      else names.push(c.name);
    }
    return names;
  }

  function findBin(name) {
    if (!app.project) return fail("No project is open.");
    var b = topBin(name);
    return ok({ exists: !!b, items: b ? contents(b) : [] });
  }

  function importXml(file, binName) {
    if (!app.project) return fail("No project is open.");
    if (!new File(file).exists) return fail("The XML isn't there: " + file);
    var bin = topBin(binName);
    if (!bin) { app.project.rootItem.createBin(binName); bin = topBin(binName); }
    if (!bin) return fail("Couldn't make the bin " + binName);
    var done = app.project.importFiles([file], true, bin, false);   // true: no dialog
    if (done === false) return fail("Premiere didn't import " + file);
    return ok({ items: contents(bin) });
  }

  return { ping: ping, renameTemplateSequences: renameTemplateSequences, findBin: findBin, importXml: importXml };
})();
