# Neon Bay — "The City Where Anything Can Happen!"

A 48-second, 16:9 3D cartoon short set in Neon Bay, a fictional coastal city. Built as a single Three.js scene.

## Download
- **4K (3840×2160):** [`NeonBay_4K.mp4`](NeonBay_4K.mp4) (click it, then the download button); best for YouTube
- **1080p:** [`NeonBay_1080p.mp4`](NeonBay_1080p.mp4) in this branch (click it, then the download button)

## Scenes
1. 0–8 s — Aerial fly-in, title "WELCOME TO NEON BAY"
2. 8–16 s — Busy shopping street; Benny crosses while texting, cars brake and honk
3. 16–24 s — Sports car on the beach road, tracking shots
4. 24–32 s — Selfie with the car, a cyclist splashes Benny
5. 32–40 s — Sunset to neon night
6. 40–48 s — Skyline finale, "NEON BAY – WHERE EVERY STREET HAS A STORY."

## Source
- `index.html` + `main.js` — the scene (open via a local web server to play it live)
- `soundtrack.mp3` — procedurally generated music and sound effects (`tools/soundtrack.py`)
- `tools/render.js`, `tools/render_all.sh`, `tools/encode.sh` — headless frame render and ffmpeg encode

Frames were rendered at 1920×1080 and upscaled to 4K with Lanczos.
