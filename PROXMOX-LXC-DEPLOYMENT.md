# S6 Chromium Grid - Proxmox LXC Deployment

**Deployed:** 2026-01-10
**LXC ID:** 1043
**Proxmox Host:** 10.10.1.15
**LXC IP:** 10.10.1.15 (via LXC 1043)
**Version:** 2.1.1

---

## Deployment Configuration

### System Resources
- **CPU:** 4 cores (4 core limit)
- **RAM:** 20GB total (16GB Docker limit, 2GB reserved)
- **Storage:** Docker volumes for data persistence
- **GPU:** Disabled (USE_GPU=false) - SwiftShader software rendering

### Instance Configuration
- **Mode:** Static with fallback
- **Total Instances:** 10 (can start up to 10 from dashboard)
- **Initial Instances:** 1 (Instance 1 - always running as fallback)
- **Remaining:** 9 instances (available to start on-demand from dashboard)

### Access Points
- **Dashboard:** http://10.10.1.15:8080
  - Username: `admin`
  - Password: `admin`
- **Instance 1 CDP (Fallback):** ws://10.10.1.15:9222
- **Instance 2-10 CDP:** ws://10.10.1.15:9223-9231 (start from dashboard first)

---

## Fallback Behavior

### When Agents Connect Correctly
```javascript
// Agent uses correct CDP URL
const browser = await chromium.connectOverCDP('ws://10.10.1.15:9222');
// ✅ Connects to Instance 1 (fallback)
```

### When Agents Connect Incorrectly
```javascript
// Agent tries any of these:
await chromium.connectOverCDP('http://10.10.1.15:9222');
await chromium.connectOverCDP('ws://10.10.1.15:9222/devtools/browser/...');
// ✅ Still connects to Instance 1 (fallback always available)
```

### Starting Additional Instances
1. Go to http://10.10.1.15:8080
2. Find "Instance 2" (or 3, 4, etc.) with "offline" status
3. Click **Start** button
4. Connect to: `ws://10.10.1.15:9223` (Instance 2), `ws://10.10.1.15:9224` (Instance 3), etc.

---

## Connection Examples

### Playwright
```javascript
const { chromium } = require('playwright');

// Connect to fallback instance (always available)
const browser = await chromium.connectOverCDP('ws://10.10.1.15:9222');

// Or connect to specific instance (must be started first via dashboard)
const browser2 = await chromium.connectOverCDP('ws://10.10.1.15:9223');
```

### Puppeteer
```javascript
const puppeteer = require('puppeteer-core');

// Connect to fallback instance
const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://10.10.1.15:9222'
});
```

---

## Management Commands

### SSH into LXC
```bash
# From Proxmox host
ssh root@10.10.1.15
pct enter 1043

# Or direct from workstation
ssh root@10.10.1.15 "pct exec 1043 -- bash"
```

### Docker Commands
```bash
# View logs
docker logs s6-chromium-grid -f

# Check status
docker ps

# Restart container
docker compose restart

# Stop/Start
docker compose down
docker compose up -d

# Update to new version
docker compose pull
docker compose up -d
```

### Dashboard API
```bash
# Check status
curl -u admin:admin http://10.10.1.15:8080/api/status | jq

# Get metrics
curl -u admin:admin http://10.10.1.15:8080/api/metrics | jq

# Get metrics history
curl -u admin:admin http://10.10.1.15:8080/api/metrics/history?hours=1 | jq

# Export metrics as CSV
curl -u admin:admin "http://10.10.1.15:8080/api/metrics/export?format=csv&hours=24" > metrics.csv
```

---

## File Locations

### Docker Compose
- **Location:** `/root/docker-compose.yml` (inside LXC 1043)

### Data Volumes
- **chromium-data:** Browser profiles and data
- **chromium-recordings:** Screen recordings

### Logs
- **Container logs:** `docker logs s6-chromium-grid`
- **Instance logs:** `/var/log/chromium-grid/` (inside container)

---

## Resource Usage

### Expected Memory Usage
- **Instance 1 (running):** ~1.5-2GB
- **Each additional instance:** ~1.5-2GB
- **Dashboard + Metrics:** ~500MB
- **Total with 10 instances:** ~18GB (within 20GB LXC limit)

### CPU Usage
- **Idle:** <5% (single instance)
- **Active browsing:** 20-50% per instance
- **Limit:** 4 cores (400% max)

---

## Troubleshooting

