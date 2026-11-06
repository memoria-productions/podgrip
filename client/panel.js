/*
 * PodGrip panel controller. With an episode project open (a renamed copy of the show's template, saved in
 * <episode>\project_files\premiere\), "Begin episode assembly":
 *   1. renames the template's ### sequences to the episode number (host: PG.renameTemplateSequences)
 *   2. reads the timecode on the footage and the F6 WAVs and syncs them (lib/assembly.js, in Node)
 *   3. writes <show>_<ep>_assembly.xml next to the project (the show's name is the project file's, before the number)
 *   4. imports it into a PodGrip bin with no dialog (host: PG.importXml)
 *   5. puts the show LUT on the cameras in the nests, if that's ticked (host: PG.applyLut)
 * and then says the one step left: make <ep>_mc from the nests.
 */
(function () {
  "use strict";

  var cs = new CSInterface();
  var inPremiere = !!window.__adobe_cep__;
  var hasNode = typeof require === "function" && typeof process !== "undefined";
  var path = hasNode ? require("path") : null;
  var VERSION = "?", BIN = "PodGrip";
  var state = { busy: false, extRoot: null, LA: null, E: null, U: null, LUT: null, update: null, project: null, dir: null, info: null, show: null };

  function $(id) { return document.getElementById(id); }
  function log(msg) { var el = $("log"); el.textContent += msg + "\n"; el.scrollTop = el.scrollHeight; }
  function status(msg, kind) { var el = $("status"); el.textContent = msg || ""; el.className = "status" + (kind ? " " + kind : ""); }
  function step(name, how) {
    var items = $("steps").querySelectorAll("li");
    for (var i = 0; i < items.length; i++) if (items[i].getAttribute("data-step") === name) items[i].className = how || "";
  }
  function resetSteps() { ["rename", "sync", "write", "import", "lut"].forEach(function (s) { step(s, ""); }); }
  /** Let the panel repaint before a step that blocks (reading timecode runs ffmpeg synchronously). */
  function paint() { return new Promise(function (r) { setTimeout(r, 40); }); }

  function callHost(fn, args) {
    var call = "PG." + fn + "(" + (args || []).map(function (a) { return JSON.stringify(a); }).join(",") + ")";
    return new Promise(function (resolve, reject) {
      if (!inPremiere) return reject(new Error("Not running inside Premiere Pro."));
      cs.evalScript(call, function (res) {
        if (!res || /^EvalScript error/.test(res)) return reject(new Error("Premiere script error in " + fn + ". Is host.jsx loaded?"));
        var o;
        try { o = JSON.parse(res); } catch (e) { return reject(new Error("Unexpected reply from Premiere: " + String(res).slice(0, 200))); }
        if (!o.ok) return reject(new Error(o.error || "Unknown Premiere error"));
        resolve(o);
      });
    });
  }

  function kv(rows) {
    var box = document.createElement("div");
    box.className = "kv";
    rows.forEach(function (r) {
      var k = document.createElement("b"), v = document.createElement("span");
      k.textContent = r[0]; v.textContent = r[1];
      box.appendChild(k); box.appendChild(v);
    });
    return box;
  }

  function showEpisode(msg, rows) {
    var box = $("epBox");
    box.textContent = "";
    box.className = rows ? "" : "muted";
    if (msg) { var p = document.createElement("p"); p.textContent = msg; box.appendChild(p); }
    if (rows) box.appendChild(kv(rows));
  }

  /** Look at the open project: which episode folder it's in, and what's been copied into it. */
  function refresh() {
    state.dir = state.info = state.show = null;
    $("btnBegin").disabled = true;
    $("btnPlace").disabled = true;
    return callHost("ping").then(function (r) {
      state.project = r.projectPath;
      if (!state.project) return showEpisode("Save the project into the episode's project_files\\premiere folder first.");
      state.dir = state.LA.episodeDir(state.project);
      if (!state.dir) return showEpisode("This project isn't inside an episode folder named yyyymmdd_###_title. Save it in <episode>\\project_files\\premiere\\.");
      state.info = state.E.folderInfo(state.dir);
      // Sequences and the XML are named after the show, read off the project file (margin_notes_015.prproj).
      state.show = state.LA.showFromProject(state.project, state.info.ep);
      $("btnPlace").disabled = false;
      fillLuts();
      var m = state.E.listMedia(state.dir);
      showEpisode(null, [
        ["Show", state.show || "(none)"], ["Episode", state.info.ep], ["Title", state.info.slug.replace(/_/g, " ")], ["Recorded", state.info.date],
        ["Project", path.basename(state.project)], ["Cameras", m.cameras.length + " clip(s) in footage"], ["Audio", m.wavs.length + " WAV(s) in sync_sound"]
      ]);
      if (!m.cameras.length || !m.wavs.length) return status("Copy the footage into media\\captured\\footage and the F6 WAVs into media\\captured\\sync_sound, then press Refresh.", "warn");
      $("btnBegin").disabled = false;
      status("");
    }).catch(function (e) { showEpisode(e.message); });
  }

  function begin() {
    if (state.busy || !state.dir) return;
    var ep = state.info.ep, prep = null, xml = null, had = false;
    state.busy = true; $("btnBegin").disabled = true; $("nextBox").classList.add("hidden");
    resetSteps(); status("");
    log("— Begin episode assembly: " + path.basename(state.dir));

    callHost("findBin", [BIN]).then(function (r) {
      had = r.exists && r.items.length > 0;
      if (had && !window.confirm("This project already has a " + BIN + " bin from an earlier assembly. Import a fresh copy alongside it?")) throw new Error("Stopped: nothing was changed.");
      step("rename", "doing");
      return callHost("renameTemplateSequences", [ep]);
    }).then(function (r) {
      r.renamed.forEach(function (x) { log((x.done ? "renamed " : "COULDN'T rename ") + x.from + " -> " + x.to); });
      if (r.renamed.some(function (x) { return !x.done; })) throw new Error("Premiere wouldn't rename every ### sequence; see the Log.");
      if (!r.renamed.length) log("no ### sequences to rename (already renamed, or not the template)");
      step("rename", "done"); step("sync", "doing");
      status("Reading the timecode on each clip. This takes about 5 s per camera clip; the panel may pause.");
      return paint();
    }).then(function () {
      prep = state.LA.prepare(state.dir, state.LA.findFfmpeg(state.extRoot), { inTemplate: true, show: state.show, log: log });
      var p = prep.plan;
      p.video.forEach(function (t, i) {
        log("  " + prep.names.nests[i] + ": " + t.body + (t.wide ? " (the wide, 24-70)" : "") + ", " + t.clips.map(function (c) { return c.name + (c.unsynced ? " NOT SYNCED" : ""); }).join(", "));
      });
      log("  audio: " + p.wavs.map(function (w) { return w.name; }).join(" + "));
      if (prep.promos) log("  promos, kept apart: " + prep.promos.wavs.map(function (w) { return w.name; }).join(" + "));
      prep.warnings.forEach(function (w) { log("  ! " + w); });
      step("sync", "done"); step("write", "doing");
      return paint();
    }).then(function () {
      xml = state.LA.write(prep, path.dirname(state.project));
      log("wrote " + xml);
      step("write", "done"); step("import", "doing");
      return callHost("importXml", [xml, BIN]);
    }).then(function (r) {
      log("imported into the " + BIN + " bin: " + r.items.join(", "));
      step("import", "done");
      if (!$("lutOnBegin").checked) { log("show LUT: not ticked, so left off"); return; }
      var lut = lutChoice();
      if (lut.error) { prep.warnings.push(lut.error); step("lut", "failed"); return; }
      step("lut", "doing");
      // A LUT that doesn't go on is a warning, not a stop: the assembly itself is done.
      return callHost("applyLut", [prep.names.nests, lut.file, lut.saturation]).then(function (r) {
        var bad = lutReport(r);
        step("lut", bad.length ? "failed" : "done");
        prep.warnings = prep.warnings.concat(bad);
      }, function (e) { step("lut", "failed"); prep.warnings.push("Show LUT: " + e.message); log("show LUT: " + e.message); });
    }).then(function () {
      var n = prep.names, warn = prep.warnings.length ? "\n\nCheck these: " + prep.warnings.join("; ") : "";
      status("Assembled episode " + ep + ": " + [n.sync].concat(prep.promos ? [n.promos] : [], n.nests, [n.main]).join(", ") + " are in the " + BIN + " bin." + warn,
        prep.warnings.length ? "warn" : "ok");
      $("nextText").textContent = "Select " + n.nests.join(" and ") + " in the " + BIN + " bin, right-click › Create Multi-Camera Source Sequence. " +
        "At the top, set the name menu to Custom and type " + n.mc + " (\"Video Clip Name +\" would add the clip's name in front). " +
        "Synchronize Point: In Points; Camera Names: Use Clip Names. Put it on V1 of " + n.main +
        " at the start, where the marker is: the Place multicam button below does that. The mics are already on A1–A4.";
      $("nextBox").classList.remove("hidden");
    }).catch(function (e) {
      var items = $("steps").querySelectorAll("li.doing");
      for (var i = 0; i < items.length; i++) items[i].className = "failed";
      status(e.message || String(e), "err");
      log("stopped: " + (e.stack || e.message || e));
    }).then(function () { state.busy = false; $("btnBegin").disabled = !state.dir; });
  }

  /** The multicam and the program sequence, by the names engine/assemble.js gives them in the template. */
  function mcNames() { return { mc: state.info.ep + "_mc", main: (state.show ? state.show + "_" : "") + state.info.ep + " (Program)" }; }

  function place() {
    if (state.busy || !state.info) return;
    var n = mcNames(), el = $("placeStatus");
    state.busy = true; $("btnPlace").disabled = true;
    el.className = "status"; el.textContent = "Placing " + n.mc + "…";
    callHost("placeMulticam", [n.mc, n.main]).then(function (r) {
      el.className = "status ok";
      el.textContent = n.mc + " is on V1 of " + n.main + " at the start" + (r.removedAudio ? ", without its empty audio" : "") +
        ". Copy V1 and A1–A4 from there into the template's main sequence.";
      log("placed " + n.mc + " at " + r.placedAt + " s; removed " + r.removedAudio + " empty audio piece(s)");
    }).catch(function (e) {
      el.className = "status err"; el.textContent = e.message;
      log("place multicam: " + e.message);
    }).then(function () { state.busy = false; $("btnPlace").disabled = !state.info; });
  }

  // ------------------------------------------------------------ the show LUT
  /** The remembered LUT folder (the show's #global\media\generated\color until David picks another), into the menu. */
  /** The LUT is remembered per show: each show has its own color folder. */
  function lutKey(k) { return k + (state.show ? "." + state.show : ""); }
  function lutFolder() { return load(lutKey("lutFolder"), null) || (state.dir ? state.LUT.defaultFolder(state.dir) : ""); }

  function fillLuts() {
    var folder = lutFolder(), names = folder ? state.LUT.list(folder) : [], sel = $("lutName"), chosen = state.LUT.pick(names, load(lutKey("lutName"), null));
    sel.textContent = "";
    names.forEach(function (n) { var o = document.createElement("option"); o.value = o.textContent = n; sel.appendChild(o); });
    if (!names.length) { var o = document.createElement("option"); o.value = ""; o.textContent = "(no LUTs found)"; sel.appendChild(o); }
    sel.value = chosen || "";
    $("lutFolder").textContent = folder ? "From " + folder : "Choose a LUT, or open an episode project to use the show's color folder.";
  }

  /** { file, saturation } for the host, or { error } in plain words. */
  function lutChoice() {
    var name = $("lutName").value, sat = state.LUT.saturation($("lutSat").value);
    if (!name) return { error: "Show LUT: there's no LUT chosen. Pick one under Show LUT." };
    if (sat !== null && isNaN(sat)) return { error: "Show LUT: the Creative saturation should be a number from 0 to 200 (or empty)." };
    return { file: path.join(lutFolder(), name), saturation: sat };
  }

  /** Log what PG.applyLut did, and give back what David should check. */
  function lutReport(r) {
    var bad = [];
    r.done.forEach(function (d) {
      log("LUT on " + d.sequence + " › " + d.clip + ": " + (d.already ? "already had it" : d.added ? "added Lumetri Color" : "set the Look on its Lumetri Color") +
        (d.saturation !== null ? ", saturation " + d.saturation : "") + (d.confirmed ? "" : " (Premiere didn't confirm the Look)"));
      if (!d.confirmed) bad.push("Show LUT: check Lumetri › Creative › Look on " + d.clip + " in " + d.sequence);
    });
    r.missing.forEach(function (s) { bad.push("Show LUT: there's no sequence " + s); });
    r.problems.forEach(function (p) { log("LUT problem: " + p); bad.push("Show LUT: " + p); });
    if (!r.done.length && !r.problems.length && !r.missing.length) bad.push("Show LUT: there were no clips to put it on");
    return bad;
  }

  function applySelected() {
    if (state.busy) return;
    var lut = lutChoice(), el = $("lutStatus");
    if (lut.error) { el.className = "status err"; el.textContent = lut.error; return; }
    state.busy = true; $("btnLut").disabled = true;
    el.className = "status"; el.textContent = "Applying " + path.basename(lut.file) + "…";
    callHost("applyLutToSelection", [lut.file, lut.saturation]).then(function (r) {
      var bad = lutReport(r), n = r.done.length;
      el.className = "status " + (bad.length ? "warn" : "ok");
      el.textContent = path.basename(lut.file) + " is on " + n + " clip" + (n === 1 ? "" : "s") + "." + (bad.length ? "\n" + bad.join("\n") : "");
    }).catch(function (e) {
      el.className = "status err"; el.textContent = e.message;
      log("apply LUT: " + e.message);
    }).then(function () { state.busy = false; $("btnLut").disabled = false; });
  }

  function chooseLut() {
    var r = window.cep && window.cep.fs.showOpenDialogEx(false, false, "Choose a LUT", lutFolder() || null, ["cube", "3dl", "look", "itx"]);
    if (!r || r.err || !r.data || !r.data.length) return;
    store(lutKey("lutFolder"), path.dirname(r.data[0]));
    store(lutKey("lutName"), path.basename(r.data[0]));
    fillLuts();
  }

  function wireLuts() {
    $("lutSat").value = load("lutSat", String(state.LUT.SATURATION));
    $("lutOnBegin").checked = load("lutOnBegin", true) !== false;
    $("lutName").addEventListener("change", function () { store(lutKey("lutName"), this.value); });
    $("lutSat").addEventListener("change", function () { store("lutSat", this.value.trim()); });
    $("lutOnBegin").addEventListener("change", function () { store("lutOnBegin", this.checked); });
    $("btnLutChoose").addEventListener("click", chooseLut);
    $("btnLut").addEventListener("click", applySelected);
    fillLuts();
  }

  // ------------------------------------------------------------ updates (as in PodCutter)
  function store(key, val) { try { localStorage.setItem("pg." + key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
  function load(key, def) { try { var v = localStorage.getItem("pg." + key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function updateOpts() { return { current: VERSION, folder: $("updateFolder").value.trim(), github: $("updateGithub").checked }; }

  /**
   * Look for a newer PodGrip: GitHub releases of memoria-productions/podgrip and/or a shared update folder.
   * On open it's quiet (a banner only if there's something new and it wasn't put off with Later).
   */
  function checkUpdates(quiet) {
    $("updateStatus").textContent = "Checking…";
    return state.U.check(updateOpts()).then(function (r) {
      state.update = r.newer ? r.latest : null;
      $("verLatest").textContent = r.latest ? r.latest.version + " (" + r.latest.source + ")" : "none found";
      $("btnInstallUpdate").disabled = !state.update;
      $("updateStatus").textContent = state.update ? "Version " + state.update.version + " is available." :
        (r.latest ? "You're up to date." : "No release found.") + (r.errors.length ? " " + r.errors.join(" ") : "");
      if (state.update && (!quiet || load("skipVersion", null) !== state.update.version)) {
        $("updateText").textContent = "PodGrip " + state.update.version + " is available (you have " + VERSION + ").";
        $("btnUpdateNow").classList.remove("hidden"); $("btnReloadBanner").classList.add("hidden");
        $("updateBanner").classList.remove("hidden");
      }
      if (r.errors.length) log("update check: " + r.errors.join(" | "));
    });
  }

  function installUpdate() {
    if (state.busy || !state.update) return;
    state.busy = true; $("btnUpdateNow").disabled = $("btnInstallUpdate").disabled = true;
    $("updateBanner").classList.remove("hidden");
    var labels = { copy: "Copying the update", download: "Downloading the update", unpack: "Unpacking", install: "Installing", done: "Installed" };
    state.U.install(state.update, function (stage, f) {
      $("updateText").textContent = labels[stage] + (f && f < 1 ? " " + Math.round(f * 100) + "%" : "") + "…";
    }, { extensionRoot: state.extRoot }).then(function (r) {
      log(r.log || ("installed " + r.version));
      $("btnUpdateNow").classList.add("hidden");
      if (r.needsRestart) {
        // The manifest changed (more than its version): Premiere only reads it at startup.
        $("updateText").textContent = "PodGrip " + r.version + " is installed. Save your project and restart Premiere Pro to use it.";
        $("updateStatus").textContent = "Installed " + r.version + ": restart Premiere Pro to finish.";
        $("btnUpdateLater").textContent = "OK";
      } else {
        $("updateText").textContent = "PodGrip " + r.version + " is installed.";
        $("updateStatus").textContent = "Installed " + r.version + ". Click Reload PodGrip to start using it; no need to restart Premiere.";
        $("btnReloadBanner").classList.remove("hidden");
        $("btnUpdateLater").textContent = "Later";
      }
      state.update = null;
    }).catch(function (e) {
      $("updateText").textContent = "The update didn't install: " + e.message;
      $("btnInstallUpdate").disabled = $("btnUpdateNow").disabled = false;
      log("update failed: " + (e.stack || e.message));
    }).then(function () { state.busy = false; $("btnUpdateNow").disabled = false; });
  }

  /**
   * Load the installed files again without restarting Premiere: re-run the host script (it redefines PG), forget
   * the Node modules loaded from the panel's folder, and reload the page. Settings are in localStorage, so they stay.
   */
  function reloadPanel() {
    if (state.busy) { status("Wait for the current job to finish, then reload.", "err"); return; }
    Object.keys(require.cache || {}).forEach(function (k) { if (k.indexOf(state.extRoot) === 0) delete require.cache[k]; });
    if (!inPremiere) { location.reload(); return; }
    var jsx = path.join(state.extRoot, "host", "host.jsx").replace(/\\/g, "/");
    cs.evalScript("$.evalFile(new File(" + JSON.stringify(jsx) + "))", function () { location.reload(); });
  }

  function wireUpdates() {
    $("verInstalled").textContent = VERSION;
    $("updateFolder").value = load("updateFolder", "");
    $("updateGithub").checked = load("updateGithub", true) !== false;
    $("updateFolder").addEventListener("change", function () { store("updateFolder", this.value.trim()); });
    $("updateGithub").addEventListener("change", function () { store("updateGithub", this.checked); });
    $("btnCheckUpdates").addEventListener("click", function () { if (!state.busy) checkUpdates(false); });
    $("btnInstallUpdate").addEventListener("click", installUpdate);
    $("btnUpdateNow").addEventListener("click", installUpdate);
    $("btnReload").addEventListener("click", reloadPanel);
    $("btnReloadBanner").addEventListener("click", reloadPanel);
    $("btnUpdateLater").addEventListener("click", function () {
      if (state.update) store("skipVersion", state.update.version);   // asked again for the next version, or from Check for updates
      $("updateBanner").classList.add("hidden");
    });
  }

  function init() {
    if (!hasNode) { showEpisode("This panel needs Node.js (enabled in its manifest)."); return; }
    state.extRoot = (inPremiere && cs.getExtensionPath()) || path.resolve(__dirname || ".", "..");
    VERSION = require(path.join(state.extRoot, "lib", "version.js")).VERSION;
    $("ver").textContent = "v" + VERSION;
    state.LA = require(path.join(state.extRoot, "lib", "assembly.js"));
    state.E = require(path.join(state.extRoot, "lib", "episode.js"));
    state.U = require(path.join(state.extRoot, "lib", "updater.js"));
    state.LUT = require(path.join(state.extRoot, "lib", "luts.js"));
    $("btnRefresh").addEventListener("click", function () { if (!state.busy) refresh(); });
    $("btnBegin").addEventListener("click", begin);
    $("btnPlace").addEventListener("click", place);
    wireLuts();
    wireUpdates();
    refresh();
    checkUpdates(true);
  }

  init();
})();
