#!/bin/bash
cd /home/user/neon-bay
for k in 0 1 2 3; do
  ( for attempt in 1 2 3 4 5; do node tools/render.js --from $((k*360)) --to $(((k+1)*360)) --fps 30 --out frames --w 1920 --h 1080 --skip 1 >> frames/log_$k.txt 2>&1 && break; done ) &
done
wait
echo ALLDONE >> frames/log_all.txt
