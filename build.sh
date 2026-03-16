#!/bin/sh
exec docker run --ipc host --entrypoint sh --rm -v $(pwd):/build -w /build node:24-trixie-slim -c ' \
    apt-get update && \
    apt-get install -y -qq build-essential cmake libblas-dev liblapack-dev xvfb xauth \
                           python3 python-is-python3 libgtk-3-0t64 libgbm1 libasound2t64 && \
    npm ci --ignore-scripts && \
    node node_modules/electron/install.js && \
    npm run rebuild && \
    npm run build && \
    npm test && \
    rm -rf dist && \
    npm run build:electron && \
    npx playwright install --with-deps chromium && \
    xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24" npx playwright test'
