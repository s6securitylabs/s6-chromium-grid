# Traefik + Let's Encrypt Configuration Guide

**For S6 Chromium Grid with Subdomain Routing**

---

## Overview

This guide covers:
1. ✅ Let's Encrypt wildcard certificate generation via HTTP-01 challenge
2. ✅ Traefik configuration for WebSocket support
3. ✅ Subdomain routing with Traefik
4. ✅ Integration with existing S6 Chromium Grid

---

## Let's Encrypt Certificate Generation

### HTTP-01 Challenge (Port 80)

**Requirements:**
- Port 80 must be accessible from the internet
- Domain must resolve to your server's public IP
- Traefik will handle ACME challenges automatically

### ⚠️ Important: HTTP-01 Limitations

**HTTP-01 challenge CANNOT issue wildcard certificates!**

You have two options:

#### Option 1: DNS-01 Challenge (Recommended for Wildcards)

Use DNS-01 challenge with your DNS provider (Cloudflare, Route53, etc.):

```yaml
# In Traefik static configuration (traefik.yml)
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@s6securitylabs.com
      storage: /letsencrypt/acme.json
      dnsChallenge:
        provider: cloudflare  # or route53, digitalocean, etc.
        delayBeforeCheck: 30s
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

**Environment variables for Cloudflare:**
```bash
CF_API_EMAIL=your-email@domain.com
CF_API_KEY=your-cloudflare-api-key
# OR for API tokens:
CF_DNS_API_TOKEN=your-cloudflare-api-token
```

#### Option 2: HTTP-01 with Individual Subdomains (Not Recommended)

Request separate certificates for each subdomain:
- grid.s6securitylabs.com
- instance0.grid.s6securitylabs.com
- instance1.grid.s6securitylabs.com
- etc.

**Not practical** for dynamic projects with custom names.

### ✅ Recommended: Use DNS-01 Challenge

---

## Traefik Configuration

### Directory Structure

```
/opt/traefik/
├── traefik.yml              # Static configuration
├── dynamic/
│   └── s6-grid.yml          # Dynamic configuration for S6 Grid
├── letsencrypt/
│   └── acme.json            # Certificate storage (chmod 600)
└── docker-compose.yml       # Traefik container
```

### Static Configuration (traefik.yml)

```yaml
# Traefik Static Configuration
log:
  level: INFO

api:
  dashboard: true
  insecure: false  # Secure the dashboard

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true

  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
        domains:
          - main: grid.s6securitylabs.com
            sans:
              - "*.grid.s6securitylabs.com"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: traefik-public

  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@s6securitylabs.com
      storage: /letsencrypt/acme.json
      # Use DNS-01 for wildcard support
      dnsChallenge:
        provider: cloudflare
        delayBeforeCheck: 30s
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"

      # Alternative: HTTP-01 (no wildcards)
      # httpChallenge:
      #   entryPoint: web
```

### Docker Compose for Traefik

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped

    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Traefik dashboard (secure it!)

    environment:
      # Cloudflare credentials for DNS-01
      CF_API_EMAIL: ${CF_API_EMAIL}
      CF_DNS_API_TOKEN: ${CF_DNS_API_TOKEN}

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./dynamic:/etc/traefik/dynamic:ro
      - ./letsencrypt:/letsencrypt
      - /etc/localtime:/etc/localtime:ro

    networks:
      - traefik-public

    labels:
      - "traefik.enable=true"

      # Traefik dashboard
      - "traefik.http.routers.traefik.rule=Host(`traefik.s6securitylabs.com`)"
      - "traefik.http.routers.traefik.entrypoints=websecure"
      - "traefik.http.routers.traefik.tls.certresolver=letsencrypt"
      - "traefik.http.routers.traefik.service=api@internal"

      # Basic auth for dashboard (optional but recommended)
      # Generate: htpasswd -nb admin yourpassword
      - "traefik.http.middlewares.traefik-auth.basicauth.users=admin:$$apr1$$..."
      - "traefik.http.routers.traefik.middlewares=traefik-auth"

networks:
  traefik-public:
    external: true
```

---

## S6 Chromium Grid Integration

### Update docker-compose.production.yml

Remove the `nginx` service and configure `dashboard` service for Traefik:

