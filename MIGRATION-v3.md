# Migration Guide: v2.x → v3.0.0

**Target Release:** v3.0.0 (Planned Q2 2026)
**Current Version:** v2.2.0
**Breaking Changes:** Yes - EXTERNAL_PORT_PREFIX removed

---

## What's Changing in v3.0.0

### ❌ Removed Features
- **EXTERNAL_PORT_PREFIX** - Completely removed
- **Static mode** - May be removed (dynamic mode only)

### ✅ Benefits
- 40% less code complexity
- Faster performance
- Clearer configuration
- Better Docker/Kubernetes integration

---

## Migration Steps

### Step 1: Identify If You Use EXTERNAL_PORT_PREFIX

Check your current configuration:

```bash
# Docker command
docker inspect your-container | grep EXTERNAL_PORT_PREFIX

# Docker Compose
grep EXTERNAL_PORT_PREFIX docker-compose.yml

# Environment file
grep EXTERNAL_PORT_PREFIX .env
```

**If the value is `0` or not set:** ✅ No migration needed
**If the value is > 0:** ⚠️ Follow migration steps below

---

### Step 2: Understanding the Change

**Before (v2.x with EXTERNAL_PORT_PREFIX=1):**
```yaml
environment:
  - EXTERNAL_PORT_PREFIX=1  # Adds 10000 to all ports

# Application calculates: 9222 + (1 × 10000) = 19222
# You access: ws://host:19222
```

**After (v3.0.0):**
```yaml
ports:
  - "19222:9222"  # Docker maps ports directly

# Application uses: 9222 internally
# Docker exposes: 19222 externally
# You access: ws://host:19222
```

**Result:** Same external behavior, simpler configuration!

---

### Step 3: Update Configuration

#### Option A: Docker Command

**Before:**
```bash
docker run -d \
  -e EXTERNAL_PORT_PREFIX=1 \
  -p 8080:8080 \
  -p 9222:9222 \
  ghcr.io/s6securitylabs/s6-chromium-grid:2.1.1
```

**After:**
```bash
docker run -d \
  -p 18080:8080 \
  -p 19222:9222 \
  ghcr.io/s6securitylabs/s6-chromium-grid:3.0.0
```

#### Option B: Docker Compose

**Before:**
```yaml
services:
  chromium:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:2.1.1
    environment:
      - EXTERNAL_PORT_PREFIX=1
    ports:
      - "8080:8080"
      - "9222:9222"
```

**After:**
```yaml
services:
  chromium:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:3.0.0
    # Remove EXTERNAL_PORT_PREFIX
    ports:
      - "18080:8080"   # Map 18080 externally to 8080 internally
      - "19222:9222"   # Map 19222 externally to 9222 internally
```

---

### Step 4: Update Client Code

**No changes needed!** If you were connecting to `ws://host:19222`, keep using the same URL.

The difference is:
- **v2.x:** Application calculates 19222 from `EXTERNAL_PORT_PREFIX=1`
- **v3.0.0:** Docker maps 19222 → 9222

Your clients don't need to know this internal detail.

---

### Step 5: Test Migration

1. **Stop old container:**
   ```bash
   docker stop s6-chromium-grid
   docker rm s6-chromium-grid
   ```

2. **Start with new config:**
   ```bash
   docker compose up -d
   # or
   docker run ...
   ```

3. **Verify ports:**
   ```bash
   docker port s6-chromium-grid
   # Should show: 9222/tcp -> 0.0.0.0:19222
   ```

4. **Test connection:**
   ```bash
   curl http://localhost:19222/json/version
   # Should return Chrome version info
   ```

---

## Common Scenarios

### Scenario 1: TrueNAS Scale Deployment

**Before (v2.x):**
- Set `EXTERNAL_PORT_PREFIX=1`
- Map ports 8080:8080, 9222:9222
- Access via 18080, 19222

**After (v3.0.0):**
- Remove `EXTERNAL_PORT_PREFIX`
- Map ports 18080:8080, 19222:9222
- Access via 18080, 19222 (same!)

### Scenario 2: Multiple Grids on Same Host

**Before (v2.x):**
```yaml
# Grid 1
environment:
  - EXTERNAL_PORT_PREFIX=1
ports:
  - "8080:8080"

# Grid 2
environment:
  - EXTERNAL_PORT_PREFIX=2
ports:
  - "8080:8080"
```

