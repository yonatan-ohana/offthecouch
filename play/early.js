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
  var pace = function (bytes, ms) { return (bytes / MB / Math.max(ms, 1) * 1000).toFixed(1) + " MB a second"; };

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
      say("speed: website got " + megabytes(got) + " MB in " + seconds(ms) + " s, " + pace(got, ms) + how);
    };
    fetch("/play/").then(function (page) { return page.text(); }).then(function (html) {
      var names = (html.match(/[0-9a-f]{32}\.(?:data\.unityweb|wasm\.unityweb|framework\.js\.unityweb|loader\.js)/g) || [])
        .filter(function (name, at, all) { return all.indexOf(name) === at; });
      if (!names.length) return;
      var key = names.join();
      try { if (localStorage.getItem("otcAhead") === key) return; } catch (e) {}
      addEventListener("pagehide", function () { tell(", Play pressed or left"); });
      names.sort(function (a, b) { return /data/.test(b) - /data/.test(a); });
      var list = names.map(function (name) { return "build/" + name; }).concat(reader);
      return list.reduce(function (before, name) {
        return before.then(function () { return fetchFile(name, function (size) { got += size; }); });
      }, Promise.resolve()).then(function () {
        try { localStorage.setItem("otcAhead", key); } catch (e) {}
        tell(", all there");
      });
    }).catch(function () { tell(", failed"); });
  }

  // On the play page. The game and the reader download side by side, so one line covers both: how fast the files came.
  function watch() {
    var opened = performance.now(), told = false, gameIn = false, readerIn = null;
    var fromUs = function (entry) { return entry.name.indexOf(Files) === 0; };
    var tell = function () {
      if (told || !gameIn || !readerIn) return;
      told = true;
      var size = readerIn.got || 0, first = performance.now(), last = 0;
      performance.getEntriesByType("resource").forEach(function (entry) {
        if (!fromUs(entry)) return;
        size += entry.transferSize;
        first = Math.min(first, entry.startTime);
        last = Math.max(last, entry.responseEnd);
      });
      var ms = last - first, reading = ", body reader started in " + seconds(readerIn.took) + " s";
      say((size < MB ? "speed: everything was already on this device" :
        "speed: " + megabytes(size) + " MB in " + seconds(ms) + " s, " + pace(size, ms)) + reading);
    };
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (fromUs(entry) && /\.data\.unityweb$/.test(entry.name)) gameIn = true;
      });
      tell();
    }).observe({ type: "resource", buffered: true });
    addEventListener("pagehide", function () {
      if (!told && !window.OTCGame) say("speed: left after " + seconds(performance.now() - opened) + " s, the game not started");
    });

    var Real = window.Worker;
    window.Worker = function (url, options) {
      var worker = new Real(url, options), began = performance.now();
      if (String(url).indexOf("reader-worker") >= 0) worker.addEventListener("message", function (event) {
        if (!event.data || event.data.kind !== "ready") return;
        readerIn = { got: event.data.got, took: performance.now() - began };
        tell();
      });
      return worker;
    };
    reader.forEach(function (name) {
      fetchFile(name, function (size) { window.OTCReaderGot = (window.OTCReaderGot || 0) + size; }).catch(function () {});
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
