# S6 Chromium Grid - Testing & Verification Guide

## Quick Verification Checklist

### ✅ Screenshot Mode Default
1. Open dashboard in **incognito/private mode** (clears localStorage)
2. Verify all running instances show **static screenshots** (not live iframes)
3. Button should say **"📹 Live"** (indicating you're in screenshot mode)
4. Screenshot should refresh automatically every 30 seconds

### ✅ Live VNC Toggle
1. Click **"📹 Live"** on any instance
2. Should switch to live VNC iframe
3. Button changes to **"📷 Screenshot"**
4. Preference persists on page refresh

### ✅ Reset Views Button
1. Switch some instances to live mode
2. Click **"🔄 Reset Views"** in header
3. Confirm dialog
4. All instances reset to screenshot mode

### ✅ Restart/Stop Functionality
1. Click **"Stop"** on a running instance
2. Instance should go **offline** within 2-3 seconds
3. Click **"Start"** (appears when offline)
4. Instance should come **online** within 3-4 seconds
5. Check browser console for API responses

---

## Detailed Testing Procedures

### Test 1: Screenshot API
```bash
# Check if screenshot endpoint works
curl -u admin:admin http://10.10.1.2:18080/api/instance/1/screenshot -o test-screenshot.jpg

# Verify file was created
ls -lh test-screenshot.jpg

# Expected: JPEG file around 20-100KB
```

### Test 2: Instance Status API
```bash
# Get all instance statuses
curl -u admin:admin http://10.10.1.2:18080/api/status | jq

# Expected output:
# {
#   "total": 5,
#   "running": 5,
#   "instances": [
#     {
#       "id": 1,
#       "status": "running",
#       "cdpPort": 9222,
#       "vncPort": 5900,
#       "wsPort": 6080,
#       "gpuEnabled": false,
#       "recording": false
#     }
#   ]
# }
```

### Test 3: Stop Instance
```bash
# Stop instance 1
curl -u admin:admin -X POST http://10.10.1.2:18080/api/instance/1/stop

# Verify it stopped
curl -u admin:admin http://10.10.1.2:18080/api/status | jq '.instances[0].status'

# Expected: "offline"
```

### Test 4: Restart Instance
```bash
# Restart instance 1
curl -u admin:admin -X POST http://10.10.1.2:18080/api/instance/1/restart

# Wait 3 seconds
sleep 3

# Verify it started
curl -u admin:admin http://10.10.1.2:18080/api/status | jq '.instances[0].status'

# Expected: "running"
```

### Test 5: Check Logs
```bash
# List available logs
curl -u admin:admin http://10.10.1.2:18080/api/logs | jq

# Get entrypoint log (last 100 lines)
curl -u admin:admin "http://10.10.1.2:18080/api/logs/entrypoint.log?lines=100" | jq -r '.lines'

# Get specific instance log
curl -u admin:admin "http://10.10.1.2:18080/api/logs/instance-1.log?lines=100" | jq -r '.lines'

# Get dashboard log
curl -u admin:admin "http://10.10.1.2:18080/api/logs/dashboard.log?lines=100" | jq -r '.lines'
```

---

## Browser Console Testing

### Check for JavaScript Errors
Open browser DevTools (F12) → Console tab

**Expected**: No red errors on page load

**Common issues**:
- `Failed to load screenshot` → Screenshot API not working
- `Failed to restart instance` → Backend API issue
- `localStorage is not defined` → Shouldn't happen in modern browsers

### Test Screenshot Refresh
```javascript
// In browser console:
console.log('Screenshot intervals:', screenshotIntervals);
// Should show Map with instance IDs and interval IDs

// Force refresh screenshot for instance 1
document.getElementById('screenshot-1').src = getScreenshotUrl(1);
```

### Test LocalStorage
```javascript
// In browser console:
// Check current preferences
for (let i = 1; i <= 5; i++) {
    console.log(`Instance ${i} live mode:`, localStorage.getItem(`vnc-live-mode-${i}`));
}

// Force reset (simulates "Reset Views" button)
for (let i = 1; i <= 5; i++) {
    localStorage.removeItem(`vnc-live-mode-${i}`);
}
location.reload();
```

---

## Log Analysis

### What to Look For

#### ✅ Good Log Entries
```
[API] Stopping instance 1
[API] Instance 1 status after stop: offline
[API] Restarting instance 1
[API] Starting Chrome for instance 1
[API] Instance 1 status after restart: running
```

#### ⚠️ Warning Signs
```
[Kill Instance 1] Command failed: pkill -9 -f "user-data-dir=/data/instance-1"
→ Expected occasionally, fallback methods should work

[Screenshot] Failed for instance 1: Command timed out
→ Display server might not be ready
```

#### 🚨 Critical Errors
```
Error: ENOENT: no such file or directory
→ Missing directories/files

Error: Cannot find module 'express'
→ npm dependencies not installed

Error: listen EADDRINUSE :::8080
→ Port already in use
```

### Common Issues & Fixes

| Issue | Log Pattern | Fix |
|-------|-------------|-----|
| Screenshot fails | `import: unable to grab mouse` | Normal for headless, ignore |
| Chrome won't start | `Failed to move to new namespace` | Increase container privileges |
| VNC black screen | `x11vnc.*unable to open display` | Xvfb not running |
| Port conflicts | `EADDRINUSE.*9222` | Another Chrome instance running |

---

## System Metrics Testing

```bash
# Get system metrics
curl -u admin:admin http://10.10.1.2:18080/api/metrics | jq

# Expected output:
# {
#   "disk": {
#     "total": 107374182400,
#     "used": 32212254720,
#     "free": 75161927680
#   },
#   "memory": {
#     "total": 16777216000,
#     "used": 8388608000,
#     "free": 8388608000
#   },
#   "cpu": {
#     "usage": "15.42"
#   },
#   "instances": [...]
# }
```

---

## Performance Benchmarks

### Expected Response Times
- `/api/status` → **< 200ms**
- `/api/instance/:id/screenshot` → **< 500ms** (first request)
- `/api/instance/:id/screenshot` → **< 50ms** (cached, 30s TTL)
- `/api/instance/:id/stop` → **< 2000ms**
- `/api/instance/:id/restart` → **< 4000ms**

### Memory Usage (per instance)
- Idle Chrome: **~150-200MB**
- Active browsing: **~300-500MB**
- Heavy page: **~500MB-1GB**

### Disk Usage
- Fresh instance data dir: **~50MB**
- After browsing: **~100-300MB**
- Screenshots: **~50KB each**
- Recordings (1 min, 720p): **~5-10MB**

---

## Troubleshooting Guide

### Issue: "Screenshot unavailable"
```bash
# Check if ImageMagick is installed
docker exec <container> which import

# Check display server
docker exec <container> ps aux | grep Xvfb

# Test screenshot manually
docker exec <container> DISPLAY=:100 import -window root /tmp/test.jpg
docker exec <container> ls -lh /tmp/test.jpg
```

### Issue: Restart/Stop not working
```bash
# Check running Chrome processes
docker exec <container> ps aux | grep chromium

# Check if pkill works
docker exec <container> pkill -f chromium

# Check permissions
docker exec <container> id chrome
```

### Issue: Can't access dashboard
```bash
# Check if dashboard is running
docker exec <container> ps aux | grep node

# Check dashboard logs
docker exec <container> tail -f /var/log/s6-grid/dashboard.log

# Check port binding
docker exec <container> netstat -tlnp | grep 8080
```

---

## Automated Test Script

Save as `test-grid.sh`:

```bash
#!/bin/bash

BASE_URL="http://10.10.1.2:18080"
USER="admin"
PASS="admin"
AUTH="$USER:$PASS"

echo "=== S6 Chromium Grid Test Suite ==="

# Test 1: API Health
echo -n "Test 1: API Health... "
STATUS=$(curl -s -u $AUTH "$BASE_URL/api/health" | jq -r '.status')
if [ "$STATUS" = "ok" ]; then
    echo "✅ PASS"
else
    echo "❌ FAIL"
fi

# Test 2: Instance Status
echo -n "Test 2: Instance Status... "
INSTANCES=$(curl -s -u $AUTH "$BASE_URL/api/status" | jq -r '.instances | length')
if [ "$INSTANCES" -gt 0 ]; then
    echo "✅ PASS ($INSTANCES instances)"
else
    echo "❌ FAIL"
fi

# Test 3: Screenshot API
echo -n "Test 3: Screenshot API... "
curl -s -u $AUTH "$BASE_URL/api/instance/1/screenshot" -o /tmp/test-screenshot.jpg
if [ -f /tmp/test-screenshot.jpg ] && [ $(stat -f%z /tmp/test-screenshot.jpg) -gt 1000 ]; then
    echo "✅ PASS"
    rm /tmp/test-screenshot.jpg
else
    echo "❌ FAIL"
fi

# Test 4: Logs API
echo -n "Test 4: Logs API... "
LOGS=$(curl -s -u $AUTH "$BASE_URL/api/logs" | jq -r '.logs | length')
if [ "$LOGS" -gt 0 ]; then
    echo "✅ PASS ($LOGS log files)"
else
    echo "❌ FAIL"
fi

# Test 5: Metrics API
echo -n "Test 5: Metrics API... "
CPU=$(curl -s -u $AUTH "$BASE_URL/api/metrics" | jq -r '.cpu.usage')
if [ -n "$CPU" ]; then
    echo "✅ PASS (CPU: ${CPU}%)"
else
    echo "❌ FAIL"
fi

echo ""
echo "=== Test Suite Complete ==="
```

Run: `chmod +x test-grid.sh && ./test-grid.sh`

---

## Performance Testing

### Load Test: Screenshot Endpoint
```bash
# Using Apache Bench
ab -n 100 -c 10 -A admin:admin http://10.10.1.2:18080/api/instance/1/screenshot

# Expected:
# - 100% success rate
# - Mean time: < 500ms
# - No timeouts
```

### Stress Test: Restart All Instances
```bash
for i in {1..5}; do
    curl -s -u admin:admin -X POST "http://10.10.1.2:18080/api/instance/$i/restart" &
done
wait

# All should succeed within 5 seconds
```

---

## Next Steps After Testing

1. ✅ Verify all tests pass
2. ✅ Review logs for errors
3. ✅ Check system metrics
4. ⏭️ Deploy to production
5. ⏭️ Set up monitoring/alerts
