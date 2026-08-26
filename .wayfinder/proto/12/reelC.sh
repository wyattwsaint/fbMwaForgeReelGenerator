# Reel C — the revised deck cut as a real n=3 reel. hook 3.0 + 3x3.5 + cta 2.5 = 16.0s
set -e
M=master2.png; F=f.ttf
HOOK="PHAROS ACADEMY"; DOMAIN="pharosacademy.net"

# hook 3.0s — hero at rest 0.5s (frame 0 = thumbnail, text fully drawn), then drift
ffmpeg -y -loglevel error -loop 1 -i hero135.png -vf \
"zoompan=z='1+0.06*max(0,on-15)/74':x='clip(1053-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(1525-(ih/zoom)/2,0,ih-ih/zoom)':d=90:s=1080x1920:fps=30,\
drawbox=y=ih-460:w=iw:h=260:color=black@0.55:t=fill,\
drawtext=fontfile=$F:text='$HOOK':fontcolor=white:fontsize=92:x=(w-text_w)/2:y=h-390,format=yuv444p" \
-frames:v 90 -r 30 -c:v libx264 -qp 0 -preset veryfast c_hook.mp4

# beat 1 — REVEAL: 1.5s travel (ease-in-out quint) + 2.0s settle. 32 samples.
ffmpeg -y -loglevel error -loop 1 -framerate 960 -t 1.5 -i $M -vf \
"crop=w=2160:h=3840:x=0:y='200+1200*if(lt(t/1.5,0.5), 16*pow(t/1.5,5), 1-pow(-2*(t/1.5)+2,5)/2)',\
scale=1080:1920:flags=lanczos,tmix=frames=32,fps=30,tpad=stop_mode=clone:stop_duration=2.0,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast c_b1.mp4

# beat 2 — DRIFT: slow zoom 1.00 -> 1.06 across the whole 3.5s. 1 sample, no blur.
ffmpeg -y -loglevel error -loop 1 -i $M -vf \
"crop=w=2160:h=3840:x=0:y=1500,zoompan=z='1+0.06*on/104':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=105:s=1080x1920:fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast c_b2.mp4

# beat 3 — HOLD: static. Final beat is always a hold, so the reel stills before the CTA.
ffmpeg -y -loglevel error -loop 1 -i $M -vf \
"crop=w=2160:h=3840:x=0:y=2620,scale=1080:1920:flags=lanczos,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast c_b3.mp4

# cta 2.5s — placeholder card (brand color/logo pending #7 config + brand kit)
ffmpeg -y -loglevel error -f lavfi -i color=c=0x1b2a41:s=1080x1920:r=30 -vf \
"drawtext=fontfile=$F:text='$DOMAIN':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h/2-60,\
drawtext=fontfile=$F:text='placeholder CTA card':fontcolor=0x8fb3d9:fontsize=40:x=(w-text_w)/2:y=h/2+90,format=yuv444p" \
-frames:v 75 -r 30 -c:v libx264 -qp 0 -preset veryfast c_cta.mp4

# hard cuts through the body, 0.3s crossfade solely into the card
printf "file 'c_hook.mp4'\nfile 'c_b1.mp4'\nfile 'c_b2.mp4'\nfile 'c_b3.mp4'\n" > flC.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i flC.txt -c copy c_body.mp4
ffmpeg -y -loglevel error -i c_body.mp4 -i c_cta.mp4 -f lavfi -i anullsrc=cl=stereo:r=48000 \
 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.3:offset=13.2,format=yuv420p[v]" \
 -map "[v]" -map 2:a -c:v libx264 -preset slow -b:v 3000k -maxrate 3000k -bufsize 6000k \
 -profile:v high -level 4.1 -x264-params keyint=60:min-keyint=30:scenecut=0 -r 30 -movflags +faststart -shortest \
 -c:a aac -b:a 128k revised-deck-n3.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 revised-deck-n3.mp4
