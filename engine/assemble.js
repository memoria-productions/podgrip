/*
 * PodGrip — everything David's multicam is built from, on a synced episode (PROJECT.md section 2, "How the
 * Premiere project is built today"), written as one FCP7 XML so a single import brings it all in:
 *   classical_et_cetera_<ep> (Sync)          the synced episode, as `podgrip sync` writes it
 *   classical_et_cetera_<ep> promos (Sync)   the promo takes, kept apart from the episode (when there are any)
 *   <ep>_b_cam, <ep>_a_cam (, <ep>_c_cam…)   one nest per camera, video only, each clip at its synced position on
 *                                            the episode's timeline (0 = the start of the audio): b = the wide,
 *                                            a = the dolly, as David names them in every past edit
 *   classical_et_cetera_<ep>                 the main sequence: mic channels 1–4 on A1–A4, V1 left for <ep>_mc,
 *                                            with a marker at 0 saying how to make it ("… (Program)" when the XML
 *                                            goes into David's template, which has its own main sequence)
 * The multicam itself (<ep>_mc) is made in Premiere: select the nests, Create Multi-Camera Source Sequence with
 * Synchronize Point "In Points" (no In marks set, so the nests line up by their starts), and put it on V1 at 0. The nests all start at the audio's 0, so it lands in sync.
 * It can't come in the XML. Premiere 2025 fails the whole import when a multiclip's angles are nested sequences,
 * and with clips as angles it starts every angle at its file's first frame, ignoring positions, trims and In
 * marks. Cameras that started recording at different times then can't be in sync (David's tests on ep 243,
 * 2026-10-30).
 * Takes plans from engine/sync.js; writes through engine/xmeml.js.
 */
(function (root, factory) {
  var xm = typeof module === "object" && module.exports ? require("./xmeml.js") : (root && root.PodXmeml) || window.PodXmeml;
  var api = factory(xm);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PodAssemble = api;
  else if (root) root.PodAssemble = api;
})(typeof self !== "undefined" ? self : this, function (XM) {
  "use strict";

  /** David's names for the camera nests: the wide is b_cam, the dolly a_cam, any further camera c_cam, d_cam… */
  function nestNames(plan, ep) {
    var others = ["a", "c", "d", "e", "f"], k = 0;
    return plan.video.map(function (t, i) { return ep + "_" + (i === 0 && t.wide ? "b" : others[k++]) + "_cam"; });
  }

  /**
   * Names of everything the XML holds, and the multicam David makes from the nests: { sync, promos, nests, mc, main }.
   * inTemplate: the XML goes into David's template project, whose own main sequence is classical_et_cetera_<ep>
   * (once the panel renames it from ###), so the XML's ready-made sequence is "… (Program)" instead.
   */
  function names(plan, ep, inTemplate) {
    return { sync: "classical_et_cetera_" + ep + " (Sync)", promos: "classical_et_cetera_" + ep + " promos (Sync)",
      nests: nestNames(plan, ep), mc: ep + "_mc", main: "classical_et_cetera_" + ep + (inTemplate ? " (Program)" : "") };
  }

  /**
   * The one step left to do in Premiere, in David's words. The dialog's name menu defaults to "Video Clip Name +",
   * which puts the first clip's name in front ("246_a_cam246_mc"): Custom gives the name as typed.
   */
  function mcStep(n) {
    return "Select " + n.nests.join(" and ") + ", right-click › Create Multi-Camera Source Sequence. Set the name menu to Custom and type " +
      n.mc + "; Synchronize Point: In Points (no In marks set); Camera Names: Use Clip Names. Put it on V1 at 0.";
  }

  /**
   * xml(plan, opts) -> XML string with the synced sequence(s), the camera nests and the main sequence.
   *   plan: the episode (sync.split().episode);  opts.ep: episode id ("243");  opts.markers: for the synced
   *   sequence;  opts.promos: the promo plan, or null;  opts.mics: mic channels on the main sequence (4: channel 5
   *   is left empty on purpose);  opts.inTemplate: name the ready-made sequence "… (Program)" (see names);
   *   opts.width/height (1920x1080).
   */
  function xml(plan, opts) {
    opts = opts || {};
    var ep = opts.ep || "ep", n = names(plan, ep, opts.inTemplate), doc = XM.Doc(opts), dur = plan.durationFrames;
    var mics = Math.min(opts.mics || 4, plan.channels);
    XM.open(doc);
    XM.syncSequence(doc, plan, { name: n.sync, markers: opts.markers }, "sequence-sync");
    if (opts.promos) XM.syncSequence(doc, opts.promos, { name: n.promos }, "sequence-promos");
    plan.video.forEach(function (t, i) {
      doc.sequence(1, { id: n.nests[i], name: n.nests[i], dur: dur, audio: null,
        video: [function (depth) { t.clips.forEach(function (c) { doc.clipItem(depth, n.nests[i] + " " + c.name, c); }); }] });
    });
    doc.sequence(1, {
      id: "sequence-main", name: n.main, dur: dur, video: [function () {}],
      audio: doc.micTracks(plan, mics, "main "),
      markers: [{ frame: 0, name: "Put " + n.mc + " here", comment: mcStep(n) }]
    });
    doc.line(0, "</xmeml>");
    return doc.text();
  }

  return { nestNames: nestNames, names: names, mcStep: mcStep, xml: xml };
});
