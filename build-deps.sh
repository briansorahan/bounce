#!/bin/bash
set -e

echo "Building C++ dependencies..."

# Build foonathan/memory library
cd third_party/memory
mkdir -p build
cd build
cmake .. -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0 \
         -DFOONATHAN_MEMORY_BUILD_EXAMPLES=OFF \
         -DFOONATHAN_MEMORY_BUILD_TESTS=OFF \
         -DFOONATHAN_MEMORY_BUILD_TOOLS=OFF \
         -DCMAKE_INSTALL_PREFIX=../../..
make -j4

# Copy generated config header to include directory
mkdir -p ../include/foonathan/memory/detail
cp src/config_impl.hpp ../include/foonathan/memory/detail/

cd ../../..

echo "Dependencies built successfully"
