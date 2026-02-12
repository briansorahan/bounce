#!/bin/bash
set -e

echo "Building C++ dependencies..."

# Build and install foonathan/memory library to local prefix
cd third_party/memory
rm -rf build install
mkdir -p build
cd build

cmake .. -DCMAKE_INSTALL_PREFIX=../install \
         -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0 \
         -DFOONATHAN_MEMORY_BUILD_EXAMPLES=OFF \
         -DFOONATHAN_MEMORY_BUILD_TESTS=OFF \
         -DFOONATHAN_MEMORY_BUILD_TOOLS=OFF

make -j4
make install

cd ../../..

echo "Dependencies built and installed successfully"
