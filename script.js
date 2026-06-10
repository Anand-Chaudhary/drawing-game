import { FilesetResolver, HandLandmarker }
    from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

let handLandmarker = null;
let video = null;
let isDrawing = false;
let lastPoint = null;
let clearCooldown = 0;  
let strokes = [];
let currentStroke = null;

const PINCH_THRESHOLD = 0.07;
const DRAW_COLOR = "#FF3366";

let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const hud = document.createElement("div");
hud.style.cssText = `
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.55); color: #fff;
  font: 500 15px/1 sans-serif; padding: 8px 20px;
  border-radius: 999px; pointer-events: none; z-index: 99;
`;
document.body.appendChild(hud);


function fingerExtended(lm, tipIdx) {
    // tip y < pip y  →  finger pointing up (y=0 at top)
    return lm[tipIdx].y < lm[tipIdx - 2].y;
}

function pinching(lm) {
    const dx = lm[4].x - lm[8].x;
    const dy = lm[4].y - lm[8].y;
    return Math.sqrt(dx * dx + dy * dy) < PINCH_THRESHOLD;
}

function getGesture(lm) {
    if (pinching(lm)) return "CLEAR";

    const indexUp  = fingerExtended(lm, 8);
    const middleUp = fingerExtended(lm, 12);
    const ringUp   = fingerExtended(lm, 16);
    const pinkyUp  = fingerExtended(lm, 20);

    if (indexUp && !middleUp && !ringUp && !pinkyUp) return "DRAW";
    return "IDLE";
}


function canvasPoint(lm) {
    // MediaPipe x/y are 0-1; mirror x for natural feel
    return {
        x: (1 - lm[8].x) * canvas.width,
        y: lm[8].y * canvas.height
    };
}

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    }
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
        numHands: 1        
    });
    console.log("Model loaded");
    startCamera();
}

function startCamera() {
    video = document.getElementById("videoElement");
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                loop();
            };
        })
        .catch(err => console.error("Camera error:", err));
}

function loop() {
    if (!handLandmarker || !video) { requestAnimationFrame(loop); return; }

    const results = handLandmarker.detectForVideo(video, performance.now());

    if (!results.landmarks?.length) {
        // no hand → lift pen
        currentStroke = null;
        hud.textContent = "no hand";
        requestAnimationFrame(loop);
        return;
    }

    const lm = results.landmarks[0];
    const gesture = getGesture(lm);

    if (clearCooldown > 0) clearCooldown--;

    if (gesture === "CLEAR" && clearCooldown === 0) {
        strokes = [];
        currentStroke = null;
        redraw();
        hud.textContent = "cleared";
        clearCooldown = 30;

    } else if (gesture === "DRAW") {
        const pt = canvasPoint(lm);

        if (!currentStroke) {
            currentStroke = { points: [pt], color: DRAW_COLOR };
            strokes.push(currentStroke);
        } else {
            currentStroke.points.push(pt);
        }

        redraw();
        hud.textContent = "drawing";

    } else {
        currentStroke = null;
        hud.textContent = "raise index to draw";
    }

    requestAnimationFrame(loop);
}

init();