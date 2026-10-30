/*
 * PodGrip — the multicam chain David builds on a synced episode (PROJECT.md section 2, "How the Premiere
 * project is built today"), written as one FCP7 XML so a single import brings it all in:
 *   classical_et_cetera_<ep> (Sync)          the synced sequence, as `podgrip sync` writes it
 *   <ep>_b_cam, <ep>_a_cam (, <ep>_c_cam…)  one nest per camera, video only, clips at their synced positions:
 *                                            b = the wide, a = the dolly, as David names them in every past edit
 *   <ep>_mc                                  a multicam (multiclip) of the nests, no audio, the wide as angle 1
 *   classical_et_cetera_<ep>                 the main sequence: the multicam on V1, mic channels 1–4 on A1–A4
 * Takes a plan from engine/sync.js; writes through engine/xmeml.js.
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

  /** David's names for the camera nests: the wide is b_cam, the dolly a_cam, any further camera c_cam, d_cam… */
  function nestNames(plan, ep) {
    var others = ["a", "c", "d", "e", "f"], k = 0;
    return plan.video.map(function (t, i) { return ep + "_" + (i === 0 && t.wide ? "b" : others[k++]) + "_cam"; });
  }

  /** Names of everything the XML holds: { sync, nests, mc, main }. */
  function names(plan, ep) {
    return { sync: "classical_et_cetera_" + ep + " (Sync)", nests: nestNames(plan, ep), mc: ep + "_mc", main: "classical_et_cetera_" + ep };
  }

  /**
   * xml(plan, opts) -> XML string with the synced sequence, the camera nests, the multicam and the main sequence.
   *   opts.ep: episode id ("243");  opts.markers: for the synced sequence;  opts.mics: mic channels on the main
   *   sequence (4: channel 5 is left empty on purpose);  opts.width/height (1920x1080).
   */
  function xml(plan, opts) {
    opts = opts || {};
    var ep = opts.ep || "ep", n = names(plan, ep), doc = XM.Doc(opts), dur = plan.durationFrames;
    var mics = Math.min(opts.mics || 4, plan.channels);
    XM.open(doc);
    XM.syncSequence(doc, plan, { name: n.sync, markers: opts.markers }, "sequence-sync");

    function angle(d, t, i) {
      var nest = n.nests[i];
      doc.line(d, "<angle>");
      doc.line(d + 1, "<name>" + esc(nest) + "</name>");
      if (i === 0) doc.line(d + 1, "<activevideoangle>TRUE</activevideoangle>");
      doc.line(d + 1, "<clip id=\"" + esc(nest + " clip") + "\">");
      doc.line(d + 2, "<name>" + esc(nest) + "</name>");
      doc.line(d + 2, "<duration>" + dur + "</duration>");
      doc.line(d + 2, RATE);
      doc.line(d + 2, "<media><video><track>");
      doc.wrapItem(d + 3, nest + " item", nest, dur, function (dd) {
        doc.sequence(dd, {
          id: nest, name: nest, dur: dur, audio: null,
          video: [function (depth) { t.clips.forEach(function (c) { doc.clipItem(depth, nest + " " + c.name, c); }); }]
        });
      });
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

  return { nestNames: nestNames, names: names, xml: xml };
});