### Instance 1 Not Running
```bash
# Check container logs
docker logs s6-chromium-grid | grep "Instance 1"

# Should see:
# [2026-01-10 06:04:36] Instance 1: Display=:100 CDP=9222 VNC=5900

# Restart if needed
docker compose restart
```

### Cannot Connect to CDP
```bash
# Check if port is listening
netstat -tlnp | grep 9222

# Test connection
curl http://10.10.1.15:9222/json/version

# Should return JSON with browser info
```

### Out of Memory
```bash
# Check memory usage
free -h

# Check Docker stats
docker stats s6-chromium-grid

# Stop instances from dashboard to free memory
# Or reduce INSTANCE_COUNT in docker-compose.yml
```

### GPU Errors (Should Not Happen)
```bash
# Verify GPU is disabled
docker exec s6-chromium-grid env | grep USE_GPU
# Should show: USE_GPU=false

# Check logs for GL errors
docker logs s6-chromium-grid | grep -i "GL\|GPU\|render"
# Should see: "CPU mode: SwiftShader software rendering"
```

---

## Updating S6 Chromium Grid

### Update to Latest Version
```bash
# SSH into LXC
ssh root@10.10.1.15 "pct exec 1043 -- bash"

# Pull new image (if public)
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:2.1.1

# Or transfer from workstation
# On workstation:
docker save ghcr.io/s6securitylabs/s6-chromium-grid:2.1.1 | \
  ssh root@10.10.1.15 "pct exec 1043 -- docker load"

# Restart with new image
cd /root
docker compose down
docker compose up -d
```

---

## Features Enabled

### ✅ Metrics & Observability
- SQLite time-series storage (7-day retention)
- Real-time metrics collection (5-second intervals)
- Dashboard displays CPU, Memory, Disk usage
- Export metrics as CSV/JSON
- `/api/metrics/history` endpoint

### ✅ Fallback Instance
- Instance 1 always running
- Available at ws://10.10.1.15:9222
- Auto-restarts on failure
- Handles incorrectly formatted agent connections

### ✅ On-Demand Instances
- 9 additional instances available
- Start from dashboard as needed
- CDP ports 9223-9231
- Independent browser profiles

### ❌ GPU Acceleration
- Disabled (USE_GPU=false)
- Using SwiftShader software rendering
- Suitable for headless automation
- Lower performance than hardware acceleration

---

## Configuration File

**Location:** `/root/docker-compose.yml` (inside LXC 1043)

```yaml
services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:2.1.1
    container_name: s6-chromium-grid
    restart: unless-stopped

    environment:
      DYNAMIC_MODE: false
      INSTANCE_COUNT: 10
      INITIAL_INSTANCE_COUNT: 1
      USE_GPU: false
      ENABLE_METRICS_HISTORY: true
      DASHBOARD_USER: admin
      DASHBOARD_PASS: admin

    ports:
      - 8080:8080      # Dashboard
      - 9222-9231:9222-9231  # CDP ports (10 instances)

    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 16g
```

---

## Security Notes

### ⚠️ Change Default Password
```bash
# Edit docker-compose.yml
nano /root/docker-compose.yml

# Change DASHBOARD_PASS
environment:
  DASHBOARD_PASS: your-secure-password-here

# Restart
docker compose restart
```

### 🔒 Firewall Recommendations
```bash
# Only allow dashboard from trusted IPs
# On Proxmox host:
iptables -A INPUT -p tcp --dport 8080 -s 10.10.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 8080 -j DROP

# Allow CDP from your network
iptables -A INPUT -p tcp --dport 9222:9231 -s 10.10.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 9222:9231 -j DROP
```

---

## Quick Reference

| Component | Port | Access |
|-----------|------|--------|
| Dashboard | 8080 | http://10.10.1.15:8080 |
| Instance 1 CDP | 9222 | ws://10.10.1.15:9222 |
| Instance 2 CDP | 9223 | ws://10.10.1.15:9223 |
| Instance 3 CDP | 9224 | ws://10.10.1.15:9224 |
| Instance 4-10 | 9225-9231 | ws://10.10.1.15:9225-9231 |

**Default Credentials:**
- Username: `admin`
- Password: `admin` ⚠️ **CHANGE THIS**

---

**Deployed Successfully:** ✅
**Status:** Production Ready
**Fallback Instance:** Running on CDP 9222
**Additional Capacity:** 9 instances available on-demand
