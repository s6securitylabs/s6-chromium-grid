# S6 Chromium Grid

[![Build and Push](https://github.com/s6securitylabs/s6-chromium-grid/actions/workflows/build-push.yml/badge.svg)](https://github.com/s6securitylabs/s6-chromium-grid/actions/workflows/build-push.yml)
[![GHCR](https://img.shields.io/badge/GHCR-s6--chromium--grid-blue?logo=github)](https://github.com/s6securitylabs/s6-chromium-grid/pkgs/container/s6-chromium-grid)

Multi-instance headless Chromium environment for browser automation, testing, and web scraping. Run multiple isolated browser instances with CDP access and optional VNC monitoring in a single container.

## Features

- **Multiple Browser Instances** - Run 1-10+ isolated Chromium instances
- **CDP Access** - Connect via Playwright, Puppeteer, or Selenium
- **VNC Monitoring** - Visual debugging via noVNC web viewer
- **Multi-View Dashboard** - See all browser instances simultaneously
- **GPU Acceleration** - Intel iGPU support via VA-API
- **TrueNAS Ready** - Easy deployment on TrueNAS Scale

## Quick Start

```bash
docker run -d \
  --name s6-chromium-grid \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  --cap-add SYS_ADMIN \
  --shm-size=2g \
  -p 8080:8080 \
  -p 9222-9226:9222-9226 \
  -e INSTANCE_COUNT=5 \
  -e DASHBOARD_USER=admin \
  -e DASHBOARD_PASS=changeme \
  ghcr.io/s6securitylabs/s6-chromium-grid:latest
```

Access the dashboard at `http://localhost:8080`

## Docker Compose

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
      - DASHBOARD_USER=admin
      - DASHBOARD_PASS=changeme
    ports:
      - "8080:8080"        # Dashboard
      - "9222-9226:9222-9226"  # CDP endpoints
      - "5900-5904:5900-5904"  # VNC (optional)
      - "6080-6084:6080-6084"  # noVNC WebSocket
    restart: unless-stopped
```

## Connecting with Playwright

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('ws://localhost:9222');
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://example.com');
await page.screenshot({ path: 'screenshot.png' });
await browser.close();
```

## Connecting with Puppeteer

```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://localhost:9222'
});
const page = await browser.newPage();
await page.goto('https://example.com');
await browser.close();
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INSTANCE_COUNT` | 5 | Number of browser instances (1-10+) |
| `ENABLE_VNC` | true | Enable VNC servers for visual access |
| `USE_GPU` | false | Enable GPU acceleration (Intel iGPU) |
| `SCREEN_WIDTH` | 1920 | Browser viewport width |
| `SCREEN_HEIGHT` | 1080 | Browser viewport height |
| `DASHBOARD_PORT` | 8080 | Dashboard web server port |
| `DASHBOARD_USER` | admin | Dashboard username |
| `DASHBOARD_PASS` | admin | Dashboard password |
| `TZ` | UTC | Timezone |

## Port Reference

| Service | Port Range | Description |
|---------|------------|-------------|
| Dashboard | 8080 | Web UI with status and VNC viewers |
| CDP | 9222-922X | Chrome DevTools Protocol endpoints |
| VNC | 5900-590X | Direct VNC connections |
| noVNC WS | 6080-608X | WebSocket for browser-based VNC |

Where X = INSTANCE_COUNT - 1

## Dashboard Features

- **Instance Status** - Real-time running/offline indicators
- **Copy CDP URL** - One-click copy of WebSocket endpoint
- **View Browser** - Embedded noVNC viewer per instance
- **View All** - Multi-instance grid view (press `M`)
- **Pop Out** - Open VNC in separate window

## TrueNAS Scale

See [TRUENAS-CUSTOM-APP.md](./TRUENAS-CUSTOM-APP.md) for detailed deployment instructions.

## GPU Acceleration

For Intel iGPU acceleration, add device passthrough:

```yaml
devices:
  - /dev/dri:/dev/dri
environment:
  - USE_GPU=true
```

## Security Notes

1. **Change default credentials** before deployment
2. **Never expose directly to internet** - use VPN or firewall
3. **Use versioned tags** in production (`:1.0.0` not `:latest`)

## Versioning

We use semantic versioning. Available tags:

- `:latest` - Latest stable release (currently 1.3.0)
- `:1.3.0` - Specific version (recommended)
- `:1.3` - Latest patch for v1.3.x
- `:1` - Latest minor for v1.x.x
- `:main` - Latest from main branch (unstable)

## License

MIT

## Contributing

Issues and PRs welcome at [github.com/s6securitylabs/s6-chromium-grid](https://github.com/s6securitylabs/s6-chromium-grid)
