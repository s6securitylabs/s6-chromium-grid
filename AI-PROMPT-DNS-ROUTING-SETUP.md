# AI Prompt: DNS and Routing Setup for S6 Chromium Grid

**Copy this entire document and provide it to your AI agent for DNS/routing setup**

---

## CONTEXT

I have an S6 Chromium Grid application that needs subdomain-based routing for VNC instances. The application runs on a server at IP address `10.10.1.133` and needs to be accessible via subdomains of `grid.s6securitylabs.com`.

## WHAT I NEED YOU TO DO

Set up DNS records and routing configuration so that:

1. **Main dashboard** is accessible at `https://grid.s6securitylabs.com`
2. **Browser instances** are accessible at `https://instance0.grid.s6securitylabs.com`, `https://instance1.grid.s6securitylabs.com`, etc.
3. **Custom projects** can use any subdomain like `https://testing.grid.s6securitylabs.com` or `https://production.grid.s6securitylabs.com`

## DNS REQUIREMENTS

### What DNS Records to Create

I need you to create DNS records in my DNS provider. Here's what needs to be set up:

**Primary Domain Record:**
- Type: `A`
- Name: `grid.s6securitylabs.com` (or just `grid` depending on DNS provider interface)
- Value/Target: `10.10.1.133`
- TTL: `3600` (1 hour) or use default

**Wildcard Subdomain Record:**
- Type: `A`
- Name: `*.grid.s6securitylabs.com` (or just `*.grid`)
- Value/Target: `10.10.1.133`
- TTL: `3600` (1 hour) or use default

**Optional Dashboard Alias:**
- Type: `CNAME`
- Name: `dashboard.grid.s6securitylabs.com` (or just `dashboard.grid`)
- Value/Target: `grid.s6securitylabs.com`
- TTL: `3600` or use default

### What This Means

The wildcard record `*.grid.s6securitylabs.com` means that ANY subdomain under `grid.s6securitylabs.com` will resolve to `10.10.1.133`. Examples:
- `instance0.grid.s6securitylabs.com` → `10.10.1.133`
- `instance5.grid.s6securitylabs.com` → `10.10.1.133`
- `testing.grid.s6securitylabs.com` → `10.10.1.133`
- `anything.grid.s6securitylabs.com` → `10.10.1.133`

## DNS PROVIDER INFORMATION

**DNS Provider:** [TELL ME YOUR DNS PROVIDER - e.g., Cloudflare, Route53, DigitalOcean, Namecheap, Pi-hole, etc.]

**Access Information:** [I WILL PROVIDE - API token, credentials, or web UI access]

**Parent Domain:** `s6securitylabs.com`

**Subdomain Being Configured:** `grid.s6securitylabs.com`

## VERIFICATION STEPS

After creating the DNS records, verify they work by testing DNS resolution:

### Test Commands

Run these commands to verify DNS is working:

```bash
# Test main domain
dig grid.s6securitylabs.com
nslookup grid.s6securitylabs.com

# Test instance subdomains
dig instance0.grid.s6securitylabs.com
dig instance1.grid.s6securitylabs.com
dig instance9.grid.s6securitylabs.com

# Test random subdomain (should also work due to wildcard)
dig testing.grid.s6securitylabs.com
dig myproject.grid.s6securitylabs.com
```

### Expected Results

All commands above should return `10.10.1.133` as the IP address.

Example successful output:
```
;; ANSWER SECTION:
instance0.grid.s6securitylabs.com. 3600 IN A 10.10.1.133
```

## SSL CERTIFICATE REQUIREMENTS

The application needs an SSL certificate for HTTPS access. Here's what you need to know:

### Option 1: Let's Encrypt with DNS-01 Challenge (Recommended)

**Why DNS-01:** HTTP-01 challenge CANNOT issue wildcard certificates. For `*.grid.s6securitylabs.com` you MUST use DNS-01 challenge.

**What I Need:**

If using Cloudflare:
- Cloudflare API Token with DNS edit permissions
- Configure in Traefik or Certbot with DNS-01 challenge

If using Route53:
- AWS Access Key ID and Secret Access Key
- IAM permissions for Route53 DNS changes

If using other DNS providers:
- Check if they support automated DNS challenges
- Provide API credentials for your DNS provider

### Option 2: Self-Signed Certificate (Testing Only)

The application can auto-generate a self-signed wildcard certificate for `*.grid.s6securitylabs.com`. This works for testing but browsers will show security warnings.

**No additional setup needed** - the application handles this automatically.

## TRAEFIK CONFIGURATION (If Applicable)

If you're using Traefik as a reverse proxy, here's what needs to be configured:

### Traefik Static Configuration

**Certificate Resolver for Let's Encrypt:**

Configure Traefik to use DNS-01 challenge for wildcard certificates:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@s6securitylabs.com
      storage: /letsencrypt/acme.json
      dnsChallenge:
        provider: cloudflare  # or your DNS provider
        delayBeforeCheck: 30s
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

