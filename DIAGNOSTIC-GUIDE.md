# S6 Chromium Grid - Diagnostic & Log Analysis Guide

## 🔍 Log Access Methods

### Method 1: Dashboard UI (Recommended)
1. Open dashboard: http://10.10.1.2:18080/
2. Login with credentials (admin/admin by default)
3. Click **"Logs"** button in header
4. Select log file from dropdown
5. Enable **"Auto-refresh"** for live tailing

### Method 2: API Endpoint
```bash
# List all log files
curl -u admin:admin http://10.10.1.2:18080/api/logs | jq

# View specific log (last 1000 lines)
curl -u admin:admin "http://10.10.1.2:18080/api/logs/entrypoint.log?lines=1000" | jq -r '.lines'
```

### Method 3: Docker Exec
```bash
# Container logs (stdout/stderr)
docker logs s6-chromium-grid --tail 100 -f

# Entrypoint log
docker exec s6-chromium-grid cat /var/log/s6-grid/entrypoint.log

# Instance logs
docker exec s6-chromium-grid cat /var/log/s6-grid/instance-1.log

# Dashboard log
docker exec s6-chromium-grid cat /var/log/s6-grid/dashboard.log
```

### Method 4: Docker Volume Mount
```bash
# If logs are mounted as volume
docker inspect s6-chromium-grid | jq '.[0].Mounts'

# Access from host
cat /path/to/mounted/logs/entrypoint.log
```

---

## 📋 Log Files Explained

| Log File | Contains | Priority |
|----------|----------|----------|
| `entrypoint.log` | Container startup, Xvfb, Chrome launches | **HIGH** |
| `dashboard.log` | Node.js dashboard server | **HIGH** |
| `instance-X.log` | Per-instance Chrome, fluxbox, x11vnc | **MEDIUM** |

---

## 🚨 Critical Error Patterns

### Container Startup Issues

#### Error: Missing dependencies
```
/usr/bin/env: 'node': No such file or directory
/bin/bash: /usr/bin/chromium: No such file or directory
```
**Cause**: Docker build failed or incomplete  
**Fix**: Rebuild image
```bash
docker build -t s6-chromium-grid:latest .
docker-compose up -d --force-recreate
```

#### Error: Permission denied
```
mkdir: cannot create directory '/data/instance-1': Permission denied
chown: cannot access '/home/chrome': Operation not permitted
```
**Cause**: Container running without proper privileges  
**Fix**: Add capabilities to docker-compose.yml
```yaml
cap_add:
  - NET_ADMIN
  - NET_RAW
  - SYS_ADMIN
  - CHOWN
  - DAC_OVERRIDE
```

#### Error: Port already in use
```
Error: listen EADDRINUSE: address already in use :::8080
```
**Cause**: Another service using port 8080  
**Fix**: Change port or stop conflicting service
```bash
# Find process using port
sudo lsof -i :8080

# Change dashboard port
docker run -e DASHBOARD_PORT=8081 ...
```

---

### Chrome Launch Issues

#### Error: Failed to move to new namespace
```
[Instance 1] Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted
```
**Cause**: Insufficient container permissions  
**Fix**: Add SYS_ADMIN capability
```yaml
cap_add:
  - SYS_ADMIN
```

#### Error: Shared memory size
```
[Instance 1] Running without the SUID sandbox! See https://chromium.googlesource.com/chromium/src/+/master/docs/linux_suid_sandbox_development.md for more information.
```
**Cause**: /dev/shm too small  
**Fix**: Increase shared memory
```yaml
shm_size: '2gb'
```

#### Error: Display server not found
```
[Instance 1] Gtk: cannot open display: :100
```
**Cause**: Xvfb not running or crashed  
**Fix**: Check entrypoint.log for Xvfb errors
```bash
docker exec s6-chromium-grid ps aux | grep Xvfb
```

---

### VNC Issues

#### Error: Unable to grab mouse
```
x11vnc: unable to grab mouse on: :100
```
**Cause**: Normal for headless environments  
**Severity**: ⚠️ Warning (can ignore)  
**Impact**: VNC will work, just can't capture mouse cursor

