# Docker Deployment Guide

Complete guide for deploying S6 Chromium Grid using Docker.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Docker Run](#docker-run)
- [Docker Compose](#docker-compose)
- [Docker Swarm](#docker-swarm)
- [Configuration](#configuration)
- [Networking](#networking)
- [Storage](#storage)
- [Resource Management](#resource-management)
- [Health Checks](#health-checks)
- [Logging](#logging)
- [Updates & Maintenance](#updates--maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Docker** | 20.10+ | 24.0+ |
| **Docker Compose** | 1.29+ | 2.20+ |
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 4 GB | 8+ GB |
| **Disk Space** | 5 GB | 20+ GB (for recordings) |
| **OS** | Linux, macOS, Windows + WSL2 | Linux (Ubuntu 22.04+) |

### Required Docker Capabilities

The container requires these Linux capabilities:
- `NET_ADMIN` - Network configuration
- `NET_RAW` - Raw socket access
- `SYS_ADMIN` - System administration (required by Chrome sandbox)

### Installing Docker

#### Ubuntu/Debian
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### macOS
```bash
brew install --cask docker
```

#### Windows
Download [Docker Desktop](https://www.docker.com/products/docker-desktop/) and enable WSL2 backend.

## Installation Methods

### 1. Quick Start (Docker Run)

Fastest way to get started:

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
  ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
```

**Verify deployment:**
```bash
docker ps | grep s6-chromium-grid
docker logs s6-chromium-grid
curl -u admin:changeme http://localhost:8080/api/status
```

### 2. Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    container_name: s6-chromium-grid
    hostname: chrome-grid
    
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    
    shm_size: '2gb'
    
    environment:
      INSTANCE_COUNT: 5
      ENABLE_VNC: "true"
      DASHBOARD_USER: admin
      DASHBOARD_PASS: ${DASHBOARD_PASS:-changeme}
      TZ: America/New_York
      SCREEN_WIDTH: 1920
      SCREEN_HEIGHT: 1080
    
    ports:
      - "8080:8080"              # Dashboard
      - "9222-9226:9222-9226"    # CDP endpoints
      - "5900-5904:5900-5904"    # VNC
      - "6080-6084:6080-6084"    # noVNC WebSocket
    
    volumes:
      - ./recordings:/recordings
      - ./data:/data
      - ./screenshots:/tmp/screenshots
    
    restart: unless-stopped
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**Deploy:**
```bash
# Create .env file for secrets
echo "DASHBOARD_PASS=your-secure-password" > .env

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 3. Production Setup with Traefik (Reverse Proxy)

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - --api.insecure=false
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    restart: unless-stopped

  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    shm_size: '2gb'
    environment:
      INSTANCE_COUNT: 10
      ENABLE_VNC: "true"
      DASHBOARD_USER: admin
      DASHBOARD_PASS: ${DASHBOARD_PASS}
      TZ: America/New_York
    volumes:
      - ./recordings:/recordings
      - ./data:/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.chrome-grid.rule=Host(`chrome-grid.yourdomain.com`)"
      - "traefik.http.routers.chrome-grid.entrypoints=websecure"
      - "traefik.http.routers.chrome-grid.tls.certresolver=letsencrypt"
      - "traefik.http.services.chrome-grid.loadbalancer.server.port=8080"
    restart: unless-stopped
```

## Docker Run

### Basic Deployment

```bash
docker run -d \
  --name s6-chromium-grid \
  --hostname chrome-grid \
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

### High-Performance Setup (10+ Instances)

```bash
docker run -d \
  --name s6-chromium-grid-hp \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  --cap-add SYS_ADMIN \
  --shm-size=4g \
  --memory=8g \
  --cpus=4 \
  --ulimit nofile=65536:65536 \
  -p 8080:8080 \
  -p 9222-9231:9222-9231 \
  -e INSTANCE_COUNT=10 \
  -e ENABLE_VNC=false \
  -e DASHBOARD_PASS=secure-password \
  -v /fast/ssd/recordings:/recordings \
  --restart unless-stopped \
  ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
```

### GPU-Accelerated (Intel iGPU)

```bash
docker run -d \
  --name s6-chromium-grid-gpu \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  --cap-add SYS_ADMIN \
  --device=/dev/dri:/dev/dri \
  --shm-size=2g \
  -p 8080:8080 \
  -p 9222-9226:9222-9226 \
  -e INSTANCE_COUNT=5 \
  -e USE_GPU=true \
  -e DASHBOARD_PASS=changeme \
  --restart unless-stopped \
  ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
```

**Verify GPU:**
```bash
docker exec s6-chromium-grid-gpu vainfo
```

### Minimal Setup (VNC Disabled)

```bash
docker run -d \
  --name s6-chromium-grid-minimal \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  --cap-add SYS_ADMIN \
  --shm-size=2g \
  -p 8080:8080 \
  -p 9222-9224:9222-9224 \
  -e INSTANCE_COUNT=3 \
  -e ENABLE_VNC=false \
  -e DASHBOARD_PASS=changeme \
  --restart unless-stopped \
  ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
```

## Docker Compose

### Development Setup

```yaml
version: '3.8'

services:
  chrome-grid-dev:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    container_name: chrome-grid-dev
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    shm_size: '2gb'
    environment:
      INSTANCE_COUNT: 3
      ENABLE_VNC: "true"
      DASHBOARD_USER: dev
      DASHBOARD_PASS: dev
      TZ: America/New_York
    ports:
      - "8080:8080"
      - "9222-9224:9222-9224"
      - "5900-5902:5900-5902"
      - "6080-6082:6080-6082"
    volumes:
      - ./recordings:/recordings
    restart: "no"  # Don't auto-restart in dev
```

### Production Setup

```yaml
version: '3.8'

services:
  chrome-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    container_name: chrome-grid-prod
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    shm_size: '4gb'
    mem_limit: 8g
    cpus: 4
    environment:
      INSTANCE_COUNT: 10
      ENABLE_VNC: "false"
      DASHBOARD_USER: ${DASHBOARD_USER}
      DASHBOARD_PASS: ${DASHBOARD_PASS}
      TZ: ${TZ:-UTC}
    ports:
      - "127.0.0.1:8080:8080"  # Only localhost
      - "9222-9231:9222-9231"
    volumes:
      - /mnt/storage/recordings:/recordings:rw
      - /mnt/storage/chrome-data:/data:rw
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/status"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
    security_opt:
      - no-new-privileges:true
```

**Deploy:**
```bash
# Create .env file
cat > .env << EOF
DASHBOARD_USER=admin
DASHBOARD_PASS=$(openssl rand -base64 32)
TZ=America/New_York
EOF

# Deploy
docker-compose up -d

# Monitor
docker-compose logs -f --tail=100

# Health check
docker-compose ps
```

### Multi-Container Setup (Separate Grids)

```yaml
version: '3.8'

services:
  chrome-grid-testing:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    container_name: chrome-grid-testing
    cap_add: [NET_ADMIN, NET_RAW, SYS_ADMIN]
    shm_size: '2gb'
    environment:
      INSTANCE_COUNT: 5
      DASHBOARD_PASS: test-pass
    ports:
      - "8080:8080"
      - "9222-9226:9222-9226"
    volumes:
      - ./test-recordings:/recordings

  chrome-grid-staging:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    container_name: chrome-grid-staging
    cap_add: [NET_ADMIN, NET_RAW, SYS_ADMIN]
    shm_size: '2gb'
    environment:
      INSTANCE_COUNT: 5
      DASHBOARD_PASS: staging-pass
    ports:
      - "8081:8080"
      - "9227-9231:9222-9226"
    volumes:
      - ./staging-recordings:/recordings
```

## Docker Swarm

### Swarm Stack Deployment

```yaml
version: '3.8'

services:
  chrome-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.role == worker
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 3
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    environment:
      INSTANCE_COUNT: 5
      DASHBOARD_PASS_FILE: /run/secrets/dashboard_pass
    ports:
      - target: 8080
        published: 8080
        mode: host
      - target: 9222
        published: 9222
        protocol: tcp
        mode: host
    volumes:
      - type: volume
        source: recordings
        target: /recordings
    secrets:
      - dashboard_pass
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  recordings:
    driver: local

secrets:
  dashboard_pass:
    external: true
```

**Deploy:**
```bash
# Create secret
echo "your-secure-password" | docker secret create dashboard_pass -

# Deploy stack
docker stack deploy -c docker-stack.yml chrome-grid

# View services
docker stack services chrome-grid

# Scale up
docker service scale chrome-grid_chrome-grid=4
```

## Configuration

### Environment Variables Reference

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `INSTANCE_COUNT` | integer | `5` | Number of browser instances (1-20) |
| `ENABLE_VNC` | boolean | `true` | Enable VNC servers |
| `USE_GPU` | boolean | `false` | Enable Intel iGPU acceleration |
| `SCREEN_WIDTH` | integer | `1920` | Viewport width in pixels |
| `SCREEN_HEIGHT` | integer | `1080` | Viewport height in pixels |
| `DASHBOARD_PORT` | integer | `8080` | Dashboard HTTP port |
| `DASHBOARD_USER` | string | `admin` | Dashboard username |
| `DASHBOARD_PASS` | string | `admin` | Dashboard password |
| `TZ` | string | `UTC` | Timezone (tz database name) |

### Using Environment Files

Create `.env`:
```bash
INSTANCE_COUNT=10
ENABLE_VNC=false
DASHBOARD_USER=admin
DASHBOARD_PASS=super-secure-password-here
TZ=America/Los_Angeles
SCREEN_WIDTH=1920
SCREEN_HEIGHT=1080
```

**Load in compose:**
```yaml
services:
  chrome-grid:
    env_file: .env
```

**Or in docker run:**
```bash
docker run --env-file .env ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8
```

## Networking

### Port Mapping Strategy

```yaml
# Expose only dashboard (CDP via internal network)
ports:
  - "127.0.0.1:8080:8080"

# Full exposure (development only!)
ports:
  - "8080:8080"
  - "9222-9226:9222-9226"
  - "5900-5904:5900-5904"
  - "6080-6084:6080-6084"

# Custom port mapping
ports:
  - "3000:8080"           # Dashboard on 3000
  - "10000-10004:9222-9226"  # CDP on 10000-10004
```

### Custom Docker Network

```bash
# Create network
docker network create --driver bridge chrome-grid-net

# Run with network
docker run -d \
  --name chrome-grid \
  --network chrome-grid-net \
  --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_ADMIN \
  --shm-size=2g \
  -e INSTANCE_COUNT=5 \
  ghcr.io/s6securitylabs/s6-chromium-grid:1.4.8

# Connect other containers
docker run -d \
  --name test-runner \
  --network chrome-grid-net \
  my-test-image

# Access via container name: ws://chrome-grid:9222
```

### Bridge Network in Compose

```yaml
version: '3.8'

networks:
  chrome-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

services:
  chrome-grid:
    networks:
      chrome-net:
        ipv4_address: 172.20.0.10
    environment:
      INSTANCE_COUNT: 5

  test-runner:
    networks:
      - chrome-net
    depends_on:
      - chrome-grid
    environment:
      CDP_HOST: chrome-grid
```

## Storage

### Volume Types

#### Named Volumes (Recommended)
```yaml
volumes:
  - recordings-data:/recordings
  - chrome-data:/data

volumes:
  recordings-data:
    driver: local
  chrome-data:
    driver: local
```

#### Bind Mounts
```yaml
volumes:
  - /host/path/recordings:/recordings
  - /host/path/data:/data
```

#### tmpfs (Temporary)
```yaml
tmpfs:
  - /tmp/screenshots:mode=1777,size=512M
```

### Storage Locations

| Path | Purpose | Recommended Size |
|------|---------|------------------|
| `/recordings` | Screen recordings (MP4) | 20GB+ |
| `/data` | Browser user data | 5GB |
| `/tmp/screenshots` | Temporary screenshots | 512MB (tmpfs) |

### Cleanup Strategy

```bash
# Clean old recordings (older than 7 days)
docker exec chrome-grid find /recordings -type f -mtime +7 -delete

# Clean all recordings
docker exec chrome-grid rm -rf /recordings/*.mp4

# Backup recordings
docker cp chrome-grid:/recordings ./backup/

# Restore recordings
docker cp ./backup/*.mp4 chrome-grid:/recordings/
```

## Resource Management

### Memory Limits

```bash
# Docker run
docker run --memory=4g --memory-swap=4g ...

# Docker Compose
services:
  chrome-grid:
    mem_limit: 4g
    mem_reservation: 2g
```

### CPU Limits

```bash
# Docker run
docker run --cpus=2 ...

# Docker Compose
services:
  chrome-grid:
    cpus: 2
    cpu_shares: 1024
```

### Recommended Resources

| Instances | CPU | RAM | SHM | Disk |
|-----------|-----|-----|-----|------|
| 1-3 | 1-2 | 2GB | 1GB | 5GB |
| 5 | 2-4 | 4GB | 2GB | 10GB |
| 10 | 4-8 | 8GB | 4GB | 20GB |
| 20+ | 8+ | 16GB+ | 4GB | 50GB+ |

## Health Checks

### Built-in Health Check

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' s6-chromium-grid

# View health logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' s6-chromium-grid
```

### Custom Health Check

```yaml
healthcheck:
  test: |
    curl -f http://localhost:8080/api/status && \
    curl -f http://localhost:9222/json/version
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

### External Monitoring

```bash
# Prometheus metrics (via node-exporter)
docker run -d \
  --name cadvisor \
  -p 8081:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  google/cadvisor:latest
```

## Logging

### Configure Log Driver

```yaml
services:
  chrome-grid:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Centralized Logging

```yaml
services:
  chrome-grid:
    logging:
      driver: "syslog"
      options:
        syslog-address: "tcp://192.168.1.100:514"
        tag: "chrome-grid"
```

### View Logs

```bash
# Real-time logs
docker logs -f s6-chromium-grid

# Last 100 lines
docker logs --tail=100 s6-chromium-grid

# Logs with timestamps
docker logs -t s6-chromium-grid

# Export logs
docker logs s6-chromium-grid > chrome-grid.log
```

## Updates & Maintenance

### Update to Latest Version

```bash
# Pull new image
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:latest

# Stop and remove old container
docker stop s6-chromium-grid
docker rm s6-chromium-grid

# Start new container (same command as before)
docker run -d --name s6-chromium-grid ...

# Or with compose
docker-compose pull
docker-compose up -d
```

### Zero-Downtime Update

```bash
# Start new container with different name
docker run -d --name chrome-grid-new \
  -p 8081:8080 \
  -p 9232-9236:9222-9226 \
  ...

# Test new instance
curl http://localhost:8081/api/status

# Switch traffic (update reverse proxy or firewall)

# Stop old container
docker stop s6-chromium-grid
docker rm s6-chromium-grid

# Rename new container
docker rename chrome-grid-new s6-chromium-grid
```

### Backup Before Update

```bash
# Backup volumes
docker run --rm \
  -v s6-recordings:/source \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/recordings-$(date +%Y%m%d).tar.gz -C /source .

# Backup configuration
docker inspect s6-chromium-grid > chrome-grid-config-backup.json
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs s6-chromium-grid

# Common fixes:
# 1. Missing capabilities
docker run --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_ADMIN ...

# 2. Insufficient shared memory
docker run --shm-size=2g ...

# 3. Port already in use
docker ps -a | grep 8080
sudo lsof -i :8080
```

### High CPU/Memory Usage

```bash
# Check resource usage
docker stats s6-chromium-grid

# Solutions:
# 1. Reduce instance count
# 2. Disable VNC if not needed
# 3. Add resource limits
docker update --cpus=2 --memory=4g s6-chromium-grid
```

### Chrome Crashes

```bash
# Check dmesg for OOM killer
dmesg | grep -i chrome

# Increase shared memory
docker run --shm-size=4g ...

# Disable GPU if causing issues
-e USE_GPU=false
```

### Connection Refused

```bash
# Verify ports are exposed
docker port s6-chromium-grid

# Test from container
docker exec s6-chromium-grid curl http://localhost:8080

# Test CDP endpoint
curl http://localhost:9222/json/version
```

### Permission Issues

```bash
# Check volume permissions
docker exec s6-chromium-grid ls -la /recordings

# Fix permissions
docker exec s6-chromium-grid chown -R chrome:chrome /recordings
```

---

**Need help?** Open an issue on [GitHub](https://github.com/s6securitylabs/s6-chromium-grid/issues)
