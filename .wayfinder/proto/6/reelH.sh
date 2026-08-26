# Reel H (#6) — brobstcleaning.com, the plain site, cut from V4 masters. Continuous deck per #12.
set -e
F=f.ttf; HOOK="HARRISBURG CLEANING"; DOMAIN="brobstcleaning.com"; NAVY=0x253856; CREAM=0xF6F0E3

# hook 3.0s — drift, hook text drawn on frame 0
ffmpeg -y -loglevel error -loop 1 -i b_hook.png -vf \
"zoompan=z='1+0.06*on/89':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=90:s=1080x1920:fps=30,\
drawbox=y=ih-460:w=iw:h=250:color=black@0.5:t=fill,\
drawtext=fontfile=$F:text='$HOOK':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=h-390,format=yuv444p" \
-frames:v 90 -r 30 -c:v libx264 -qp 0 -preset veryfast h_hook.mp4

# beat 1 — PAN down #services, 7 samples
ffmpeg -y -loglevel error -loop 1 -framerate 210 -t 3.5 -i b_services.png -vf \
"crop=w=2160:h=3840:x=0:y='1084*t/3.5',scale=1080:1920:flags=lanczos,tmix=frames=7,fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast h_b1.mp4

# beat 2 — DRIFT over #about, no blur
ffmpeg -y -loglevel error -loop 1 -i b_about.png -vf \
"zoompan=z='1+0.06*on/104':x='clip(iw/2-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(ih/2-(ih/zoom)/2,0,ih-ih/zoom)':d=105:s=1080x1920:fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast h_b2.mp4

# beat 3 — PAN down #reviews, 7 samples
ffmpeg -y -loglevel error -loop 1 -framerate 210 -t 3.5 -i b_reviews.png -vf \
"crop=w=1600:h=2844:x=0:y='976*t/3.5',scale=1080:1920:flags=lanczos,tmix=frames=7,fps=30,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast h_b3.mp4

# cta 2.5s — card in the site's own used colours (scraped from usage, not from tokens)
ffmpeg -y -loglevel error -f lavfi -i color=c=$NAVY:s=1080x1920:r=30 -vf \
"drawtext=fontfile=$F:text='$DOMAIN':fontcolor=$CREAM:fontsize=84:x=(w-text_w)/2:y=h/2-50,\
drawtext=fontfile=$F:text='placeholder CTA card':fontcolor=0x8fa4c4:fontsize=36:x=(w-text_w)/2:y=h/2+90,format=yuv444p" \
-frames:v 75 -r 30 -c:v libx264 -qp 0 -preset veryfast h_cta.mp4

printf "file 'h_hook.mp4'\nfile 'h_b1.mp4'\nfile 'h_b2.mp4'\nfile 'h_b3.mp4'\n" > flH.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i flH.txt -c copy h_body.mp4
ffmpeg -y -loglevel error -i h_body.mp4 -i h_cta.mp4 -f lavfi -i anullsrc=cl=stereo:r=48000 \
 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.3:offset=13.2,format=yuv420p[v]" \
 -map "[v]" -map 2:a -c:v libx264 -preset slow -b:v 3000k -maxrate 3000k -bufsize 6000k \
 -profile:v high -level 4.1 -x264-params keyint=60:min-keyint=30:scenecut=0 -r 30 -movflags +faststart -shortest \
 -c:a aac -b:a 128k brobst-v4.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 brobst-v4.mp4
