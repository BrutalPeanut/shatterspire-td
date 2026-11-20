#!/bin/bash
# Multi-seed balance check: Easy + Medium spender and an Easy 35% hoarder on all 4 maps, 6 bot seeds each.
# Usage: bash test/balance.sh [label]   -> /tmp/balance-<label>.txt plus a summary.
# A single bot run is NOT evidence: small rule changes flip single runs. Compare two labels' summaries instead.
set -e; cd "$(dirname "$0")/.."; L=${1:-run}; OUT=/tmp/balance-$L.txt; : > "$OUT"
one() { # map diff seed hoard
  local out start fl worst
  out=$(BOTSEED=$3 HOARD=$4 npx tsx test/bot.ts $1 $2 2>&1)
  start=$(case $2 in easy) echo 200;; medium) echo 150;; *) echo 100;; esac)
  fl=$(echo "$out" | tail -1 | grep -oE "lives [0-9]+" | grep -oE "[0-9]+")
  worst=$( (echo "$out" | grep -oE "^  r[0-9]+ lives [0-9]+ \(-[0-9]+\)" | sed -E 's/.*\(-([0-9]+)\)/\1/'; prev=$(echo "$out" | grep -oE "^  r[0-9]+ lives [0-9]+" | tail -2 | head -1 | grep -oE "[0-9]+$"); echo $(( ${prev:-$start} - fl ))) | sort -rn | head -1)
  echo "$1|$2|$4|$(echo "$out" | tail -1 | grep -oE '(victory|over) at round [0-9]+' | sed 's/ at round / /')|$fl|$worst"
}
export -f one
for m in meadow caverns ember summit; do for s in 1 2 3 4 5 6; do echo "$m medium $s 0"; echo "$m easy $s 0"; echo "$m easy $s 0.35"; done; done | xargs -P 4 -n 4 bash -c 'one "$@"' _ >> "$OUT"
python3 - "$OUT" <<'PY'
import sys, collections
d = collections.defaultdict(list)
for l in open(sys.argv[1]):
    m, diff, h, res, lives, worst = l.strip().split('|'); st, rnd = res.split()
    d[(diff, h, m)].append((st == 'victory', int(lives), int(rnd), int(worst)))
for k in sorted(d):
    v = d[k]; print(f"{k[0]:7} hoard {k[1]:4} {k[2]:8} wins {sum(x[0] for x in v)}/{len(v)}  avg lives {sum(x[1] for x in v)/len(v):4.0f}  "
                    f"died at {sorted(x[2] for x in v if not x[0]) or '-'}  one-wave losses >=60: {sum(x[3] >= 60 for x in v)}")
print('TOTAL wins', sum(x[0] for v in d.values() for x in v), '/', sum(len(v) for v in d.values()))
PY
