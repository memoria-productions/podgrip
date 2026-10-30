#!/usr/bin/env node
// CI: the installed panel's own code on Windows, with its bundled ffmpeg: read the LTC from a camera-like clip
// (timecode on channel 1, noise-free silence on channel 2) the way "Begin episode assembly" does.
//   node scripts/smoke-test.js
"use strict";
const path = require("path"), fs = require("fs"), os = require("os");
const EXT = path.join(process.env.APPDATA, "Adobe", "CEP", "extensions", "PodGrip");
const L = require(path.join(EXT, "engine", "ltc.js")), LA = require(path.join(EXT, "lib", "assembly.js"));
const { synth } = require(path.join(__dirname, "..", "tests", "ltcsynth.js"));

const ffmpeg = LA.findFfmpeg(EXT);
if (!ffmpeg.startsWith(EXT)) throw new Error("expected the bundled ffmpeg, got " + ffmpeg);

// A 48 kHz 16-bit stereo WAV: LTC from 10:06:41:00 on the left, silence on the right.
const ltc = synth({ h: 10, m: 6, s: 41, f: 0 }, 24 * 6), data = Buffer.alloc(ltc.length * 4);
ltc.forEach((v, i) => data.writeInt16LE(v, i * 4));
const head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVEfmt ", 8); head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(48000, 24); head.writeUInt32LE(48000 * 4, 28);
head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(data.length, 40);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "podgrip-smoke-")), clip = path.join(work, "camera.wav");
fs.writeFileSync(clip, Buffer.concat([head, data]));

const got = L.clipTimecode(ffmpeg, clip);
fs.rmSync(work, { recursive: true, force: true });
console.log("LTC read with the bundled ffmpeg:", got && L.format(got.frames), got && "(channel " + got.channel + ")");
if (!got || got.channel !== 1 || Math.abs(got.frames - L.parse("10:06:41:00")) > 2) throw new Error("wrong or no LTC: " + JSON.stringify(got));
console.log("SMOKE TEST PASSED");
