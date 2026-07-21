#!/bin/sh
set -eu

export BLENDER_WORKER_HOST=127.0.0.1
export BLENDER_WORKER_PORT=5191

npm run serve:caprover &
worker_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

shutdown() {
  kill "$worker_pid" "$nginx_pid" 2>/dev/null || true
  wait "$worker_pid" 2>/dev/null || true
  wait "$nginx_pid" 2>/dev/null || true
}

trap shutdown INT TERM EXIT

while kill -0 "$worker_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done

exit_code=1
if ! kill -0 "$worker_pid" 2>/dev/null; then
  wait "$worker_pid" || exit_code=$?
else
  wait "$nginx_pid" || exit_code=$?
fi

exit "$exit_code"
