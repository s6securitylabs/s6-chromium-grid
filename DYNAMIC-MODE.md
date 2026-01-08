# Dynamic Mode - Path-Based Instance Routing

**S6 Chromium Grid v1.6.0+**

Dynamic Mode enables on-demand browser instance provisioning with path-based routing. Connect to `ws://host:port/project-name/` and instances are automatically created, managed, and cleaned up.

## 🎯 Overview

### What is Dynamic Mode?

Traditional (Static) Mode:
```
ws://10.10.1.2:19222  → Instance 1 (always running)
ws://10.10.1.2:19223  → Instance 2 (always running)
ws://10.10.1.2:19224  → Instance 3 (always running)
```

Dynamic Mode:
```
ws://10.10.1.2:19222/ecommerce-tests/   → Auto-creates "ecommerce-tests" instance
ws://10.10.1.2:19222/payment-system/    → Auto-creates "payment-system" instance
ws://10.10.1.2:19222/user-dashboard/    → Auto-creates "user-dashboard" instance
```

### Key Features

- **Single Gateway Port** - All connections go through one WebSocket endpoint
- **Auto-Provisioning** - Instances created on first connection
- **Project Isolation** - Each project gets dedicated Chrome instance with isolated data directory
- **Auto-Cleanup** - Idle instances stopped after configurable timeout (default: 30 minutes)
- **Resource Limits** - Maximum concurrent instances (default: 20)
- **State Persistence** - Instance registry persists across container restarts

## 🚀 Quick Start

### Enable Dynamic Mode

**Docker Run:**
```bash
docker run -d \
  --name s6-chromium-grid \
  --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_ADMIN \
  --shm-size=2g \
  -p 18080:8080 \
  -p 19222:9222 \
  -e DYNAMIC_MODE=true \
  -e MAX_DYNAMIC_INSTANCES=20 \
  -e INSTANCE_TIMEOUT_MINUTES=30 \
  -e CDP_GATEWAY_PORT=9222 \
  -e EXTERNAL_PORT_PREFIX=1 \
  ghcr.io/s6securitylabs/s6-chromium-grid:latest
```

**Docker Compose:**
```yaml
services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:latest
    environment:
      - DYNAMIC_MODE=true
      - MAX_DYNAMIC_INSTANCES=20
      - INSTANCE_TIMEOUT_MINUTES=30
      - CDP_GATEWAY_PORT=9222
      - EXTERNAL_PORT_PREFIX=1
    ports:
      - "18080:8080"
      - "19222:9222"
```

### Connect from Playwright

```typescript
import { chromium } from 'playwright';

const projectName = 'my-ecommerce-tests';
const endpoint = `ws://10.10.1.2:19222/${projectName}/`;

const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto('https://example.com');
await page.screenshot({ path: 'screenshot.png' });

await browser.close();
```

**On first connection:**
1. Gateway receives connection to `/my-ecommerce-tests/`
2. No instance exists → creates new Chrome instance
3. Waits ~2 seconds for Chrome to start
4. Routes WebSocket traffic to new instance
5. Instance ready!

**On subsequent connections:**
- Existing instance reused immediately
- No startup delay
- Activity timestamp updated (resets idle timer)

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DYNAMIC_MODE` | `false` | Enable dynamic mode (`true`/`false`) |
| `MAX_DYNAMIC_INSTANCES` | `20` | Maximum concurrent instances |
| `INSTANCE_TIMEOUT_MINUTES` | `30` | Idle timeout before auto-stop |
| `CDP_GATEWAY_PORT` | `9222` | WebSocket gateway port |

### Project Name Rules

Valid project names:
- Lowercase letters, numbers, hyphens only
- Must start and end with letter/number
- 2-50 characters
- Examples: `test-1`, `ecommerce`, `payment-system-v2`

Invalid names:
- `-test` (starts with hyphen)
- `Test` (uppercase)
- `my_project` (underscores)
- `a` (too short)

## 🔧 Instance Lifecycle

### Creation

```
1. Client connects: ws://host:port/project-name/
2. Gateway parses path → "project-name"
3. Check if instance exists
   NO  → Create new instance (Xvfb + Chrome + socat)
   YES → Reuse existing instance
4. Proxy WebSocket traffic bidirectionally
```

