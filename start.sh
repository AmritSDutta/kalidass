#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start Cloudflare Worker API (Upstash Blob)
cd "$ROOT/worker"
npm run start &
WORKER_PID=$!

# Start Docusaurus static site (preview port)
cd "$ROOT/frontend"
npm run start

trap 'kill $WORKER_PID' EXIT
