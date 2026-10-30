# PodAssembler

PodAssembler assembles a complete **Classical et cetera** episode in Premiere Pro from the shoot day's files:

- timecode sync (no Resolve round trip);
- the camera nests and multicam;
- the camera cut;
- the cold open, intro sting and name cards;
- the channel cards and the outro.

It builds on [PodDirector](https://github.com/memoria-productions/poddirector), which does the camera cutting today.

The design, everything measured from the 38 finished 2026 episodes, the milestones and the open questions are all in **[PROJECT.md](PROJECT.md)**.

## Status

Early. What works today:

- **`podassembler timecode <file|episode folder>`** prints the timecode of every camera clip and F6 WAV. Cameras are read from the LTC the F6 feeds into their audio; WAVs from their BWF header. It matches Resolve's timecode on 120 of 125 camera clips and all 112 WAVs from 2026.
- **Research tools** that check the engine against David's finished edits (see below).

Next (PROJECT.md, milestone 0): `podassembler sync <episode folder>`, which writes the synced FCP7 XML that Resolve produces today.

## Layout

| Path | What's there |
|---|---|
| `engine/ltc.js` | LTC decoder: camera timecode from its audio channel. |
| `engine/bwf.js` | Zoom F6 broadcast WAV header: timecode, length, split files. |
| `engine/analyzer.js`, `director.js`, `motion.js`, `framing.js`, `transcript.js`, `transcriber.js`, `keys.js` | **Copied from PodDirector.** Don't edit them here; change them in PodDirector, then run `npm run sync-poddirector`. `engine/PODDIRECTOR.txt` records which version they came from. |
| `cli/podassembler.js` | The command line. |
| `tools/` | Research and checking tools. |
| `tests/` | `npm test`. |

### Research tools

Paths default to David's machine (`tools/paths.js`). Override any of them with an environment variable.

| Command | What it does |
|---|---|
| `node tools/sync_check.js [--ep 243]` | Our timecode sync against every Resolve export in the season folder. |
| `node tools/prproj.js <folder> --out <dir>` | Reads finished Premiere projects: sequences, multicam angles per piece, graphics. (PodDirector) |
| `node tools/analyze_past.js --projects <folder> --out <dir> --ffmpeg <exe>` | Batch dolly-motion analysis of past episodes. Resumable. (PodDirector) |
| `node tools/compare_edits.js [ep …]` | Replays the cutting engine on past episodes and compares it with David's cut. Set `PRESET=handoff MOTION=1 QUIET=1` for the headline numbers. |
| `node tools/survey_assets.js` | What goes into a finished episode besides the multicam, and where each asset sits. |

## Requirements

- Node 18 or later.
- ffmpeg: PodDirector's bundled copy is used by default.
- exiftool, only for identifying cameras by aperture.