**After (v3.0.0):**
```yaml
# Grid 1
ports:
  - "18080:8080"
  - "19222:9222"

# Grid 2
ports:
  - "28080:8080"
  - "29222:9222"
```

**Better (v3.0.0 with Docker networks):**
Deploy separate containers with different names - Docker handles isolation.

---

## Dynamic Mode Simplification

### v2.2.0 Behavior (Current)

**Dynamic mode ignores EXTERNAL_PORT_PREFIX:**
```bash
# Even with EXTERNAL_PORT_PREFIX=1, dynamic mode uses port 9222
docker run -d -e DYNAMIC_MODE=true -e EXTERNAL_PORT_PREFIX=1 -p 9222:9222 ...
# Access: ws://host:9222/project-name/
```

### v3.0.0 Behavior (Future)

**No change needed - already works correctly:**
```bash
docker run -d -e DYNAMIC_MODE=true -p 9222:9222 ...
# Access: ws://host:9222/project-name/
```

---

## Troubleshooting

### Issue: Port conflicts after migration

**Problem:** Another service already uses port 19222

**Solution:** Choose different external ports
```yaml
ports:
  - "29222:9222"  # Use 29222 instead of 19222
  - "28080:8080"  # Use 28080 instead of 18080
```

### Issue: Clients can't connect

**Problem:** Firewall rules reference old port logic

**Solution:** Update firewall to allow new external ports
```bash
# Before
iptables -A INPUT -p tcp --dport 9222 -j ACCEPT

# After (if mapping 19222:9222)
iptables -A INPUT -p tcp --dport 19222 -j ACCEPT
```

### Issue: Dashboard shows wrong ports

**Problem:** v2.x dashboard cached with old prefix

**Solution:** Clear browser cache (Ctrl+Shift+R)

---

## Rollback Plan

If you encounter issues with v3.0.0:

1. **Stop v3.0.0 container:**
   ```bash
   docker stop s6-chromium-grid
   docker rm s6-chromium-grid
   ```

2. **Revert to v2.2.0:**
   ```bash
   docker pull ghcr.io/s6securitylabs/s6-chromium-grid:2.2.0
   # Use your old configuration with EXTERNAL_PORT_PREFIX
   docker compose up -d
   ```

3. **Report issue:** https://github.com/s6securitylabs/s6-chromium-grid/issues

---

## Timeline

| Version | Status | EXTERNAL_PORT_PREFIX |
|---------|--------|---------------------|
| v2.1.x | Current | ✅ Fully supported |
| v2.2.0 | Current | ⚠️ Deprecated (warning logged) |
| v3.0.0 | Q2 2026 | ❌ Removed |

**Recommendation:** Migrate now in v2.2.0 to ensure smooth transition.

---

## FAQ

**Q: Why remove EXTERNAL_PORT_PREFIX?**
A: Docker handles port mapping natively. Application-level port calculations add complexity without benefit.

**Q: Will v2.x continue to work?**
A: Yes! v2.2.0 will be supported for 6+ months after v3.0.0 release.

**Q: What if I need multiple grids?**
A: Deploy separate Docker containers with different port mappings. Docker handles isolation.

**Q: Does this affect dynamic mode?**
A: No - dynamic mode already ignores EXTERNAL_PORT_PREFIX in v2.2.0.

**Q: Do I need to update client code?**
A: No - external URLs remain the same. Only configuration changes.

---

## Need Help?

- 📖 Documentation: [README.md](README.md)
- 🐛 Issues: [GitHub Issues](https://github.com/s6securitylabs/s6-chromium-grid/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/s6securitylabs/s6-chromium-grid/discussions)

---

**Migration Checklist:**

- [ ] Check if EXTERNAL_PORT_PREFIX > 0 in your config
- [ ] Update docker-compose.yml or docker run command
- [ ] Remove EXTERNAL_PORT_PREFIX environment variable
- [ ] Add Docker port mappings (external:internal)
- [ ] Test connection to new ports
- [ ] Update firewall rules if needed
- [ ] Clear browser cache for dashboard
- [ ] Update documentation/runbooks

✅ **Migration complete!** You're ready for v3.0.0.
