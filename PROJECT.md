# PodGrip: project brief

A Premiere Pro plugin that builds a complete **Classical et cetera** episode from the shoot day's raw files. It handles the cold open, intro, name cards, the camera cut, the mid-roll cards and the outro. The result is a timeline David only has to review and polish.

It's distilled from PodDirector (`#poddirector`), which does the camera cutting today, and from measurements of the 38 finished 2026 episodes (203–244). Every number here comes from those edits or the shoot files, unless it's marked as a guess.

---

## 1. Goal

**In:** an episode folder on M: (footage, F6 audio), the episode number and title, and who sat where.
**Out:** a Premiere project whose main sequence `classical_et_cetera_<ep>` matches David's finished layout (section 3):

- a multicam of the wide and the dolly, with a cut that looks like David's;
- the mics on A1–A4;
- a cold-open teaser, the intro sting and the lower thirds;
- the three channel cards;
- the full outro stack;
- markers for anything a person should decide.

**What it should feel like:** run it, get coffee, come back to a rough cut that needs about 15 minutes of review instead of a few hours of assembly.

**First win:** timecode sync without the Resolve round trip (section 2). It's already proven on all 37 past episodes, and it's milestone 1.

**Not in scope (at first):** colour, audio mixing beyond placement and levels, YouTube upload, thumbnails. Also the 9×16 promo and reels, which David makes in the same project (a later milestone).

---

## 2. Where everything lives

### Per episode
`M:\@PRODUCTION\memoria_press\video\#serial\classical_et_cetera\<year>\<yyyymmdd>_<ep>_<slug>\`

| Path | What's there |
|---|---|
| `media\captured\footage\` (sometimes `footage\theater\`) | Sony A7S III clips, `<yyyymmdd>_<body>_<nnnn>.MP4`. Bodies: `A7S3_1`, `A7S3_2`, `A7S3-3`. Each clip has a sidecar `<clip>M01.XML`. |
| `media\captured\sync_sound\` | Zoom F6 poly WAVs, `<yymmdd>_<take>_000N.WAV`, split at 2 GB (`_0001`, `_0002`). Sometimes there's an `audio_test\` subfolder. |
| `project_files\resolve\` | `classical_et_cetera_<ep>.xml`: the **synced** sequence exported from DaVinci Resolve as FCP7 XML (`xmeml` v5). There's one for every 2026 episode; ep 206 uses `peoject_files` (sic). |
| `project_files\premiere\` | `classical_et_cetera_<ep>.prproj`, or `classical_et_ceterea_<ep>_25.2.prproj` from ep 230 on (the typo is real). Ep 240 is under `project_media\premiere`. |

### Shared assets, `...\classical_et_cetera\#global\media\`

| Path | Used for |
|---|---|
| `generated\mograph\mograph_lower_third_<first>_<last>.mov` | One name card per person: 8 s, transparent. |
| `generated\mograph\<season asset package>\` | Intro sting, outro, podcast bumper. Packages: `Winter 2024 Asset Package`, `2024_fall_asset_package`, `2025_spring_asset_package`, `2025_summer_asset_package`. The files are `render_intro.mov`, `cetc_intro_<season>_25.mov`, `render_outro.mov` / `cetc_outro_<season>_25.mov`, and `render_memoria_press_podcast_bumper.mov` / `cetc_pod_bumper_<season>_25.mov`. |
| `generated\mixdown\` | `20240214_jessica_audio_outro.WAV` and `memoria_press_podcast_network_outro.wav`. |
| `generated\graphics\` | `podcast@memoriapress_v2.mov`, `MP-Logo--VERTICAL_1920x1080_White.png`. |
| `sourced\music\` | `audioblocks-moments-like-this_rEH6PvDM8.wav` (open and close bed) and `guitar-strum-open.wav`. |
| `sourced\sfx\` | `Mountain Audio - Beep.wav` (rare: a bleep). |

`M:\Video\#Assets\Graphics\Memoria Press\Memoria YouTube Notifications\Finals\` holds `MP Final Comp.mov` and `YT Final Comp.mov`.

**David's Premiere template:** `...\classical_et_cetera\#global\project_files\premiere_pro\classical_et_ceterea_###_25.2.prproj`. It holds his audio processing and the templated media (sequences `classical_et_cetera_###` and `classical_et_cetera_###_promo_9x16`). New episodes start from a copy of it, so PodGrip's XML is imported into that copy. Never write to the template itself.

