# S6 Chromium Grid - Production Deployment Guide

## Overview

This guide covers deploying S6 Chromium Grid with HTTPS support (self-signed certificate) on ports 80 and 443.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet/Network                         │
└────────────────┬───────────────────┬────────────────────────┘
                 │                   │
            Port 80 (HTTP)      Port 443 (HTTPS)
                 │                   │
                 ├───────────────────┤
                 │                   │
            ┌────▼───────────────────▼────┐
            │   NGINX Reverse Proxy       │
            │   - SSL Termination         │
            │   - HTTP → HTTPS Redirect   │
            │   - Self-Signed Certificate │
            └─────────────┬───────────────┘
                          │
                     Port 8080
                          │
            ┌─────────────▼───────────────┐
            │ S6 Chromium Grid Dashboard  │
            │ - WebSocket Support         │
            │ - API Endpoints             │
            │ - Basic Auth               │
            └─────────────────────────────┘
                          │
                 Ports 9222-9231
                          │
            ┌─────────────▼───────────────┐
            │   Chrome Instances          │
            │   - CDP Protocol            │
            │   - Browser Automation      │
            └─────────────────────────────┘
```

---

## Features

### ✅ HTTPS Support
- Self-signed SSL certificate (10-year validity)
- Automatic certificate generation on first start
- TLS 1.2 and TLS 1.3 support
- Modern cipher suites

### ✅ HTTP Redirect
- Port 80 automatically redirects to HTTPS (port 443)
- Health check endpoint available on HTTP without redirect

### ✅ Security Headers
- HSTS (Strict-Transport-Security)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection

### ✅ Rate Limiting
- Dashboard: 10 requests/second (burst 20)
- API: 30 requests/second (burst 50)

### ✅ WebSocket Support
- Full WebSocket proxy support for dashboard features
- Proper upgrade headers

---

## Prerequisites

- Docker and Docker Compose installed on target server
- SSH access to target server
- Ports 80, 443, and 9222-9231 available

---

## Quick Start

### 1. Clone or Copy Files to Server

```bash
# Copy deployment files to server
scp docker-compose.production.yml root@10.10.1.133:/root/s6-chromium-grid/docker-compose.yml
scp .env.production root@10.10.1.133:/root/s6-chromium-grid/.env
scp -r nginx root@10.10.1.133:/root/s6-chromium-grid/
```

### 2. Configure Environment

Edit `.env` on the server and update:

```bash
# Change default credentials!
DASHBOARD_USER=your-username
DASHBOARD_PASS=your-secure-password

# Update SSL common name if needed
SSL_CN=s6-chromium-grid.lan.sweet6.net
```

### 3. Deploy

```bash
# Using the deployment script (recommended)
./deploy-production.sh root@10.10.1.133 2.2.0

# Or manually on the server
ssh root@10.10.1.133
cd /root/s6-chromium-grid
docker compose up -d
```

---

## Automated Deployment

Use the provided deployment script:

```bash
# Deploy with defaults (root@10.10.1.133, version 2.2.0)
./deploy-production.sh

# Deploy to custom server with specific version
./deploy-production.sh root@192.168.1.100 2.1.1

# Deploy to custom server with latest
./deploy-production.sh user@my-server.com latest
```

The script will:
1. ✅ Check server connectivity
2. ✅ Verify Docker is installed
3. ✅ Copy deployment files
4. ✅ Pull Docker image
5. ✅ Stop existing containers
6. ✅ Start new containers
7. ✅ Verify health checks
8. ✅ Show logs and status

---

## Accessing the Dashboard

### HTTPS (Recommended)
```
https://s6-chromium-grid.lan.sweet6.net
https://10.10.1.133
```

**Note:** Browser will show security warning for self-signed certificate. Click "Advanced" → "Proceed" to continue.

### HTTP (Redirects to HTTPS)
```
http://s6-chromium-grid.lan.sweet6.net
http://10.10.1.133
```

### CDP Endpoints (Direct Access)
```
ws://s6-chromium-grid.lan.sweet6.net:9222
ws://10.10.1.133:9222-9231
```

---

## SSL Certificate Management

### View Certificate Info

```bash
docker exec s6-nginx openssl x509 -in /etc/nginx/ssl/cert.pem -noout -text
```

### Regenerate Certificate

```bash
# Remove existing certificate
docker exec s6-nginx rm -f /etc/nginx/ssl/cert.pem /etc/nginx/ssl/key.pem

