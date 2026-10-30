/*
 * PodAssembler — Broadcast WAV (Zoom F6) header reader.
 *
 * The F6 writes its timecode as the BWF bext time_reference: samples since midnight. At 23.976 fps a timecode
 * "day" is 86,486.4 real seconds, so frames = samples / rate * 24000/1001 (this matched Resolve on all 112 WAVs of
 * 2026). Long takes are split at 2 GB into NNNNNN_TTT_0001.WAV, _0002…; the split is seamless (_0002 starts on the
 * sample after _0001 ends), so continuation files are chained by length, not snapped.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PodBwf = api;
  else if (root) root.PodBwf = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Parse a WAV header from a Buffer (the first 64 KB is plenty) plus the file size. */
  function parseHeader(b, fileSize) {
    if (b.toString("ascii", 0, 4) !== "RIFF" && b.toString("ascii", 0, 4) !== "RF64") throw new Error("not a WAV file");
    var info = { rate: 0, channels: 0, bits: 0, timeReference: null, dataBytes: null, description: null, originator: null };
    var ds64 = null;
    for (var o = 12; o + 8 <= b.length;) {
      var id = b.toString("ascii", o, o + 4), size = b.readUInt32LE(o + 4);
      if (id === "ds64") ds64 = b.readUInt32LE(o + 16) + b.readUInt32LE(o + 20) * 4294967296;
      if (id === "fmt ") { info.channels = b.readUInt16LE(o + 10); info.rate = b.readUInt32LE(o + 12); info.bits = b.readUInt16LE(o + 22); }
      if (id === "bext") {
        info.description = b.toString("ascii", o + 8, o + 8 + 256).replace(/\0[\s\S]*$/, "");
        info.originator = b.toString("ascii", o + 8 + 256, o + 8 + 288).replace(/\0[\s\S]*$/, "");
        info.timeReference = b.readUInt32LE(o + 8 + 338) + b.readUInt32LE(o + 8 + 342) * 4294967296;
      }
      if (id === "data") {
        // 0xFFFFFFFF = RF64 (size in ds64). 0 = the size was never filled in (seen on F6 files): use the file's length.
        info.dataBytes = size === 0xffffffff && ds64 !== null ? ds64 : (size === 0xffffffff || size === 0) && fileSize ? fileSize - (o + 8) : size;
        break;
      }
      o += 8 + size + (size & 1);
    }
    var frameBytes = info.channels * info.bits / 8;
    info.samples = frameBytes && info.dataBytes !== null ? Math.floor(info.dataBytes / frameBytes) : null;
    info.durationSec = info.samples !== null && info.rate ? info.samples / info.rate : null;
    return info;
  }

  /** Read a WAV file's header (Node). */
  function read(file) {
    var fs = require("fs");
    var fd = fs.openSync(file, "r");
    try {
      var size = fs.fstatSync(fd).size, info;
      // Usually the data chunk starts within 64 KB; some F6 files put a large PAD chunk first, so read further then.
      for (var len = 1 << 16; ; len *= 8) {
        var b = Buffer.alloc(Math.min(len, size)), n = fs.readSync(fd, b, 0, b.length, 0);
        info = parseHeader(b.subarray(0, n), size);
        if (info.dataBytes !== null || n >= size || len >= 1 << 24) return info;
      }
    } finally { fs.closeSync(fd); }
  }

  /** Timecode (frames at the nominal rate) of the file's first sample, or null without a bext chunk. */
  function timecodeFrames(info, fpsNominal, fpsReal) {
    if (info.timeReference === null || !info.rate) return null;
    return Math.round(info.timeReference / info.rate * (fpsReal || 24000 / 1001));
  }

  /** "260303_001_0002.WAV" -> { date: "260303", take: 1, part: 2 }; "260407_003.WAV" -> part 1. */
  function nameParts(name) {
    var m = /^(\d{6})_(\d{3})(?:_(\d{4}))?\.wav$/i.exec(name);
    return m ? { date: m[1], take: Number(m[2]), part: m[3] ? Number(m[3]) : 1 } : null;
  }

  return { parseHeader: parseHeader, read: read, timecodeFrames: timecodeFrames, nameParts: nameParts };
});
