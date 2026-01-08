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

export INSTANCE_COUNT BASE_CDP_PORT BASE_VNC_PORT DASHBOARD_PORT DASHBOARD_USER DASHBOARD_PASS

echo "[*] Configuring IP restriction: localhost + 10.10.1.2-10.10.1.9"
iptables -F INPUT 2>/dev/null || true
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

for ip in $(seq 2 9); do
    iptables -A INPUT -p tcp --dport "$DASHBOARD_PORT" -s "10.10.1.${ip}" -j ACCEPT
done
iptables -A INPUT -p tcp --dport "$DASHBOARD_PORT" -j DROP

for i in $(seq 1 "$INSTANCE_COUNT"); do
    CDP_PORT=$((BASE_CDP_PORT + i - 1))
    VNC_PORT=$((BASE_VNC_PORT + i - 1))
    WS_PORT=$((6080 + i - 1))
    for ip in $(seq 2 9); do
        iptables -A INPUT -p tcp --dport "$CDP_PORT" -s "10.10.1.${ip}" -j ACCEPT
        iptables -A INPUT -p tcp --dport "$VNC_PORT" -s "10.10.1.${ip}" -j ACCEPT
        iptables -A INPUT -p tcp --dport "$WS_PORT" -s "10.10.1.${ip}" -j ACCEPT
    done
done

for i in $(seq 1 "$INSTANCE_COUNT"); do
    CDP_PORT=$((BASE_CDP_PORT + i - 1))
    VNC_PORT=$((BASE_VNC_PORT + i - 1))
    WS_PORT=$((6080 + i - 1))
    iptables -A INPUT -p tcp --dport "$CDP_PORT" -j DROP
    iptables -A INPUT -p tcp --dport "$VNC_PORT" -j DROP
    iptables -A INPUT -p tcp --dport "$WS_PORT" -j DROP
done

if [ "$USE_GPU" = "true" ]; then
    GL_FLAGS="--use-gl=egl --enable-gpu --enable-webgl --enable-webgl2 --ignore-gpu-blocklist --enable-gpu-rasterization --enable-accelerated-video-decode --enable-features=VaapiVideoDecoder,VaapiVideoEncoder"
    echo "[*] Intel iGPU mode: VA-API hardware acceleration"
else
    GL_FLAGS="--use-gl=angle --use-angle=swiftshader --enable-webgl --enable-webgl2 --ignore-gpu-blocklist"
    echo "[*] CPU mode: SwiftShader software rendering"
fi

CHROME_COMMON_FLAGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --no-pings --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-search-engine-choice-screen --disable-sync --disable-sync-preferences --disable-background-networking --disable-client-side-phishing-detection --disable-component-update --disable-default-apps --disable-extensions --disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,PasswordManager,AutofillServerCommunication,ChromeWhatsNewUI,HttpsUpgrades,HeavyAdIntervention --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-domain-reliability --disable-breakpad --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling --aggressive-cache-discard --disable-back-forward-cache --memory-pressure-off --password-store=basic --use-mock-keychain --deny-permission-prompts --disable-notifications --enable-features=NetworkService,NetworkServiceInProcess --force-color-profile=srgb --disable-web-security --allow-running-insecure-content --autoplay-policy=no-user-gesture-required $GL_FLAGS"

echo "[*] Starting $INSTANCE_COUNT browser instances..."

for i in $(seq 1 "$INSTANCE_COUNT"); do
    DISPLAY_NUM=$((99 + i))
    CDP_PORT=$((BASE_CDP_PORT + i - 1))
    VNC_PORT=$((BASE_VNC_PORT + i - 1))
    DATA_DIR="/data/instance-${i}"
    
    export DISPLAY=":${DISPLAY_NUM}"
    
    mkdir -p "$DATA_DIR"
    chown chrome:chrome "$DATA_DIR"
    
    echo "[*] Instance $i: Display=$DISPLAY CDP=:$CDP_PORT VNC=:$VNC_PORT"
    
    Xvfb "$DISPLAY" -screen 0 "${SCREEN_WIDTH}x${SCREEN_HEIGHT}x24" -ac +extension GLX +render -noreset &
    sleep 0.5
    
    su -s /bin/bash chrome -c "fluxbox -display $DISPLAY &"
    
    if [ "$ENABLE_VNC" = "true" ]; then
        x11vnc -display "$DISPLAY" -forever -shared -rfbport "$VNC_PORT" -nopw -bg -xkb -q 2>/dev/null
    fi
    
    su -s /bin/bash chrome -c "DISPLAY=$DISPLAY chromium \
        --remote-debugging-port=$CDP_PORT \
        --remote-debugging-address=0.0.0.0 \
        --window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT} \
        --user-data-dir=$DATA_DIR \
        $CHROME_COMMON_FLAGS \
        about:blank" &
    
    sleep 1
done

echo ""
echo "[*] All $INSTANCE_COUNT instances started"
echo "[*] CDP ports: $BASE_CDP_PORT-$((BASE_CDP_PORT + INSTANCE_COUNT - 1))"
echo "[*] VNC ports: $BASE_VNC_PORT-$((BASE_VNC_PORT + INSTANCE_COUNT - 1))"
echo ""
echo "[*] Starting dashboard on port $DASHBOARD_PORT..."

cd /dashboard && node server.js &

echo ""
echo "============================================"
echo "  Dashboard: http://0.0.0.0:$DASHBOARD_PORT"
echo "  Login: $DASHBOARD_USER / $DASHBOARD_PASS"
echo "============================================"
echo ""

wait
