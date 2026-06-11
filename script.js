import { FilesetResolver, HandLandmarker }
    from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

let handLandmarker = null;
let video = null;
let strokes = [];
let currentStroke = null;
let clearCooldown = 0;
let leftCursorPt  = null;

const PINCH_THRESHOLD = 0.07;
const PALETTE = [
  { color: "#FF3333", label: "Red"    },
  { color: "#3399FF", label: "Blue"   },
  { color: "#33CC55", label: "Green"  },
  { color: "#FFCC00", label: "Yellow" },
];
let selectedColorIndex = 0;

const SWATCH_SIZE    = 52;
const SWATCH_X       = 24;
const SWATCH_MARGIN  = 16;
const SWATCH_HIT_PAD = 20;

function swatchY(i) {
  return 80 + i * (SWATCH_SIZE + SWATCH_MARGIN);
}

let canvas = document.getElementById("canvas");
let ctx    = canvas.getContext("2d");
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  redraw();
});

const hud = document.createElement("div");
hud.style.cssText = `
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.55); color: #fff;
  font: 500 15px/1 sans-serif; padding: 8px 20px;
  border-radius: 999px; pointer-events: none; z-index: 99;
`;
document.body.appendChild(hud);

const debugEl = document.createElement("div");
debugEl.style.cssText = `
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.45); color: #0f0;
  font: 13px/1.6 monospace; padding: 8px 16px;
  border-radius: 8px; pointer-events: none; z-index: 99;
`;
document.body.appendChild(debugEl);

function fingerExtended(lm, tipIdx) {
  return lm[tipIdx].y < lm[tipIdx - 2].y;
}

function pinching(lm) {
  const dx = lm[4].x - lm[8].x;
  const dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx * dx + dy * dy) < PINCH_THRESHOLD;
}

function getGesture(lm) {
  if (pinching(lm)) return "PINCH";
  const indexUp  = fingerExtended(lm, 8);
  const middleUp = fingerExtended(lm, 12);
  const ringUp   = fingerExtended(lm, 16);
  const pinkyUp  = fingerExtended(lm, 20);
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return "POINT";
  return "IDLE";
}

function toCanvas(lm, idx) {
  return {
    x: (1 - lm[idx].x) * canvas.width,
    y: lm[idx].y * canvas.height,
  };
}

function pinchMidpoint(lm) {
  return {
    x: ((1 - lm[4].x) + (1 - lm[8].x)) * 0.5 * canvas.width,
    y: (lm[4].y + lm[8].y) * 0.5 * canvas.height,
  };
}

function hitSwatch(pt) {
  for (let i = 0; i < PALETTE.length; i++) {
    const sy = swatchY(i);
    if (
      pt.x >= SWATCH_X - SWATCH_HIT_PAD &&
      pt.x <= SWATCH_X + SWATCH_SIZE + SWATCH_HIT_PAD &&
      pt.y >= sy - SWATCH_HIT_PAD &&
      pt.y <= sy + SWATCH_SIZE + SWATCH_HIT_PAD
    ) return i;
  }
  return -1;
}


function drawCursor(pt, color) {
  if (!pt) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPalette() {
  for (let i = 0; i < PALETTE.length; i++) {
    const sy = swatchY(i);
    ctx.save();

    if (i === selectedColorIndex) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur  = 12;
    }

    ctx.fillStyle = PALETTE[i].color;
    ctx.beginPath();
    ctx.roundRect(SWATCH_X, sy, SWATCH_SIZE, SWATCH_SIZE, 10);
    ctx.fill();

    if (i === selectedColorIndex) {
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font      = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("both pinch = clear", SWATCH_X, swatchY(PALETTE.length) + 20);
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth   = 4;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }

  drawPalette();
  drawCursor(leftCursorPt, PALETTE[selectedColorIndex].color);
}

async function init() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "./app/shared/models/hand_landmarker.task"
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
  console.log("Model loaded");
  startCamera();
}

function startCamera() {
  video = document.getElementById("videoElement");
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
      video.onloadedmetadata = () => { video.play(); loop(); };
    })
    .catch(err => console.error("Camera error:", err));
}

function loop() {
  if (!handLandmarker || !video) { requestAnimationFrame(loop); return; }

  const results = handLandmarker.detectForVideo(video, performance.now());

  if (clearCooldown > 0) clearCooldown--;

  if (!results.landmarks?.length) {
    currentStroke  = null;
    leftCursorPt   = null;
    hud.textContent     = "no hand detected";
    debugEl.textContent = "no hands";
    redraw();
    requestAnimationFrame(loop);
    return;
  }

  const rawLabels = results.handednesses.map(
    (h, i) => `hand${i}: ${h?.[0]?.categoryName ?? "?"}`
  ).join(" | ");
  debugEl.textContent = rawLabels;

  let rightHandLm = null;
  let leftHandLm  = null;

  for (let i = 0; i < results.landmarks.length; i++) {
    const label = results.handednesses[i]?.[0]?.categoryName;
    if (label === "Right") rightHandLm = results.landmarks[i];
    if (label === "Left")  leftHandLm  = results.landmarks[i];
  }

  const leftGesture  = leftHandLm  ? getGesture(leftHandLm)  : "NONE";
  const rightGesture = rightHandLm ? getGesture(rightHandLm) : "NONE";

  hud.textContent = `L:${leftGesture} | R:${rightGesture}`;

  if (leftGesture === "PINCH" && rightGesture === "PINCH" && clearCooldown === 0) {
    strokes = [];
    currentStroke = null;
    redraw();
    hud.textContent = "canvas cleared ✓";
    clearCooldown = 60;
    requestAnimationFrame(loop);
    return;
  }

  leftCursorPt = leftHandLm ? toCanvas(leftHandLm, 8) : null;

  if (leftHandLm && leftGesture === "PINCH") {
    const pt  = toCanvas(leftHandLm, 8);
    const hit = hitSwatch(pt);
    if (hit !== -1) {
      selectedColorIndex = hit;
      hud.textContent = `color: ${PALETTE[hit].label}`;
    }
  }

  if (rightHandLm) {
    if (rightGesture === "PINCH") {
      const pt = pinchMidpoint(rightHandLm);
      if (!currentStroke) {
        currentStroke = { points: [pt], color: PALETTE[selectedColorIndex].color };
        strokes.push(currentStroke);
      } else {
        currentStroke.points.push(pt);
      }
    } else {
      currentStroke = null;
    }
  } else {
    currentStroke = null;
  }

  redraw();
  requestAnimationFrame(loop);
}

init();