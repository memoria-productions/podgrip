"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const B = require("../engine/bwf.js");

/** A minimal F6-style poly WAV header: RIFF, bext (time_reference), fmt (float 32), data. */
function header(opts) {
  const bext = Buffer.alloc(602);
  bext.write(opts.description || "zTRK1=Tr1", 0, "ascii");
  bext.write("ZOOM F6", 256, "ascii");
  bext.writeUInt32LE(opts.ref % 4294967296, 338);
  bext.writeUInt32LE(Math.floor(opts.ref / 4294967296), 342);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(3, 0); fmt.writeUInt16LE(opts.channels, 2); fmt.writeUInt32LE(48000, 4);
  fmt.writeUInt32LE(48000 * opts.channels * 4, 8); fmt.writeUInt16LE(opts.channels * 4, 12); fmt.writeUInt16LE(32, 14);
  const chunk = (id, body) => Buffer.concat([Buffer.from(id, "ascii"), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(body.length, 0); return b; })(), body]);
  const dataHdr = Buffer.alloc(8); dataHdr.write("data", 0, "ascii"); dataHdr.writeUInt32LE(opts.dataBytes, 4);
  const body = Buffer.concat([Buffer.from("WAVE", "ascii"), chunk("bext", bext), chunk("fmt ", fmt), dataHdr]);
  const riff = Buffer.alloc(8); riff.write("RIFF", 0, "ascii"); riff.writeUInt32LE(body.length + opts.dataBytes, 4);
  return Buffer.concat([riff, body]);
}

test("bwf: reads rate, channels, length and the F6 timecode", () => {
  // 23:59:56:00 at 23.976: 86396 timecode seconds = 86396 * 1.001 real seconds since midnight
  const ref = Math.round(86396 * 1.001 * 48000), samples = 48000 * 60;
  const h = B.parseHeader(header({ ref, channels: 5, dataBytes: samples * 5 * 4 }), 0);
  assert.equal(h.rate, 48000); assert.equal(h.channels, 5); assert.equal(h.bits, 32);
  assert.equal(h.samples, samples); assert.equal(h.durationSec, 60);
  assert.equal(h.originator, "ZOOM F6");
  assert.equal(B.timecodeFrames(h), 86396 * 24);
});

test("bwf: time_reference above 32 bits", () => {
  const ref = 5000000000;
  assert.equal(B.parseHeader(header({ ref, channels: 4, dataBytes: 16 }), 0).timeReference, ref);
});

test("bwf: read() on a file, and nothing else is a WAV", () => {
  const f = path.join(os.tmpdir(), "pa_bwf_test.wav");
  fs.writeFileSync(f, header({ ref: 48000, channels: 4, dataBytes: 4 * 4 * 10 }));
  try { assert.equal(B.read(f).samples, 10); } finally { fs.unlinkSync(f); }
  assert.throws(() => B.parseHeader(Buffer.from("not a wav file at all"), 0), /not a WAV/);
});

test("bwf: F6 file names give date, take and split part", () => {
  assert.deepEqual(B.nameParts("260303_001_0002.WAV"), { date: "260303", take: 1, part: 2 });
  assert.deepEqual(B.nameParts("260407_003.WAV"), { date: "260407", take: 3, part: 1 });
  assert.equal(B.nameParts("Mountain Audio - Beep.wav"), null);
});
