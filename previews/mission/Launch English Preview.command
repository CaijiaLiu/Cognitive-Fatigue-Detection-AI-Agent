#!/bin/zsh
set -eu
unsetopt BG_NICE
task_dir="${0:A:h}"
cd "$task_dir"
if [[ -x /usr/local/bin/node ]]; then
  task_node=/usr/local/bin/node
elif [[ -x /opt/homebrew/bin/node ]]; then
  task_node=/opt/homebrew/bin/node
else
  task_node="$(command -v node || true)"
fi
if [[ -z "$task_node" ]]; then
  print 'Node.js is required to run this local preview.'
  read -r '?Press Return to close.'
  exit 1
fi
print 'Focus Lab — Live Camera Mission Preview v0.3'
print 'This is the new multi-screen preview, not the original website.'
print 'Keep this window open. Close it to stop this preview.'
PORT=4177 "$task_node" scripts/serve.mjs &
task_pid=$!
trap 'kill "$task_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
if ! kill -0 "$task_pid" 2>/dev/null; then
  print 'The preview did not start. Port 4177 may already be in use.'
  print 'No existing server was stopped. Close any previous English preview window and retry.'
  read -r '?Press Return to close.'
  exit 1
fi
# Do not open a stale page if the requested server failed to start.
/usr/bin/open 'http://127.0.0.1:4177/?ui=mission-en-v0.3-live-eyes'
wait "$task_pid"