**Environment Variables Needed:**

For Cloudflare:
```bash
CF_API_EMAIL=your-cloudflare-email@example.com
CF_DNS_API_TOKEN=your-cloudflare-api-token
```

For AWS Route53:
```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

### Traefik Routing Configuration

**What Traefik Needs to Route:**

1. **Main Dashboard:** `grid.s6securitylabs.com` → Backend container port 8080
2. **All Subdomains:** `*.grid.s6securitylabs.com` → Internal NGINX container port 80

**Why Internal NGINX?**
- Traefik handles SSL termination and wildcard certificate
- NGINX handles subdomain-to-port routing (instance0 → port 6080, instance1 → 6081, etc.)
- This is because Traefik can't dynamically route different subdomains to different backend ports

### Traefik Labels for Docker Compose

```yaml
# Main dashboard routing
traefik.http.routers.s6-dashboard.rule=Host(`grid.s6securitylabs.com`)
traefik.http.routers.s6-dashboard.entrypoints=websecure
traefik.http.routers.s6-dashboard.tls.certresolver=letsencrypt

# Instance subdomain routing (goes to internal NGINX)
traefik.http.routers.s6-instances.rule=HostRegexp(`{subdomain:[a-z0-9-]+}\\.grid\\.s6securitylabs\\.com`)
traefik.http.routers.s6-instances.entrypoints=websecure
traefik.http.routers.s6-instances.tls.certresolver=letsencrypt

# WebSocket support (critical for VNC)
traefik.http.middlewares.ws-headers.headers.customrequestheaders.Connection=Upgrade
traefik.http.middlewares.ws-headers.headers.customrequestheaders.Upgrade=websocket
traefik.http.routers.s6-instances.middlewares=ws-headers
```

## WEBSOCKET REQUIREMENTS

The application uses WebSockets for VNC connections. Ensure:

1. **WebSocket Upgrade Headers** are forwarded
2. **Host Header** is preserved (so subdomain can be extracted)
3. **Long Timeouts** are set (VNC connections can be persistent for hours)

### Traefik WebSocket Configuration

```yaml
# In traefik.yml static configuration
entryPoints:
  websecure:
    address: ":443"
    transport:
      respondingTimeouts:
        readTimeout: 0s    # No timeout for WebSocket reads
        writeTimeout: 0s   # No timeout for WebSocket writes
        idleTimeout: 3600s # 1 hour idle timeout
```

### NGINX WebSocket Configuration

Already configured in the application - no changes needed. NGINX will:
- Extract subdomain from Host header (e.g., `instance0`)
- Map subdomain to websockify port (instance0 → 6080, instance1 → 6081)
- Proxy WebSocket connection with proper headers

## FIREWALL / PORT REQUIREMENTS

### Ports That Need to Be Open

**External (Internet-facing):**
- Port `80` (HTTP) - For Let's Encrypt HTTP-01 validation and redirect to HTTPS
- Port `443` (HTTPS) - For all web traffic including WebSocket connections

**Internal (Between containers):**
- Port `8080` - Dashboard application
- Ports `6080-6089` - WebSocket VNC connections (10 instances)
- Ports `9222-9231` - Chrome DevTools Protocol (CDP) - direct access, not proxied

**Note:** CDP ports (9222-9231) should be exposed directly if you need remote access to Chrome DevTools Protocol. These are NOT proxied through Traefik/NGINX.

## NETWORK ARCHITECTURE

Here's how the traffic flows:

```
Internet
   ↓
[DNS Resolution]
   ↓ (all *.grid.s6securitylabs.com → 10.10.1.133)
   ↓
Port 80/443
   ↓
