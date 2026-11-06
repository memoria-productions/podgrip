/*
 * PodGrip — ExtendScript host (runs inside Premiere Pro). ES3: no let, no arrow functions, no built-in JSON.
 *
 * Everything returns a JSON string: { ok: true, ... } or { ok: false, error }.
 *
 *   PG.ping()                         Premiere version and the open project's path
 *   PG.renameTemplateSequences(ep)    "<show>_###…" -> "<show>_<ep>…" (the show's template)
 *   PG.findBin(name)                  is there already a bin of that name at the top of the project? (and what's in it)
 *   PG.importXml(file, binName)       import an FCP7 XML into a top-level bin, with no dialog
 *   PG.placeMulticam(mc, program)     put <ep>_mc on V1 of the program sequence at the start, video only, mics untouched
 *   PG.applyLut(seqs, lut, sat)       Lumetri Color with the LUT as its Creative Look (and Creative Saturation) on every clip of those sequences
 *   PG.applyLutToSelection(lut, sat)  the same, on the clips selected in the open sequence
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

  function sequenceNamed(name) {
    var seqs = app.project.sequences, i;
    for (i = 0; i < seqs.numSequences; i++) if (seqs[i].name === name) return seqs[i];
    return null;
  }

  /** Every audio clip in a sequence as "track|name|start|end", to check nothing moved. */
  function audioSnapshot(seq) {
    var out = [], t, i;
    for (t = 0; t < seq.audioTracks.numTracks; t++) {
      var clips = seq.audioTracks[t].clips;
      for (i = 0; i < clips.numItems; i++) out.push(t + "|" + clips[i].name + "|" + clips[i].start.ticks + "|" + clips[i].end.ticks);
    }
    return out;
  }

  /**
   * Put the multicam David made from the nests on V1 of the program sequence, at the very start, video only.
   * A script can't switch off source patching, so the audio tracks are locked while it's placed, any (empty) audio
   * the multicam still brings is removed, and the mics are checked against how they were before.
   */
  function placeMulticam(mcName, programName) {
    if (!app.project) return fail("No project is open.");
    var mc = sequenceNamed(mcName), seq = sequenceNamed(programName), t;
    if (!mc) return fail("There's no " + mcName + " yet. Make it from the nests first (Create Multi-Camera Source Sequence, name menu Custom).");
    if (!seq) return fail("Can't find the sequence " + programName + ". Run Begin episode assembly first.");
    var v1 = seq.videoTracks[0];
    if (v1.clips.numItems > 0) return fail(programName + " already has something on V1. Clear V1 first, or place " + mcName + " by hand.");
    app.project.openSequence(seq.sequenceID);
    var before = audioSnapshot(seq), locked = [];
    for (t = 0; t < seq.audioTracks.numTracks; t++) {
      try { if (!seq.audioTracks[t].isLocked()) { seq.audioTracks[t].setLocked(1); locked.push(t); } } catch (e1) { /* older versions: checked below */ }
    }
    try { v1.overwriteClip(mc.projectItem, 0); }
    finally { for (t = 0; t < locked.length; t++) { try { seq.audioTracks[locked[t]].setLocked(0); } catch (e2) { /* nothing to undo */ } } }
    if (v1.clips.numItems === 0) return fail("Premiere didn't place " + mcName + " on V1. Place it by hand: turn off the A1 source patch, put the playhead at the start, select " + mcName + " and press . (Overwrite).");
    // Anything new on the audio tracks named like the multicam is its empty audio: take it out.
    var removed = 0, i;
    for (t = 0; t < seq.audioTracks.numTracks; t++) {
      var clips = seq.audioTracks[t].clips;
      for (i = clips.numItems - 1; i >= 0; i--) if (clips[i].name === mcName) { clips[i].remove(0, 0); removed++; }
    }
    var after = audioSnapshot(seq);
    if (after.join("\n") !== before.join("\n"))
      return fail("Placing " + mcName + " changed the audio tracks, so the mics may have been cut. Press Ctrl+Z in Premiere to undo, then place it by hand (A1 source patch off, then Overwrite).");
    return ok({ placedAt: v1.clips[0].start.seconds, removedAudio: removed });
  }

  // ------------------------------------------------------------ the show LUT
  // Premiere's scripting has no way to add an effect, so Lumetri Color goes on through the QE DOM (unofficial, but
  // what every panel uses). Its settings are then reached through the clip's components as usual.
  var LUMETRI = "AE.ADBE Lumetri";

  function qeSequence(name) {
    app.enableQE();
    var i;
    for (i = 0; i < qe.project.numSequences; i++) { var s = qe.project.getSequenceAt(i); if (s.name === name) return s; }
    return null;
  }

  /** The QE item for the n-th clip on a QE track: QE also lists the gaps between clips, as "Empty". */
  function qeClip(qeTrack, n) {
    var i, k = -1;
    for (i = 0; i < qeTrack.numItems; i++) {
      var it = qeTrack.getItemAt(i);
      if (it.type === "Empty") continue;
      if (++k === n) return it;
    }
    return null;
  }

  function lumetriOf(clip) {
    var i;
    for (i = 0; i < clip.components.numItems; i++) {
      var c = clip.components[i];
      if (c.matchName === LUMETRI || c.displayName === "Lumetri Color") return c;
    }
    return null;
  }

  /** Lumetri's Creative settings: its Look, and the Creative Saturation (the first Saturation after the Look; Basic Correction has one before it). */
  function creative(comp) {
    var p = comp.properties, i, look = -1, sat = null, names = [];
    for (i = 0; i < p.numItems; i++) {
      names.push(p[i].displayName);
      if (look < 0 && p[i].displayName === "Look") look = i;
      else if (look >= 0 && !sat && p[i].displayName === "Saturation") sat = p[i];
    }
    return { look: look >= 0 ? p[look] : null, saturation: sat, names: names };
  }

  /** Lumetri Color on one clip, with the LUT as its Creative Look (and the saturation, if given). Returns what it did. */
  function lutOnClip(seq, qeSeq, t, i, lut, saturation) {
    var clip = seq.videoTracks[t].clips[i], comp = lumetriOf(clip), added = false;
    if (!comp) {
      var q = qeSeq && qeClip(qeSeq.getVideoTrackAt(t), i);
      if (!q) throw new Error("couldn't reach it through Premiere's QE scripting");
      q.addVideoEffect(qe.project.getVideoEffectByName("Lumetri Color"));
      clip = seq.videoTracks[t].clips[i];
      comp = lumetriOf(clip);
      if (!comp) throw new Error("Premiere didn't add Lumetri Color");
      added = true;
    }
    var cr = creative(comp);
    if (!cr.look) throw new Error("its Lumetri Color has no Look setting the script can reach (it has: " + cr.names.join(", ") + ")");
    var had = String(cr.look.getValue()) === lut;
    if (!had) cr.look.setValue(lut, true);
    if (saturation !== null && saturation !== undefined && cr.saturation && cr.saturation.getValue() !== saturation) cr.saturation.setValue(saturation, true);
    return {
      clip: clip.name, added: added, already: had,
      confirmed: String(cr.look.getValue()) === lut,   // Premiere may hand back the LUT as something other than its path
      saturation: cr.saturation ? cr.saturation.getValue() : null
    };
  }

  /** Run lutOnClip over a list of [t, i] in a sequence, collecting results and problems instead of stopping. */
  function lutOnClips(seq, qeSeq, at, lut, saturation, done, problems) {
    var k;
    for (k = 0; k < at.length; k++) {
      var name = seq.videoTracks[at[k][0]].clips[at[k][1]].name;
      try { var r = lutOnClip(seq, qeSeq, at[k][0], at[k][1], lut, saturation); r.sequence = seq.name; done.push(r); }
      catch (e) { problems.push(seq.name + " › " + name + ": " + (e.message || e)); }
    }
  }

  /** The show LUT on every clip of the named sequences (the camera nests). Sequences that aren't there are skipped. */
  function applyLut(seqNames, lut, saturation) {
    if (!app.project) return fail("No project is open.");
    if (!new File(lut).exists) return fail("The LUT isn't there: " + lut);
    var done = [], problems = [], missing = [], n, s, t, i, seqs = app.project.sequences;
    for (n = 0; n < seqNames.length; n++) {
      var found = false;
      for (s = 0; s < seqs.numSequences; s++) {
        var seq = seqs[s];
        if (seq.name !== seqNames[n]) continue;
        found = true;
        var at = [];
        for (t = 0; t < seq.videoTracks.numTracks; t++) for (i = 0; i < seq.videoTracks[t].clips.numItems; i++) at.push([t, i]);
        lutOnClips(seq, qeSequence(seq.name), at, lut, saturation, done, problems);
      }
      if (!found) missing.push(seqNames[n]);
    }
    return ok({ done: done, problems: problems, missing: missing });
  }

  /** The show LUT on the video clips selected in the open sequence. */
  function applyLutToSelection(lut, saturation) {
    if (!app.project) return fail("No project is open.");
    if (!new File(lut).exists) return fail("The LUT isn't there: " + lut);
    var seq = app.project.activeSequence;
    if (!seq) return fail("Open a sequence and select the clips first.");
    var sel = seq.getSelection(), at = [], k, t, i;
    for (k = 0; k < sel.length; k++) {
      for (t = 0; t < seq.videoTracks.numTracks; t++) {
        var clips = seq.videoTracks[t].clips;
        for (i = 0; i < clips.numItems; i++) if (clips[i].nodeId === sel[k].nodeId) at.push([t, i]);
      }
    }
    if (!at.length) return fail("No video clips are selected in " + seq.name + ".");
    app.enableQE();
    var done = [], problems = [];
    lutOnClips(seq, qe.project.getActiveSequence(), at, lut, saturation, done, problems);
    return ok({ done: done, problems: problems, missing: [] });
  }

  return {
    ping: ping, renameTemplateSequences: renameTemplateSequences, findBin: findBin, importXml: importXml, placeMulticam: placeMulticam,
    applyLut: applyLut, applyLutToSelection: applyLutToSelection
  };
})();
