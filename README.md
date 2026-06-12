# Hand Gesture Drawing Game
This is a browser-based drawing app controlled with hand gestures using MediaPipe hand tracking.

## Features
- Live webcam background with full-screen canvas overlay
- Draw using hand pinch gestures
- Color palette selection by gesture
- Clear canvas gesture shortcut

## Controls
- **Right hand pinch**: draw on the canvas
- **Left hand pinch on a color swatch**: change drawing color
- **Both hands pinch at the same time**: clear the canvas

## Prerequisites
- A modern browser with webcam access (Chrome/Edge recommended)
- Internet connection (MediaPipe is loaded from CDN)
- `hand_landmarker.task` model file available at:
  - `app/shared/models/hand_landmarker.task`

## Run locally
1. Open a terminal in this project folder.
2. Start a static server:

```bash
npx serve .
```

3. Open the local URL printed in the terminal.
4. Allow camera permission in the browser when prompted.

## Project structure
- `index.html` — page layout, video/canvas layers, and styles
- `script.js` — gesture detection, drawing logic, palette, and UI overlay
