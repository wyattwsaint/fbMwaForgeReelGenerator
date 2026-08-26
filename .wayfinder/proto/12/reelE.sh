# Reel E — what is a "pan"? Lateral vs vertical, settling vs continuous. No holds.
. ./lib.sh
# 1. LATERAL pan across #costs, punched 1.5x, 3.5s continuous (linear, 6 samples)
ffmpeg -y -loglevel error -loop 1 -framerate 180 -t 3.5 -i m_costs.png -vf \
"crop=w=1620:h=2880:x='810*t/3.5':y=720,scale=1080:1920:flags=lanczos,tmix=frames=6,fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast e_lat35.mp4
# 2. LATERAL pan across #costs, 1.5s travel + 2.0s settle (ease-in-out, 32 samples)
ffmpeg -y -loglevel error -loop 1 -framerate 960 -t 1.5 -i m_costs.png -vf \
"crop=w=1620:h=2880:x='810*if(lt(t/1.5,0.5), 16*pow(t/1.5,5), 1-pow(-2*(t/1.5)+2,5)/2)':y=720,\
scale=1080:1920:flags=lanczos,tmix=frames=32,fps=30,tpad=stop_mode=clone:stop_duration=2.0,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast e_lat15.mp4
# 3. VERTICAL pan down #week, 3.5s continuous (linear, 7 samples) — a reveal that never settles
ffmpeg -y -loglevel error -loop 1 -framerate 210 -t 3.5 -i m_week.png -vf \
"crop=w=2160:h=3840:x=0:y='1400*t/3.5',scale=1080:1920:flags=lanczos,tmix=frames=7,fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast e_vert35.mp4
# 4. the REVEAL for contrast — same travel, 1.5s then settles
cp d_b1.mp4 e_rev.mp4
label Le1.mp4 "LATERAL PAN" "3.5s continuous - pricing"
label Le2.mp4 "LATERAL PAN" "1.5s then settles - pricing"
label Le3.mp4 "VERTICAL PAN" "3.5s continuous - schedule"
label Le4.mp4 "REVEAL" "1.5s then settles - schedule"
: > flE.txt
i=1; for c in e_lat35 e_lat15 e_vert35 e_rev; do
  echo "file 'Le$i.mp4'" >> flE.txt; echo "file '$c.mp4'" >> flE.txt; i=$((i+1)); done
deliver flE.txt pan-variants.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 pan-variants.mp4
