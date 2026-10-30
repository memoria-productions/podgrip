/*
 * PodAssembler — FCP7 XML (xmeml v5) writer for a synced episode, in the shape of David's Resolve export, which
 * Premiere imports as a sequence:
 *   V1, V2…  one camera body per track (video only; the cameras' audio is just the timecode signal)
 *   A1, A2…  one F6 channel per track (A1–A4 = the four mics, as in the finished edit), every channel of a WAV
 *            linked so they move together
 *   markers  for anything placed without timecode
 * 23.976 fps (timebase 24, NTSC), 1920x1080, 48 kHz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PodXmeml = api;
  else if (root) root.PodXmeml = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /** file://localhost/M:/@PRODUCTION/... with # and spaces escaped, as Resolve writes it. */
  function pathUrl(p) {
    var s = String(p).replace(/\\/g, "/");
    return "file://localhost/" + s.split("/").map(function (seg, i) {
      return i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg).replace(/%40/g, "@");
    }).join("/").replace(/^\/+/, "");
  }

  var RATE = "<rate><timebase>24</timebase><ntsc>TRUE</ntsc></rate>";

  function tcString(frames) {
    var day = 24 * 86400; frames = ((Math.round(frames) % day) + day) % day;
    var s = Math.floor(frames / 24), p = function (v) { return (v < 10 ? "0" : "") + v; };
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60) + ":" + p(frames % 24);
  }

  /**
   * write(plan, opts) -> XML string.  opts.name: sequence name;  opts.width/height (1920x1080).
   */
  function write(plan, opts) {
    opts = opts || {};
    var W = opts.width || 1920, H = opts.height || 1080, out = [], defined = {};
    var line = function (depth, s) { out.push(new Array(depth + 1).join("    ") + s); };
    var fileId = function (c) { return c.name + " file"; };

    function fileEl(c, depth) {
      if (defined[c.path]) { line(depth, "<file id=\"" + esc(fileId(c)) + "\"/>"); return; }
      defined[c.path] = true;
      line(depth, "<file id=\"" + esc(fileId(c)) + "\">");
      line(depth + 1, "<name>" + esc(c.name) + "</name>");
      line(depth + 1, "<pathurl>" + esc(pathUrl(c.path)) + "</pathurl>");
      line(depth + 1, RATE);
      line(depth + 1, "<duration>" + c.frames + "</duration>");
      if (c.tc !== null && c.tc !== undefined)
        line(depth + 1, "<timecode>" + RATE + "<string>" + tcString(c.tc) + "</string><frame>" + c.tc + "</frame><displayformat>NDF</displayformat></timecode>");
      line(depth + 1, "<media>");
      if (c.kind === "camera") {
        line(depth + 2, "<video><samplecharacteristics>" + RATE + "<width>" + W + "</width><height>" + H + "</height></samplecharacteristics></video>");
        line(depth + 2, "<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>");
      } else {
        line(depth + 2, "<audio><samplecharacteristics><depth>32</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>" + c.channels + "</channelcount></audio>");
      }
      line(depth + 1, "</media>");
      line(depth, "</file>");
    }

    function clipItem(depth, id, c, extra) {
      line(depth, "<clipitem id=\"" + esc(id) + "\">");
      line(depth + 1, "<masterclipid>" + esc(c.name + " master") + "</masterclipid>");
      line(depth + 1, "<name>" + esc(c.name) + "</name>");
      line(depth + 1, "<enabled>TRUE</enabled>");
      line(depth + 1, "<duration>" + c.frames + "</duration>");
      line(depth + 1, RATE);
      line(depth + 1, "<start>" + c.start + "</start>");
      line(depth + 1, "<end>" + (c.start + c.frames) + "</end>");
      line(depth + 1, "<in>0</in>");
      line(depth + 1, "<out>" + c.frames + "</out>");
      fileEl(c, depth + 1);
      if (extra) extra(depth + 1);
      line(depth, "</clipitem>");
    }

    var seqName = opts.name || "Synced episode";
    var dur = plan.durationFrames;
    line(0, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    line(0, "<!DOCTYPE xmeml>");
    line(0, "<xmeml version=\"5\">");
    line(1, "<sequence id=\"sequence-1\">");
    line(2, "<name>" + esc(seqName) + "</name>");
    line(2, "<duration>" + dur + "</duration>");
    line(2, RATE);
    line(2, "<timecode>" + RATE + "<string>01:00:00:00</string><frame>86400</frame><displayformat>NDF</displayformat></timecode>");
    line(2, "<in>-1</in><out>-1</out>");
    line(2, "<media>");
    line(3, "<video>");
    line(4, "<format><samplecharacteristics>" + RATE + "<width>" + W + "</width><height>" + H + "</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>");
    plan.video.forEach(function (t) {
      line(4, "<track>");
      t.clips.forEach(function (c) { clipItem(5, c.name + " v", c); });
      line(5, "<enabled>TRUE</enabled><locked>FALSE</locked>");
      line(4, "</track>");
    });
    line(3, "</video>");
    line(3, "<audio>");
    line(4, "<numOutputChannels>2</numOutputChannels>");
    line(4, "<format><samplecharacteristics><depth>32</depth><samplerate>48000</samplerate></samplecharacteristics></format>");
    for (var ch = 1; ch <= plan.channels; ch++) {
      line(4, "<track>");
      plan.wavs.forEach(function (w) {
        if (ch > w.channels) return;
        clipItem(5, w.name + " a" + ch, w, function (d) {
          line(d, "<sourcetrack><mediatype>audio</mediatype><trackindex>" + ch + "</trackindex></sourcetrack>");
          for (var k = 1; k <= w.channels; k++)
            line(d, "<link><linkclipref>" + esc(w.name + " a" + k) + "</linkclipref><mediatype>audio</mediatype><trackindex>" + k + "</trackindex><clipindex>" + (plan.wavs.filter(function (x) { return x.channels >= k; }).indexOf(w) + 1) + "</clipindex></link>");
        });
      });
      line(5, "<enabled>TRUE</enabled><locked>FALSE</locked>");
      line(4, "</track>");
    }
    line(3, "</audio>");
    line(2, "</media>");
    (opts.markers || []).forEach(function (m) {
      line(2, "<marker><name>" + esc(m.name) + "</name><comment>" + esc(m.comment || "") + "</comment><in>" + m.frame + "</in><out>-1</out></marker>");
    });
    line(1, "</sequence>");
    line(0, "</xmeml>");
    return out.join("\n") + "\n";
  }

  return { write: write, pathUrl: pathUrl, tcString: tcString };
});
