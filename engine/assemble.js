/*
 * PodGrip — the multicam David builds on a synced episode (PROJECT.md section 2, "How the Premiere project is built
 * today"), written as one FCP7 XML so a single import brings it all in:
 *   classical_et_cetera_<ep> (Sync)          the synced episode, as `podgrip sync` writes it
 *   classical_et_cetera_<ep> promos (Sync)   the promo takes, kept apart from the episode (when there are any)
 *   <ep>_mc                                  a multicam (multiclip), no audio. Each angle is one camera with all its
 *                                            clips at their synced positions, which is the job David's nests do;
 *                                            angles are named as his nests are: <ep>_b_cam = the wide (angle 1),
 *                                            <ep>_a_cam = the dolly, then c, d…
 *   classical_et_cetera_<ep>                 the main sequence: the multicam on V1, mic channels 1–4 on A1–A4
 * Premiere 2025 imports a multiclip whose angles are clips, but fails on a whole file whose angles are nested
 * sequences (checked by David on ep 243, 2026-10-30), so the angles hold the camera clips directly.
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

  var esc = XM.esc, RATE = XM.RATE;

  /** David's names for the cameras: the wide is b_cam, the dolly a_cam, any further camera c_cam, d_cam… */
  function angleNames(plan, ep) {
    var others = ["a", "c", "d", "e", "f"], k = 0;
    return plan.video.map(function (t, i) { return ep + "_" + (i === 0 && t.wide ? "b" : others[k++]) + "_cam"; });
  }

  /** Names of everything the XML holds: { sync, promos, angles, mc, main }. */
  function names(plan, ep) {
    return { sync: "classical_et_cetera_" + ep + " (Sync)", promos: "classical_et_cetera_" + ep + " promos (Sync)",
      angles: angleNames(plan, ep), mc: ep + "_mc", main: "classical_et_cetera_" + ep };
  }

  /**
   * xml(plan, opts) -> XML string with the synced sequence(s), the multicam and the main sequence.
   *   plan: the episode (sync.split().episode);  opts.ep: episode id ("243");  opts.markers: for the synced
   *   sequence;  opts.promos: the promo plan, or null;  opts.mics: mic channels on the main sequence (4: channel 5
   *   is left empty on purpose);  opts.width/height (1920x1080).
   */
  function xml(plan, opts) {
    opts = opts || {};
    var ep = opts.ep || "ep", n = names(plan, ep), doc = XM.Doc(opts), dur = plan.durationFrames;
    var mics = Math.min(opts.mics || 4, plan.channels);
    XM.open(doc);
    XM.syncSequence(doc, plan, { name: n.sync, markers: opts.markers }, "sequence-sync");
    if (opts.promos) XM.syncSequence(doc, opts.promos, { name: n.promos }, "sequence-promos");

    function angle(d, t, i) {
      var name = n.angles[i];
      doc.line(d, "<angle>");
      doc.line(d + 1, "<name>" + esc(name) + "</name>");
      if (i === 0) doc.line(d + 1, "<activevideoangle>TRUE</activevideoangle>");
      doc.line(d + 1, "<clip id=\"" + esc(name + " clip") + "\">");
      doc.line(d + 2, "<name>" + esc(name) + "</name>");
      doc.line(d + 2, "<duration>" + dur + "</duration>");
      doc.line(d + 2, RATE);
      doc.line(d + 2, "<media><video><track>");
      t.clips.forEach(function (c) { doc.clipItem(d + 3, name + " " + c.name, c); });
      doc.line(d + 2, "</track></video></media>");
      doc.line(d + 1, "</clip>");
      doc.line(d, "</angle>");
    }

    doc.sequence(1, {
      id: "sequence-main", name: n.main, dur: dur,
      video: [function (depth) {
        doc.wrapItem(depth, n.mc + " item", n.mc, dur, function (d) {
          doc.line(d, "<multiclip id=\"" + esc(n.mc) + "\">");
          doc.line(d + 1, "<name>" + esc(n.mc) + "</name>");
          doc.line(d + 1, "<collapsed>FALSE</collapsed>");
          doc.line(d + 1, "<synctype>0</synctype>");
          plan.video.forEach(function (t, i) { angle(d + 1, t, i); });
          doc.line(d, "</multiclip>");
        });
      }],
      audio: doc.micTracks(plan, mics, "main ")
    });
    doc.line(0, "</xmeml>");
    return doc.text();
  }

  return { angleNames: angleNames, names: names, xml: xml };
});
