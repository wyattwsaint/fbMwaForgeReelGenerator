# Reel D — revised deck, one site section per beat. Masters from capsections.mjs.
set -e
F=f.ttf; HOOK="PHAROS ACADEMY"; DOMAIN="pharosacademy.net"

# hook 3.0s — #hero. At rest 0.5s (frame 0 = thumbnail), then drift.
ffmpeg -y -loglevel error -loop 1 -i m_hero.png -vf \
"zoompan=z='1+0.06*max(0,on-15)/74':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=90:s=1080x1920:fps=30,\
drawbox=y=ih-460:w=iw:h=260:color=black@0.55:t=fill,\
drawtext=fontfile=$F:text='$HOOK':fontcolor=white:fontsize=92:x=(w-text_w)/2:y=h-390,format=yuv444p" \
-frames:v 90 -r 30 -c:v libx264 -qp 0 -preset veryfast d_hook.mp4

# beat 1 — REVEAL down #week (the schedule). 1.5s travel + 2.0s settle, 32 samples.
ffmpeg -y -loglevel error -loop 1 -framerate 960 -t 1.5 -i m_week.png -vf \
"crop=w=2160:h=3840:x=0:y='1400*if(lt(t/1.5,0.5), 16*pow(t/1.5,5), 1-pow(-2*(t/1.5)+2,5)/2)',\
scale=1080:1920:flags=lanczos,tmix=frames=32,fps=30,tpad=stop_mode=clone:stop_duration=2.0,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast d_b1.mp4

# beat 2 — DRIFT over #faith (the quote). 1 sample, no blur.
ffmpeg -y -loglevel error -loop 1 -i m_faith.png -vf \
"zoompan=z='1+0.06*on/104':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=105:s=1080x1920:fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast d_b2.mp4

# beat 3 — HOLD on #costs (pricing). Dense text, so config pins it to a hold.
ffmpeg -y -loglevel error -loop 1 -i m_costs.png -vf \
"scale=1080:1920:flags=lanczos,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast d_b3.mp4

# cta 2.5s — placeholder card
ffmpeg -y -loglevel error -f lavfi -i color=c=0x1b2a41:s=1080x1920:r=30 -vf \
"drawtext=fontfile=$F:text='$DOMAIN':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h/2-60,\
drawtext=fontfile=$F:text='placeholder CTA card':fontcolor=0x8fb3d9:fontsize=40:x=(w-text_w)/2:y=h/2+90,format=yuv444p" \
-frames:v 75 -r 30 -c:v libx264 -qp 0 -preset veryfast d_cta.mp4

printf "file 'd_hook.mp4'\nfile 'd_b1.mp4'\nfile 'd_b2.mp4'\nfile 'd_b3.mp4'\n" > flD.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i flD.txt -c copy d_body.mp4
ffmpeg -y -loglevel error -i d_body.mp4 -i d_cta.mp4 -f lavfi -i anullsrc=cl=stereo:r=48000 \
 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.3:offset=13.2,format=yuv420p[v]" \
 -map "[v]" -map 2:a -c:v libx264 -preset slow -b:v 3000k -maxrate 3000k -bufsize 6000k \
 -profile:v high -level 4.1 -x264-params keyint=60:min-keyint=30:scenecut=0 -r 30 -movflags +faststart -shortest \
 -c:a aac -b:a 128k revised-deck-sections.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 revised-deck-sections.mp4
