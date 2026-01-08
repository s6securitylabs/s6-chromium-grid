# S6 Chromium Grid - Product Requirements Document

## Overview

**Product Name:** S6 Chromium Grid  
**Version:** 1.0.0  
**Last Updated:** 2026-01-08  
**Status:** Production Ready  
**Repository:** github.com/s6securitylabs/s6-chromium-grid  
**Container Registry:** ghcr.io/s6securitylabs/s6-chromium-grid

### Executive Summary

S6 Chromium Grid is a Docker-based multi-instance headless Chromium environment designed for browser automation, testing, and web scraping. It provides multiple isolated browser instances accessible via Chrome DevTools Protocol (CDP), with optional VNC viewing for debugging and monitoring.

### Problem Statement

Browser automation at scale requires:
- Multiple isolated browser instances running concurrently
- Remote access via CDP for tools like Playwright, Puppeteer, Selenium
- Visual debugging capability without local display
- Easy deployment on home servers (TrueNAS, Unraid, etc.)
- GPU acceleration for WebGL/Canvas-heavy applications

Existing solutions (Selenium Grid, Browserless) are either complex to deploy, expensive, or lack visual monitoring.

### Solution

A single Docker container running N configurable Chromium instances, each with:
- Dedicated CDP endpoint for automation
- Optional VNC server for visual monitoring
- WebSocket proxy for browser-based VNC viewing
- Unified web dashboard for management and control

---

## Target Users

| User Type | Use Case |
|-----------|----------|
| **QA Engineers** | Parallel browser testing across multiple instances |
| **Developers** | Local/remote browser automation development |
| **DevOps** | CI/CD pipeline browser testing |
| **Home Lab Users** | Self-hosted browser automation on TrueNAS/Unraid |
| **Web Scrapers** | Concurrent scraping with isolated browser contexts |

---

## Functional Requirements

### FR-1: Multi-Instance Browser Management

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-1.1 | Run N configurable Chromium instances (default: 5) | P0 | Done |
| FR-1.2 | Each instance runs in isolated Xvfb display | P0 | Done |
| FR-1.3 | Instances auto-restart on crash (via websockify) | P1 | Done |
| FR-1.4 | Configurable screen resolution per container | P1 | Done |
| FR-1.5 | Start/stop/restart individual instances via API | P1 | Done |

### FR-2: CDP (Chrome DevTools Protocol) Access

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-2.1 | Each instance exposes CDP on unique port (9222 + N) | P0 | Done |
| FR-2.2 | CDP accessible from configured allowed IPs | P0 | Done |
| FR-2.3 | Support Playwright, Puppeteer, Selenium CDP connections | P0 | Done |
| FR-2.4 | WebSocket CDP endpoint for remote debugging | P0 | Done |

### FR-3: VNC Visual Access

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-3.1 | Optional VNC server per instance (5900 + N) | P0 | Done |
| FR-3.2 | noVNC web-based viewer integration (v1.4.0) | P0 | Done |
| FR-3.3 | WebSocket proxy for browser-based VNC (6080 + N) | P0 | Done |
| FR-3.4 | Multi-view dashboard showing all instances | P1 | Done |
| FR-3.5 | Pop-out individual VNC to new window | P2 | Done |
| FR-3.6 | Inline VNC preview thumbnails in dashboard cards | P1 | Done |

### FR-4: Web Dashboard

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-4.1 | Single-page dashboard at port 8080 | P0 | Done |
| FR-4.2 | Basic authentication (username/password) | P0 | Done |
| FR-4.3 | Real-time instance status (running/offline) | P0 | Done |
| FR-4.4 | Display CDP and VNC ports per instance | P0 | Done |
| FR-4.5 | Copy CDP endpoint to clipboard | P1 | Done |
| FR-4.6 | Embedded VNC viewer per instance | P1 | Done |
| FR-4.7 | "View All" multi-instance grid view | P1 | Done |
| FR-4.8 | Keyboard shortcuts (M: multi-view, ESC: close) | P2 | Done |
| FR-4.9 | Start/Stop/Restart buttons per instance | P1 | Done |
| FR-4.10 | Toast notifications for actions | P2 | Done |
| FR-4.11 | Auto-refresh status every 10 seconds | P1 | Done |

