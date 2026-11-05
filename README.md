# PodGrip

PodGrip assembles a complete **Classical et cetera** episode in Premiere Pro from the shoot day's files:

- timecode sync (no Resolve round trip);
- the camera nests and multicam;
- the camera cut;
- the cold open, intro sting and name cards;
- the channel cards and the outro.

It builds on [PodDirector](https://github.com/memoria-productions/poddirector), which does the camera cutting today.

The design, everything measured from the 38 finished 2026 episodes, the milestones and the open questions are all in **[PROJECT.md](PROJECT.md)**.

## Status

Early. What works today:

- **The PodGrip panel in Premiere** (Window › Extensions › PodGrip).
  - To set up an episode:
    - Copy the media into `media\captured\footage` and `sync_sound`.
    - Copy your template into `<episode>\project_files\premiere\`, rename it (for example `classical_et_cetera_245.prproj`) and open it.
  - Then press **Begin episode assembly**. The panel:
    1. renames the template's `###` sequences to the episode number;
    2. reads the timecode and syncs;
    3. writes `classical_et_cetera_<ep>_assembly.xml` next to the project;
    4. imports it, with no dialog, into a **PodGrip** bin: `(Sync)`, `promos (Sync)`, the nests `<ep>_b_cam` / `<ep>_a_cam`, and `classical_et_cetera_<ep> (Program)` with the mics on A1–A4;
    5. puts the show LUT on each camera clip in the nests (if ticked under **Show LUT**). A LUT that doesn't go on is listed as something to check; the assembly itself still finishes.
  - It then tells you the one step left: make `<ep>_mc` from the nests (Create Multi-Camera Source Sequence, name menu Custom, In Points).
  - **Place multicam** then puts `<ep>_mc` on V1 of the `(Program)` sequence at the start, video only. It locks the audio tracks while placing, removes the multicam's empty audio, and checks the mics on A1–A4 didn't move. From there, copy it into the template's main sequence.
  - **Show LUT:**
    - The panel remembers a LUT and its folder. Until you choose another with **Choose LUT…**, that's `2024_slog3_set_custom.cube` from the show's `#global\media\generated\color`.
    - It adds Lumetri Color to a clip, or uses the one already there. It sets Creative › Look to the LUT and Creative › Saturation to the number given (90 to start; leave it empty to keep Lumetri's own).
    - **Apply LUT to selected clips** does the same for the clips selected in the open sequence, for example the promo's adjustment layer.
    - Premiere's scripting has no official way to add an effect, so PodGrip uses its QE scripting, as other panels do. If Premiere doesn't confirm the Look, the panel names the clip to check.
  - **Install:**
    1. Download `PodGrip-x.y.z-Windows.zip` from the [latest release](https://github.com/memoria-productions/podgrip/releases/latest).
    2. Unzip it and double-click **Install PodGrip.bat**.
    3. Restart Premiere.

    After that, the panel offers new releases itself. To install from the source code instead:
    ```
    powershell -ExecutionPolicy Bypass -File install\install.ps1
    ```
    That copy uses PodCutter's ffmpeg unless you run `scripts/fetch-vendor.sh` first.

- **`podgrip timecode <file|episode folder>`** prints the timecode of every camera clip and F6 WAV. Cameras are read from the LTC the F6 feeds into their audio; WAVs from their BWF header. It matches Resolve's timecode on 120 of 125 camera clips and all 112 WAVs from 2026.
- **`podgrip sync <episode folder> [--out file.xml] [--gap seconds]`** does what the Resolve round trip does today:
  - It lays the cameras and the F6 audio out by timecode and writes an FCP7 XML sequence, `classical_et_cetera_<ep> (Sync)`, to import into Premiere.
  - The default output is `Documents\PodGrip\sync\`.
  - Layout:
    - the wide (24-70) on V1 and the dolly on V2;
    - F6 channels 1–5 on A1–A5, all linked;
    - F6 splits joined end to end, and later takes after the first with a 2 s gap.
  - Anything it couldn't sync (no timecode on the clip) goes at the end with a "Not synced" marker.
  - It prints what went where and anything odd.
  - Over the 37 episodes with a Resolve export, it puts 145 clips exactly where Resolve did. The 7 that differ are the hand nudges and snapping slips described in PROJECT.md.
  - Checked in Premiere 2025 on ep 243: in sync, and each mic on its own track.
- **`podgrip assemble <episode folder>`**: the same assembly XML as the panel's, for the command line (in `Documents\PodGrip\assemble\`).
- **Research tools** that check the engine against David's finished edits (see below).

Next: the panel making `<ep>_mc` too, then placing the program, graphics and outro in the template's main sequence (PROJECT.md milestones 3–5).

## Layout

| Path | What's there |
|---|---|
| `engine/ltc.js` | LTC decoder: camera timecode from its audio channel. |
| `engine/bwf.js` | Zoom F6 broadcast WAV header: timecode, length, split files. |
| `engine/sync.js` | Timecode sync planner: takes, splits, camera tracks, the wide first. |
| `engine/xmeml.js` | FCP7 XML writer for the synced sequence. |
| `engine/xml.js` | A small XML reader (FCP7 XML, Sony sidecars). |
| `engine/assemble.js` | The assembly XML: synced sequences, camera nests, the program sequence. |
| `lib/episode.js` | Reads an episode folder: clips, sidecars, timecode (Node). |
| `lib/assembly.js` | "Begin episode assembly": finds the episode, syncs, writes the XML. Shared by the panel and the CLI. |
| `CSXS/`, `client/`, `host/host.jsx` | The Premiere panel: manifest, page and controller, and the ExtendScript that renames, imports, places the multicam and applies the LUT. |
| `lib/luts.js` | The show LUT: its default folder, the LUTs in a folder, which one to offer. |
| `install/` | The installer (`install.ps1`, plus `Install PodGrip.bat` / `Uninstall PodGrip.bat`), into `%APPDATA%\Adobe\CEP\extensions\PodGrip`. |
| `lib/version.js`, `lib/updater.js` | The version, and the in-panel updater (GitHub releases of `memoria-productions/podgrip`, or an update folder). |
| `scripts/`, `.github/workflows/build.yml` | Packaging and CI: `fetch-vendor.sh` (ffmpeg), `package-windows.sh`, Windows smoke and update tests, releases on `v*` tags. |
| `engine/analyzer.js`, `director.js`, `motion.js`, `framing.js`, `transcript.js`, `transcriber.js`, `keys.js` | **Copied from PodDirector.** Don't edit them here; change them in PodDirector, then run `npm run sync-poddirector`. `engine/PODDIRECTOR.txt` records which version they came from. |
| `cli/podgrip.js` | The command line. |
| `tools/` | Research and checking tools. |
| `tests/` | `npm test`. |

### Research tools

Paths default to David's machine (`tools/paths.js`). Override any of them with an environment variable.

| Command | What it does |
|---|---|
| `node tools/sync_check.js [--ep 243]` | Our timecode readings against every Resolve export in the season folder. |
| `node tools/sync_compare.js [--ep 243]` | `podgrip sync`'s layout against every Resolve export: clip positions within each take. |
| `node tools/prproj.js <folder> --out <dir>` | Reads finished Premiere projects: sequences, multicam angles per piece, graphics. (PodDirector) |
| `node tools/analyze_past.js --projects <folder> --out <dir> --ffmpeg <exe>` | Batch dolly-motion analysis of past episodes. Resumable. (PodDirector) |
| `node tools/compare_edits.js [ep …]` | Replays the cutting engine on past episodes and compares it with David's cut. Set `PRESET=handoff MOTION=1 QUIET=1` for the headline numbers. |
| `node tools/survey_assets.js` | What goes into a finished episode besides the multicam, and where each asset sits. |

## Requirements

- Node 18 or later.
- ffmpeg: PodCutter's bundled copy (PodDirector's, before the rename) is used by default.
- exiftool, only for identifying cameras by aperture.
