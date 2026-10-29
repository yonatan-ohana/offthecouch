// The browser body reader's own lane (a web worker), so reading the camera never holds up the game's drawing: the
// game's page sends each new camera picture here (see Assets/Plugins/WebGL/BrowserReader.jspre) and gets the body's
// and hands' points back. The reader's files sit next to this one.
var body = null, hands = null, lastStamp = 0;

self.onmessage = function (event) {
  var message = event.data;
  if (message.kind === "load") load(message.base);
  else if (message.kind === "read") read(message);
};

function load(base) {
  import(base + "vision_bundle.mjs").then(function (vision) {
    return vision.FilesetResolver.forVisionTasks(base + "wasm").then(function (files) {
      return make(vision, files, base, "GPU").then(function () { return "graphics chip"; }, function (error) {
        console.warn("[Browser] the graphics chip refused the reader, using the processor:", error);
        return make(vision, files, base, "CPU").then(function () { return "processor"; });
      });
    });
  }).then(function (processor) {
    // The first read takes seconds (the graphics chip gets ready): done once on a blank picture, before the camera's.
    var started = performance.now(), blank = new ImageData(64, 64);
    body.detectForVideo(blank, stamp());
    hands.detectForVideo(blank, stamp());
    self.postMessage({ kind: "ready", processor: processor, warmMs: performance.now() - started });
  }, function (error) {
    self.postMessage({ kind: "failed", error: String(error) });
  });
}

function make(vision, files, base, delegate) {
  return Promise.all([
    vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + "pose_landmarker_full.task", delegate: delegate }, runningMode: "VIDEO", numPoses: 1 }),
    vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + "hand_landmarker.task", delegate: delegate }, runningMode: "VIDEO", numHands: 2 })
  ]).then(function (made) {
    body = made[0];
    hands = made[1];
  });
}

// One camera picture: the body, if someone is there (33 x (x, y, certainty), then 33 x (x, y, z) in metres; x and y
// run 0-1 across the picture from the top left) and, when asked, up to two hands of 21 x (x, y, z). The picture is
// let go of afterwards.
function read(message) {
  var at = stamp(), started = performance.now();
  var result = body.detectForVideo(message.picture, at), points = result.landmarks[0], world = result.worldLandmarks[0];
  var bodyOut = null;
  if (points && world) {
    bodyOut = new Float32Array(198);
    for (var i = 0; i < 33; i++) {
      bodyOut[3 * i] = points[i].x;
      bodyOut[3 * i + 1] = points[i].y;
      bodyOut[3 * i + 2] = points[i].visibility === undefined ? 1 : points[i].visibility;
      bodyOut[99 + 3 * i] = world[i].x;
      bodyOut[99 + 3 * i + 1] = world[i].y;
      bodyOut[99 + 3 * i + 2] = world[i].z;
    }
  }
  var bodyMs = performance.now() - started, handMs = 0, handsOut = null, handCount = 0;
  if (message.hands) {
    started = performance.now();
    var found = hands.detectForVideo(message.picture, at).landmarks;
    handMs = performance.now() - started;
    handCount = Math.min(found.length, 2);
    handsOut = new Float32Array(126);
    for (var h = 0; h < handCount; h++)
      for (var p = 0; p < 21; p++) {
        handsOut[63 * h + 3 * p] = found[h][p].x;
        handsOut[63 * h + 3 * p + 1] = found[h][p].y;
        handsOut[63 * h + 3 * p + 2] = found[h][p].z;
      }
  }
  message.picture.close();
  var transfer = [];
  if (bodyOut) transfer.push(bodyOut.buffer);
  if (handsOut) transfer.push(handsOut.buffer);
  self.postMessage({ kind: "read", body: bodyOut, hands: handsOut, handCount: handCount, handsRead: !!message.hands,
                     bodyMs: bodyMs, handMs: handMs }, transfer);
}

// Each read needs a later time than the last.
function stamp() {
  lastStamp = Math.max(performance.now(), lastStamp + 1);
  return lastStamp;
}
