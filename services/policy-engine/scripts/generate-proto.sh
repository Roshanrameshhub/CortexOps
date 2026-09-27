#!/bin/bash

# Script to generate Go code from Protocol Buffer definitions

set -e

echo "Generating gRPC code from proto files..."

# Check if protoc is installed
if ! command -v protoc &> /dev/null; then
    echo "Error: protoc is not installed. Please install Protocol Buffers compiler."
    echo "Visit: https://grpc.io/docs/protoc-installation/"
    exit 1
fi

# Check if Go plugins are installed
if ! command -v protoc-gen-go &> /dev/null; then
    echo "Installing protoc-gen-go..."
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
fi

if ! command -v protoc-gen-go-grpc &> /dev/null; then
    echo "Installing protoc-gen-go-grpc..."
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
fi

# Create output directory
mkdir -p api/proto/v1

# Generate Go code
protoc --go_out=api/proto/v1 --go_opt=paths=source_relative \
       --go-grpc_out=api/proto/v1 --go-grpc_opt=paths=source_relative \
       api/proto/policy_engine.proto

echo "✅ Proto generation complete!"
echo "Generated files:"
ls -lh api/proto/v1/
