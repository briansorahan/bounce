FROM node:24-trixie-slim
RUN apt-get update
RUN apt-get install -y -qq build-essential cmake libblas-dev liblapack-dev xvfb xauth \
                           python3 python-is-python3 libgtk-3-0t64 libgbm1 libasound2t64
WORKDIR /build
COPY binding.gyp \
     eslint.config.mjs \
     package.json \
     package-lock.json \
     playwright.config.ts \
     tsconfig.electron.json \
     tsconfig.json \
     tsconfig.renderer.json \
     /build/

COPY flucoma-core /build/flucoma-core
COPY native /build/native
COPY third_party /build/third_party

COPY src /build/src

RUN npm ci --ignore-scripts \
    && node node_modules/electron/install.js \
    && npm run rebuild \
    && npm run lint \
    && npm run build \
    && rm -rf dist \
    && npm run build:electron \
    && npx playwright install --with-deps chromium

COPY tests /build/tests
RUN npm test
