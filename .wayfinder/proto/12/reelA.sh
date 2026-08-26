# Reel A — move-duration ladder. samples = ceil(peak per-frame px displacement), cap 32.
. ./lib.sh
t0=$(date +%s)
push 0.6 32 a_push06.mp4 ; push 1.0 18 a_push10.mp4 ; push 1.5 12 a_push15.mp4 ; push 2.0 9 a_push20.mp4
pan  0.5 32 a_pan05.mp4  ; pan  0.8 32 a_pan08.mp4  ; pan  1.2 32 a_pan12.mp4
label La1.mp4 "PUSH 0.6s" "current spec - 32 samples"
label La2.mp4 "PUSH 1.0s" "18 samples"
label La3.mp4 "PUSH 1.5s" "12 samples"
label La4.mp4 "PUSH 2.0s" "9 samples"
label La5.mp4 "WHIP 0.5s" "current spec - 32 samples"
label La6.mp4 "WHIP 0.8s" "32 samples"
label La7.mp4 "WHIP 1.2s" "32 samples"
: > flA.txt
i=1; for c in a_push06 a_push10 a_push15 a_push20 a_pan05 a_pan08 a_pan12; do
  echo "file 'La$i.mp4'" >> flA.txt; echo "file '$c.mp4'" >> flA.txt; i=$((i+1)); done
deliver flA.txt pacing-moves.mp4
echo "reelA: $(( $(date +%s)-t0 ))s"