**Creation time:** ~2-3 seconds

### Activity Tracking

Every WebSocket message (client → server OR server → client) updates the instance's `lastActivity` timestamp. This prevents active connections from being cleaned up.

### Auto-Cleanup

Cleanup runs every 5 minutes:
```javascript
for each running instance:
  idleTime = now - lastActivity
  if (idleTime > INSTANCE_TIMEOUT_MINUTES):
    stop instance
    keep in registry (can be restarted)
```

Stopped instances remain in registry and can be restarted on next connection.

### Manual Management

**Dashboard UI:**
- View all dynamic instances at `http://host:18080`
- Start/stop/delete instances manually
- Monitor idle time and activity

**API Endpoints:**
```bash
# List all dynamic instances
curl -u admin:changeme http://localhost:18080/api/dynamic/instances

# Start/create instance
curl -X POST -u admin:changeme http://localhost:18080/api/dynamic/instances/my-project/start

# Stop instance
curl -X POST -u admin:changeme http://localhost:18080/api/dynamic/instances/my-project/stop

# Delete instance permanently
curl -X DELETE -u admin:changeme http://localhost:18080/api/dynamic/instances/my-project
```

## 📊 Resource Allocation

### Port Ranges

Dynamic instances use isolated port ranges to avoid conflicts with static mode:

| Resource | Port Range | Example |
|----------|------------|---------|
| CDP Internal | 30000-30999 | 30000, 30001, 30002... |
| Display Numbers | 200-299 | :200, :201, :202... |

### Directory Structure

```
/data/
├── dynamic-ecommerce-tests/     # Chrome user data
├── dynamic-payment-system/      # Chrome user data
├── dynamic-user-dashboard/      # Chrome user data
└── dynamic-instances.json       # Registry file

/var/log/s6-grid/
├── dynamic-ecommerce-tests.log
├── dynamic-payment-system.log
└── dynamic-user-dashboard.log
```

### Memory Usage

- Each Chrome instance: ~300-500 MB RAM
- 20 instances: ~6-10 GB RAM
- Set Docker memory limit accordingly

## 🔍 Monitoring & Debugging

### Dashboard

Navigate to `http://host:18080` to see:
- All dynamic instances
- Status (running/stopped/error)
- Idle time
- Last activity timestamp
- Manual start/stop/delete controls

### Logs

**Container logs:**
```bash
docker logs -f s6-chromium-grid
```

**Instance-specific logs:**
```bash
docker exec s6-chromium-grid tail -f /var/log/s6-grid/dynamic-my-project.log
```

**Gateway logs:**
```
[WSGateway] New connection: /my-project/
[WSGateway] Project: my-project
[WSGateway] Routing my-project -> ws://127.0.0.1:30000
[DynamicManager] ✓ Instance created: my-project (CDP: 30000, PID: 1234)
```

### Common Issues

**"Maximum instances reached"**
- Increase `MAX_DYNAMIC_INSTANCES`
- Stop idle instances manually
- Reduce `INSTANCE_TIMEOUT_MINUTES` for faster cleanup

**"Invalid path format"**
- Check project name follows rules (lowercase, alphanumeric, hyphens)
- Ensure path starts with `/` and project name

**Instance creation fails**
- Check container resources (RAM, CPU)
- Review instance log: `/var/log/s6-grid/dynamic-PROJECT.log`
- Verify `shm-size` is adequate (2GB minimum)

## 🆚 Dynamic vs Static Mode

| Feature | Static Mode | Dynamic Mode |
|---------|-------------|--------------|
| **Instances** | Fixed count at startup | Created on-demand |
| **Ports** | One port per instance | Single gateway port |
| **URL Pattern** | `ws://host:9222` | `ws://host:9222/project/` |
| **Resource Usage** | All instances always running | Only active instances running |
| **Max Instances** | Limited by port mappings | Configurable (default: 20) |
| **Startup Time** | All start at boot (~30s) | Per-instance (~2s) |
| **Cleanup** | Manual | Automatic (idle timeout) |
| **Use Case** | Fixed workloads, CI/CD | Dynamic projects, multi-tenant |