### FR-5: GPU Acceleration

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-5.1 | Intel iGPU support via VA-API | P1 | Done |
| FR-5.2 | SwiftShader CPU fallback for WebGL | P1 | Done |
| FR-5.3 | Configurable GPU enable/disable | P1 | Done |

### FR-6: API Endpoints

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-6.1 | GET /api/status - All instances status | P0 | Done |
| FR-6.2 | GET /api/health - Health check | P1 | Done |
| FR-6.3 | POST /api/instance/:id/start - Start instance | P1 | Done |
| FR-6.4 | POST /api/instance/:id/stop - Stop instance | P1 | Done |
| FR-6.5 | POST /api/instance/:id/restart - Restart instance | P1 | Done |
| FR-6.6 | GET /api/instance/:id/pages - List browser pages | P2 | Done |

---

## Non-Functional Requirements

### NFR-1: Security

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| NFR-1.1 | IP allowlist for all services (iptables) | P0 | Done |
| NFR-1.2 | Basic auth on dashboard | P0 | Done |
| NFR-1.3 | Run browser as non-root user (chrome) | P0 | Done |
| NFR-1.4 | Minimal container privileges | P1 | Done |
| NFR-1.5 | No secrets in image (env vars only) | P0 | Done |

### NFR-2: Performance

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| NFR-2.1 | < 500MB RAM per idle instance | P1 | Done |
| NFR-2.2 | < 5s instance startup time | P1 | Done |
| NFR-2.3 | Support 10+ concurrent instances | P2 | Untested |

### NFR-3: Reliability

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| NFR-3.1 | Auto-restart crashed websockify proxies | P0 | Done |
| NFR-3.2 | Graceful shutdown on SIGTERM | P1 | Done |
| NFR-3.3 | Health check endpoint (/api/health) | P1 | Done |
| NFR-3.4 | VNC reconnect on connection loss | P1 | Done |

### NFR-4: Compatibility

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| NFR-4.1 | TrueNAS Scale custom app deployment | P0 | Done |
| NFR-4.2 | Docker Compose deployment | P0 | Done |
| NFR-4.3 | Unraid Community Apps | P2 | Planned |
| NFR-4.4 | Kubernetes/Helm chart | P3 | Planned |

### NFR-5: DevOps

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| NFR-5.1 | GitHub Actions CI/CD pipeline | P0 | Done |
| NFR-5.2 | Automatic GHCR publishing on push | P0 | Done |
| NFR-5.3 | Semantic versioning with git tags | P0 | Done |
| NFR-5.4 | Multi-tag image publishing | P1 | Done |

---

## Architecture

### Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     S6 Chromium Grid Container                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Dashboard (Node.js)                    │   │
│  │                      Port 8080                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │   │
│  │  │  noVNC WS   │  │  noVNC WS   │  │  noVNC WS   │  ...  │   │
│  │  │  Port 6080  │  │  Port 6081  │  │  Port 6082  │       │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │ Instance 1 │  │ Instance 2 │  │ Instance 3 │  ...            │
│  ├────────────┤  ├────────────┤  ├────────────┤                 │
│  │ Xvfb :100  │  │ Xvfb :101  │  │ Xvfb :102  │                 │
│  │ Fluxbox    │  │ Fluxbox    │  │ Fluxbox    │                 │
│  │ Chromium   │  │ Chromium   │  │ Chromium   │                 │
│  │ CDP: 9222  │  │ CDP: 9223  │  │ CDP: 9224  │                 │
│  │ VNC: 5900  │  │ VNC: 5901  │  │ VNC: 5902  │                 │
│  └────────────┘  └────────────┘  └────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### Port Mapping

| Service | Internal Port Range | Description |
|---------|---------------------|-------------|
| Dashboard | 8080 | Web UI with VNC viewers and controls |
| CDP | 9222-922X | Chrome DevTools Protocol endpoints |
| VNC | 5900-590X | Direct VNC server connections |
| noVNC WS | 6080-608X | WebSocket proxy for browser-based VNC |

