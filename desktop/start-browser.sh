# Runs INSIDE the user's Maritime desktop. Restarts Chromium with the CDP port on the SAME profile,
# so saved logins survive. No-op when the port is already up.
if curl -s -m 2 localhost:9222/json/version >/dev/null; then echo ready; exit 0; fi
P=$(pgrep -o -f '/usr/lib/chromium/chromium')
if [ -n "$P" ]; then
  ARGS=$(tr '\0' '\n' < /proc/$P/cmdline | tail -n +2 | grep -v -- '--remote-debugging' | grep -v '^https\?:' | tr '\n' ' ')
  eval $(tr '\0' '\n' < /proc/$P/environ | grep -E '^(DISPLAY|XAUTHORITY|HOME|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR)=' | sed 's/^/export /')
  pkill -f /usr/lib/chromium/chromium; sleep 2
else
  ARGS="--user-data-dir=/data/desktop/profile --no-first-run --no-default-browser-check"
  export DISPLAY=${DISPLAY:-:0}
fi
nohup /usr/lib/chromium/chromium $ARGS --start-maximized --hide-crash-restore-bubble --remote-debugging-port=9222 --remote-allow-origins=* about:blank >/tmp/chromium.log 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 2 localhost:9222/json/version >/dev/null && { echo ready; exit 0; }; sleep 1; done
echo "browser did not start"; exit 1