#### Error: Unable to open display
```
x11vnc: unable to open display ":100"
```
**Cause**: Xvfb crashed or display number wrong  
**Fix**: Restart instance, check Xvfb logs

#### Error: Port in use
```
x11vnc: bind: Address already in use (98)
x11vnc: error binding socket to 5900
```
**Cause**: VNC port already bound  
**Fix**: Kill zombie x11vnc or use different ports
```bash
docker exec s6-chromium-grid pkill x11vnc
```

---

### Screenshot Issues

#### Error: Cannot grab X server
```
import: unable to grab X server `-' @ error/xwindow.c/XSelectWindow/9322.
```
**Cause**: X server busy or crashed  
**Severity**: ⚠️ Warning  
**Fix**: Retry screenshot, check Xvfb

#### Error: No such file or directory
```
[Screenshot] Failed for instance 1: Error: spawn import ENOENT
```
**Cause**: ImageMagick not installed  
**Fix**: Rebuild with ImageMagick
```dockerfile
RUN apt-get install -y imagemagick
```

#### Error: Permission denied
```
import: unable to open image `/tmp/screenshots/instance-1.jpg.tmp': Permission denied
```
**Cause**: Directory permissions  
**Fix**: Set permissions in Dockerfile
```dockerfile
RUN chmod 777 /tmp/screenshots
```

---

### Dashboard/API Issues

#### Error: Authentication failed
```
Error: 401 Unauthorized
WWW-Authenticate: Basic realm="S6 Chromium Grid"
```
**Cause**: Wrong credentials  
**Fix**: Use correct username/password
```bash
curl -u admin:admin http://...
```

#### Error: Cannot find module
```
Error: Cannot find module 'express'
```
**Cause**: npm install failed  
**Fix**: Check dashboard.log, reinstall
```bash
docker exec s6-chromium-grid sh -c "cd /dashboard && npm install"
```

---

## 📊 Diagnostic Checklist

### Quick Health Check
```bash
#!/bin/bash
echo "=== S6 Chromium Grid Diagnostics ==="

# 1. Container running?
docker ps | grep s6-chromium-grid && echo "✅ Container running" || echo "❌ Container not running"

# 2. Dashboard responding?
curl -s -u admin:admin http://10.10.1.2:18080/api/health | grep ok && echo "✅ Dashboard OK" || echo "❌ Dashboard down"

# 3. Instances running?
RUNNING=$(curl -s -u admin:admin http://10.10.1.2:18080/api/status | jq -r '.running')
TOTAL=$(curl -s -u admin:admin http://10.10.1.2:18080/api/status | jq -r '.total')
echo "✅ Instances: $RUNNING/$TOTAL running"

# 4. Screenshot API working?
curl -s -u admin:admin http://10.10.1.2:18080/api/instance/1/screenshot -o /tmp/test.jpg
[ -f /tmp/test.jpg ] && echo "✅ Screenshot API OK" || echo "❌ Screenshot API failed"

# 5. Logs accessible?
LOGS=$(curl -s -u admin:admin http://10.10.1.2:18080/api/logs | jq -r '.logs | length')
echo "✅ Found $LOGS log files"

# 6. Check for errors in logs
docker exec s6-chromium-grid grep -i "error\|fatal\|failed" /var/log/s6-grid/*.log | head -10
```

### Deep Dive Diagnostics

#### 1. Check All Processes
```bash
docker exec s6-chromium-grid ps aux

# Should see:
# - node server.js (dashboard)
# - chromium (one per instance)
# - Xvfb (one per instance)
# - x11vnc (one per instance if VNC enabled)
# - websockify (one per instance)
# - fluxbox (one per instance)
```

#### 2. Check Network Ports
```bash
docker exec s6-chromium-grid netstat -tlnp

# Should see LISTENING on:
# - 8080 (dashboard)
# - 9222-922X (CDP ports)
# - 5900-590X (VNC ports)
# - 6080-608X (websockify ports)
# - 19222-1922X (internal CDP ports)
```

