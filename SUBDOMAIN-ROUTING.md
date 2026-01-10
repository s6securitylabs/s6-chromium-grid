# Subdomain-based Routing Architecture

**Version:** v2.2.4
**Date:** 2026-01-10
**Status:** Implemented

---

## Overview

S6 Chromium Grid now uses **subdomain-based routing** for cleaner URLs and better isolation. Each browser instance or project gets its own subdomain.

## URL Structure

### Main Dashboard
```
https://grid.s6securitylabs.com              → Main dashboard
https://dashboard.grid.s6securitylabs.com    → Main dashboard (alternative)
```

### Static Instances (Numbered)
```
https://instance0.grid.s6securitylabs.com    → Instance 0 (VNC + noVNC)
https://instance1.grid.s6securitylabs.com    → Instance 1 (VNC + noVNC)
https://instance2.grid.s6securitylabs.com    → Instance 2 (VNC + noVNC)
...
https://instance9.grid.s6securitylabs.com    → Instance 9 (VNC + noVNC)
```

### Dynamic Projects (Named)
```
https://testing.grid.s6securitylabs.com      → Project "testing"
https://production.grid.s6securitylabs.com   → Project "production"
https://myproject.grid.s6securitylabs.com    → Project "myproject"
```

## DNS Setup Required

### Wildcard DNS Record

Add this to your DNS server (Pi-hole, BIND, etc.):

```dns
*.grid.s6securitylabs.com    A    10.10.1.133
grid.s6securitylabs.com      A    10.10.1.133
```

### Verification

Test DNS resolution:

```bash
# Test main domain
dig grid.s6securitylabs.com
nslookup grid.s6securitylabs.com

# Test instance subdomains
dig instance0.grid.s6securitylabs.com
dig instance1.grid.s6securitylabs.com

# Test custom project names
dig testing.grid.s6securitylabs.com
dig myproject.grid.s6securitylabs.com

# All should resolve to 10.10.1.133
```

## How It Works

### 1. NGINX Subdomain Extraction

NGINX extracts the subdomain from the hostname:

```nginx
# Extract subdomain from host
map $host $subdomain {
    ~^([^.]+)\.grid\.sweet6\.net$ $1;  # Captures "instance0", "testing", etc.
    default "";
}
```

### 2. Static Instance Mapping

Known static instances are mapped to websockify ports:

```nginx
map $subdomain $instance_websockify_port {
    "instance0" 6080;  # Instance 0
    "instance1" 6081;  # Instance 1
    ...
    "instance9" 6089;  # Instance 9
    default "";
}
```

### 3. Dynamic Project Lookup

For custom project names (e.g., "testing", "production"):
- NGINX checks if there's a static mapping
- If not found, proxies to dashboard API
- Dashboard returns the correct websockify port for that project

### 4. WebSocket Routing

VNC WebSocket connections:

```
Client → wss://instance0.grid.s6securitylabs.com/websockify
         ↓
NGINX extracts "instance0" subdomain
         ↓
Maps to port 6080
         ↓
Proxies to dashboard:6080
         ↓
Websockify serves VNC over WebSocket
```

## SSL Certificate

### Wildcard Certificate

The NGINX container auto-generates a **wildcard self-signed certificate**:

```
CN: *.grid.s6securitylabs.com
SAN:
  - grid.s6securitylabs.com
  - *.grid.s6securitylabs.com
  - dashboard.grid.s6securitylabs.com
  - instance0.grid.s6securitylabs.com
  - instance1.grid.s6securitylabs.com
  ...
  - instance9.grid.s6securitylabs.com
```

### Valid for 10 years (3650 days)

### Production Certificate (Optional)

For production with public DNS, use Let's Encrypt wildcard:

```bash
certbot certonly --dns-cloudflare \
  -d 'grid.s6securitylabs.com' \
  -d '*.grid.s6securitylabs.com'
```

Then mount the certificates in docker-compose:

```yaml
volumes:
  - /etc/letsencrypt/live/grid.s6securitylabs.com/fullchain.pem:/etc/nginx/ssl/cert.pem:ro
  - /etc/letsencrypt/live/grid.s6securitylabs.com/privkey.pem:/etc/nginx/ssl/key.pem:ro
```

## Dashboard Changes

### JavaScript Function

The dashboard generates subdomain URLs automatically:

```javascript
function getVncUrl(wsPort, customName, instanceId) {
    const baseDomain = 'grid.s6securitylabs.com';

    // Determine subdomain
    let subdomain;
    if (customName && customName.trim()) {
        // Custom project name
        subdomain = customName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    } else {
        // Static instance number
        subdomain = `instance${instanceId}`;
    }

    // Build URL
    const protocol = window.location.protocol;
    return `${protocol}//${subdomain}.${baseDomain}/vnc.html?path=/websockify&autoconnect=true&resize=scale`;
}
```

### Example Output

```javascript
// Static instance 0
getVncUrl(6080, '', 0)
// → "https://instance0.grid.s6securitylabs.com/vnc.html?path=/websockify&autoconnect=true&resize=scale"

