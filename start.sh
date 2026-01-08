#!/bin/bash
set -e

if [ -f .env ]; then
    source .env
fi

INSTANCE_COUNT="${1:-${INSTANCE_COUNT:-5}}"
USE_GPU="${2:-${USE_GPU:-false}}"

./generate-compose.sh "$INSTANCE_COUNT" "$USE_GPU"

echo ""
echo "Building and starting $INSTANCE_COUNT Chromium instances..."
echo ""

docker compose up --build -d

sleep 3
HOST_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=== Chromium CDP Test Environment ==="
echo ""
printf "%-12s %-28s %s\n" "Instance" "CDP Endpoint" "VNC Endpoint"
printf "%-12s %-28s %s\n" "--------" "------------" "------------"
for i in $(seq 1 "$INSTANCE_COUNT"); do
    CDP_PORT=$((9221 + i))
    VNC_PORT=$((5899 + i))
    printf "%-12s %-28s %s\n" "chromium-${i}" "ws://${HOST_IP}:${CDP_PORT}" "vnc://${HOST_IP}:${VNC_PORT}"
done
echo ""
echo "Allowed IPs: localhost, 10.10.1.2-10.10.1.9"
echo ""
echo "Logs: docker compose logs -f"
