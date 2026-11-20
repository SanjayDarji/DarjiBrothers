#!/bin/bash
cd /home/user/neon-bay
ffmpeg -loglevel error -y -framerate 30 -i frames/%05d.jpg -i audio/soundtrack.wav \
  -vf "scale=3840:2160:flags=lanczos,unsharp=5:5:0.35:5:5:0" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -c:a aac -b:a 256k -movflags +faststart -shortest NeonBay_4K.mp4
ffmpeg -loglevel error -y -i NeonBay_4K.mp4 -vf "scale=1920:1080:flags=lanczos" -c:v libx264 -preset medium -crf 20 -c:a copy -movflags +faststart NeonBay_1080p.mp4
ls -la NeonBay_*.mp4