Where X = INSTANCE_COUNT - 1

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Base Image | Debian Bookworm Slim | Latest |
| Browser | Chromium | Latest (apt) |
| Display Server | Xvfb | - |
| Window Manager | Fluxbox | - |
| VNC Server | x11vnc | - |
| VNC Web Client | noVNC | 1.4.0 |
| WebSocket Proxy | python3-websockify | - |
| Dashboard Server | Node.js + Express | 18.x |
| Process Manager | dumb-init | - |

---

## CI/CD Pipeline

### GitHub Actions Workflow

Located at `.github/workflows/build-push.yml`

#### Triggers

| Event | Action |
|-------|--------|
| Push to `main` | Build and push `:latest`, `:main` tags |
| Push tag `v*` | Build and push versioned tags (`:1.0.0`, `:1.0`, `:1`) |
| Pull request to `main` | Build only (no push) - validation |

#### Pipeline Steps

1. **Checkout** - Clone repository
2. **Setup QEMU** - Multi-platform support
3. **Setup Docker Buildx** - Advanced build features
4. **Login to GHCR** - Authenticate with GitHub Container Registry
5. **Extract metadata** - Generate tags and labels
6. **Build and push** - Build image and push to GHCR

#### Image Tags Generated

| Tag Pattern | Example | When |
|-------------|---------|------|
| `:latest` | `:latest` | Every push to main |
| `:main` | `:main` | Every push to main |
| `:{version}` | `:1.0.0` | Tag push (v1.0.0) |
| `:{major}.{minor}` | `:1.0` | Tag push (v1.0.0) |
| `:{major}` | `:1` | Tag push (v1.0.0) |

#### Secrets Required

| Secret | Source | Purpose |
|--------|--------|---------|
| `GITHUB_TOKEN` | Automatic | GHCR authentication |

No manual secrets configuration required.

### Releasing New Versions

```bash
# 1. Commit changes
git add -A && git commit -m "feat: add new feature"
git push

# 2. Create and push tag
git tag v1.0.0
git push origin v1.0.0

# 3. GitHub Actions automatically:
#    - Builds the image
#    - Pushes to ghcr.io/s6securitylabs/s6-chromium-grid:1.0.0
#    - Also pushes :1.0, :1, and :latest tags
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INSTANCE_COUNT` | 5 | Number of browser instances |
| `ENABLE_VNC` | true | Enable VNC servers |
| `USE_GPU` | false | Enable GPU acceleration |
| `SCREEN_WIDTH` | 1920 | Browser viewport width |
| `SCREEN_HEIGHT` | 1080 | Browser viewport height |
| `SCREEN_DEPTH` | 24 | Color depth |
| `DASHBOARD_PORT` | 8080 | Dashboard web server port |
| `DASHBOARD_USER` | admin | Basic auth username |
| `DASHBOARD_PASS` | admin | Basic auth password |
| `ALLOWED_IPS` | 127.0.0.1,10.10.1.2-10.10.1.9 | IP allowlist |
| `LANG` | en_US.UTF-8 | Locale |
| `TZ` | UTC | Timezone |

### Required Capabilities

For unprivileged container operation:
- `NET_ADMIN` - iptables for IP filtering
- `NET_RAW` - Network access
- `SYS_ADMIN` - Chrome sandbox (or use --no-sandbox)

---

## Deployment

### Docker Compose

```yaml
services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:latest
    container_name: s6-chromium-grid
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    shm_size: '2gb'
    environment:
      - INSTANCE_COUNT=5
      - ENABLE_VNC=true
      - USE_GPU=true
      - DASHBOARD_USER=admin
      - DASHBOARD_PASS=secure-password
    ports:
      - "8080:8080"
      - "9222-9226:9222-9226"
      - "5900-5904:5900-5904"
      - "6080-6084:6080-6084"
    devices:
      - /dev/dri:/dev/dri
    volumes:
      - chromium-data:/data
    restart: unless-stopped

volumes:
  chromium-data:
```

### TrueNAS Scale

See [TRUENAS-CUSTOM-APP.md](./TRUENAS-CUSTOM-APP.md) for detailed setup instructions.

### Updating Container on TrueNAS