## 💡 Use Cases

### Multi-Project Testing

```typescript
const projects = ['web-app', 'mobile-app', 'admin-panel'];

for (const project of projects) {
  const browser = await chromium.connectOverCDP(`ws://10.10.1.2:19222/${project}/`);
  
  await runTests(browser, project);
  await browser.close();
}
```

Each project gets isolated Chrome instance with separate:
- Cookies
- LocalStorage
- Cache
- Browser history

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  test:
    strategy:
      matrix:
        project: [frontend, backend, integration]
    
    steps:
      - name: Run tests
        env:
          CDP_URL: ws://s6-grid:9222/${{ matrix.project }}/
        run: npm test
```

### Multi-Tenant SaaS

```typescript
app.post('/api/tenants/:tenantId/test', async (req, res) => {
  const tenantId = req.params.tenantId;
  const endpoint = `ws://10.10.1.2:19222/tenant-${tenantId}/`;
  
  const browser = await chromium.connectOverCDP(endpoint);
  
  res.json({ endpoint, browser: 'ready' });
});
```

## 🔄 Migration from Static Mode

**Before (Static):**
```typescript
const endpoints = [
  'ws://10.10.1.2:19222',
  'ws://10.10.1.2:19223',
  'ws://10.10.1.2:19224',
];

const browser = await chromium.connectOverCDP(endpoints[0]);
```

**After (Dynamic):**
```typescript
const projectName = 'my-tests';
const endpoint = `ws://10.10.1.2:19222/${projectName}/`;

const browser = await chromium.connectOverCDP(endpoint);
```

**Benefits:**
- No manual port management
- Auto-scaling (up to `MAX_DYNAMIC_INSTANCES`)
- Better resource utilization (idle instances stopped)
- Project-based organization

## 🚨 Production Considerations

### Security

- **Authentication:** Dashboard requires basic auth (set `DASHBOARD_USER` / `DASHBOARD_PASS`)
- **Network:** Restrict CDP gateway port access via firewall/security groups
- **Isolation:** Each instance runs as `chrome` user with sandboxing

### High Availability

- **Health Checks:** Dashboard exposes `/api/health` endpoint
- **Restart Policy:** Use `restart: unless-stopped` in Docker Compose
- **Monitoring:** Track instance count and idle time via dashboard API

### Performance

- **Connection Pooling:** WebSocket connections reused within same project
- **Resource Limits:** Set Docker memory/CPU limits
- **Cleanup Frequency:** Adjust `INSTANCE_TIMEOUT_MINUTES` based on workload

## 📚 API Reference

### GET /api/dynamic/instances

List all dynamic instances.

**Response:**
```json
{
  "mode": "dynamic",
  "instances": [
    {
      "projectName": "ecommerce-tests",
      "status": "running",
      "cdpPort": 30000,
      "pid": 1234,
      "created": 1704844800000,
      "lastActivity": 1704845400000,
      "idleMinutes": 5
    }
  ],
  "maxInstances": 20,
  "activeCount": 1
}
```

### POST /api/dynamic/instances/:projectName/start

Create or start an instance.

**Response:**
```json
{
  "success": true,
  "instance": {
    "projectName": "my-project",
    "cdpPort": 30001,
    "status": "running"
  }
}
```

### POST /api/dynamic/instances/:projectName/stop

Stop a running instance (keeps in registry).

### DELETE /api/dynamic/instances/:projectName

Permanently delete an instance (removes data directory).

---

## 🎉 Summary

Dynamic Mode transforms S6 Chromium Grid from a static instance pool into an on-demand provisioning system:

✅ **Single URL pattern:** `ws://host:port/project-name/`  
✅ **Auto-provisioning:** Instances created on first connection  
✅ **Auto-cleanup:** Idle instances stopped after timeout  
✅ **Resource efficient:** Only active instances consume resources  
✅ **Scalable:** Up to 20+ concurrent projects  

Perfect for:
- Multi-project test suites
- CI/CD pipelines with parallel jobs
- Multi-tenant SaaS applications
- Development environments with many projects

Questions? Open an issue: https://github.com/s6securitylabs/s6-chromium-grid/issues
