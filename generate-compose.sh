#!/bin/bash
set -e

if [ -f .env ]; then
    source .env
fi

INSTANCE_COUNT="${1:-${INSTANCE_COUNT:-5}}"
USE_GPU="${2:-${USE_GPU:-false}}"
OUTPUT_FILE="docker-compose.yml"

if [ "$INSTANCE_COUNT" -lt 2 ]; then
    echo "Minimum 2 instances required"
    exit 1
fi

if [ "$USE_GPU" = "true" ] || [ "$USE_GPU" = "gpu" ]; then
    USE_GPU="true"
    echo "Intel iGPU mode: VA-API hardware acceleration"
    EXTRA_CONFIG='
    devices:
      - /dev/dri:/dev/dri
    group_add:
      - video
      - render'
else
    USE_GPU="false"
    echo "CPU mode: SwiftShader software rendering"
    EXTRA_CONFIG=""
fi

cat > "$OUTPUT_FILE" << HEADER
x-chromium-base: &chromium-base
  build: .
  cap_add:
    - NET_ADMIN
    - NET_RAW
    - SYS_ADMIN
  shm_size: '512mb'
  restart: unless-stopped
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: '1'

services:
HEADER

for i in $(seq 1 "$INSTANCE_COUNT"); do
    CDP_PORT=$((9221 + i))
    VNC_PORT=$((5899 + i))
    
    cat >> "$OUTPUT_FILE" << EOF
  chromium-${i}:
    <<: *chromium-base
    container_name: chromium-cdp-${i}
    hostname: chromium-cdp-${i}
    environment:
      - CDP_PORT=9222
      - VNC_PORT=5900
      - ENABLE_VNC=\${ENABLE_VNC:-true}
      - SCREEN_WIDTH=\${SCREEN_WIDTH:-1920}
      - SCREEN_HEIGHT=\${SCREEN_HEIGHT:-1080}
      - USE_GPU=${USE_GPU}
      - TZ=\${TZ:-Australia/Adelaide}
      - LANG=\${LANG:-en_US.UTF-8}
    ports:
      - "${CDP_PORT}:9222"
      - "${VNC_PORT}:5900"
    volumes:
      - chromium-data-${i}:/data${EXTRA_CONFIG}

EOF
done

echo "volumes:" >> "$OUTPUT_FILE"
for i in $(seq 1 "$INSTANCE_COUNT"); do
    echo "  chromium-data-${i}:" >> "$OUTPUT_FILE"
done

echo ""
echo "Generated $OUTPUT_FILE with $INSTANCE_COUNT instances"
echo "Resources: 1GB max RAM per instance (idle uses minimal)"
echo ""
echo "Endpoints:"
for i in $(seq 1 "$INSTANCE_COUNT"); do
    echo "  chromium-${i}: CDP=:$((9221 + i)) VNC=:$((5899 + i))"
done
echo ""
echo "Allowed IPs: localhost, 10.10.1.2-10.10.1.9"
echo "Timezone: Australia/Adelaide"
