# PodAssembler: notes for Claude Code

PodAssembler is a Premiere Pro plugin (planned) that assembles a whole Classical et cetera episode from raw shoot files. The user is David Ward (Memoria Press), who edits the show himself. **Read PROJECT.md first**: it holds the design, the measured anatomy of 38 finished episodes, David's cutting rules, the recording setup, the milestones and the open questions.

## Layout
- PodAssembler's own code:
  - `engine/ltc.js`, `bwf.js`, `sync.js`, `xmeml.js`, `xml.js` and `assemble.js` (pure, UMD);
  - `lib/` (Node-only helpers, such as `episode.js`);
  - `cli/podassembler.js` (`timecode`, `sync`, `assemble`).
- The plugin's steps stay distinct, each with its own module and command:
  - `sync`: the timecode layout, written by `xmeml.js`;
  - `assemble`: the nested multicam chain built on it, `assemble.js`.
- The other `engine/*.js` files, plus `tools/prproj.js` and `tools/analyze_past.js`, are **copied from PodDirector** (`../#poddirector`, https://github.com/memoria-productions/poddirector).
  - Don't edit the copies here. Change them in PodDirector, then run `npm run sync-poddirector`.
  - `engine/PODDIRECTOR.txt` records the source commit.
- Engine files use the UMD wrapper and ES5 style (`var`, `function`), so they also load in a CEP panel. Tools and tests are plain Node.
- `tools/paths.js` holds the default paths on David's PC, each overridable by an environment variable.

## Facts that are easy to get wrong
- **Timecode:**
  - The F6 TC out feeds every camera's mic input, so camera timecode is **LTC on audio channel 1**.
  - Channel 2 is noise: the cameras record **no room sound**, so audio cross-correlation can't sync them.
  - The camera's own timecode (MP4 tmcd and the M01.XML sidecar) is a free-running clock per body. Never use it.
  - `ltc.CALIBRATE_FRAMES = -1` matches Resolve's stamp.
- **F6 WAVs:**
  - BWF `time_reference` is samples since midnight. Frames = samples / rate × 24000/1001.
  - Splits (`_0001`, `_0002`) are seamless: chain them by length.
  - Takes are `_001`, `_002`…
  - Channel 5 (and 6) is empty on purpose.
- **Episode folders:**
  - They get renamed after projects and XMLs were made. Find files by name within the episode folder, not by stored path.
  - Typos are real: `peoject_files`, `classical_et_ceterea_<ep>_25.2.prproj`.
- **The M: drive** is a network share. Read footage in place and never write to it.
- **The wide camera** is the 24-70 lens (Sony sidecar `<Lens modelName>`). Which body or angle is the wide changes from episode to episode.

## Conventions
- Run `npm test` before committing. Tests use synthetic signals and headers, so no footage is needed.
- Check changes against real episodes with the tools in `tools/`. `compare_edits.js` headline today: 79% agreement with David's camera choice (`PRESET=handoff MOTION=1 MOTION_ONLY=1 QUIET=1`).
- Keep David's source sequences and footage untouched. Build on new sequences, and suggest edits rather than making them.
- Write user-facing text in plain language: David reads the logs and the reports.