// Named project
getVncUrl(6080, 'Testing Project', 1)
// → "https://testing-project.grid.s6securitylabs.com/vnc.html?path=/websockify&autoconnect=true&resize=scale"
```

## Benefits vs Path-based Routing

### ✅ **Cleaner URLs**
```
Before: https://grid.s6securitylabs.com/websockify/0/websockify
After:  https://instance0.grid.s6securitylabs.com/websockify
```

### ✅ **Better SSL Coverage**
- Single wildcard certificate covers all subdomains
- No certificate warnings for new instances/projects

### ✅ **Easier Firewall Rules**
```bash
# Allow specific projects only
iptables -A INPUT -p tcp --dport 443 -m string --string "testing.grid.s6securitylabs.com" --algo bm -j ACCEPT
```

### ✅ **Better Isolation**
- Each instance feels like its own service
- Can implement per-subdomain rate limiting
- Easier to track in logs

### ✅ **Project Name Flexibility**
- Use meaningful names: `testing.grid.s6securitylabs.com`, `staging.grid.s6securitylabs.com`
- No URL encoding issues with project names

### ✅ **WebSocket Host Header**
- WebSocket receives full subdomain in Host header
- NGINX can route based on $host variable
- More flexible than path-based routing

## Migration from Path-based

### Old URLs (v2.2.3 and earlier)
```
https://s6-chromium-grid.lan.sweet6.net/websockify/0/websockify  → Instance 0
https://s6-chromium-grid.lan.sweet6.net/websockify/1/websockify  → Instance 1
```

### New URLs (v2.2.4+)
```
https://instance0.grid.s6securitylabs.com/websockify  → Instance 0
https://instance1.grid.s6securitylabs.com/websockify  → Instance 1
```

### Dashboard Automatically Updates

The dashboard will generate new subdomain URLs automatically. No client changes needed.

## Deployment Steps

### 1. Configure DNS
```bash
# Add wildcard DNS record
*.grid.s6securitylabs.com    A    10.10.1.133
```

### 2. Deploy Updated Containers
```bash
cd /root/s6-chromium-grid
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml build --no-cache
docker compose -f docker-compose.production.yml up -d
```

### 3. Verify DNS
```bash
dig instance0.grid.s6securitylabs.com
# Should return 10.10.1.133
```

### 4. Test VNC Access
```bash
# Access dashboard
https://grid.s6securitylabs.com

# Click "View" on Instance 1
# Should open: https://instance0.grid.s6securitylabs.com/vnc.html
```

## Troubleshooting

### DNS Not Resolving

**Symptom:** `instance0.grid.s6securitylabs.com` doesn't resolve

**Solution:**
```bash
# Check DNS server
dig @10.10.1.1 instance0.grid.s6securitylabs.com

# Check /etc/resolv.conf
cat /etc/resolv.conf

# Flush DNS cache
sudo systemd-resolve --flush-caches
```

### Certificate Errors

**Symptom:** Browser shows SSL warning for subdomain

**Solution:**
```bash
# Verify wildcard certificate SANs
openssl x509 -in /etc/nginx/ssl/cert.pem -noout -text | grep DNS

# Should show:
# DNS:*.grid.s6securitylabs.com, DNS:instance0.grid.s6securitylabs.com, ...
```

### VNC Not Connecting

**Symptom:** noVNC shows connection error

**Solution:**
```bash
# Check NGINX logs for subdomain extraction
docker exec s6-nginx tail -f /var/log/nginx/access.log | grep subdomain

# Should show: subdomain="instance0"

# Check websockify is running on correct port
docker exec s6-chromium-grid ps aux | grep websockify
```

## Advanced Configuration

### Custom Base Domain

To use a different base domain, update:

1. **dashboard/public/index.html:**
```javascript
const baseDomain = 'your-domain.com';  // Change this
```

2. **nginx/nginx.conf:**
```nginx
map $host $subdomain {
    ~^([^.]+)\.your-domain\.com$ $1;  # Change this
    default "";
}
```

3. **nginx/Dockerfile:**
```dockerfile
CN="${SSL_CN:-*.your-domain.com}"  # Change this
```

### Dynamic Project Port Lookup

For dynamic mode, implement API endpoint in `dashboard/server.js`:

```javascript
app.get('/api/vnc-port/:projectName', (req, res) => {
    const { projectName } = req.params;

    // Look up project in dynamic manager
    const instance = dynamicManager.getInstanceByName(projectName);

    if (instance) {
        res.json({ wsPort: instance.wsPort });
    } else {
        res.status(404).json({ error: 'Project not found' });
    }
});
```

## Monitoring & Logs

### NGINX Access Logs

Logs include extracted subdomain:

```
10.10.1.50 - - [10/Jan/2026:10:00:00 +1030] "GET /websockify HTTP/1.1"
200 1234 "https://grid.s6securitylabs.com/" "Mozilla/5.0" host="instance0.grid.s6securitylabs.com" subdomain="instance0"
```

### grep for Specific Instance

```bash
docker exec s6-nginx grep 'subdomain="instance0"' /var/log/nginx/access.log
```

## Future Enhancements

- [ ] Add per-subdomain rate limiting
- [ ] Implement subdomain-based authentication
- [ ] Support project aliases (e.g., `prod.grid.s6securitylabs.com` → `production.grid.s6securitylabs.com`)
- [ ] Add subdomain health checks
- [ ] Implement subdomain-based metrics

---

## References

- **NGINX Server Name Matching:** http://nginx.org/en/docs/http/server_names.html
- **NGINX Map Module:** http://nginx.org/en/docs/http/ngx_http_map_module.html
- **Let's Encrypt Wildcard Certs:** https://letsencrypt.org/docs/faq/#does-let-s-encrypt-issue-wildcard-certificates
