# Release v2.1.1 - Bug Fix Release

**Release Date:** 2026-01-09
**Release Type:** Bug Fix (Patch)
**Image:** ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.1

---

## What's Fixed

### Docker Compose Manifest Error
**Issue:** `manifest unknown` error when using `generate-compose.sh` to create multi-instance setups

**Root Cause:** The `generate-compose.sh` script was missing the `image:` directive, causing Docker Compose to try pulling an image named after the service ("chromium-cdp") which doesn't exist.

**Fix:** Added `image: ghcr.io/s6securitylabs/s6-chromium-grid:latest` to the base configuration in `generate-compose.sh`

---

## Changes

### Files Modified
1. **dashboard/package.json** - Version bumped to 2.1.1
2. **dashboard/public/index.html** - Version badge updated to v2.1.1
3. **generate-compose.sh** - Added missing `image:` directive
4. **CHANGELOG.md** - Added v2.1.1 release notes

---

## Upgrade Instructions

### From v2.1.0 to v2.1.1

**Option 1: Using Standard docker-compose.yml (Recommended)**
```bash
# Stop current container
docker compose down

# Pull new version
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.1

# Update docker-compose.yml to use v2.1.1 (or use :latest)
# Then start
docker compose up -d
```

**Option 2: Using Generated Multi-Instance Setup**
```bash
# Stop all containers
docker compose down

# Regenerate compose file with fixed script
./generate-compose.sh 5 false

# Pull new version
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:latest

# Start
docker compose up -d
```

**Option 3: Direct Docker Run**
```bash
# Stop and remove old container
docker stop s6-chromium-grid && docker rm s6-chromium-grid

# Pull new version
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.1

# Run with your config
docker run -d --name s6-chromium-grid \
  --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_ADMIN \
  --shm-size=2g \
  -p 8080:8080 -p 9222:9222 \
  -e DYNAMIC_MODE=true \
  -e MAX_DYNAMIC_INSTANCES=20 \
  -e DASHBOARD_USER=admin \
  -e DASHBOARD_PASS=admin \
  ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.1
```

---

## Verification

**Check Version:**
```bash
# Check container logs
docker logs s6-chromium-grid 2>&1 | grep "S6 Chromium Grid"

# Access dashboard and check version badge
curl -s -u admin:admin http://localhost:8080/ | grep "version-badge"
# Should show: <span class="version-badge">v2.1.1</span>
```

**Test Generated Compose:**
```bash
# Generate new compose file
./generate-compose.sh 3 false

# Verify it contains image directive
grep -A 5 "chromium-base" docker-compose.yml | grep "image:"
# Should show: image: ghcr.io/s6securitylabs/s6-chromium-grid:latest
```

---

## What's Included from v2.1.0

All features from v2.1.0 are included:
- ✅ SQLite-based time-series metrics
- ✅ Server-Sent Events real-time streaming
- ✅ Historical metrics API
- ✅ Metrics export (CSV/JSON)
- ✅ Fixed dashboard UI bugs (7 bugs fixed)
- ✅ Dynamic mode improvements

---

## Breaking Changes

**None** - Fully backward compatible with v2.1.0

---

## Image Information

**Tags:**
- `ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.1`
- `ghcr.io/s6securitylabs/s6-chromium-grid:latest` (updated to v2.1.1)

**Digest:**
- `sha256:03c55b8f9f9cc0708c97ae28fee2f29c5d2c9ca7500f2062fefd416c76ba7b0d`

**Pull Commands:**
```bash
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:v2.1.1
# or
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:latest
```

---

## Documentation

- **FIX-MANIFEST-UNKNOWN-ERROR.md** - Comprehensive troubleshooting guide for manifest errors
- **BUGFIX-REPORT-v2.1.0.md** - Details on all 7 UI bugs fixed in v2.1.0
- **E2E-TEST-REPORT.md** - Comprehensive testing report for v2.1.0 features
- **CHANGELOG.md** - Full changelog with all versions

---

## Known Issues

**None** - All reported issues have been fixed.

---

## Support

If you encounter any issues:
1. Check the troubleshooting guides in the documentation
2. Ensure you're using the latest image (v2.1.1)
3. Clear browser cache when accessing dashboard (Ctrl+Shift+R)
4. Report issues at: https://github.com/s6securitylabs/s6-chromium-grid/issues

---

## Next Release

**v2.2.0** will focus on:
- Intelligent auto-scaling with LRU eviction
- Resource-aware instance limits
- Preemptive cleanup at capacity
- Enhanced load testing

**Estimated Release:** TBD

---

**Released By:** Claude Code Agent
**Build Date:** 2026-01-09
**Status:** ✅ Production Ready
