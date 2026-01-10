# Fix: Docker Manifest Unknown Error

**Error:** `manifest unknown` when pulling `chromium-cdp` image

**Root Cause:** The `generate-compose.sh` script (used for multi-instance setups) was missing the `image:` directive, causing Docker Compose to try pulling a non-existent image.

---

## Quick Fix

### Option 1: Use the Standard docker-compose.yml (Recommended)

The standard `docker-compose.yml` works correctly and uses the v2.1.0 image:

```bash
# Pull the latest image
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.0

# Start with standard compose
docker compose up -d

# Or with dynamic mode:
DYNAMIC_MODE=true MAX_DYNAMIC_INSTANCES=20 docker compose up -d
```

### Option 2: Regenerate Multi-Instance Compose File

If you need multiple static instances, regenerate the compose file with the fixed script:

```bash
# Regenerate compose file (5 instances, CPU mode)
./generate-compose.sh 5 false

# Pull the image
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:latest

# Start services
docker compose up -d
```

### Option 3: Manual Fix for Existing Generated File

If you have an existing generated `docker-compose.yml`, add the image line:

**Before:**
```yaml
x-chromium-base: &chromium-base
  build: .
  cap_add:
    - NET_ADMIN
```

**After:**
```yaml
x-chromium-base: &chromium-base
  image: ghcr.io/s6securitylabs/s6-chromium-grid:latest  # ← Add this line
  build: .
  cap_add:
    - NET_ADMIN
```

---

## Understanding the Error

The error message:
```
Failed 'up' action for 'chromium-cdp' app: chromium-cdp Pulling
chromium-cdp Error manifest unknown
```

This means Docker Compose tried to pull an image but:
1. No `image:` directive was specified in the compose file
2. Docker defaults to using the service name as the image name
3. No image exists with that name in any registry

---

## Recommended Setup: Dynamic Mode (v2.1.0)

Instead of managing multiple static instances, use **dynamic mode** which creates instances on-demand:

```yaml
# docker-compose.yml
services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.0
    container_name: s6-chromium-grid
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    shm_size: '4gb'
    environment:
      - DYNAMIC_MODE=true
      - MAX_DYNAMIC_INSTANCES=20
      - INSTANCE_TIMEOUT_MINUTES=30
      - DASHBOARD_USER=admin
      - DASHBOARD_PASS=changeme
      - ENABLE_METRICS_HISTORY=true
    ports:
      - "8080:8080"
      - "9222:9222"
    volumes:
      - chromium-data:/data
    restart: unless-stopped

volumes:
  chromium-data:
```

**Benefits of Dynamic Mode:**
- ✅ Single container manages all instances
- ✅ Instances created automatically when clients connect
- ✅ Auto-cleanup of idle instances
- ✅ Lower memory footprint when idle
- ✅ Built-in metrics and monitoring
- ✅ Path-based routing: `http://localhost:9222/{project-name}/`

---

## Static Mode vs Dynamic Mode

### Static Mode (Old - generate-compose.sh)
- ❌ Multiple containers (chromium-cdp-1, chromium-cdp-2, etc.)
- ❌ All instances always running (wastes resources)
- ❌ Manual scaling (edit compose file)
- ❌ Complex port mapping (9222, 9223, 9224...)
- ✅ Fixed instance count (predictable)

### Dynamic Mode (New - v2.1.0)
- ✅ Single container
- ✅ Instances created on-demand
- ✅ Auto-scaling up to MAX_DYNAMIC_INSTANCES
- ✅ Single port (9222) with path-based routing
- ✅ Built-in metrics, SSE streaming, dashboard
- ✅ Lower idle resource usage

---

## Troubleshooting

### Still Getting Manifest Unknown?

1. **Clear Docker Compose cache:**
   ```bash
   docker compose down
   docker system prune -af
   docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.0
   docker compose up -d
   ```

2. **Check which compose file is being used:**
   ```bash
   docker compose config
   ```

3. **Verify the image exists:**
   ```bash
   docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.0
   # Should download successfully
   ```

4. **Check app lifecycle config:**
   If you're using an app lifecycle management system (Coolify, Dokploy, Portainer, etc.), check its configuration to ensure it's using the correct compose file and image name.

### App Lifecycle Management Systems

If you're using **Coolify**, **Dokploy**, **Portainer**, or similar:

1. Navigate to the app configuration
2. Check the Docker Compose content
3. Ensure `image: ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.0` is present
4. Redeploy the app

---

## Files Modified

- ✅ `generate-compose.sh` - Added `image:` directive
- ✅ `docker-compose.yml` - Already correct (uses standard image)

---

## Summary

**The Fix:**
- Added `image: ghcr.io/s6securitylabs/s6-chromium-grid:latest` to `generate-compose.sh`

**Next Steps:**
1. Pull the latest image: `docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.0`
2. If using standard compose: `docker compose up -d`
3. If using multi-instance: Regenerate with `./generate-compose.sh`
4. Clear browser cache when accessing dashboard

**Recommended:**
- Switch to dynamic mode (see example above)
- Use single container instead of multi-instance setup
- Benefits: auto-scaling, metrics, better resource usage

---

**Fixed By:** Claude Code Agent
**Date:** 2026-01-09
**Issue:** Docker manifest unknown error for chromium-cdp
**Resolution:** Added image directive to generate-compose.sh, documented recommended setup
