# S6 Chromium Grid - TrueNAS Scale Deployment

Deploy S6 Chromium Grid as a custom app on TrueNAS Scale.

---

## Quick Start

**Image:** `ghcr.io/s6securitylabs/s6-chromium-grid:latest`

---

## TrueNAS Custom App Configuration

### General
| Field | Value |
|-------|-------|
| Application Name | `s6-chromium-grid` |
| Version | (leave default) |

### Image Configuration
| Field | Value |
|-------|-------|
| Repository | `ghcr.io/s6securitylabs/s6-chromium-grid` |
| Tag | `latest` or `1.0.0` (versioned recommended) |
| Pull Policy | `Always` (to get updates) |

### Container Configuration
| Field | Value |
|-------|-------|
| Timezone | `Australia/Adelaide` (or your timezone) |
| Restart Policy | `Unless Stopped` |
| TTY | Enabled |
| Stdin | Enabled |

#### Environment Variables

| Name | Value | Description |
|------|-------|-------------|
| `INSTANCE_COUNT` | `5` | Number of browsers (1-10+) |
| `ENABLE_VNC` | `true` | Enable VNC viewing |
| `USE_GPU` | `true` | Intel iGPU acceleration |
| `SCREEN_WIDTH` | `1920` | Browser width |
| `SCREEN_HEIGHT` | `1080` | Browser height |
| `DASHBOARD_PORT` | `8080` | Web UI port |
| `DASHBOARD_USER` | `admin` | Login username |
| `DASHBOARD_PASS` | `your-secure-password` | Login password |
| `LANG` | `en_US.UTF-8` | Locale |

### Security Context Configuration
| Field | Value |
|-------|-------|
| Privileged | Enabled |

Or use capabilities (more secure):
- `NET_ADMIN`
- `NET_RAW`
- `SYS_ADMIN`

### Network Configuration

#### Ports

**Standard ports:**
| Host Port | Container Port | Protocol | Description |
|-----------|----------------|----------|-------------|
| `8080` | `8080` | TCP | Dashboard |
| `9222` | `9222` | TCP | CDP Instance 1 |
| `9223` | `9223` | TCP | CDP Instance 2 |
| `9224` | `9224` | TCP | CDP Instance 3 |
| `9225` | `9225` | TCP | CDP Instance 4 |
| `9226` | `9226` | TCP | CDP Instance 5 |
| `5900` | `5900` | TCP | VNC Instance 1 |
| `5901` | `5901` | TCP | VNC Instance 2 |
| `5902` | `5902` | TCP | VNC Instance 3 |
| `5903` | `5903` | TCP | VNC Instance 4 |
| `5904` | `5904` | TCP | VNC Instance 5 |
| `6080` | `6080` | TCP | noVNC WebSocket 1 |
| `6081` | `6081` | TCP | noVNC WebSocket 2 |
| `6082` | `6082` | TCP | noVNC WebSocket 3 |
| `6083` | `6083` | TCP | noVNC WebSocket 4 |
| `6084` | `6084` | TCP | noVNC WebSocket 5 |

**If port 5900 conflicts with VM VNC**, use prefixed ports:
| Host Port | Container Port |
|-----------|----------------|
| `18080` | `8080` |
| `19222-19226` | `9222-9226` |
| `15900-15904` | `5900-5904` |
| `16080-16084` | `6080-6084` |

### Storage Configuration

| Type | Host Path | Mount Path |
|------|-----------|------------|
| Host Path | `/mnt/pool/apps/chromium-data` | `/data` |

Create first:
```bash
mkdir -p /mnt/pool/apps/chromium-data
```

### Resources Configuration
| Field | Value |
|-------|-------|
| Enable Resource Limits | Enabled |
| CPU | `4` |
| Memory | `6144` MiB |

### GPU Configuration
| Field | Value |
|-------|-------|
| Passthrough available (non-NVIDIA) GPUs | Enabled |

Set `USE_GPU=true` in environment variables.

---

## Updating to New Versions

### Method 1: Pull Policy "Always" + Restart
If using `:latest` tag with Pull Policy = `Always`:
1. Stop the app
2. Start the app (will pull latest image)

### Method 2: Version Tags (Recommended)
1. Check releases at [GHCR](https://github.com/s6securitylabs/s6-chromium-grid/pkgs/container/s6-chromium-grid)
2. Edit app, change tag from `:1.0.0` to `:1.1.0`
3. Save and restart

### Method 3: Manual Pull via SSH
```bash
sudo k3s crictl pull ghcr.io/s6securitylabs/s6-chromium-grid:latest
```
Then restart the app.

---

## After Deployment

### Access Dashboard
```
http://TRUENAS_IP:8080
Username: admin
Password: (what you set)
```

### Dashboard Features
- Real-time status of all browser instances
- Live VNC view (click "View Browser")
- Multi-view grid (click "View All" or press `M`)
- Copy CDP endpoint URLs
- Pop-out VNC to new window

### Playwright Connection
```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('ws://TRUENAS_IP:9222');
const page = await browser.newPage();
await page.goto('https://example.com');
```

---

## Scaling

To change instance count:
1. Stop the app
2. Edit `INSTANCE_COUNT` environment variable
3. Add/remove port mappings:
   - 6 instances: add 9227, 5905, 6085
   - 7 instances: add 9227-9228, 5905-5906, 6085-6086
4. Start the app

---

## Troubleshooting

### Check Logs
Apps → s6-chromium-grid → Logs

### Test CDP
```bash
curl http://TRUENAS_IP:9222/json/version
```

### Direct VNC Test
```bash
vncviewer TRUENAS_IP:5900
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Instances offline | Check logs for Chromium crashes, increase shm_size |
| VNC not connecting | Verify `ENABLE_VNC=true` and ports mapped |
| GPU not working | Check `/dev/dri` passthrough and `USE_GPU=true` |
| Dashboard auth fails | Verify `DASHBOARD_USER` and `DASHBOARD_PASS` env vars |
