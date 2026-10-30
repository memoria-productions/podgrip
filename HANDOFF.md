# PodAssembler: hand-over, 2026-10-30

This is where things stand after the session that checked the sync XMLs, before they were imported into Premiere. Read `PROJECT.md` and `CLAUDE.md` first.

## Done so far (on `main`)
- `3dfd834`: the project brief, the timecode (LTC) reader, and the engine copied from PodDirector.
- `db6c7c9`: `podassembler sync <episode folder>`. It lays out the cameras and the F6 WAVs by timecode and writes an FCP7 XML in place of the Resolve round trip. It matches the Resolve exports on 145 clips across 37 episodes.

## New in this session
- **The sync XMLs are already made** for ep 243 and ep 244, in `C:\Users\david.ward\Documents\PodAssembler\sync\`:
  - `classical_et_cetera_243_sync.xml`
  - `classical_et_cetera_244_sync.xml`

  To make them again:
  ```
  node cli/podassembler.js sync "M:\@PRODUCTION\memoria_press\video\#serial\classical_et_cetera\2026\20261012_243_mailbag"
  ```
- **Checked offline:**
  - Both files parse as valid XML.
  - `npm test` passes.
  - The structure matches the Resolve export `project_files\resolve\classical_et_cetera_243.xml`.
- **How our XML differs from Resolve's.** These differences are deliberate, but they're where to look first if the import goes wrong:
  - **Audio tracks:** we put one F6 channel per audio track, so A1–A5 each hold that channel of every WAV. Resolve puts one WAV per track and links its channels.
  - **Links:** our `<link>` entries carry `mediatype`, `trackindex` and `clipindex`. Resolve's carry only `linkclipref`.
  - **No camera audio:** the cameras' audio is just the LTC signal, so it isn't placed.
  - **File details:** we declare sample characteristics (32-bit, 48 kHz, 5 channels) on the WAV `<file>`. Resolve gives only `channelcount`.
  - **Filters:** there are no Audio Levels or Pan filters. Resolve adds them at unity.
- **Premiere Pro 2025** is installed at `C:\Program Files\Adobe\Adobe Premiere Pro 2025`. Projects are saved as 25.2.
- **Imported into Premiere 2025 by David:** the footage and audio are synced perfectly, and nothing came in offline. No changes to `xmeml.js` were needed.

## Import checklist (done for ep 243; reuse it for new episodes)
1. In a **scratch project**, go to File › Import and choose `classical_et_cetera_243_sync.xml`. Open the sequence `classical_et_cetera_243 (Sync)`.
2. **Video:**
   - V1 should be `20261012_A7S3_1_5524.MP4`, the wide.
   - V2 should be `20261012_A7S3-3_5218.MP4`, then `_5219` near the end.
3. **Audio:**
   - A1–A5 should be one mono F6 channel each, with three pieces per track: `261012_001_0001`, `_001_0002` and `_002`.
   - Ch 5 should be flat.
   - Waveforms should draw on A1–A4.
   - The 5 channels of each WAV should be linked.
   - Note whether Premiere made the clips mono, or stereo / 5-channel instead.
4. **The join:** at the `_0001` → `_0002` join, about 37 min in, there should be no gap or overlap.
5. **Sync:** spot-check lip sync against the mic waveforms near the start, mid-show and on `_5219`.
6. **Media:** note any offline media, "locate media" prompts or import warnings.

Fix whatever goes wrong in `engine/xmeml.js`, then add a test, run `npm test` and commit.

## After that: milestone 1 (PROJECT.md sections 6 and 9)
- Build `<ep>_a_cam` / `<ep>_b_cam` (one nest per camera, with Black Video in the gaps), `<ep>_mc` (a multicam of the two nests, with no audio) and the main sequence `classical_et_cetera_<ep>`.
- **Prototype first and agree the approach with David.** The open choices:
  - Can the XML carry nested sequences, so the nests and the main sequence come in one import?
  - Can it carry a multiclip? If not, the multicam source sequence has no script API, so it would be built with PodDirector's keystroke builder.
  - Or is a stacked V1/V2 cut enough? (Question 1 in section 10.)

## Reminders
- The M: drive is read-only. Never write to it.
- Engine files copied from PodDirector are changed in `../#poddirector`, then brought over with `npm run sync-poddirector`.
- There's no GitHub remote. Don't create one unless David asks.