# Restart container to generate new certificate
docker restart s6-nginx
```

### Custom Certificate

If you have a real SSL certificate:

1. Copy certificate files to server:
```bash
scp my-cert.pem root@10.10.1.133:/root/s6-chromium-grid/ssl/cert.pem
scp my-key.pem root@10.10.1.133:/root/s6-chromium-grid/ssl/key.pem
```

2. Update `docker-compose.yml` volume mount:
```yaml
volumes:
  - ./ssl:/etc/nginx/ssl:ro
```

3. Restart containers:
```bash
docker compose restart nginx
```

---

## CI/CD Integration

### GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/build-push.yml`) that:

- ✅ Builds Docker image on push to main
- ✅ Pushes to GitHub Container Registry (GHCR)
- ✅ Tags with version on git tags (e.g., `v2.2.0`)
- ✅ Tags `latest` on main branch

### Triggering Deployment

**Option 1: Manual Tag**
```bash
git tag 2.3.0
git push origin 2.3.0
```

**Option 2: GitHub Release**
Create a release in GitHub UI, which automatically triggers CI/CD.

**Option 3: Direct Push**
```bash
git push origin main
```

### Auto-Deployment (Future Enhancement)

To enable automatic deployment after CI/CD:

1. Add deployment job to `.github/workflows/build-push.yml`:

```yaml
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Production
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /root/s6-chromium-grid
            docker compose pull
            docker compose up -d
```

2. Add secrets to GitHub repository:
   - `PROD_HOST`: 10.10.1.133
   - `PROD_USER`: root
   - `PROD_SSH_KEY`: SSH private key

---

## Management Commands

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f nginx
docker compose logs -f dashboard

# Last 100 lines
docker compose logs --tail=100
```

### Restart Services

```bash
# All services
docker compose restart

# Specific service
docker compose restart nginx
docker compose restart dashboard
```

### Update to New Version

```bash
# Pull new image
docker compose pull

# Restart with new image
docker compose up -d
```

### Stop Services

```bash
docker compose down
```

### Check Status

```bash
docker compose ps
```

### Resource Usage

```bash
docker stats
```

---

## Troubleshooting

### Certificate Errors

**Problem:** Browser shows "NET::ERR_CERT_AUTHORITY_INVALID"

**Solution:** This is expected with self-signed certificates. Options:
1. Click "Advanced" → "Proceed to site (unsafe)"
2. Import certificate to browser's trust store
3. Use a real SSL certificate from Let's Encrypt

### Port Already in Use

**Problem:** "bind: address already in use"

**Solution:**
```bash
# Find what's using the port
sudo netstat -tlnp | grep ':80\|:443'

# Stop the service
sudo systemctl stop apache2  # or nginx, etc.

# Try deployment again
```

### NGINX Not Starting

**Problem:** NGINX container fails to start

**Solution:**
```bash
# Check logs
docker compose logs nginx

# Common issues:
# 1. Port conflicts (see above)
# 2. Invalid config - test with:
docker exec s6-nginx nginx -t

# 3. Certificate generation failed - regenerate:
docker exec s6-nginx /usr/local/bin/generate-cert.sh
docker compose restart nginx
```

### Dashboard Not Accessible

**Problem:** Cannot access dashboard through NGINX

**Solution:**
```bash
# 1. Check if dashboard is running
docker compose ps dashboard

# 2. Test dashboard directly (bypass NGINX)
curl -u admin:admin http://localhost:8080/api/status

# 3. Check NGINX upstream connection
docker compose logs nginx | grep upstream

# 4. Verify network connectivity
docker compose exec nginx ping dashboard
```

### WebSocket Connection Fails

**Problem:** WebSocket connections drop or fail

**Solution:**
1. Check proxy headers in `nginx/nginx.conf`:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

2. Verify timeout settings:
```nginx
proxy_read_timeout 60s;
```

3. Test WebSocket directly:
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8080
```

---

## Security Recommendations

### 1. Change Default Credentials

**CRITICAL:** Update default admin credentials in `.env`:
```bash
DASHBOARD_USER=your-secure-username
DASHBOARD_PASS=your-very-strong-password
```

### 2. Restrict CDP Port Access

Add firewall rules to restrict CDP ports to trusted IPs:

```bash
# Allow only from specific IP
sudo ufw allow from 10.10.1.0/24 to any port 9222:9231 proto tcp

# Or use iptables
sudo iptables -A INPUT -p tcp --match multiport --dports 9222:9231 -s 10.10.1.0/24 -j ACCEPT
sudo iptables -A INPUT -p tcp --match multiport --dports 9222:9231 -j DROP
```

