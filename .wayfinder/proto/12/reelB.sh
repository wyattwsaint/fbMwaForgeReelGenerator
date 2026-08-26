# Reel B — shots per beat. Content held constant; only the cut rate varies.
. ./lib.sh
t0=$(date +%s)
HOLD=0 push 0.6 32 b1_a.mp4 ; HOLD=0 pull 0.6 32 b1_b.mp4 ; drift 2.3 b1_c.mp4          # 3 shots / 3.5s (spec)
HOLD=0 push 1.2 15 b2_a.mp4 ; drift 2.3 b2_c.mp4                                        # 2 shots / 3.5s
drift 3.5 b3_a.mp4                                                                      # 1 shot  / 3.5s
HOLD=0 push 1.5 12 b4_a.mp4 ; drift 3.0 b4_c.mp4                                        # 2 shots / 4.5s
label Lb1.mp4 "3 SHOTS" "3.5s beat - current spec"
label Lb2.mp4 "2 SHOTS" "3.5s beat"
label Lb3.mp4 "1 SHOT"  "3.5s beat"
label Lb4.mp4 "2 SHOTS" "4.5s beat"
: > flB.txt
{ echo "file 'Lb1.mp4'"; for f in b1_a b1_b b1_c; do echo "file '$f.mp4'"; done
  echo "file 'Lb2.mp4'"; for f in b2_a b2_c; do echo "file '$f.mp4'"; done
  echo "file 'Lb3.mp4'"; echo "file 'b3_a.mp4'"
  echo "file 'Lb4.mp4'"; for f in b4_a b4_c; do echo "file '$f.mp4'"; done; } > flB.txt
deliver flB.txt pacing-beats.mp4
echo "reelB: $(( $(date +%s)-t0 ))s"
