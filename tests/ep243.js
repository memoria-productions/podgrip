// Shared fixture: clip facts for synthetic episodes, and episode 243 as shot.
"use strict";

const tc = (h, m, s, f) => ((h * 60 + m) * 60 + s) * 24 + (f || 0);
const WIDE = "24-70mm F2.8 DG DN | Art 019", TELE = "70-200mm F2.8 DG OS HSM | Sport";
const wav = (name, t, frames, extra) => Object.assign({ kind: "wav", name, path: "M:/ep/sync_sound/" + name, date: "261012",
  take: Number(name.slice(7, 10)), part: name.length > 15 ? Number(name.slice(11, 15)) : 1, tc: t, frames, channels: 5 }, extra);
const cam = (name, body, lens, t, frames) => ({ kind: "camera", name, path: "M:/ep/footage/" + name, body, lens, tc: t, frames });

// Episode 243 as shot: the F6 clock crosses midnight; a 2-part main take and a short second take.
const ep243 = () => [
  wav("261012_001_0001.WAV", tc(23, 59, 56), 53616),
  wav("261012_001_0002.WAV", tc(0, 37, 10), 20736),
  wav("261012_002.WAV", tc(0, 54, 12), 2952),
  cam("20261012_A7S3-3_5218.MP4", "A7S3-3", TELE, tc(0, 0, 1, 2), 74148),
  cam("20261012_A7S3-3_5219.MP4", "A7S3-3", TELE, tc(0, 54, 15, 10), 2796),
  cam("20261012_A7S3_1_5524.MP4", "A7S3_1", WIDE, tc(23, 59, 59, 14), 74220)
];

module.exports = { tc, WIDE, TELE, wav, cam, ep243 };