#### 3. Check File Permissions
```bash
docker exec s6-chromium-grid ls -la /data
docker exec s6-chromium-grid ls -la /tmp/screenshots
docker exec s6-chromium-grid ls -la /recordings
docker exec s6-chromium-grid ls -la /var/log/s6-grid
```

#### 4. Check Disk Space
```bash
docker exec s6-chromium-grid df -h

# /data should have space for user profiles
# /tmp should have space for screenshots
# /recordings should have space for videos
```

#### 5. Test Chrome Manually
```bash
# Start Chrome manually to see errors
docker exec -u chrome s6-chromium-grid \
  bash -c "DISPLAY=:100 chromium \
    --remote-debugging-port=19999 \
    --no-sandbox \
    --disable-dev-shm-usage \
    about:blank"

# Check if it connects
curl http://localhost:19999/json/version
```

---

## 🔧 Common Fixes

### Fix 1: Restart Everything
```bash
docker-compose down
docker-compose up -d
```

### Fix 2: Rebuild Image
```bash
docker-compose down
docker build -t s6-chromium-grid:latest .
docker-compose up -d
```

### Fix 3: Clear Instance Data
```bash
# CAUTION: Deletes all browser data
docker exec s6-chromium-grid rm -rf /data/instance-*
docker-compose restart
```

### Fix 4: Clear Screenshots
```bash
docker exec s6-chromium-grid rm -f /tmp/screenshots/*.jpg
```

### Fix 5: Reset Recordings
```bash
docker exec s6-chromium-grid rm -f /recordings/*.mp4
```

### Fix 6: Restart Specific Instance
```bash
# Via API
curl -u admin:admin -X POST http://10.10.1.2:18080/api/instance/1/restart

# Via command line
docker exec s6-chromium-grid pkill -f "user-data-dir=/data/instance-1"
# Wait 2 seconds, Chrome should auto-restart from entrypoint
```

---

## 📈 Performance Monitoring

### CPU Usage
```bash
# Container CPU
docker stats s6-chromium-grid --no-stream

# Per-process CPU
docker exec s6-chromium-grid top -b -n 1 | head -20
```

### Memory Usage
```bash
# Container memory
docker stats s6-chromium-grid --no-stream --format "{{.MemUsage}}"

# Per-instance memory
docker exec s6-chromium-grid ps aux --sort=-%mem | head -10
```

### Disk Usage
```bash
# Screenshot directory
docker exec s6-chromium-grid du -sh /tmp/screenshots

# Instance data directories
docker exec s6-chromium-grid du -sh /data/instance-*

# Recordings
docker exec s6-chromium-grid du -sh /recordings

# Total
docker exec s6-chromium-grid df -h /
```

---

## 🚀 Optimization Tips

### Reduce Memory Usage
```yaml
environment:
  - INSTANCE_COUNT=3  # Fewer instances
  - SCREEN_WIDTH=1280  # Lower resolution
  - SCREEN_HEIGHT=720
```

### Reduce CPU Usage
```yaml
environment:
  - USE_GPU=false  # Use SwiftShader (CPU rendering)
```

### Reduce Disk Usage
```bash
# Auto-cleanup old recordings
docker exec s6-chromium-grid find /recordings -name "*.mp4" -mtime +7 -delete

# Clear browser caches
docker exec s6-chromium-grid find /data -name "Cache" -type d -exec rm -rf {} +
```

---

## 📞 Getting Help

### Information to Collect
1. **Container logs**: `docker logs s6-chromium-grid --tail 200`
2. **Entrypoint log**: Via dashboard or `cat /var/log/s6-grid/entrypoint.log`
3. **Dashboard log**: Via dashboard or `cat /var/log/s6-grid/dashboard.log`
4. **System info**: `docker info`
5. **Docker version**: `docker --version`
6. **Compose file**: `cat docker-compose.yml`
7. **Environment**: `docker exec s6-chromium-grid env`

### Create Issue Report
```markdown
## Issue Description
[Describe what's not working]

## Environment
- Docker version: [output of docker --version]
- Host OS: [Linux/macOS/Windows]
- INSTANCE_COUNT: [number]
- ENABLE_VNC: [true/false]

## Logs
[Paste relevant log excerpts]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]
```