```yaml
version: '3.8'

services:
  dashboard:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:latest
    container_name: s6-chromium-grid
    hostname: s6-chromium-grid
    restart: unless-stopped

    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN

    shm_size: 2g

    environment:
      DASHBOARD_USER: ${DASHBOARD_USER:-admin}
      DASHBOARD_PASS: ${DASHBOARD_PASS:-admin}
      DASHBOARD_PORT: 8080
      DYNAMIC_MODE: ${DYNAMIC_MODE:-false}
      INSTANCE_COUNT: ${INSTANCE_COUNT:-10}
      INITIAL_INSTANCE_COUNT: ${INITIAL_INSTANCE_COUNT:-1}
      ENABLE_METRICS_HISTORY: ${ENABLE_METRICS_HISTORY:-true}
      ENABLE_VNC: ${ENABLE_VNC:-true}

    # Expose ports to Traefik network (no public exposure)
    expose:
      - "8080"      # Dashboard
      - "6080-6089" # WebSocket VNC

    # CDP ports need direct access (no proxy)
    ports:
      - "9222-9231:9222-9231"

    volumes:
      - chromium-data:/data
      - chromium-recordings:/recordings

    networks:
      - traefik-public
      - s6-grid-internal

    labels:
      - "traefik.enable=true"

      # =========================================
      # Main Dashboard (grid.s6securitylabs.com)
      # =========================================
      - "traefik.http.routers.s6-dashboard.rule=Host(`grid.s6securitylabs.com`) || Host(`dashboard.grid.s6securitylabs.com`)"
      - "traefik.http.routers.s6-dashboard.entrypoints=websecure"
      - "traefik.http.routers.s6-dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.s6-dashboard.service=s6-dashboard"
      - "traefik.http.services.s6-dashboard.loadbalancer.server.port=8080"

      # =========================================
      # Instance Subdomains (instance0-9.grid.s6securitylabs.com)
      # =========================================
      - "traefik.http.routers.s6-instances.rule=HostRegexp(`^instance[0-9]\\.grid\\.s6securitylabs\\.com$$`)"
      - "traefik.http.routers.s6-instances.entrypoints=websecure"
      - "traefik.http.routers.s6-instances.tls.certresolver=letsencrypt"
      - "traefik.http.routers.s6-instances.service=s6-instances"

      # Route to specific websockify ports based on subdomain
      # This requires a custom Traefik plugin or manual routing per instance
      # See "Advanced Subdomain Routing" section below

      # =========================================
      # WebSocket Support Middleware
      # =========================================
      - "traefik.http.middlewares.websocket-headers.headers.customrequestheaders.Connection=Upgrade"
      - "traefik.http.middlewares.websocket-headers.headers.customrequestheaders.Upgrade=websocket"
      - "traefik.http.routers.s6-instances.middlewares=websocket-headers"

volumes:
  chromium-data:
    driver: local
  chromium-recordings:
    driver: local

networks:
  traefik-public:
    external: true
  s6-grid-internal:
    driver: bridge
```

---

## Advanced Subdomain Routing

**Problem:** Traefik can't dynamically route subdomains to different backend ports based on subdomain name.

**Solution Options:**

### Option 1: Keep NGINX as Internal Reverse Proxy (Recommended)

Use Traefik for SSL termination and NGINX for port routing:

```
Client
  → Traefik (SSL termination, *.grid.s6securitylabs.com)
      → NGINX (subdomain → port mapping)
          → Websockify (6080-6089)
```

**Updated docker-compose.yml:**

```yaml
services:
  dashboard:
    # ... existing config
    expose:
      - "8080"
    networks:
      - traefik-public
      - s6-internal
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.s6-dashboard.rule=Host(`grid.s6securitylabs.com`)"
      - "traefik.http.services.s6-dashboard.loadbalancer.server.port=8080"

  nginx-internal:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    container_name: s6-nginx-internal
    restart: unless-stopped

    environment:
      SSL_ENABLED: "false"  # Traefik handles SSL

    expose:
      - "80"

    networks:
      - traefik-public
      - s6-internal

    depends_on:
      - dashboard

    labels:
      - "traefik.enable=true"

      # Route ALL instance subdomains to NGINX
      - "traefik.http.routers.s6-instances.rule=HostRegexp(`{subdomain:[a-z0-9-]+}\\.grid\\.s6securitylabs\\.com`)"
      - "traefik.http.routers.s6-instances.entrypoints=websecure"
      - "traefik.http.routers.s6-instances.tls.certresolver=letsencrypt"
      - "traefik.http.routers.s6-instances.service=s6-nginx"
      - "traefik.http.services.s6-nginx.loadbalancer.server.port=80"

      # WebSocket support
      - "traefik.http.middlewares.ws-headers.headers.customrequestheaders.Connection=Upgrade"
      - "traefik.http.middlewares.ws-headers.headers.customrequestheaders.Upgrade=websocket"
      - "traefik.http.routers.s6-instances.middlewares=ws-headers"

networks:
  traefik-public:
    external: true
  s6-internal:
    driver: bridge
```

**Update nginx.conf** to listen on port 80 (no SSL):

