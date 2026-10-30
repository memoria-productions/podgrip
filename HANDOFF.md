# PodGrip: hand-over, 2026-10-30

This is where things stand after the session that checked the sync XMLs, before they were imported into Premiere. Read `PROJECT.md` and `CLAUDE.md` first.

## Done so far (on `main`)
- `3dfd834`: the project brief, the timecode (LTC) reader, and the engine copied from PodDirector.
- `db6c7c9`: `podgrip sync <episode folder>`. It lays out the cameras and the F6 WAVs by timecode and writes an FCP7 XML in place of the Resolve round trip. It matches the Resolve exports on 145 clips across 37 episodes.

## New in this session
- **The sync XMLs are already made** for ep 243 and ep 244, in `C:\Users\david.ward\Documents\PodGrip\sync\`:
  - `classical_et_cetera_243_sync.xml`
  - `classical_et_cetera_244_sync.xml`

  To make them again:
  ```
  node cli/podgrip.js sync "M:\@PRODUCTION\memoria_press\video\#serial\classical_et_cetera\2026\20261012_243_mailbag"
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

## Milestone 1: the nested multicam (branch `feature/assemble-multicam`)
- **David chose a real, re-switchable nested multicam**, not a stacked V1/V2 cut.
- **It's a distinct part of the plugin.** `podgrip sync` writes only the sync XML again. The multicam is its own command and module:
  ```
  node cli/podgrip.js assemble "M:\@PRODUCTION\memoria_press\video\#serial\classical_et_cetera\2026\20261012_243_mailbag"
  ```
  - `engine/assemble.js` builds it, writing through the shared helpers in `engine/xmeml.js`.
  - Output: `C:\Users\david.ward\Documents\PodGrip\assemble\classical_et_cetera_<ep>_assembly.xml`.
  - The file holds:
    - the `(Sync)` sequence, plus a separate `promos (Sync)` sequence for the promo takes;
    - `<ep>_mc`, whose angles `<ep>_b_cam` (the wide) and `<ep>_a_cam` (the dolly) each hold that camera's clips;
    - the main sequence `classical_et_cetera_<ep>`, with `_mc` on V1 and mics 1–4 on A1–A4.
  - Everything from the old `Documents\PodAssembler` folder now lives in `Documents\PodGrip`.
- **Import tests (files in `Documents\PodGrip\import_tests\`):**
  - Nests import fine, and so does a multicam whose angles are camera clips. David switched angles on it and `_5219` came through.
  - A multicam whose angles are nested sequences fails the whole import. So `assemble.js` builds the angles from camera clips, and there are no nest sequences (David's choice).
- **Promos:** the short takes besides the episode are Instagram promo recordings. They're synced, but kept out of the episode and the multicam (`sync.split`; see PROJECT.md milestone 1).
- **Open, and the next thing to fix: audio channels.**
  - In David's test imports, A2–A5 played Martin (channel 1) and drew no waveform.
  - The very first sync import drew distinct waveforms on A1–A4.
  - Suspect: the tests were imported into a project that already held those WAVs, and Premiere reused their master clips. Check with the regenerated ep 243 assembly XML, imported into a **brand-new, empty project**.
  - If A2 is still Martin there, the fix is in `micTracks` / the WAV `<file>` in `engine/xmeml.js`.
  - Fallback: David's current routine of re-bringing the audio in from `sync_sound`.

## Reminders
- The M: drive is read-only. Never write to it.
- Engine files copied from PodDirector are changed in `../#poddirector`, then brought over with `npm run sync-poddirector`.
- There's no GitHub remote. Don't create one unless David asks.
