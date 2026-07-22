#!/usr/bin/env bash
# Live test for the #194 Pasqal keychain silent-re-auth workaround.
# Collects your Pasqal credentials WITHOUT echoing the password, then runs the
# real server code against live Pasqal + the real macOS keychain (isolated to a
# temp token file and a "live-test" keychain slot — your real ~/.amico state is
# never touched). Nothing is written to shell history or any argv.
set -euo pipefail
cd "$(dirname "$0")"

DEFAULT_PROJECT="8b948e29-93cb-4042-b5dc-6916f379d575" # Harmoniqs Tests (Jack's notes)

read -r -p "Pasqal username (email): " PASQAL_LIVE_USER
read -r -s -p "Pasqal password (hidden): " PASQAL_LIVE_PW; echo
read -r -p "Project ID [${DEFAULT_PROJECT}]: " PASQAL_LIVE_PROJECT
PASQAL_LIVE_PROJECT="${PASQAL_LIVE_PROJECT:-$DEFAULT_PROJECT}"
export PASQAL_LIVE_USER PASQAL_LIVE_PW PASQAL_LIVE_PROJECT

PATH="$HOME/.bun/bin:$PATH" bun ./pasqal-live-test.mjs
