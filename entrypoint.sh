#!/bin/bash
set -e

INSTANCE_COUNT="${INSTANCE_COUNT:-5}"
ENABLE_VNC="${ENABLE_VNC:-true}"
SCREEN_WIDTH="${SCREEN_WIDTH:-1920}"
SCREEN_HEIGHT="${SCREEN_HEIGHT:-1080}"
USE_GPU="${USE_GPU:-false}"
BASE_CDP_PORT="${BASE_CDP_PORT:-9222}"
BASE_VNC_PORT="${BASE_VNC_PORT:-5900}"
DASHBOARD_PORT="${DASHBOARD_PORT:-8080}"
DASHBOARD_USER="${DASHBOARD_USER:-admin}"
DASHBOARD_PASS="${DASHBOARD_PASS:-admin}"
LOG_DIR="/var/log/s6-grid"

mkdir -p "$LOG_DIR"
chmod 777 "$LOG_DIR"
chown -R chrome:chrome "$LOG_DIR" 2>/dev/null || true

export INSTANCE_COUNT BASE_CDP_PORT BASE_VNC_PORT DASHBOARD_PORT DASHBOARD_USER DASHBOARD_PASS EXTERNAL_PORT_PREFIX LOG_DIR

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_DIR/entrypoint.log"
}

log "=== S6 Chromium Grid Starting ==="
log "INSTANCE_COUNT=$INSTANCE_COUNT"
log "ENABLE_VNC=$ENABLE_VNC"
log "USE_GPU=$USE_GPU"
log "SCREEN=${SCREEN_WIDTH}x${SCREEN_HEIGHT}"

log "Skipping iptables (may not have permissions)"

if [ "$USE_GPU" = "true" ]; then
    GL_FLAGS="--use-gl=egl --enable-gpu --enable-webgl --enable-webgl2 --ignore-gpu-blocklist --enable-gpu-rasterization --enable-accelerated-video-decode --enable-features=VaapiVideoDecoder,VaapiVideoEncoder"
    log "GPU mode: VA-API hardware acceleration"
else
    GL_FLAGS="--use-gl=angle --use-angle=swiftshader --enable-webgl --enable-webgl2 --ignore-gpu-blocklist"
    log "CPU mode: SwiftShader software rendering"
fi

CHROME_COMMON_FLAGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --no-pings --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-search-engine-choice-screen --disable-sync --disable-sync-preferences --disable-background-networking --disable-client-side-phishing-detection --disable-component-update --disable-default-apps --disable-extensions --disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,PasswordManager,AutofillServerCommunication,ChromeWhatsNewUI,HttpsUpgrades,HeavyAdIntervention --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-domain-reliability --disable-breakpad --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling --aggressive-cache-discard --disable-back-forward-cache --memory-pressure-off --password-store=basic --use-mock-keychain --deny-permission-prompts --disable-notifications --enable-features=NetworkService,NetworkServiceInProcess --force-color-profile=srgb --disable-web-security --allow-running-insecure-content --autoplay-policy=no-user-gesture-required $GL_FLAGS"

log "Starting $INSTANCE_COUNT browser instances..."

for i in $(seq 1 "$INSTANCE_COUNT"); do
    DISPLAY_NUM=$((99 + i))
    CDP_PORT=$((BASE_CDP_PORT + i - 1))
    VNC_PORT=$((BASE_VNC_PORT + i - 1))
    DATA_DIR="/data/instance-${i}"
    INSTANCE_LOG="$LOG_DIR/instance-${i}.log"
    
    export DISPLAY=":${DISPLAY_NUM}"
    
    mkdir -p "$DATA_DIR"
    chown chrome:chrome "$DATA_DIR" 2>/dev/null || true
    
    touch "$INSTANCE_LOG"
    chmod 666 "$INSTANCE_LOG"
    
    log "Instance $i: Display=$DISPLAY CDP=$CDP_PORT VNC=$VNC_PORT"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Xvfb on display $DISPLAY" >> "$INSTANCE_LOG"
    Xvfb "$DISPLAY" -screen 0 "${SCREEN_WIDTH}x${SCREEN_HEIGHT}x24" -ac +extension GLX +render -noreset >> "$INSTANCE_LOG" 2>&1 &
    XVFB_PID=$!
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Xvfb started with PID $XVFB_PID" >> "$INSTANCE_LOG"
    sleep 0.5
    
    if ! kill -0 $XVFB_PID 2>/dev/null; then
        log "ERROR: Xvfb failed to start for instance $i"
        continue
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting fluxbox" >> "$INSTANCE_LOG"
    su -s /bin/bash chrome -c "fluxbox -display $DISPLAY 2>&1 | grep -v -i 'background\|wallpaper\|fbsetbg' >> '$INSTANCE_LOG' &" 2>/dev/null || true
    
    if [ "$ENABLE_VNC" = "true" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting x11vnc on port $VNC_PORT" >> "$INSTANCE_LOG"
        x11vnc -display "$DISPLAY" -forever -shared -rfbport "$VNC_PORT" -nopw -bg -xkb >> "$INSTANCE_LOG" 2>&1 || {
            log "WARNING: x11vnc failed to start for instance $i"
        }
    fi
    
    INTERNAL_CDP_PORT=$((CDP_PORT + 10000))
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Chromium on internal port $INTERNAL_CDP_PORT (exposed as $CDP_PORT)" >> "$INSTANCE_LOG"
    su -s /bin/bash chrome -c "DISPLAY=$DISPLAY /usr/lib/chromium/chromium \
        --remote-debugging-port=$INTERNAL_CDP_PORT \
        --remote-debugging-address=0.0.0.0 \
        --window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT} \
        --user-data-dir=$DATA_DIR \
        $CHROME_COMMON_FLAGS \
        about:blank >> '$INSTANCE_LOG' 2>&1" &
    
    CHROME_PID=$!
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Chromium started with PID $CHROME_PID" >> "$INSTANCE_LOG"
    
    sleep 0.5
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting socat: 0.0.0.0:$CDP_PORT -> 127.0.0.1:$INTERNAL_CDP_PORT" >> "$INSTANCE_LOG"
    socat TCP-LISTEN:${CDP_PORT},fork,bind=0.0.0.0,reuseaddr TCP:127.0.0.1:${INTERNAL_CDP_PORT} >> "$INSTANCE_LOG" 2>&1 &
    
    sleep 0.5
done

log "All $INSTANCE_COUNT instances started"
log "CDP ports: $BASE_CDP_PORT-$((BASE_CDP_PORT + INSTANCE_COUNT - 1))"
log "VNC ports: $BASE_VNC_PORT-$((BASE_VNC_PORT + INSTANCE_COUNT - 1))"

log "Starting dashboard on port $DASHBOARD_PORT..."
cd /dashboard && node server.js 2>&1 | tee -a "$LOG_DIR/dashboard.log" &

log "============================================"
log "  Dashboard: http://0.0.0.0:$DASHBOARD_PORT"
log "  Login: $DASHBOARD_USER / ********"
log "============================================"

wait