### 3. Use Real SSL Certificate

For production, use Let's Encrypt:

```bash
# Install certbot
apt-get install certbot

# Get certificate
certbot certonly --standalone -d s6-chromium-grid.lan.sweet6.net

# Copy to deployment directory
cp /etc/letsencrypt/live/s6-chromium-grid.lan.sweet6.net/fullchain.pem ./ssl/cert.pem
cp /etc/letsencrypt/live/s6-chromium-grid.lan.sweet6.net/privkey.pem ./ssl/key.pem

# Update docker-compose.yml to mount ./ssl
# Restart nginx
docker compose restart nginx
```

### 4. Enable Additional NGINX Security

Edit `nginx/nginx.conf` to add:

```nginx
# Rate limiting (already included)
# Client IP whitelisting
allow 10.10.1.0/24;
deny all;

# Request size limits
client_max_body_size 10M;
client_body_timeout 12;
client_header_timeout 12;
```

### 5. Regular Updates

```bash
# Update to latest version
cd /root/s6-chromium-grid
docker compose pull
docker compose up -d
```

---

## Performance Tuning

### NGINX Worker Processes

Edit `nginx/nginx.conf`:
```nginx
worker_processes auto;  # Uses all CPU cores
worker_connections 2048;  # Increase if needed
```

### Connection Pooling

```nginx
upstream dashboard {
    server dashboard:8080;
    keepalive 64;  # Increase for more concurrent connections
}
```

### Caching (Optional)

Add caching for static assets:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=static_cache:10m max_size=100m;

location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    proxy_cache static_cache;
    proxy_cache_valid 200 1d;
    proxy_cache_use_stale error timeout http_500 http_502 http_503;
}
```

---

## Monitoring

### Health Checks

NGINX includes built-in health checks:

```bash
# HTTP health check
curl http://localhost/health

# HTTPS health check
curl -k https://localhost/health

# Dashboard health check (direct)
curl -u admin:admin http://localhost:8080/api/status
```

### Prometheus Integration (Future)

Add metrics endpoint to `nginx.conf`:
```nginx
location /metrics {
    stub_status on;
    access_log off;
    allow 10.10.1.0/24;
    deny all;
}
```

---

## Backup and Restore

### Backup Data

```bash
# Backup volumes
docker run --rm \
  -v s6-chromium-grid_chromium-data:/data \
  -v s6-chromium-grid_chromium-recordings:/recordings \
  -v $(pwd):/backup \
  alpine tar czf /backup/s6-backup-$(date +%Y%m%d).tar.gz /data /recordings

# Backup SSL certificates
docker run --rm \
  -v s6-chromium-grid_nginx-ssl:/ssl \
  -v $(pwd):/backup \
  alpine tar czf /backup/ssl-backup-$(date +%Y%m%d).tar.gz /ssl
```

### Restore Data

```bash
# Restore volumes
docker run --rm \
  -v s6-chromium-grid_chromium-data:/data \
  -v s6-chromium-grid_chromium-recordings:/recordings \
  -v $(pwd):/backup \
  alpine tar xzf /backup/s6-backup-20260110.tar.gz
```

---

## Ports Reference

| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 80 | HTTP | NGINX | Redirects to HTTPS |
| 443 | HTTPS | NGINX | Dashboard (with SSL) |
| 8080 | HTTP | Dashboard | Internal (not exposed) |
| 9222-9231 | WebSocket | CDP | Chrome DevTools Protocol |
| 5900-5909 | TCP | VNC | Internal (not exposed) |
| 6080-6089 | WebSocket | noVNC | Internal (not exposed) |

---

## Support

- 📖 Main Documentation: [README.md](README.md)
- 🐛 Issues: [GitHub Issues](https://github.com/s6securitylabs/s6-chromium-grid/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/s6securitylabs/s6-chromium-grid/discussions)
- 📋 Migration Guide: [MIGRATION-v3.md](MIGRATION-v3.md)

---

## Changelog

- **v2.2.0** - Added HTTPS support with self-signed certificates
- **v2.2.0** - Added NGINX reverse proxy
- **v2.2.0** - Added production deployment script
- **v2.2.0** - Deprecated EXTERNAL_PORT_PREFIX

---

**Status:** Production Ready ✅
**Last Updated:** 2026-01-10
**Version:** 2.2.0
