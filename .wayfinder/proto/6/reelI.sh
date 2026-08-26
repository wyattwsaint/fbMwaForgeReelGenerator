# Reel I (#6 follow-on) — pan direction, equal path length (1084 master px / 3.5s), equal blur (7 samples).
set -e
F=f.ttf
mk(){ # $1 name  $2 x-expr  $3 y-expr  $4 label
ffmpeg -y -loglevel error -loop 1 -framerate 210 -t 3.5 -i v_services.png -vf \
"crop=w=2160:h=3840:x='$2':y='$3',scale=1080:1920:flags=lanczos,tmix=frames=7,fps=30,\
drawbox=y=1700:w=iw:h=110:color=black@0.65:t=fill,\
drawtext=fontfile=$F:text='$4':fontcolor=white:fontsize=52:x=40:y=1725,format=yuv444p" \
-frames:v 105 -r 30 -c:v libx264 -qp 0 -preset veryfast i_$1.mp4; }

mk vert "1080"           "1084*t/3.5"        "VERTICAL (current deck)"
mk lat  "1084*t/3.5"     "542"               "LATERAL"
mk diag "766*t/3.5"      "766*t/3.5"         "DIAGONAL"
mk latr "1084-1084*t/3.5" "542"              "LATERAL, reversed"

printf "file 'i_vert.mp4'\nfile 'i_lat.mp4'\nfile 'i_diag.mp4'\nfile 'i_latr.mp4'\n" > flI.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i flI.txt -f lavfi -i anullsrc=cl=stereo:r=48000 \
 -map 0:v -map 1:a -c:v libx264 -preset slow -b:v 3000k -maxrate 3000k -bufsize 6000k \
 -profile:v high -level 4.1 -r 30 -pix_fmt yuv420p -movflags +faststart -shortest -c:a aac -b:a 128k pan-directions.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 pan-directions.mp4