```nginx
http {
    # Remove SSL configuration
    # Traefik handles SSL termination

    server {
        listen 80;
        server_name grid.s6securitylabs.com dashboard.grid.s6securitylabs.com;

        # Dashboard routes
        location / {
            proxy_pass http://dashboard:8080;
            # ... standard proxy headers
        }
    }

    server {
        listen 80;
        server_name ~^(?!dashboard|grid).*\.grid\.s6securitylabs\.com$;

        # Instance subdomain routing
        location /websockify {
            # ... subdomain to port mapping
        }

        location / {
            # ... noVNC static files
        }
    }
}
```

### Option 2: Individual Traefik Routers (Manual but Simple)

Create separate routers for each instance:

```yaml
labels:
  # Instance 0
  - "traefik.http.routers.instance0.rule=Host(`instance0.grid.s6securitylabs.com`)"
  - "traefik.http.routers.instance0.service=instance0-svc"
  - "traefik.http.services.instance0-svc.loadbalancer.server.port=6080"

  # Instance 1
  - "traefik.http.routers.instance1.rule=Host(`instance1.grid.s6securitylabs.com`)"
  - "traefik.http.routers.instance1.service=instance1-svc"
  - "traefik.http.services.instance1-svc.loadbalancer.server.port=6081"

  # ... repeat for instances 2-9
```

**Limitation:** Doesn't support dynamic project names.

---

## WebSocket Configuration for Traefik

Traefik supports WebSockets by default, but ensure:

### 1. Headers Are Forwarded

```yaml
labels:
  - "traefik.http.middlewares.ws.headers.customrequestheaders.Connection=Upgrade"
  - "traefik.http.middlewares.ws.headers.customrequestheaders.Upgrade=websocket"
  - "traefik.http.routers.yourrouter.middlewares=ws"
```

### 2. Timeouts Are Set

```yaml
# In traefik.yml
entryPoints:
  websecure:
    transport:
      respondingTimeouts:
        readTimeout: 0s
        writeTimeout: 0s
        idleTimeout: 180s
```

### 3. Host Header Preserved

```yaml
- "traefik.http.services.yourservice.loadbalancer.passhostheader=true"
```

---

## DNS Configuration

Set up wildcard DNS:

```dns
grid.s6securitylabs.com            A    YOUR_PUBLIC_IP
*.grid.s6securitylabs.com          A    YOUR_PUBLIC_IP
```

Or for local DNS (internal network):

```dns
grid.s6securitylabs.com            A    10.10.1.133
*.grid.s6securitylabs.com          A    10.10.1.133
```

---

## Complete Deployment Steps

### 1. Create Traefik Network

```bash
docker network create traefik-public
```

### 2. Set Up Traefik

```bash
mkdir -p /opt/traefik/{dynamic,letsencrypt}
chmod 600 /opt/traefik/letsencrypt/acme.json
touch /opt/traefik/letsencrypt/acme.json

# Copy traefik.yml and docker-compose.yml
cd /opt/traefik
docker compose up -d
```

### 3. Configure DNS

Add DNS records for `grid.s6securitylabs.com` and `*.grid.s6securitylabs.com`

### 4. Deploy S6 Chromium Grid

```bash
cd /root/s6-chromium-grid
git pull origin main

# Update docker-compose.production.yml with Traefik labels
docker compose -f docker-compose.production.yml up -d
```

### 5. Verify

```bash
# Check Traefik dashboard
https://traefik.s6securitylabs.com/dashboard/

# Check S6 Grid
https://grid.s6securitylabs.com

# Check instance VNC
https://instance0.grid.s6securitylabs.com
```

---

## Recommended Architecture

```
Internet
   │
   ├─► Port 80  → Traefik → Redirect to HTTPS
   │
   └─► Port 443 → Traefik (SSL Termination)
                     │
                     ├─► grid.s6securitylabs.com → Dashboard:8080
                     │
                     └─► *.grid.s6securitylabs.com → NGINX-Internal:80
                                                          │
                                                          ├─► Subdomain → Port Mapping
                                                          │
                                                          └─► Websockify:6080-6089
```

---

## Summary

**For your Traefik agent:**

1. ✅ Use **DNS-01 challenge** (not HTTP-01) for wildcard certificates
2. ✅ Configure DNS provider credentials (Cloudflare recommended)
3. ✅ Keep **NGINX as internal proxy** for subdomain → port routing
4. ✅ Traefik routes `*.grid.s6securitylabs.com` → NGINX → Websockify
5. ✅ WebSocket headers forwarded automatically
6. ✅ Host header preserved for subdomain extraction

**Key Point:** HTTP-01 challenge CANNOT issue wildcard certificates. You MUST use DNS-01 for `*.grid.s6securitylabs.com` support.
