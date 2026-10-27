#!/bin/sh
set -eu
attempt=0
until xdpyinfo >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 100 ] || exit 1
  sleep 0.1
done
case "$1" in
  wm) exec openbox ;;
  browser)
    exec chromium --no-sandbox --disable-dev-shm-usage --no-first-run \
      --no-default-browser-check --disable-session-crashed-bubble \
      --disable-features=Translate --password-store=basic --lang=de-DE \
      --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
      --user-data-dir=/tmp/chromium --force-device-scale-factor=1 \
      --window-size=1280,800 --window-position=0,0 --kiosk "$PRAXIS_URL" ;;
  vnc) exec x11vnc -display :99 -localhost -nopw -forever -shared -rfbport 5900 ;;
esac
