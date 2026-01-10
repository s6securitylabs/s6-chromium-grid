# Subdomain Routing Deployment Guide

**Quick deployment steps for v2.2.4 subdomain-based routing**

---

## Step 1: Configure DNS (You're doing this now)

Add wildcard DNS record to your DNS server:

```
*.grid.sweet6.net    A    10.10.1.133
grid.sweet6.net      A    10.10.1.133
```

**Test after adding:**
```bash
dig instance0.grid.sweet6.net
dig testing.grid.sweet6.net
# Both should return 10.10.1.133
```

---

## Step 2: Deploy to Production Server

```bash
# SSH to server
ssh root@10.10.1.133

# Navigate to project directory
cd /root/s6-chromium-grid

# Pull latest code
git pull origin main

# Stop current containers
docker compose -f docker-compose.production.yml down

# Remove old nginx volume (to regenerate wildcard cert)
docker volume rm s6-chromium-grid_nginx-ssl

# Rebuild with new subdomain routing
docker compose -f docker-compose.production.yml build --no-cache

# Start containers
docker compose -f docker-compose.production.yml up -d

# Check containers are healthy
docker ps | grep s6
```

---

## Step 3: Verify Deployment

### Check containers
```bash
docker ps
# Should show:
# s6-chromium-grid    (healthy)
# s6-nginx            (healthy)
```

### Check NGINX logs
```bash
docker logs s6-nginx | grep "Wildcard"
# Should show: "✓ Wildcard certificate generated for *.grid.sweet6.net!"
```

### Check certificate SANs
```bash
docker exec s6-nginx openssl x509 -in /etc/nginx/ssl/cert.pem -noout -text | grep "DNS:"
# Should show: DNS:*.grid.sweet6.net, DNS:instance0.grid.sweet6.net, etc.
```

---

## Step 4: Test VNC Access

### Access main dashboard
```
https://grid.sweet6.net
```

### Click "View" on Instance 1

Should open a new window with URL:
```
https://instance0.grid.sweet6.net/vnc.html?path=/websockify&autoconnect=true&resize=scale
```

### Verify WebSocket connection

Open browser console (F12) and check for:
- ✅ No doubled URL errors
- ✅ WebSocket connects to `wss://instance0.grid.sweet6.net/websockify`
- ✅ noVNC shows live browser screen

---

## What Changed

### Old (Path-based)
```
https://s6-chromium-grid.lan.sweet6.net/websockify/0/websockify
```

### New (Subdomain-based)
```
https://instance0.grid.sweet6.net/websockify
```

### Benefits
- ✅ Cleaner URLs
- ✅ No more doubled URL bugs
- ✅ Wildcard SSL certificate covers all instances
- ✅ Custom project names work as subdomains
- ✅ Better WebSocket routing via Host header

---

## Troubleshooting

### "DNS not resolving"

**Test:**
```bash
dig instance0.grid.sweet6.net
```

**Fix:**
- Check wildcard DNS record is correct: `*.grid.sweet6.net`
- Flush DNS cache: `sudo systemd-resolve --flush-caches`
- Check your device is using correct DNS server

### "Certificate error"

**Test:**
```bash
docker exec s6-nginx openssl x509 -in /etc/nginx/ssl/cert.pem -noout -text | grep "Subject:"
# Should show: CN = *.grid.sweet6.net
```

**Fix:**
- Delete nginx-ssl volume and restart:
```bash
docker compose -f docker-compose.production.yml down
docker volume rm s6-chromium-grid_nginx-ssl
docker compose -f docker-compose.production.yml up -d
```

### "VNC not connecting"

**Check NGINX subdomain extraction:**
```bash
docker exec s6-nginx tail -f /var/log/nginx/access.log
# Look for: subdomain="instance0"
```

**Check websockify is running:**
```bash
docker exec s6-chromium-grid ps aux | grep websockify
# Should show processes on ports 6080-6089
```

---

## Next Steps After Deployment

1. **Test all instances** - Click View on each instance to verify VNC works
2. **Test custom names** - If using dynamic mode, test project name subdomains
3. **Update bookmarks** - Change bookmarks from old URLs to new subdomain URLs
4. **Monitor logs** - Watch NGINX logs for any subdomain routing issues

---

## Rollback (If Needed)

If subdomain routing has issues, rollback to previous version:

```bash
cd /root/s6-chromium-grid
git checkout dd79d02  # Previous commit before subdomain routing
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml build --no-cache
docker compose -f docker-compose.production.yml up -d
```

Then revert your DNS changes.

---

## Support

Check these docs for more details:
- `SUBDOMAIN-ROUTING.md` - Full architecture documentation
- `CHANGELOG-v2.2.3.md` - Previous VNC bug fixes
- `PRODUCTION-DEPLOYMENT.md` - General deployment guide