| Method | Steps |
|--------|-------|
| **Pull Policy "Always"** | Stop app → Start app (pulls latest) |
| **Version tags** | Edit app → change tag `:1.0.0` to `:1.1.0` → Save |
| **Manual pull** | SSH: `sudo k3s crictl pull ghcr.io/s6securitylabs/s6-chromium-grid:latest` |

---

## API Reference

### GET /api/status

Returns status of all instances.

**Response:**
```json
{
  "total": 5,
  "running": 5,
  "instances": [
    {
      "id": 1,
      "status": "running",
      "cdpPort": 9222,
      "vncPort": 5900,
      "wsPort": 6080,
      "browser": "Chrome/120.0.6099.129",
      "vncConnected": true
    }
  ]
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-08T00:00:00.000Z"
}
```

### POST /api/instance/:id/restart

Restart a specific instance.

**Response:**
```json
{
  "success": true,
  "instance": { ... }
}
```

### POST /api/instance/:id/stop

Stop a specific instance.

### GET /api/instance/:id/pages

List open pages in browser instance.

---

## Versioning Strategy

### Semantic Versioning

Format: `MAJOR.MINOR.PATCH`

| Version Change | When |
|----------------|------|
| MAJOR (1.0.0 → 2.0.0) | Breaking changes, architecture overhaul |
| MINOR (1.0.0 → 1.1.0) | New features, backward compatible |
| PATCH (1.0.0 → 1.0.1) | Bug fixes, security patches |

### Image Tags

| Tag | Description |
|-----|-------------|
| `:latest` | Latest stable release |
| `:1.0.0` | Specific version (recommended for production) |
| `:1.0` | Latest patch for minor version |
| `:1` | Latest minor for major version |
| `:main` | Latest from main branch (unstable) |

---

## Roadmap

### v1.0.0 (Current)
- [x] Multi-instance Chromium with CDP
- [x] VNC + noVNC integration (v1.4.0)
- [x] Web dashboard with auth
- [x] Multi-view grid display
- [x] Inline VNC preview thumbnails
- [x] Instance start/stop/restart controls
- [x] Health check endpoint
- [x] GitHub Actions CI/CD
- [x] TrueNAS deployment guide

### v1.1.0 (Planned)
- [ ] Prometheus metrics endpoint (/metrics)
- [ ] Browser profile persistence options
- [ ] Custom Chrome flags per instance
- [ ] Screenshot API

### v1.2.0 (Planned)
- [ ] Session recording (video)
- [ ] Browser extension pre-installation
- [ ] Resource usage monitoring in dashboard
- [ ] Instance memory/CPU limits

### v2.0.0 (Future)
- [ ] Kubernetes Helm chart
- [ ] Auto-scaling based on demand
- [ ] Multi-node clustering
- [ ] Firefox/WebKit support

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Container startup time | < 30s for 5 instances | Time from `docker run` to all instances ready |
| Memory usage | < 500MB per idle instance | `docker stats` |
| CDP response time | < 100ms | Playwright connection latency |
| Dashboard load time | < 2s | Browser dev tools |
| Uptime | 99.9% | Monitoring |

---

## Appendix

### A. Playwright Connection Example

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('ws://your-server:9222');
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://example.com');
await page.screenshot({ path: 'screenshot.png' });
await browser.close();
```

### B. Puppeteer Connection Example

```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://your-server:9222'
});
const page = await browser.newPage();
await page.goto('https://example.com');
await browser.close();
```

### C. Security Considerations

1. **Never expose to public internet** without VPN/firewall
2. **Change default credentials** before deployment
3. **Use specific version tags** in production (not `:latest`)
4. **Restrict IP allowlist** to only necessary clients
5. **Monitor for resource abuse** (crypto mining, etc.)

### D. File Structure

```
s6-chromium-grid/
├── .github/
│   └── workflows/
│       └── build-push.yml      # CI/CD pipeline
├── dashboard/
│   ├── public/
│   │   └── index.html          # Dashboard UI
│   ├── server.js               # Express server
│   └── package.json
├── Dockerfile                  # Container build
├── docker-compose.yml          # Local development
├── entrypoint.sh              # Container startup
├── master_prd.md              # This document
├── README.md                  # Quick start guide
└── TRUENAS-CUSTOM-APP.md      # TrueNAS deployment
```