[Traefik] (SSL Termination, Let's Encrypt)
   ↓
   ├─→ grid.s6securitylabs.com
   │   → Dashboard Container:8080
   │
   └─→ instance0.grid.s6securitylabs.com
       instance1.grid.s6securitylabs.com
       testing.grid.s6securitylabs.com
       etc.
       ↓
       [NGINX Internal Container:80]
       ↓ (extracts subdomain, routes to port)
       ↓
       ├─→ instance0 → Websockify:6080
       ├─→ instance1 → Websockify:6081
       ├─→ instance2 → Websockify:6082
       └─→ ... → Websockify:6080-6089
```

## TESTING CHECKLIST

After setup, verify everything works:

### 1. DNS Resolution
```bash
dig grid.s6securitylabs.com
# Should return: 10.10.1.133

dig instance0.grid.s6securitylabs.com
# Should return: 10.10.1.133
```

### 2. SSL Certificate
```bash
openssl s_client -connect grid.s6securitylabs.com:443 -servername grid.s6securitylabs.com
# Should show valid certificate with CN=*.grid.s6securitylabs.com
```

### 3. Dashboard Access
```bash
curl -k https://grid.s6securitylabs.com
# Should return HTML (dashboard page)
```

### 4. Instance Subdomain Access
```bash
curl -k https://instance0.grid.s6securitylabs.com
# Should return HTML (noVNC viewer page)
```

### 5. WebSocket Connection

Open browser console (F12) and navigate to:
```
https://instance0.grid.s6securitylabs.com/vnc.html
```

Check console for WebSocket connection:
```javascript
WebSocket connection to 'wss://instance0.grid.s6securitylabs.com/websockify' succeeded
```

Should NOT see errors like:
- ❌ "WebSocket connection failed"
- ❌ "Connection closed with code 1006"
- ❌ "Certificate error"

## TROUBLESHOOTING GUIDE

### DNS Not Resolving

**Problem:** `dig instance0.grid.s6securitylabs.com` returns no results

**Solutions:**
1. Verify wildcard record `*.grid.s6securitylabs.com` is created correctly
2. Check DNS propagation: https://dnschecker.org
3. Wait 5-10 minutes for DNS cache to clear
4. Flush local DNS cache: `sudo systemd-resolve --flush-caches`

### SSL Certificate Errors

**Problem:** Browser shows "Certificate Invalid" or "Not Secure"

**Solutions:**
1. If using self-signed cert: This is expected, click "Advanced" → "Proceed"
2. If using Let's Encrypt: Check Traefik logs for certificate generation errors
3. Verify DNS-01 challenge credentials are correct
4. Check DNS propagation is complete before requesting certificate

### WebSocket Connection Fails

**Problem:** noVNC shows "Connection closed" or "Failed to connect"

**Solutions:**
1. Verify WebSocket upgrade headers are configured in Traefik
2. Check Host header is preserved: `traefik.http.services.X.loadbalancer.passhostheader=true`
3. Check NGINX logs for subdomain extraction: `docker logs s6-nginx | grep subdomain`
4. Verify websockify is running: `docker exec s6-chromium-grid ps aux | grep websockify`

### Subdomain Routing Not Working

**Problem:** All subdomains go to dashboard instead of instances

**Solutions:**
1. Verify Traefik router for instances uses HostRegexp correctly
2. Check NGINX is receiving the requests (not being blocked by Traefik)
3. Verify NGINX subdomain extraction map is correct in nginx.conf
4. Check NGINX logs: `docker exec s6-nginx tail -f /var/log/nginx/access.log`

## WHAT TO PROVIDE BACK TO ME

After completing the setup, please provide:

1. **DNS Record Confirmation:**
   - Screenshot or output showing DNS records created
   - Output of `dig grid.s6securitylabs.com` and `dig instance0.grid.s6securitylabs.com`

2. **SSL Certificate Status:**
   - Confirmation of certificate generation (if using Let's Encrypt)
   - Output of `openssl s_client -connect grid.s6securitylabs.com:443` showing certificate details

3. **Traefik Configuration:**
   - Final traefik.yml configuration
   - Docker Compose labels configured for routing
   - Environment variables set (DO NOT include actual API tokens, just confirm they're set)

4. **Test Results:**
   - Confirmation that dashboard loads at https://grid.s6securitylabs.com
   - Confirmation that instance0 loads at https://instance0.grid.s6securitylabs.com
   - Screenshot of successful WebSocket connection in browser console

5. **Any Issues Encountered:**
   - Error messages
   - Logs from Traefik or NGINX
   - Specific steps where you got stuck

## SUMMARY OF YOUR TASKS

**DNS Setup:**
1. Create A record: `grid.s6securitylabs.com` → `10.10.1.133`
2. Create wildcard A record: `*.grid.s6securitylabs.com` → `10.10.1.133`
3. Verify DNS resolution works

**SSL Certificate (if using Let's Encrypt):**
1. Configure DNS provider API credentials
2. Set up Traefik with DNS-01 challenge
3. Request wildcard certificate for `*.grid.s6securitylabs.com`

**Traefik Routing:**
1. Route `grid.s6securitylabs.com` to dashboard container port 8080
2. Route `*.grid.s6securitylabs.com` to NGINX internal container port 80
3. Configure WebSocket headers forwarding
4. Set long timeouts for WebSocket connections

**Verification:**
1. Test DNS resolution
2. Test HTTPS access to dashboard
3. Test HTTPS access to instance subdomains
4. Test WebSocket connection in browser

## IMPORTANT NOTES

- **Wildcard SSL requires DNS-01 challenge** - HTTP-01 will NOT work
- **Keep NGINX container** - Traefik cannot route subdomains to different ports
- **WebSocket headers must be preserved** - Critical for VNC to work
- **Host header must be forwarded** - NGINX needs it to extract subdomain
- **DNS propagation takes time** - Wait 5-10 minutes after creating records

---

## READY TO START?

Provide me with:
1. Your DNS provider name
2. Access credentials or API token
3. Confirmation you want Let's Encrypt (or self-signed for testing)
4. Any existing Traefik configuration you have

Then I'll set everything up according to this specification.
