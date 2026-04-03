#!/bin/sh
set -eu
docker build -t bounce-build .
exec docker run --ipc host --rm -e CI=true -e BOUNCE_NULL_AUDIO=1 bounce-build sh -c \
      'xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24" npx playwright test'
