// The wait before the first fruit (owner, 2026-11-05, after the first watched strangers waited minutes: "why aren't we
// downloading it in the background?"). Two jobs:
// 1. On the website, computers download the game and the body reader quietly, so most of it is here before Play is
//    pressed. Not phones: nobody's mobile data goes on a game they may never start. On the play page every device
//    starts the body reader beside the game, instead of after it.
// 2. Every visit records how fast the files really came (a "speed:" line in the visit's story on the numbers page).
// The storage sends a cut-off file's remainder (see freeFile in the online program), so moving between pages loses nothing.
(function () {
  var Files = "https://api.cuzgames.com/api/free/", MB = 1048576;
  var onPlay = /\/play[^/]*\/(index\.html)?$/.test(location.pathname);
  var phone = !!((navigator.userAgentData && navigator.userAgentData.mobile) ||
    (navigator.maxTouchPoints > 1 && !matchMedia("(any-pointer: fine)").matches));
  var reader = ["reader/vision_bundle.mjs", "reader/wasm/vision_wasm_internal.js", "reader/wasm/vision_wasm_internal.wasm",
    "reader/" + (phone ? "pose_landmarker_lite.task" : "pose_landmarker_full.task"), "reader/hand_landmarker.task"];
  var megabytes = function (bytes) { return Math.round(bytes / MB); };
  var seconds = function (ms) { return Math.round(ms / 1000); };
  var pace = function (bytes, ms) { return (bytes / MB / Math.max(ms, 1) * 1000).toFixed(1) + " MB/s"; };

  function say(words) {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return console.log("[early] " + words);
    if (window.OTCShop && OTCShop.say) return OTCShop.say(words);
    try {
      var visit = sessionStorage.getItem("otcVisit");
      if (!visit) return;
      fetch("https://api.cuzgames.com/api/step", { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ step: "say", game: "", detail: words, count: false, from: sessionStorage.getItem("otcFrom") || "",
          visit: visit, at: Date.now() - +sessionStorage.getItem("otcStart"), device: phone ? "phone" : "computer" }) }).catch(function () {});
    } catch (e) {}
  }

  // Fetches one file into the browser's own store and throws the bytes away: the game asks for it later and finds it there.
  function fetchFile(name, got) {
    return fetch(Files + name, { mode: "cors", priority: "low" }).then(function (response) {
      if (!response.ok || !response.body) throw new Error("no file");
      var pages = response.body.getReader();
      return (function next() {
        return pages.read().then(function (part) {
          if (part.done) return;
          if (got) got(part.value.length);
          return next();
        });
      })();
    });
  }

  // On the website.
  function ahead() {
    var save = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType));
    if (phone || save || /bot|crawl|spider|slurp|lighthouse|pagespeed|preview|externalhit/i.test(navigator.userAgent)) return;
    var began = performance.now(), got = 0, wanted = 0, told = false;
    var tell = function (how) {
      if (told) return;
      told = true;
      var ms = performance.now() - began;
      if (got < MB || got / ms * 1000 > 150 * MB) return; // came from this computer, not over the internet
      say("speed: website download " + how + " after " + seconds(ms) + " s, " + megabytes(got) + " MB, " + pace(got, ms));
    };
    fetch("/play/").then(function (page) { return page.text(); }).then(function (html) {
      var names = (html.match(/[0-9a-f]{32}\.(?:data\.unityweb|wasm\.unityweb|framework\.js\.unityweb|loader\.js)/g) || [])
        .filter(function (name, at, all) { return all.indexOf(name) === at; });
      if (!names.length) return;
      var key = names.join();
      try { if (localStorage.getItem("otcAhead") === key) return; } catch (e) {}
      say("speed: website download started");
      addEventListener("pagehide", function () { tell("stopped (Play pressed or left)"); });
      names.sort(function (a, b) { return /data/.test(b) - /data/.test(a); });
      var list = names.map(function (name) { return "build/" + name; }).concat(reader);
      return list.reduce(function (before, name) {
        return before.then(function () { return fetchFile(name, function (size) { got += size; }); });
      }, Promise.resolve()).then(function () {
        try { localStorage.setItem("otcAhead", key); } catch (e) {}
        tell("finished");
      });
    }).catch(function () { tell("failed"); });
  }

  // On the play page: "download started" and "download finished", nothing to do with the camera (owner, 2026-11-05: "you
  // just need to send start a download and finish download"). The game and the reader download side by side. Sizes are the
  // same as the loading card's, because Safari does not say how much really came. Someone who goes first leaves a line too;
  // tablets and phones often only put the page away, so that counts, and if they come back the finish line still follows.
  function watch() {
    var opened = performance.now(), finished = false, gone = false, readerSize = phone ? 17 : 21, size = phone ? 70 : 74;
    var unpacked = (phone ? 27.2 : 30.6) * MB, waiting = reader.length, had = 0, grewAt = opened;
    var soon = function (words, tries) {
      if (window.OTCShop && OTCShop.say) return say(words);
      if (tries < 100) setTimeout(function () { soon(words, tries + 1); }, 100);
    };
    soon("speed: download started", 0);
    var measure = function () {
      var now = (size - readerSize) * Math.min(window.OTCGameLoaded || 0, 1) + readerSize * Math.min((window.OTCReaderGot || 0) / unpacked, 1);
      if (now > had) { had = now; grewAt = performance.now(); }
      if (finished || (window.OTCGameLoaded || 0) < 1 || waiting > 0) return;
      finished = true;
      clearInterval(meter);
      var ms = performance.now() - opened, rate = size / Math.max(ms, 1) * 1000;
      say("speed: download finished" + (rate > 150 ? ", the files were already on this device" :
        " in " + seconds(ms) + " s, " + size + " MB, " + rate.toFixed(1) + " MB/s"));
    };
    var meter = setInterval(measure, 500);
    var leaving = function () {
      measure();
      if (finished || gone) return;
      gone = true;
      var rate = had / Math.max(grewAt - opened, 1) * 1000;
      say("speed: left before the download finished, " + Math.round(had) + " of " + size + " MB after " +
        seconds(performance.now() - opened) + " s" + (had < 1 ? "" : ", " + rate.toFixed(1) + " MB/s"));
    };
    addEventListener("pagehide", leaving);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leaving(); });

    var Real = window.Worker;
    window.Worker = function (url, options) {
      var worker = new Real(url, options), began = performance.now();
      if (String(url).indexOf("reader-worker") >= 0) worker.addEventListener("message", function (event) {
        if (!event.data || event.data.kind !== "ready") return;
        say("speed: body reader started in " + seconds(performance.now() - began) + " s");
      });
      return worker;
    };
    reader.forEach(function (name) {
      var one = function () { waiting--; };
      fetchFile(name, function (bytes) { window.OTCReaderGot = (window.OTCReaderGot || 0) + bytes; }).then(one, one);
    });
  }

  if (onPlay) return watch();
  if (document.visibilityState === "visible") return ahead();
  document.addEventListener("visibilitychange", function start() {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", start);
    ahead();
  });
})();
