# PROTOTYPE (wayfinder #12) — throwaway pacing harness. Reuses #11's masters.
set -e
HOLD=${HOLD:-0.5}
HF () { python -c "print(round(30*$1))"; }

# push  $1=T $2=samples $3=out   zoom 1 -> 1.32, ease-out cubic, focal on wordmark
push () { T=$1; S=$2; O=$3; FPS=$((30*S)); N=$(python -c "print(round($FPS*$T))"); NO=$(python -c "print(round(30*$T)+round(30*$HOLD))")
ffmpeg -y -loglevel error -loop 1 -i hero135.png -vf \
"zoompan=z='1+0.32*(1-pow(1-on/($N-1),3))':x='clip(1053-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(1525-(ih/zoom)/2,0,ih-ih/zoom)':d=$N:s=1080x1920:fps=$FPS,tmix=frames=$S,fps=30,tpad=stop_mode=clone:stop_duration=$HOLD,format=yuv444p" \
-frames:v $NO -r 30 -c:v libx264 -qp 0 -preset veryfast "$O"; }

# pull  $1=T $2=samples $3=out   zoom 1.32 -> 1.00
pull () { T=$1; S=$2; O=$3; FPS=$((30*S)); N=$(python -c "print(round($FPS*$T))"); NO=$(python -c "print(round(30*$T)+round(30*$HOLD))")
ffmpeg -y -loglevel error -loop 1 -i hero135.png -vf \
"zoompan=z='1.32-0.32*(1-pow(1-on/($N-1),3))':x='clip(1053-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(1525-(ih/zoom)/2,0,ih-ih/zoom)':d=$N:s=1080x1920:fps=$FPS,tmix=frames=$S,fps=30,tpad=stop_mode=clone:stop_duration=$HOLD,format=yuv444p" \
-frames:v $NO -r 30 -c:v libx264 -qp 0 -preset veryfast "$O"; }

# drift $1=T $2=out   slow push 1 -> 1.06 linear, 1 sample
drift () { T=$1; O=$2; N=$(python -c "print(round(30*$T))")
ffmpeg -y -loglevel error -loop 1 -i hero135.png -vf \
"zoompan=z='1+0.06*on/($N-1)':x='clip(1053-(iw/zoom)/2,0,iw-iw/zoom)':y='clip(1525-(ih/zoom)/2,0,ih-ih/zoom)':d=$N:s=1080x1920:fps=30,format=yuv444p" \
-frames:v $N -r 30 -c:v libx264 -qp 0 -preset veryfast "$O"; }

# pan   $1=T $2=samples $3=out   vertical whip, ease-in-out quint, 4060 master px
pan () { T=$1; S=$2; O=$3; FPS=$((30*S)); NO=$(python -c "print(round(30*$T)+round(30*$HOLD))")
ffmpeg -y -loglevel error -loop 1 -framerate $FPS -t $T -i master2.png -vf \
"crop=w=1350:h=2400:x=405:y='4060*if(lt(t/$T,0.5), 16*pow(t/$T,5), 1-pow(-2*(t/$T)+2,5)/2)',scale=1080:1920:flags=lanczos,tmix=frames=$S,fps=30,tpad=stop_mode=clone:stop_duration=$HOLD,format=yuv444p" \
-frames:v $NO -r 30 -c:v libx264 -qp 0 -preset veryfast "$O"; }

# label $1=out $2=big $3=small
label () { ffmpeg -y -loglevel error -f lavfi -i color=c=0x101418:s=1080x1920:r=30 -vf \
"drawtext=fontfile=f.ttf:text='$2':fontcolor=white:fontsize=104:x=(w-text_w)/2:y=h/2-150,drawtext=fontfile=f.ttf:text='$3':fontcolor=0x8fb3d9:fontsize=50:x=(w-text_w)/2:y=h/2+20" \
-frames:v 24 -r 30 -c:v libx264 -qp 0 -preset veryfast -pix_fmt yuv444p "$1"; }

# deliver $1=listfile $2=out.mp4
deliver () { ffmpeg -y -loglevel error -f concat -safe 0 -i "$1" -c copy _ll_$2
ffmpeg -y -loglevel error -i _ll_$2 -f lavfi -i anullsrc=cl=stereo:r=48000 -map 0:v -map 1:a \
 -vf format=yuv420p -c:v libx264 -preset slow -b:v 3000k -maxrate 3000k -bufsize 6000k \
 -profile:v high -level 4.1 -x264-params keyint=60:min-keyint=30:scenecut=0 -r 30 -movflags +faststart -shortest \
 -c:a aac -b:a 128k "$2"; }