### Recording setup

- **Zoom F6:** 48 kHz, 32-bit float. The tracks are only named Tr1–Tr5. The default seats are **1 Martin, 2 Tanya, 3 Jessica, 4 Paul**.
  - Channel 5 (and 6 on ep 235) is left on but empty on purpose: it makes Premiere draw waveforms properly. It isn't a missing person.
  - Guests take someone's seat. Paul sometimes hosts from Jessica's seat (ch 3).
  - Check who's on a channel by voice, never by channel number alone.
  - Timecode is in the BWF `time_reference`.
- **Mics:** SM58 until ep 229, SM7B from ep 230. The SM7B gives a lower own-mic margin, especially for Jessica, so speaker detection needs both tunings.
- **Cameras:**
  - **Wide:** static, always the **24-70** (stopped down to about f/8).
  - **Dolly / solo:** the **70-200 f/2.8**, with an operator.
  - Which body is the wide changes from episode to episode. Read the lens from the sidecar (`<Lens modelName>`). The aperture is only available through `exiftool -ee`, which is slow: about 3.5 min per 30 GB clip.
  - Some episodes have a third camera (`_c_cam`).
- **Seating per date:** `C:\Users\david.ward\Music\poddirector_audio_analyze\seating.json`. Voiceprints are in `voiceprints.json`, with the `scripts\` (voiceprint.js, whos_on_mic.js) in the same folder.

### Timecode and sync

**How the timecode gets to the cameras.**
- The F6's timecode out goes into a stereo splitter. Each branch then goes into an L/R splitter, and one side is plugged into each camera's mic input.
- So each camera records **LTC (timecode as audio) on audio channel 1**. Channel 2 is just noise: **the cameras record no room sound**.
- Each camera's own timecode (in the MP4 and in the `M01.XML` sidecar's `LtcChangeTable`) is the body's free-running clock. For example, A7S3_1 reads `08:20:15:20` and A7S3-3 reads `10:06:41:00` for clips started 3 minutes apart. Those clocks don't match each other or the F6, which is why Premiere's timecode sync fails.
- The F6 writes its timecode into each WAV's BWF `time_reference`, in samples since midnight. At 23.976 fps a timecode "day" is 86,486.4 real seconds.
- The F6 clock sits near midnight on some days (eps 243 and 244), so timecode wraps from 23:59 to 00:00 mid-episode.

**David's Resolve routine today.**
1. Add the clips to the media pool, then right-click → *Update timecode from media* (it decodes the LTC channel).
2. Make a new timeline. Drag in the footage and **only the first WAV**, then sync by timecode.
3. **Snap** the other WAVs (the F6's 2 GB continuation files `_0002`, and the second take's `_002`) onto the end of the first.
4. Export the timeline as FCP7 XML.
5. In Premiere, import the XML, then bring the audio back in by hand from `media\captured\sync_sound`, because the import sometimes gets the waveforms wrong.

**Doing it without Resolve: tested 2026-10-30 against all 37 Resolve XMLs.**

- **Reading the timecode works.** A small LTC decoder (`engine/ltc.js`, biphase-mark decode of channel 1 through ffmpeg, 4 s per clip) gives exactly Resolve's timecode on **120 of 125 camera clips**, once a fixed 1-frame offset is applied. The other 5 had no LTC: odd clips in eps 222, 224, 235 and 236, probably cameras that weren't plugged into the splitter.
- **The F6 timecode matches Resolve on all 112 WAVs.** It comes from the BWF `time_reference`, converted at 24000/1001.
- **The F6 splits are seamless.** `_0002` starts on the exact sample where `_0001` ends, so a continuation WAV goes at the first one's position plus its length. No snapping is needed.
- **Placing each clip at its timecode matches Resolve to the frame for the main take** in every episode.
  - What doesn't match, and why:
    - **Second takes.** A second take's camera and `_002.WAV` are dragged together to just after the main take, so the whole group is shifted but still in sync with itself. PodGrip should do the same: put each take after the last, with a short gap.
    - **Snapped `_0002` files that are off.** In **ep 213 (+2.59 s) and ep 223 (+1.13 s)** the snapped `_0002` sits later than its true seamless join. That's 1–2.6 s of audio drift for the second half of the show, unless it was fixed in Premiere. Timecode placement avoids it.
    - **Small nudges on single clips:** ep 243 cam A7S3-3 +1.5 s, ep 232 two short clips, ep 231 one clip, ep 224 two clips. These can't be checked by audio, because the cameras have no room sound. They were either hand nudges or slips. Timecode is the reference.
- **Folders renamed after export.** Some episode folders were renamed after the export (typo fixes, swapped numbers, ep 206 even points at `D:\1_2026_memoriapress\...`). Find files by name inside the episode folder, not by the stored path.

**So step 3 can replace Resolve outright** (section 5). Read the LTC on each camera and the BWF on each WAV, lay everything out by timecode, chain the splits, and put second takes after the first. It then writes the XML or builds the Premiere sequence directly, with the WAVs imported properly from `sync_sound`.

### How the Premiere project is built today (ep 243)

1. Import the Resolve XML. It becomes the sequence **`classical_et_cetera_<ep> (Resolve)`**:
   - V1 and V2: one camera each, cut into pieces where the camera split its files;
   - camera scratch audio;
   - the F6 WAVs, 5 channels each.
2. Make one nest per camera, **`<ep>_a_cam`** and **`<ep>_b_cam`**. Each holds that camera's clips, with Black Video filling the gaps.
3. Make **`<ep>_mc`**, a multicam of the two nests, with no audio. Ep 243 has a_cam on V2, 1.46 s in.
4. Make the main edit **`classical_et_cetera_<ep>`**, with the multicam on V1 and the WAVs directly on A1–A4 (section 3).
5. Make the social cuts: **`_promo_9x16`** and **`_15/_30/_45/_60_reel_9x16`**, vertical, built from the main edit.

---

## 3. Anatomy of a finished episode (measured over 38 edits)

The main sequence is `classical_et_cetera_<ep>`, at 23.976 fps. Episodes run 30–71 min.

### Tracks

| Track | Contents |
|---|---|
| V1 | `<ep>_mc`, the multicam. Its angles are `<ep>_a_cam` / `<ep>_b_cam`, which are nests of the camera clips. |
| V2 | Intro sting, channel cards, outro. One lower third. |
| V3–V6 | The other lower thirds, one per person, stacked. The podcast bumper is on V4. |
| A1–A4 | Mic channels 1–4 from the F6 WAV. The intro sting's audio is also on A1. |
| A2 | `render_outro.mov` audio. |
| A4 | Jessica's audio outro, then the network outro. |
| A5 | Occasional sfx (beep). |
| A6 / A7 | Music beds and the guitar strum. Older edits sometimes used A8–A11 for teaser mic overlaps. |

### Timeline, from start to end
Medians, with the p25–p75 range where it varies.

| When | What |
|---|---|
| **0 s** | **Cold open teaser**, 4–22 s (median 12.6). It's a self-contained moment lifted from mid-conversation, **11–35 min into the recording** (usually past the halfway point), and is mostly on the wide. Music bed `moments like this` (A6, first 23.2 s of the file) runs under it from 0. |
| **13.4 s** (11.6–15.5) | **Intro sting**, 4.6 s. Picture: `render_intro.mov` from 7.4 s in, on V2. Sound: `cetc_intro_<season>_25.mov` on A1. |
| right after the sting | **The program starts**, at the host's welcome ("Hello and welcome to Classical et cetera"). |
| **23.9 s** (22.0–28.0), about 5.8 s after the sting | **Lower thirds for everyone at once**, 8 s, one track each. **Always over the wide** (38 of 38). |
| **5.5 min** (4.9–7.0) | `MP Final Comp.mov`, 10 s. |
| **48% through** (44–54%) | `YT Final Comp.mov`, 10 s. |
| **7.9 min before the end** (6.8–9.7) | `podcast@memoriapress_v2.mov`, 10 s. |
| end − 49.9 s | Music `moments like this` on A6, from 197.7 s into the file, 40.2 s long. |
| end − 46.1 s | The same music on A7, from 211.1 s into the file, 26.8 s long. |
| end − 41.5 s | `render_outro.mov` on V2 and A2, 25.9 s. Jessica's audio outro on A4, from 127.0 s into the file, 22.1 s. **The program (multicam) ends about 40.3 s before the end**, so the outro overlaps its last 1–2 s. |
| end − 19.4 s | `guitar-strum-open.wav`, 6.5 s. |
| end − 18.8 s | `memoria_press_podcast_network_outro.wav` on A4, 18.8 s (it runs to the end). |
| end − 16.8 s | Podcast bumper on V4, 7.1 s. |

The camera only seems to matter under the channel cards for the YouTube card, which is over a solo 27 times out of 38. Otherwise they go wherever they fall.

**Odd ones out:**
- Ep 207 has two teasers.
- Ep 231's "teaser" is the whole show (a different structure).
- Ep 210 has a beep with a logo flash.
- Ep 237 has no multicam edit.
- Ep 222's media is missing.
- Ep 217 has no seating entry.
- Eps 235 and 236: the dolly file couldn't be matched.

---

## 4. The camera cut: David's style

Measured over 35 episodes by lining each edit up with the mic audio. It was then re-checked with the dolly's actual motion (36 episodes, analysed overnight on 2026-10-29).

- About **2.6 cuts/min**, with **44% on the wide**.
  - Wides: median 16 s. Solos: median 19 s.
- **Goes wide about 1.4 s *before* a change of speaker.** Cuts to the new speaker's solo about **4.6 s into their turn** (p25 1.8 s, p75 6.5 s).
- Share of each turn spent on the wide, by turn length:

  | Turn length | On the wide |
  |---|---|
  | under 5 s | 89% |
  | 5–15 s | 67% |
  | 15–30 s | 40% |
  | over 30 s | 23% |

- Overlaps are 71% wide, and there are few reaction cutaways.
- **The dolly is never on screen while it's moving:** 0.1% of solo time, against 15–27% moving while it's off screen.

Rules from David's reviews (these override the statistics):

1. **The wide is the safety shot.** Cutting to it never waits.
2. **The solo is only used when it's steady and on whoever is talking.** The dolly stays on the last person until the operator moves it, so when someone else starts talking, go wide.
3. **Stay on the person talking, and read ahead in the waveform.** A bump on several mics at once isn't a reason to cut. A question that runs into its answer stays on the asker until the answer starts.
4. **A long steady turn gets the solo.** Check "who's in the shot" against who's talking.
5. **Intro:** host's solo through the welcome, then the wide for the introductions, held **at least 15 s** for the name cards. Put a "Welcome" marker at the welcome.
6. **Content cuts get disguised.**
   - Change angle exactly on the cut, and never use the same angle on both sides.
   - From the wide, go to a solo, ideally of whoever speaks next.
   - From a solo, go to the wide.
   - A short cover is better than none.

**Today's best engine settings** (PodDirector "Wide + dolly handoffs", v0.17.1 working copy):

```
soloAfterSec 4.5, wideLeadSec 1.5, crosstalkMinSec 3, minWideSec 9, minShotSec 8, comeBackSec 1.5,
interjectionMode "reaction", interjectionChance 0, groupReactWide true, maxShotSec 0
```

With motion and framing readings, these match David's camera choice on **79%** of the timeline, at 48% wide. They show the dolly mid-move 0.1% of the time, the same as David. Balanced mode scores 64%.

---

## 5. Assembly pipeline

Each step writes its result to a JSON plan before anything touches Premiere. That keeps every step testable offline and replayable against past episodes.

1. **Inventory.** Find the camera clips in `media\captured\footage` (and `footage\theater`) and the WAVs in `sync_sound` (skip `audio_test\`). Group the clips by camera body and the WAVs by take (`_001`, `_002`…, with `_0001` / `_0002` splits).
2. **Identify the cameras.** The wide is the 24-70 (from the sidecar lens). Fall back to the aperture (about f/8) through exiftool, and finally to motion (the wide never moves). Note any third camera.
3. **Timecode sync, with no Resolve** (section 2, *Timecode and sync*).
   - Decode the LTC on each camera's channel 1, falling back to channel 2, minus the calibrated 1 frame.
   - Read each WAV's BWF timecode. Chain each split onto the end of the one before.
   - Lay everything out by timecode, handling the midnight wrap. Each further take goes after the last one, with a 2 s gap.
   - Flag any camera clip with no readable LTC, and any clip that overlaps no audio.
   - Then build David's chain:
     - the `classical_et_cetera_<ep> (Sync)` sequence, which replaces `(Resolve)`;
     - the `_a_cam` / `_b_cam` nests;
     - the `_mc` multicam;
     - with the WAVs imported directly from `sync_sound`.
   - While Resolve is still in use, check the result against the episode's Resolve XML. The target is ≤ 1 frame on every main-take clip.
4. **Who's on which channel.** Start from seating.json if there's an entry. Confirm each channel by voiceprint. Flag guests and swapped mics. Ignore the empty ch 5/6.
5. **Analyse** with the PodDirector engines:
   - mic curves (analyzer.js);
   - dolly motion and thumbnails (motion.js, about 6× realtime);
   - who's in the shot (framing.js);
   - a transcript (whisper; transcriber.js).
6. **Program range.** Find the welcome and the sign-off in the transcript (transcript.js already does this). Everything outside them is pre- and post-show chatter.
7. **Content-cut suggestions.** Use transcript.js cues: "cut that", tangents, restarts, interruptions, off the record. They're **suggested only, never applied**: put them on the timeline as markers for David.
8. **Cold-open teaser pick.** Rank candidate 4–22 s moments from 11–35 min into the recording. Look for:
   - one speaker;
   - a complete sentence with a clean start and end, from the transcript;
   - energy (loudness variance, laughter);
   - no names or context needed.

   Offer the top three. Default to the first, and put markers on the other two.
9. **Camera cut.** Run director.js with the handoff preset over the program. Then cut the teaser too, mostly on the wide.
10. **Assemble the main sequence** (section 3):
    - teaser, music bed, sting;
    - program from the welcome;
    - lower thirds at about 5.8 s after the sting, in the intro's wide hold;
    - channel cards at their positions, nudged to a pause in speech;
    - outro stack timed from the program's end.
11. **Lower thirds.** Map each person to `mograph_lower_third_<first>_<last>.mov`. A missing one (a new guest) becomes a marker with the name, plus a note to render it.
12. **Mark and label.** Add the Welcome marker, teaser alternatives, suggested content cuts, low-confidence camera stretches and any missing assets. Label the solo pieces Rose.
13. **Report.** A short summary: what was placed, what needs a human, and the confidence of each step.

---

## 6. How to build it in Premiere (decide early)

What PodDirector learned:

- **ExtendScript (CEP, ES3)** can import media, create sequences, place clips (insert/overwrite), add markers and razor through QE.
  - It **can't** switch a multicam angle, and often can't set a label colour.
  - PodDirector gets around both by typing Premiere's own shortcuts: *Cut to Camera N* and *Edit › Label › Rose* (engine/keys.js, which parses the `.kys` file). That works, but it takes about 0.6 s per cut and needs the Timeline focused with hands off the keyboard.
  - Creating the multicam source sequence has no script API.
- **The .prproj format** is gzipped XML. tools/prproj.js already *reads* it fully: sequences, tracks, items, multicam angles, labels, sources. *Writing* one is possible in principle but risky. Premiere is strict about ObjectIDs/UIDs.
- **FCP7 XML (xmeml) import** can describe a whole timeline (clips, tracks, markers, labels) in one go, and Premiere imports it natively. It still needs testing whether it can bring in a multicam (multiclip) with the right angle per piece, or whether the cut has to be stacked tracks.
- **UXP** is Adobe's replacement for CEP in Premiere. Check what the installed Premiere version (projects are saved as 25.2) supports before choosing.

**Suggested approach**, to be confirmed with a prototype in milestone 1:
- Do as much as possible as one **generated FCP7 XML** of the main sequence: graphics, audio, markers, teaser, and the camera cut as stacked V1/V2.
- If David needs the multicam to switch angles by hand afterwards, convert to multicam with PodDirector's keystroke builder ("Build as multicam") as a final optional step.
- Keep **CEP** for the panel UI unless UXP proves ready, so PodDirector's host code and updater can be reused.

---

## 7. What to reuse from PodDirector

| Module | Reuse for |
|---|---|
| `engine/director.js` | Camera cut: `plan`, the presets (`handoff`), content-cut covers, the intro wide hold. |
| `engine/analyzer.js` | Mic loudness curves through ffmpeg, including multichannel WAVs. |
| `engine/motion.js` | Dolly motion and per-second thumbnails. |
| `engine/framing.js` | Who's in the dolly shot. |
| `engine/transcript.js`, `transcriber.js` | Whisper transcript, the welcome and sign-off, cleanup cues, names and intros. |
| `engine/keys.js` | Shortcut file parsing and keystroke automation (multicam angles, labels). |
| `engine/updater.js`, `install/`, CI | GitHub-release updater, installer, Windows packaging and smoke test. |
| `tools/prproj.js` | Reading finished projects: the test oracle (section 8). |
| `tools/analyze_past.js` | Batch motion analysis of past episodes (resumable, keeps the PC awake). |

Lessons to carry over:

- ExtendScript is ES3: no `let`, no arrow functions, no built-in `JSON`.
- Test the host script against a fake Premiere (`tests/host.test.js`).
- Bundle ffmpeg and whisper.cpp at packaging time. ffmpeg isn't on PATH on David's machine.
- **Never change the source sequence.** Build on a copy or a new sequence, keep an undo history, and never delete content for the user.
- A release is a commit to `main` plus a `vX.Y.Z` tag. CI then builds the zip and the GitHub release. `gh` isn't installed, so use the GitHub API through curl.

---

## 8. Proving it works: replay against past episodes

The 38 finished edits are the test set. For each one, rebuild the episode from its raw files and compare the result with David's edit, read through tools/prproj.js.

| Check | Target |
|---|---|
| Sync | main-take clips within 1 frame of David's Resolve XML. Today 143 clips match exactly. Every other clip is explained in section 2: second takes moved on purpose, snapping slips, single-clip nudges, or no LTC. |
| Camera choice agreement (wide vs solo, program only) | ≥ 79% (today's engine) |
| Dolly on screen while moving | ≤ 0.5% of solo time |
| Cuts per minute | 2.3–2.9 |
| Wide share | 40–50% |
| Lower thirds start | within ±3 s of David's, and over the wide |
| Intro sting / program start | within ±2 s |
| Channel cards | MP 5.5 min ±1.5, YT 44–54%, podcast@ 6.8–9.7 min from the end |
| Outro stack offsets from the end | exact (frame) |
| Teaser | 4–22 s, from 11–35 min into the recording. Report how often David's teaser is in our top 3. |
| Content cuts | how many of David's removed sections we flagged (the timeline has inPoint jumps on the wide), and how many false flags |

Existing data to start from (on David's PC):

- **Edits read from the projects:** `C:\Users\david.ward\Documents\PodDirector\edits\*.edit.json`. Aperture cache: `apertures.json`.
- **Dolly motion and thumbnails for 36 episodes** (41 camera files, about 30 h): `C:\Users\david.ward\Documents\PodDirector\motion\` (`manifest.json` plus `<ep>\*.motion.f32 / *.thumbs.rgb`; 1/6 s hop, 32×18 thumbnails each second).
- **Local copies of the mic audio** (eps 203–245): `C:\Users\david.ward\Music\poddirector_audio_analyze\`.
- The checking tools are in `tools/`: `compare_edits.js` (with `motion_map.js`, which maps edit time → multicam time → angle item → camera file time), `sync_check.js` and `survey_assets.js`. See the README.

---

## 9. Milestones

0. **Timecode sync tool (do this first; it saves time on every episode).** **Built, 2026-10-30:** `podgrip sync <episode folder>` (`engine/sync.js`, `engine/xmeml.js`, `lib/episode.js`).
   - It writes an FCP7 XML in the shape of the Resolve export: the wide on V1, the dolly on V2, F6 channels on A1–A5, splits chained, takes in order.
   - `tools/sync_compare.js` puts it level with Resolve on 145 clips across 37 episodes.
   - Real-world cases it handles:
     - leftover "Audio Extracted" WAVs;
     - WAVs from other days in the folder;
     - two cameras with the same body name (told apart by lens);
     - F6 files with a big PAD chunk or a zero data size;
     - clips without timecode (placed at the end with a marker).
   - **Checked in Premiere 2025, 2026-10-30:** David imported the ep 243 XML. The footage and audio are synced perfectly and nothing came in offline.
   - **Still to do:** run it on the next shoot alongside Resolve.
1. **Prototype the Premiere side (1 week).** Generate an FCP7 XML for ep 243 with the stacked camera cut, mics, graphics, music and markers, and import it. Decide XML vs ExtendScript vs UXP, and whether the multicam step is needed.
   - **David's choice, 2026-10-30:** a real, re-switchable **nested multicam** (question 1 in section 10). It's its own step of the plugin, separate from sync: `podgrip assemble <episode folder>` (`engine/assemble.js`).
   - **What Premiere 2025 takes from XML (David's import tests on ep 243, 2026-10-30):**
     - Nested sequences import fine, on their own and stacked inside another sequence.
     - A multiclip whose angles are nested sequences makes the whole import fail ("may be damaged or contain outdated elements").
     - A multiclip whose angles are camera clips imports as a switchable multicam (`[MC1]`), but **every angle starts at its file's first frame**. Premiere ignores clip positions, `<in>` trims, In/Out marks on the angle and black slug filler.
       - Read back from the saved project: `243_mc` had both files at 0. The dolly really starts 1.50 s after the wide, so the wide played 1.5 s early.
       - So an XML multicam is only in sync when the cameras started recording together, and they never do.
     - David's own ep 243 `243_mc` has the dolly nest 1.46 s after the wide. PodGrip's LTC gives 1.50 s (1 frame apart). Resolve's sequence had 3.0 s: David's "+1.5 s" fix, by eye.
   - **David's choice: nests from the XML, the multicam in one step in Premiere.** `podgrip assemble` writes `<WORK_DIR>\assemble\classical_et_cetera_<ep>_assembly.xml` with:
     - the `(Sync)` sequence, and the promos' own `promos (Sync)` sequence;
     - the nests `<ep>_b_cam` (the wide) and `<ep>_a_cam` (the dolly). Each holds its camera at its synced position on the episode's timeline, where 0 is the same instant in every nest;
     - the main sequence `classical_et_cetera_<ep>`, with mics 1–4 on A1–A4, V1 left empty, and a marker at 0 saying how to make the multicam.

     David then selects the nests, chooses Create Multi-Camera Source Sequence (Sync Point: Clip Start, no audio), names it `<ep>_mc` and puts it on V1 at 0. Once there's a panel, it can do this step (PodDirector already drives Premiere's shortcuts).
   - **Lead-in:** everything starts 10 s in (`--lead`). David always leaves room at the left in Resolve so a sync nudge never cuts media off.
   - **Promo takes are kept apart** (`sync.split`). The episode is the day's longest F6 take. The other takes are Instagram promo recordings: 0.3–4 min in every 2026 episode, except ep 222's 11.7-min take 2. A "promo" over 5 min is flagged for checking.
   - **Audio channels, fixed 2026-10-30.**
     - The problem: with the WAV `<file>` giving only `<channelcount>5</channelcount>` (as Resolve writes it), Premiere played channel 1 (Martin) on every mono track, even in a new project. That's probably why the Resolve XML "gets the waveforms wrong" too.
     - The fix: describe the file channel by channel, one mono `<audio>` per channel with `<audiochannel><sourcechannel>N</sourcechannel></audiochannel>`. David heard every mic on its own track.
     - Adding Premiere's own track attributes (`premiereTrackType="Mono"`, `currentExplodedTrackIndex`) put everything back on channel 1, so they're left out.
2. **Offline planner.** Steps 1–8 of section 5 as a Node CLI (`podgrip plan <episode folder>`), producing `<ep>.assembly.json`, plus a replay harness over the 38 episodes.
3. **Graphics and outro placement.** Deterministic rules from section 3, checked against all 38 episodes.
4. **Teaser picker.** Ranking, scored by how often David's actual teaser lands in the top 3.
5. **Panel.** A one-page flow (pick the episode folder → check people and cameras → Assemble → review list), using PodDirector's UI patterns and updater.
6. **First real episode** assembled end to end, with David reviewing. Write his feedback into the rules, as was done for PodDirector.

---

## 10. Questions for David

1. Should the multicam stay re-switchable (a real multicam clip), or is a stacked V1/V2 cut fine for the master?
2. How do you pick the teaser? Funniest line, strongest claim, a question? Is it always one speaker?
3. Which season's asset package should new episodes use, and how do we know when it changes?
4. Do the channel cards land at particular moments (a pause, the end of a topic) or just around those times?
5. What are the audio levels and fades for the music beds, the outros and the sting? (The project files have them; they haven't been measured yet.)
6. When a guest has no lower-third render yet, who makes it, and from what template?
7. ~~What's the plugin's name?~~ **PodGrip** (David, 2026-10-30). It was PodAssembler, which was too long and read badly when cut off. A grip builds the set before the director calls action, and PodDirector cuts what PodGrip builds.
8. Were the small single-clip nudges done by hand (ep 243 cam A7S3-3 +1.5 s, and clips in eps 224, 231 and 232)? Did eps 213 and 223 have audio drift in the second half that you fixed in Premiere?
9. Which cameras in eps 222, 224, 235 and 236 weren't on the timecode splitter?
