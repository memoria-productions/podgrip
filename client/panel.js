/*
 * PodGrip panel controller. With David's episode project open (a renamed copy of his template, saved in
 * <episode>\project_files\premiere\), "Begin episode assembly":
 *   1. renames the template's ### sequences to the episode number (host: PG.renameTemplateSequences)
 *   2. reads the timecode on the footage and the F6 WAVs and syncs them (lib/assembly.js, in Node)
 *   3. writes classical_et_cetera_<ep>_assembly.xml next to the project
 *   4. imports it into a PodGrip bin with no dialog (host: PG.importXml)
 * and then says the one step left: make <ep>_mc from the nests.
 */
(function () {
  "use strict";

  var cs = new CSInterface();
  var inPremiere = !!window.__adobe_cep__;
  var hasNode = typeof require === "function" && typeof process !== "undefined";
  var path = hasNode ? require("path") : null;
  var VERSION = "?", BIN = "PodGrip";
  var state = { busy: false, extRoot: null, LA: null, E: null, U: null, update: null, project: null, dir: null, info: null };

  function $(id) { return document.getElementById(id); }
  function log(msg) { var el = $("log"); el.textContent += msg + "\n"; el.scrollTop = el.scrollHeight; }
  function status(msg, kind) { var el = $("status"); el.textContent = msg || ""; el.className = "status" + (kind ? " " + kind : ""); }
  function step(name, how) {
    var items = $("steps").querySelectorAll("li");
    for (var i = 0; i < items.length; i++) if (items[i].getAttribute("data-step") === name) items[i].className = how || "";
  }
  function resetSteps() { ["rename", "sync", "write", "import"].forEach(function (s) { step(s, ""); }); }
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
    state.dir = state.info = null;
    $("btnBegin").disabled = true;
    $("btnPlace").disabled = true;
    return callHost("ping").then(function (r) {
      state.project = r.projectPath;
      if (!state.project) return showEpisode("Save the project into the episode's project_files\\premiere folder first.");
      state.dir = state.LA.episodeDir(state.project);
      if (!state.dir) return showEpisode("This project isn't inside an episode folder named yyyymmdd_###_title. Save it in <episode>\\project_files\\premiere\\.");
      state.info = state.E.folderInfo(state.dir);
      $("btnPlace").disabled = false;
      var m = state.E.listMedia(state.dir);
      showEpisode(null, [
        ["Episode", state.info.ep], ["Title", state.info.slug.replace(/_/g, " ")], ["Recorded", state.info.date],
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
      prep = state.LA.prepare(state.dir, state.LA.findFfmpeg(state.extRoot), { inTemplate: true, log: log });
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
  function mcNames() { return { mc: state.info.ep + "_mc", main: "classical_et_cetera_" + state.info.ep + " (Program)" }; }

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

  /** A newer release on GitHub (memoria-productions/podgrip) shows a banner; quiet when offline or up to date. */
  function checkUpdate() {
    state.U.check({ current: VERSION }).then(function (r) {
      if (!r.newer) { r.errors.forEach(function (e) { log("update check: " + e); }); return; }
      state.update = r.latest;
      $("updateText").textContent = "PodGrip " + r.latest.version + " is available (you have " + VERSION + ").";
      $("updateBanner").classList.remove("hidden");
    });
  }

  function update() {
    if (state.busy || !state.update) return;
    state.busy = true; $("btnUpdate").disabled = true;
    state.U.install(state.update, function (stage, f) {
      $("updateText").textContent = { download: "Downloading… " + Math.round((f || 0) * 100) + "%", copy: "Copying…", unpack: "Unpacking…", install: "Installing…", done: "Installed." }[stage] || stage;
    }, { extensionRoot: state.extRoot }).then(function (r) {
      $("updateText").textContent = "Updated to " + r.version + ". " + (r.needsRestart ? "Restart Premiere Pro to load it." : "Close and reopen the PodGrip panel to load it.");
      log("updated to " + r.version);
    }).catch(function (e) {
      $("updateText").textContent = "The update didn't install: " + e.message;
      $("btnUpdate").disabled = false;
    }).then(function () { state.busy = false; });
  }

  function init() {
    if (!hasNode) { showEpisode("This panel needs Node.js (enabled in its manifest)."); return; }
    state.extRoot = (inPremiere && cs.getExtensionPath()) || path.resolve(__dirname || ".", "..");
    VERSION = require(path.join(state.extRoot, "lib", "version.js")).VERSION;
    $("ver").textContent = "v" + VERSION;
    state.LA = require(path.join(state.extRoot, "lib", "assembly.js"));
    state.E = require(path.join(state.extRoot, "lib", "episode.js"));
    state.U = require(path.join(state.extRoot, "lib", "updater.js"));
    $("btnRefresh").addEventListener("click", function () { if (!state.busy) refresh(); });
    $("btnBegin").addEventListener("click", begin);
    $("btnPlace").addEventListener("click", place);
    $("btnUpdate").addEventListener("click", update);
    refresh();
    checkUpdate();
  }

  init();
})();
