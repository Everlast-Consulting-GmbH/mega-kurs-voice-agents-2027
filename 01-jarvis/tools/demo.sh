#!/usr/bin/env bash
# One-command demo runner for a single laptop (no compose plugin needed).
#
#   make demo         start everything, reset data, open the HUD fullscreen in Chrome
#   make demo-stop    stop everything
#   make demo-reset   reset test data between rehearsals
#   make demo-status  show what is running
#
# Logs and PIDs live in .demo/ (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/.demo"
LOGS="$STATE/logs"
HUD_URL="http://localhost:3000"
CU_IMAGE="jarvis-cu-worker:local"
CU_NAME="jarvis-cu-worker"
mkdir -p "$LOGS"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

wait_for() { # url name [seconds]
  local url=$1 name=$2 secs=${3:-60}
  for _ in $(seq 1 "$secs"); do
    curl -sf -o /dev/null "$url" && { ok "$name läuft"; return 0; }
    sleep 1
  done
  fail "$name antwortet nicht ($url). Log: $LOGS"
}

start_bg() { # name command...
  local name=$1; shift
  if [[ -f "$STATE/$name.pid" ]] && kill -0 "$(cat "$STATE/$name.pid")" 2>/dev/null; then
    ok "$name läuft schon"; return 0
  fi
  # exec: the service replaces the subshell, so no helper shell keeps our stdout open
  # and the PID file points at the real process.
  (cd "$ROOT" && exec nohup "$@" >"$LOGS/$name.log" 2>&1 </dev/null) &
  echo $! >"$STATE/$name.pid"
}

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

preflight() {
  command -v docker >/dev/null || fail "Docker fehlt. Docker Desktop installieren."
  docker info >/dev/null 2>&1 || fail "Docker läuft nicht. Docker Desktop starten."
  command -v uv >/dev/null || fail "uv fehlt (brew install uv)."
  command -v pnpm >/dev/null || fail "pnpm fehlt (brew install pnpm)."
  [[ -f "$ROOT/.env" ]] || fail ".env fehlt. Kopiere .env.example nach .env und trage deine Keys ein."
  grep -q '^ELEVENLABS_API_KEY=.\+' "$ROOT/.env" || fail "ELEVENLABS_API_KEY fehlt in .env."
  grep -q '^ELEVENLABS_AGENT_ID=.\+' "$ROOT/.env" || fail "ELEVENLABS_AGENT_ID fehlt in .env."
  grep -qE '^(REQUESTY|ANTHROPIC)_API_KEY=.+' "$ROOT/.env" || say "Weder REQUESTY_API_KEY noch ANTHROPIC_API_KEY gesetzt: delegierte Aufgaben schlagen fehl."
  # A busy port is fine only if it belongs to our own previous start.
  for pair in 3000:hud 8700:world 8787:orchestrator; do
    port=${pair%%:*}; name=${pair#*:}
    if port_busy "$port" && [[ ! -f "$STATE/$name.pid" ]]; then
      fail "Port $port ist von einem fremden Prozess belegt. Erst beenden, dann neu starten."
    fi
  done
  ok "Voraussetzungen erfüllt"
}

start() {
  preflight
  say "Installiere Abhängigkeiten (schnell, wenn schon vorhanden)"
  (cd "$ROOT" && pnpm install --silent >/dev/null && uv sync --all-packages --all-extras -q)

  say "Starte Testwelt"
  start_bg world uv run --package jarvis-mock-world uvicorn jarvis_mock_world.app:app --host 127.0.0.1 --port 8700
  wait_for http://localhost:8700/health "Testwelt"

  say "Starte Orchestrator"
  start_bg orchestrator uv run --package jarvis-orchestrator jarvis-orchestrator
  wait_for http://localhost:8787/health "Orchestrator"

  say "Starte Computer-Use-Container (erster Build dauert einige Minuten)"
  docker build -q -f "$ROOT/services/cu-worker/Dockerfile" -t "$CU_IMAGE" "$ROOT" >"$LOGS/cu-build.log"
  if ! docker ps --format '{{.Names}}' | grep -qx "$CU_NAME"; then
    docker rm -f "$CU_NAME" >/dev/null 2>&1 || true
    docker run -d --rm --name "$CU_NAME" --shm-size=512m \
      -p 127.0.0.1:8800:8800 -p 127.0.0.1:6080:6080 \
      --add-host host.docker.internal:host-gateway --env-file "$ROOT/.env" \
      -e PRAXIS_URL=http://host.docker.internal:8700/praxis \
      -e ORCHESTRATOR_URL=http://host.docker.internal:8787 \
      "$CU_IMAGE" >/dev/null
  fi
  wait_for http://localhost:8800/health "Computer Use" 90

  say "Baue und starte das Dashboard (Produktionsmodus, flüssiger als dev)"
  if [[ ! -f "$STATE/hud.pid" ]] || ! kill -0 "$(cat "$STATE/hud.pid")" 2>/dev/null; then
    (cd "$ROOT" && pnpm --filter hud build >"$LOGS/hud-build.log" 2>&1) || fail "Dashboard-Build fehlgeschlagen. Log: $LOGS/hud-build.log"
  fi
  start_bg hud pnpm --filter hud start
  wait_for "$HUD_URL" "Dashboard"

  reset
  warmup

  say "Öffne das Dashboard im Vollbild"
  open -na "Google Chrome" --args --app="$HUD_URL" --start-fullscreen --autoplay-policy=no-user-gesture-required >/dev/null 2>&1 \
    || say "Chrome nicht gefunden. Bitte $HUD_URL im Browser öffnen."
  ok "Demo bereit. Auf „Anrufen“ klicken und loslegen. Stoppen: make demo-stop"
}

reset() {
  curl -sf -X POST http://localhost:8700/admin/reset >/dev/null && ok "Testdaten zurückgesetzt" || fail "Reset fehlgeschlagen"
}

warmup() {
  # First requests compile routes and fill caches; do them now, not on stage.
  curl -sf --max-time 15 -o /dev/null "$HUD_URL/api/elevenlabs/session" && ok "Sprachverbindung vorgewärmt" \
    || say "ElevenLabs-Session konnte nicht vorgewärmt werden. Key und Agent-ID prüfen."
  curl -sf --max-time 10 -o /dev/null http://localhost:8787/tools && ok "Werkzeuge vorgewärmt"
}

kill_tree() { # pid: stop a process and all its descendants (pnpm/uv spawn children)
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

stop() {
  for name in hud orchestrator world; do
    if [[ -f "$STATE/$name.pid" ]]; then
      pid=$(cat "$STATE/$name.pid")
      kill_tree "$pid"
      rm -f "$STATE/$name.pid"
      ok "$name gestoppt"
    fi
  done
  docker stop "$CU_NAME" >/dev/null 2>&1 && ok "Computer Use gestoppt" || true
}

status() {
  for pair in "Dashboard:$HUD_URL" "Testwelt:http://localhost:8700/health" \
              "Orchestrator:http://localhost:8787/health" "Computer Use:http://localhost:8800/health"; do
    name=${pair%%:*}; url=${pair#*:}
    if curl -sf -o /dev/null --max-time 3 "$url"; then ok "$name"; else printf '\033[1;31m✗\033[0m %s\n' "$name"; fi
  done
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  reset) reset ;;
  status) status ;;
  *) fail "Unbekannt: $1 (start|stop|reset|status)" ;;
esac
