#!/usr/bin/env bash
# hub-smoke-gate.sh — the smoke gate: the ONLY road to a hub swap is a passing
# DB-snapshot boot smoke (amicode#295, D3 of spec-20260905-045114).
#
# Born from the 2026-08-30 incident contract (ops/hub-restart.sh +
# ops/hub-upgrade-smoke.sh): a candidate binary is boot-smoked against a copy
# of the production DB before any swap touches the hub. The smoke harness
# records its verdict next to the staged binary —
#
#   <staged>.smoke.json  {"outcome":"pass","sha256":"<sha of staged>",
#                         "harness":"hub-upgrade-smoke.sh","recorded_at":"<iso>"}
#
# — and this gate is the reader every swap goes through:
#
#   hub-smoke-gate.sh check <staged-binary>
#       exit 0 = a passing, sha-matching smoke record exists
#       exit 1 = refused (the refusal NAMES the missing gate)
#   hub-smoke-gate.sh swap <staged-binary> <live-binary>
#       gate first; on pass, rename-only mv staged → live + sha sidecar
#       refresh. NO process stop: rename(2) over a running executable is
#       legal and atomic, the new image loads at the next restart, and the
#       hub is never left down. On refusal nothing moves.
#
# The gate guards BASE correctness (it lives in the base, not the fleet
# overlay); the swap is rename-only per the 2026-08-30 safety laws.
set -uo pipefail

usage() { echo "usage: hub-smoke-gate.sh check <staged-binary> | swap <staged-binary> <live-binary>"; exit 2; }

MODE="${1:-}"
STAGED="${2:-}"
LIVE="${3:-}"

[ "$MODE" = "check" ] || [ "$MODE" = "swap" ] || usage
[ -n "$STAGED" ] || usage
if [ "$MODE" = "swap" ]; then
  [ -n "$LIVE" ] || usage
  [ -f "$LIVE" ] || { echo "REFUSED: live binary $LIVE does not exist (missing gate: hub-upgrade-smoke)"; exit 1; }
fi
[ -f "$STAGED" ] || { echo "REFUSED: staged binary $STAGED does not exist (missing gate: hub-upgrade-smoke)"; exit 1; }

RECORD="$STAGED.smoke.json"

command -v python3 >/dev/null || { echo "REFUSED: python3 required to read the smoke record (missing gate: hub-upgrade-smoke)"; exit 1; }
command -v sha256sum >/dev/null || { echo "REFUSED: sha256sum required (missing gate: hub-upgrade-smoke)"; exit 1; }

refuse() {
  echo "REFUSED: $1 — the DB-snapshot boot smoke is the only road to a hub swap (missing gate: hub-upgrade-smoke; run ops/hub-upgrade-smoke.sh first)" >&2
  exit 1
}

# The smoke verdict: outcome + sha of the binary the harness actually smoked.
read -r REC_OUTCOME REC_SHA < <(
  python3 - "$RECORD" <<'EOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        record = json.load(f)
    print(record.get("outcome", ""), record.get("sha256", ""))
except Exception:
    print("", "")
EOF
) || true

if [ -z "$REC_OUTCOME" ]; then
  refuse "no smoke record at $RECORD"
fi
if [ "$REC_OUTCOME" != "pass" ]; then
  refuse "smoke record at $RECORD is outcome=$REC_OUTCOME, not pass"
fi

STAGED_SHA="$(sha256sum "$STAGED" | awk '{print $1}')"
if [ "$REC_SHA" != "$STAGED_SHA" ]; then
  refuse "smoke record is stale — its sha256 does not match the staged binary (record=$REC_SHA staged=$STAGED_SHA)"
fi

if [ "$MODE" = "check" ]; then
  echo "OK: smoke gate passed for $STAGED sha=${STAGED_SHA:0:16}… (outcome=$REC_OUTCOME)"
  exit 0
fi

# swap — rename-only, per the 2026-08-30 safety laws: if anything dies
# mid-swap the old binary is either still running or already replaced —
# never half-written, and no process is ever stopped or started here.
mv -f "$STAGED" "$LIVE" || refuse "mv failed; nothing changed"
chmod 0755 "$LIVE" 2>/dev/null || true
sha256sum "$LIVE" | awk '{print $1}' > "$LIVE.sha256"
echo "OK swapped sha=$(cut -c1-16 "$LIVE.sha256")… — restart to load it (rename-only; the running hub was never stopped)"
