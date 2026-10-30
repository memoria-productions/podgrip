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
    - the nests `<ep>_b_cam` (the wide) and `<ep>_a_cam` (the dolly), each camera at its synced position;
    - the main sequence `classical_et_cetera_<ep>`, with mics 1–4 on A1–A4, V1 empty, and a marker at 0 with the one step to do.
  - **The multicam is made in Premiere** (David's choice):
    - select the two nests;
    - Create Multi-Camera Source Sequence, name menu **Custom** (the default "Video Clip Name +" makes `246_a_cam246_mc`), Synchronize Point: In Points (no In marks set; Premiere 2025 has no "Clip Start");
    - name it `<ep>_mc`;
    - put it on V1 at 0.

    The CLI prints this step after writing the file.
  - Everything starts 10 s in (`--lead`), as David does in Resolve, so a sync nudge never cuts media off.
  - Everything from the old `Documents\PodAssembler` folder now lives in `Documents\PodGrip`.
- **Import tests (files in `Documents\PodGrip\import_tests\`, and `import_tests.prproj` read back with `tools/prproj.js`):**
  - Nests import fine.
  - A multicam whose angles are nested sequences fails the whole import.
  - A multicam whose angles are camera clips imports and switches, but Premiere starts every angle at its file's first frame. That makes cameras that started at different times out of sync: the wide was 1.5 s early on ep 243. So the XML can't carry the multicam (PROJECT.md milestone 1).
- **Promos:** the short takes besides the episode are Instagram promo recordings. They're synced, but kept out of the episode and the multicam (`sync.split`; see PROJECT.md milestone 1).
- **Audio channels: fixed.** A2–A5 used to play Martin (channel 1). Each WAV `<file>` now lists its channels one by one, and David heard every mic on its own track (variant B in `import_tests\`). Premiere's own track attributes break this again, so they're left out (PROJECT.md milestone 1).
- **Checked in Premiere 2025 by David, 2026-10-30:** the ep 243 assembly XML imports cleanly, and every mic is on its own track. The `243_mc` he made from the nests (In Points) has **both angles in lip sync**. Milestone 1's multicam step works.

## The PodGrip panel (v0.1.0, built 2026-10-30, not yet run in Premiere)
- **David's flow:**
  1. Make the episode folder `yyyymmdd_###_title` and copy the media into `media\captured\footage` and `sync_sound`.
  2. Copy the template into `project_files\premiere\`, rename it, and open it.
  3. In the PodGrip panel, press **Begin episode assembly**.
- **What the button does:**
  - **Renames** the template's `###` sequences to the episode number (`PG.renameTemplateSequences`).
  - **Syncs** in Node (`lib/assembly.js`, the same code as `podgrip assemble`).
  - **Writes** `classical_et_cetera_<ep>_assembly.xml` next to the project.
  - **Imports** it with no dialog into a top-level PodGrip bin (`PG.importXml` → `app.project.importFiles`). If a PodGrip bin already has items, it asks first.
  - **Names:** the XML's ready-made sequence is `classical_et_cetera_<ep> (Program)` (mics on A1–A4, marker at 0), so it doesn't clash with the template's renamed main sequence.
  - **Then** it shows the one manual step: make `<ep>_mc` from the nests (In Points) and put it on V1 of the Program sequence.
- **Checked offline only:**
  - the host script against a fake Premiere (`tests/host.test.js`);
  - the panel's sync-and-write path on ep 243 (into a temp folder).
- **Install:** `powershell -ExecutionPolicy Bypass -File install\install.ps1`, then restart Premiere.
  - David runs this himself: auto mode won't let Claude run a script that bypasses the execution policy or may set PlayerDebugMode.
  - PlayerDebugMode is already 1 for CSXS 9–12 (from PodCutter).
- **Unknowns to watch on the first run:**
  - whether `sequence.name` / `projectItem.name` renaming sticks in Premiere 2025;
  - whether `importFiles` puts the XML's sequences straight in the bin or in a sub-bin (both are handled);
  - how long the panel pauses while reading timecode (about 5 s per camera clip, synchronous).

## Next
- David installs the panel and runs it on a fresh episode (or a copy of ep 243's folder layout).
- Then:
  - merge `feature/assemble-multicam` into `main`;
  - have the panel make `<ep>_mc` too, through keystrokes as PodCutter does, since there's no script API for it;
  - place the program, graphics and outro in the template's main sequence (milestone 3).
- Check the episodes where a camera has a second clip within the episode (216, 222, 224, 231, 232, 234, 238): do the nests hold both clips in sync?

## Reminders
- The M: drive is read-only, except that the panel writes the assembly XML next to the episode project, in `project_files\premiere`. Never write to the footage, the audio or the template.
- Engine files copied from PodDirector are changed in `../#poddirector`, then brought over with `npm run sync-poddirector`.
- GitHub: `memoria-productions/podgrip` (public, David's choice 2026-10-30). Releases follow PodCutter's routine (CLAUDE.md, Releases).
