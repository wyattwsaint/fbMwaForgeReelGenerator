# Reel G — no holds anywhere. Every shot moves continuously for its whole beat.
# Deck: drift (zoom) + pan (vertical translate). Both full-beat, neither lands.
set -e
F=f.ttf; HOOK="PHAROS ACADEMY"; DOMAIN="pharosacademy.net"

# hook 3.0s — #hero, drift from frame 0 (no rest; frame 0 still has the text fully drawn)
ffmpeg -y -loglevel error -loop 1 -i m_hero.png -vf \
"zoompan=z='1+0.06*on/89':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=90:s=1080x1920:fps=30,\
drawbox=y=ih-460:w=iw:h=260:color=black@0.55:t=fill,\
drawtext=fontfile=$F:text='$HOOK':fontcolor=white:fontsize=92:x=(w-text_w)/2:y=h-390,format=yuv444p" \
-frames:v 90 -r 30 -c:v libx264 -qp 0 -preset veryfast g_hook.mp4

# beat 1 — PAN down #week (schedule), continuous, linear, 7 samples
ffmpeg -y -loglevel error -loop 1 -framerate 210 -t 3.5 -i m_week.png -vf \
"crop=w=2160:h=3840:x=0:y='1400*t/3.5',scale=1080:1920:flags=lanczos,tmix=frames=7,fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast g_b1.mp4

# beat 2 — DRIFT over #faith (quote), continuous, 1 sample
ffmpeg -y -loglevel error -loop 1 -i m_faith.png -vf \
"zoompan=z='1+0.06*on/104':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=105:s=1080x1920:fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast g_b2.mp4

# beat 3 — PAN down #costs (pricing), punched 1.33x for travel, continuous, 7 samples
ffmpeg -y -loglevel error -loop 1 -framerate 210 -t 3.5 -i m_costs.png -vf \
"crop=w=1822:h=3240:x=304:y='1080*t/3.5',scale=1080:1920:flags=lanczos,tmix=frames=7,fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast g_b3.mp4

# cta 2.5s — placeholder card
ffmpeg -y -loglevel error -f lavfi -i color=c=0x1b2a41:s=1080x1920:r=30 -vf \
"drawtext=fontfile=$F:text='$DOMAIN':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=h/2-60,\
drawtext=fontfile=$F:text='placeholder CTA card':fontcolor=0x8fb3d9:fontsize=40:x=(w-text_w)/2:y=h/2+90,format=yuv444p" \
-frames:v 75 -r 30 -c:v libx264 -qp 0 -preset veryfast g_cta.mp4

printf "file 'g_hook.mp4'\nfile 'g_b1.mp4'\nfile 'g_b2.mp4'\nfile 'g_b3.mp4'\n" > flG.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i flG.txt -c copy g_body.mp4
ffmpeg -y -loglevel error -i g_body.mp4 -i g_cta.mp4 -f lavfi -i anullsrc=cl=stereo:r=48000 \
 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.3:offset=13.2,format=yuv420p[v]" \
 -map "[v]" -map 2:a -c:v libx264 -preset slow -b:v 3000k -maxrate 3000k -bufsize 6000k \
 -profile:v high -level 4.1 -x264-params keyint=60:min-keyint=30:scenecut=0 -r 30 -movflags +faststart -shortest \
 -c:a aac -b:a 128k continuous-deck.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 continuous-deck.mp4
