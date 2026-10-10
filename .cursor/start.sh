#!/usr/bin/env bash
# Start the monorepo API + web. Verification waits on API :3002 and the Vite proxy.
set -u

resolve_app_root() {
  if [ -f /workspace/package.json ]; then
    printf '%s\n' /workspace
    return 0
  fi
  if [ -f /tmp/gestao-app/package.json ]; then
    printf '%s\n' /tmp/gestao-app
    return 0
  fi
  git -C /workspace fetch origin cursor/scaffold-dev-environment-96c3
  if git -C /workspace worktree add /tmp/gestao-app origin/cursor/scaffold-dev-environment-96c3; then
    printf '%s\n' /tmp/gestao-app
    return 0
  fi
  echo "[start] Could not locate application package.json" >&2
  return 1
}

api_ok() {
  curl -sf --max-time 2 http://127.0.0.1:3002/api/health >/dev/null
}

web_ok() {
  curl -sf --max-time 2 http://127.0.0.1:5173/api/health >/dev/null
}

APP_ROOT="$(resolve_app_root)" || exit 1
cd "$APP_ROOT"

if [ ! -d node_modules ]; then
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

export PORT=3002
export VITE_API_TARGET=http://127.0.0.1:3002

# The Cloud environment also starts dev:server and dev:web in terminals.
# Wait for that single pair before launching, so this script does not bind a second API or Vite.
i=0
while [ "$i" -lt 20 ]; do
  if api_ok && web_ok; then
    echo "[start] API :3002 and web proxy :5173 already healthy (root=$APP_ROOT)"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

if ! node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.dev ? 0 : 1)"; then
  echo "[start] No npm dev script in $APP_ROOT" >&2
  exit 1
fi

port_open() {
  node -e 'const net=require("net"); const port=Number(process.argv[1]); const socket=net.connect(port,"127.0.0.1",()=>{socket.end(); process.exit(0)}); socket.on("error",()=>process.exit(1));' "$1"
}

if port_open 3002 || port_open 5173; then
  echo "[start] Port 3002 or 5173 is busy but /api/health is not ready. Not starting another server." >&2
  exit 1
fi

nohup npm run dev >/tmp/gestao-dev.log 2>&1 &
echo $! >/tmp/gestao-dev.pid
echo "[start] launched npm run dev pid=$(cat /tmp/gestao-dev.pid) PORT=3002 root=$APP_ROOT"

ready=0
i=0
while [ "$i" -lt 60 ]; do
  if api_ok && web_ok; then
    echo "[start] API :3002 and web :5173/api/health are ready"
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" != 1 ]; then
  echo "[start] Timed out waiting for http://127.0.0.1:3002/api/health and http://127.0.0.1:5173/api/health" >&2
  echo "[start] --- /tmp/gestao-dev.log ---" >&2
  tail -n 80 /tmp/gestao-dev.log >&2 || true
  exit 1
fi
