#!/bin/bash
set -e

INSTANCE_COUNT="${1:-}"
USE_GPU="${2:-false}"

if [ -z "$INSTANCE_COUNT" ]; then
    echo "Usage: ./scale.sh <instance_count> [gpu]"
    echo ""
    echo "Examples:"
    echo "  ./scale.sh 4          # 4 instances, CPU/SwiftShader"
    echo "  ./scale.sh 6          # 6 instances, CPU/SwiftShader"
    echo "  ./scale.sh 4 gpu      # 4 instances, Intel iGPU"
    echo ""
    echo "Resources: 1GB RAM + 1 CPU per instance (256MB reserved)"
    echo ""
    echo "Current running instances:"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (none)"
    exit 0
fi

if [ "$INSTANCE_COUNT" -lt 2 ]; then
    echo "Minimum 2 instances required"
    exit 1
fi

echo "Scaling to $INSTANCE_COUNT instances..."

docker compose down 2>/dev/null || true

./start.sh "$INSTANCE_COUNT" "$USE_GPU"
