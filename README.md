# S6 Chromium Grid

[![Build and Push](https://github.com/s6securitylabs/s6-chromium-grid/actions/workflows/build-push.yml/badge.svg)](https://github.com/s6securitylabs/s6-chromium-grid/actions/workflows/build-push.yml)
[![GHCR](https://img.shields.io/badge/GHCR-s6--chromium--grid-blue?logo=github)](https://github.com/s6securitylabs/s6-chromium-grid/pkgs/container/s6-chromium-grid)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.0--beta5-orange.svg)](https://github.com/s6securitylabs/s6-chromium-grid/releases)

**Production-ready multi-instance headless Chromium environment for browser automation, E2E testing, and web scraping.**

Run multiple isolated Chromium browser instances with Chrome DevTools Protocol (CDP) access, real-time VNC monitoring, and a powerful web dashboard - all in a single Docker container.

Perfect for parallel test execution, distributed web scraping, browser automation farms, and CI/CD pipelines.

## ✨ Features

### Core Capabilities
- 🚀 **Multiple Browser Instances** - Run 1-10+ isolated Chromium instances in parallel
- 🎯 **Dynamic Mode** - NEW! Path-based routing with on-demand instance provisioning (`ws://host:port/project-name/`)
- 🔌 **CDP Access** - Full Chrome DevTools Protocol support for Playwright, Puppeteer, and Selenium
- 📺 **VNC Monitoring** - Real-time visual debugging via noVNC web viewer
- 🎯 **Multi-View Dashboard** - Monitor all browser instances simultaneously with live metrics
- ⚡ **GPU Acceleration** - Intel iGPU hardware acceleration support via VA-API
- 🤖 **AI-Powered Automation** - Customizable AI prompt templates with dynamic placeholder replacement

### Dashboard Features (v1.4.8)
- ✅ Real-time instance status monitoring (running/offline)
- 📋 One-click CDP endpoint copying with custom host support
- 🎬 Screen recording with H.264 encoding and configurable quality
- 🖼️ Instant screenshot capture for all instances
- 🔄 Auto-refresh metrics with customizable intervals
- 🤖 AI prompt generator with customizable templates (NEW in v1.4.8)
- 🎨 Accordion-style settings organization for clean UX
- 📊 System metrics: CPU, Memory, Disk usage per instance

### Deployment Options
- 🐳 Docker & Docker Compose ready
- ☸️ Kubernetes compatible
- 🏢 TrueNAS Scale native support
- 💾 Persistent storage for recordings and configurations

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Usage Examples](#-usage-examples)
  - [Playwright](#playwright)
  - [Puppeteer](#puppeteer)
  - [AI Prompt Generator](#ai-prompt-generator-new)
- [Configuration](#-configuration)
- [Dashboard Features](#-dashboard-features)
- [Docker Deployment](#-docker-deployment)
- [Advanced Usage](#-advanced-usage)
- [Security](#-security)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🚀 Quick Start

### Prerequisites
- Docker 20.10+ or Docker Desktop
- 2GB+ available RAM (4GB+ recommended for 5+ instances)
- Linux, macOS, or Windows with WSL2

### Launch in 30 Seconds

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

**Access the dashboard:** `http://localhost:8080` (login: `admin` / `changeme`)

**Connect to browser instance:** `ws://localhost:9222` (instance 1), `ws://localhost:9223` (instance 2), etc.

### Verify Installation

```bash
# Check container status
docker ps | grep s6-chromium-grid

# View logs
docker logs s6-chromium-grid

# Test API endpoint
curl -u admin:changeme http://localhost:8080/api/status
```

### 🎯 NEW: Dynamic Mode (v1.6.0+)

Enable path-based routing for on-demand instance provisioning:

```bash
docker run -d \
  --name s6-chromium-grid \
  --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_ADMIN \
  --shm-size=2g \
  -p 8080:8080 \
  -p 9222:9222 \
  -e DYNAMIC_MODE=true \
  -e MAX_DYNAMIC_INSTANCES=20 \
  ghcr.io/s6securitylabs/s6-chromium-grid:latest
```

**Connect with project-based routing:**
```typescript
const browser = await chromium.connectOverCDP('ws://localhost:9222/my-project/');
```

Instances are automatically created on first connection and cleaned up after 30 minutes of inactivity.

**📖 Full Documentation:** [DYNAMIC-MODE.md](./DYNAMIC-MODE.md)

## 🐳 Docker Deployment

### Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
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
      - DASHBOARD_PASS=${DASHBOARD_PASS:-changeme}
      - TZ=America/New_York
    
    ports:
      - "8080:8080"              # Dashboard
      - "9222-9226:9222-9226"    # CDP endpoints
      - "5900-5904:5900-5904"    # VNC (optional)
      - "6080-6084:6080-6084"    # noVNC WebSocket
    
    volumes:
      - ./recordings:/recordings
      - ./data:/data
    
    restart: unless-stopped
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**Deploy:**

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Docker Run (Standalone)

```bash
docker run -d \
  --name s6-chromium-grid \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  --cap-add SYS_ADMIN \
  --shm-size=2g \
  -p 8080:8080 \
  -p 9222-9226:9222-9226 \
  -p 5900-5904:5900-5904 \
  -p 6080-6084:6080-6084 \
  -e INSTANCE_COUNT=5 \
  -e ENABLE_VNC=true \
  -e DASHBOARD_USER=admin \
  -e DASHBOARD_PASS=changeme \
  -e TZ=America/New_York \
  -v $(pwd)/recordings:/recordings \
  -v $(pwd)/data:/data \
  --restart unless-stopped \
  ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
```

### Docker CLI Management

```bash
# View logs
docker logs -f s6-chromium-grid

# Stop container
docker stop s6-chromium-grid

# Start container
docker start s6-chromium-grid

# Restart container
docker restart s6-chromium-grid

# Remove container
docker rm -f s6-chromium-grid

# Update to latest version
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:latest
docker stop s6-chromium-grid
docker rm s6-chromium-grid
# Then run the docker run command again
```

## 💻 Usage Examples

### Playwright

Connect to any browser instance via Chrome DevTools Protocol:

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('ws://localhost:9222');
const context = browser.contexts()[0]; // Use existing context
const page = await context.newPage();

await page.goto('https://example.com');
await page.screenshot({ path: 'screenshot.png' });

await browser.close();
```

**Parallel execution across multiple instances:**

```typescript
import { chromium } from 'playwright';

const instances = [9222, 9223, 9224, 9225, 9226];
const browsers = await Promise.all(
  instances.map(port => chromium.connectOverCDP(`ws://localhost:${port}`))
);

// Run tests in parallel across all 5 instances
const results = await Promise.all(
  browsers.map(async (browser, index) => {
    const context = browser.contexts()[0];
    const page = await context.newPage();
    await page.goto(`https://example.com/test-${index}`);
    return page.screenshot({ path: `screenshot-${index}.png` });
  })
);

await Promise.all(browsers.map(b => b.close()));
```

### Puppeteer

```javascript
const puppeteer = require('puppeteer-core');

const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://localhost:9222'
});

const page = await browser.newPage();
await page.goto('https://example.com');
const screenshot = await page.screenshot();

await browser.close();
```

### AI Prompt Generator (NEW)

**Generate AI-powered test automation prompts directly from the dashboard:**

1. **Open Dashboard** → Click "⚙️ Settings"
2. **Expand "🤖 AI Prompt Template"** section
3. **Customize your template** with dynamic placeholders:
   - `{ENDPOINT}` - Full WebSocket URL (e.g., `ws://localhost:9222`)
   - `{HOST}` - Hostname only (e.g., `localhost`)
   - `{PORT}` - Port number (e.g., `9222`)
   - `{INSTANCE_ID}` - Instance number (e.g., `1`)

4. **Save** and click "📋 Copy AI Prompt" on any instance

**Example custom template:**

```
Write comprehensive Playwright tests for my e-commerce site:

Connection: {ENDPOINT}
Instance: {INSTANCE_ID}

Test scenarios:
1. User login flow
2. Product search and filtering
3. Add to cart and checkout
4. Payment validation (mock)

Use TypeScript, include error handling, and take screenshots on failure.
```

When you click "Copy AI Prompt" on instance 1, placeholders are auto-replaced:

```
Write comprehensive Playwright tests for my e-commerce site:

Connection: ws://192.168.1.100:9222
Instance: 1

Test scenarios:
[... rest of template with actual values ...]
```

Copy directly to ChatGPT, Claude, or any AI assistant for instant test generation!

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INSTANCE_COUNT` | `5` | Number of browser instances (1-10+) |
| `ENABLE_VNC` | `true` | Enable VNC servers for visual debugging |
| `USE_GPU` | `false` | Enable Intel iGPU hardware acceleration |
| `SCREEN_WIDTH` | `1920` | Browser viewport width (pixels) |
| `SCREEN_HEIGHT` | `1080` | Browser viewport height (pixels) |
| `DASHBOARD_PORT` | `8080` | Dashboard web server port |
| `DASHBOARD_USER` | `admin` | Dashboard authentication username |
| `DASHBOARD_PASS` | `admin` | Dashboard authentication password ⚠️ |
| `EXTERNAL_PORT_PREFIX` | `0` | ⚠️ **DEPRECATED** - Use Docker port mapping instead. Ignored in dynamic mode. |
| `TZ` | `UTC` | Timezone (e.g., `America/New_York`) |

⚠️ **Security Warning:** Always change `DASHBOARD_PASS` in production!

### ~~Port Prefix Configuration~~ (DEPRECATED)

> ⚠️ **DEPRECATED:** `EXTERNAL_PORT_PREFIX` is deprecated and will be removed in v3.0.0.
>
> **Use Docker port mapping instead:**
> ```yaml
> ports:
>   - "19222:9222"  # Map external port 19222 to internal port 9222
>   - "18080:8080"  # Map external port 18080 to internal port 8080
> ```
>
> **Why deprecated:**
> - Docker handles port mapping natively
> - Adds unnecessary complexity
> - Ignored in dynamic mode (recommended mode)
> - Confusing for users
>
> **Migration:** Remove `EXTERNAL_PORT_PREFIX` from your configuration and use Docker's `-p` flag or `ports:` in docker-compose.yml.

### Port Mapping

| Service | Port Range | Protocol | Description |
|---------|------------|----------|-------------|
| **Dashboard** | `8080` | HTTP | Web UI with monitoring and VNC viewers |
| **CDP** | `9222-922X` | WebSocket | Chrome DevTools Protocol endpoints |
| **VNC** | `5900-590X` | TCP | Direct VNC connections (RealVNC, TigerVNC) |
| **noVNC** | `6080-608X` | WebSocket | Browser-based VNC access |

*Where X = `INSTANCE_COUNT - 1`*

**Example:** With `INSTANCE_COUNT=5`:
- Dashboard: `8080`
- CDP: `9222-9226` (5 instances)
- VNC: `5900-5904`
- noVNC WebSocket: `6080-6084`

### Volume Mounts (Optional)

Persist recordings and configurations across container restarts:

```bash
docker run -d \
  -v /path/on/host/recordings:/recordings \
  -v /path/on/host/data:/data \
  ghcr.io/s6securitylabs/s6-chromium-grid:latest
```

| Mount Point | Purpose |
|-------------|---------|
| `/recordings` | Stores screen recordings (H.264 MP4) |
| `/data` | Browser user data directories |
| `/tmp/screenshots` | Temporary screenshot storage |

## 🎛️ Dashboard Features

The web dashboard (`http://localhost:8080`) provides comprehensive control and monitoring:

### Instance Management
- ✅ **Real-time Status** - Live indicators for each browser instance (running/offline)
- 📋 **CDP URL Copy** - One-click copy of WebSocket endpoints with custom host support
- 🖥️ **VNC Viewer** - Embedded noVNC viewer for visual debugging
- 🎬 **Screen Recording** - Start/stop H.264 recording with configurable quality (fps, CRF, resolution)
- 📸 **Instant Screenshots** - Capture current browser state as PNG
- 🔄 **Instance Restart** - Restart individual instances without affecting others

### Multi-Instance Views
- 🎯 **Grid View** - Monitor all instances simultaneously (press `M` key)
- 🪟 **Pop-Out Windows** - Open VNC in separate browser window
- 📊 **Metrics Dashboard** - CPU, Memory, Disk usage per instance

### Settings (⚙️ Menu)
- 🎬 **Recording Settings** - Configure FPS (5-30), quality (CRF 18-28), resolution scaling, max file size
- 🌐 **Custom CDP Host** - Set custom hostname for CDP URLs (useful for remote access)
- 🤖 **AI Prompt Templates** - Customize automation prompt generation with placeholders
- 🎨 **Dashboard Preferences** - Auto-refresh intervals, theme settings

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `M` | Toggle multi-view grid |
| `ESC` | Close active modal |
| `/` | Focus search (if implemented) |

## 🏢 Platform-Specific Guides

### TrueNAS Scale

Full deployment guide available: [TRUENAS-CUSTOM-APP.md](./TRUENAS-CUSTOM-APP.md)

**Quick setup:**
1. Apps → Discover Apps → Custom App
2. Set image: `ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8`
3. Add capabilities: `NET_ADMIN`, `NET_RAW`, `SYS_ADMIN`
4. Configure ports and environment variables
5. Deploy

### Synology NAS

Use Container Manager (Docker) app with Docker Compose configuration.

### Unraid

1. Docker tab → Add Container
2. Use Docker Run command from Quick Start
3. Configure Web UI port mapping
4. Set privileged mode ON

## 📚 Additional Documentation

- [Detailed Docker Guide](./DOCKER.md) - Comprehensive Docker deployment scenarios
- [Changelog](./CHANGELOG.md) - Version history and release notes
- [API Documentation](./API.md) - Dashboard REST API reference
- [TrueNAS Guide](./TRUENAS-CUSTOM-APP.md) - TrueNAS Scale deployment

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

- Check [existing issues](https://github.com/s6securitylabs/s6-chromium-grid/issues) first
- Use issue templates for bugs and features
- Provide detailed reproduction steps
- Include logs and system information

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone repository
git clone https://github.com/s6securitylabs/s6-chromium-grid.git
cd s6-chromium-grid

# Build locally
docker build -t s6-chromium-grid:dev .

# Test locally
docker run -d --name test-grid \
  --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_ADMIN \
  --shm-size=2g -p 8080:8080 -p 9222-9226:9222-9226 \
  s6-chromium-grid:dev
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024-2025 S6 Security Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

## 🙏 Acknowledgments

- [Chromium Project](https://www.chromium.org/) - The browser engine
- [Playwright](https://playwright.dev/) - Inspiration for CDP usage patterns
- [noVNC](https://novnc.com/) - Browser-based VNC client
- [Debian](https://www.debian.org/) - Base image

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/s6securitylabs/s6-chromium-grid/issues)
- **Discussions:** [GitHub Discussions](https://github.com/s6securitylabs/s6-chromium-grid/discussions)
- **Security:** Report via email to security@s6securitylabs.com

## ⭐ Star History

If you find this project useful, please consider giving it a star! It helps others discover the project.

---

**Made with ❤️ by [S6 Security Labs](https://github.com/s6securitylabs)**
