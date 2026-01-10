# Quick Start: Using AI Agent for DNS/Routing Setup

## What This Is

A ready-to-use prompt you can give to any AI agent (Claude, ChatGPT, Gemini, etc.) to automatically set up DNS and routing for S6 Chromium Grid.

## How to Use

### Step 1: Open the AI Prompt

Open the file: `AI-PROMPT-DNS-ROUTING-SETUP.md`

### Step 2: Copy the Entire Contents

Select all and copy the entire document.

### Step 3: Start a Conversation with Your AI Agent

Examples:
- **Claude:** https://claude.ai
- **ChatGPT:** https://chat.openai.com
- **Gemini:** https://gemini.google.com

### Step 4: Paste and Customize

Paste the entire prompt, then provide:

**Required Information:**
```
DNS Provider: [Cloudflare / Route53 / DigitalOcean / etc.]
API Token: [Your DNS provider API token]
Email: admin@s6securitylabs.com
Server IP: 10.10.1.133
Domain: grid.s6securitylabs.com
```

**Optional:**
- Traefik configuration location
- Existing SSL certificate location
- Custom port mappings

### Step 5: AI Will Execute

The AI will:
1. ✅ Create DNS A record: `grid.s6securitylabs.com → 10.10.1.133`
2. ✅ Create wildcard: `*.grid.s6securitylabs.com → 10.10.1.133`
3. ✅ Configure Let's Encrypt with DNS-01 challenge
4. ✅ Set up Traefik routing for subdomains
5. ✅ Configure WebSocket support
6. ✅ Test and verify everything works

### Step 6: Deploy to Server

Once AI confirms setup is complete:

```bash
ssh root@10.10.1.133
cd /root/s6-chromium-grid
git pull origin main
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml build --no-cache
docker compose -f docker-compose.production.yml up -d
```

### Step 7: Test Access

```bash
# Main dashboard
https://grid.s6securitylabs.com

# Instance 0 VNC
https://instance0.grid.s6securitylabs.com

# Instance 1 VNC
https://instance1.grid.s6securitylabs.com
```

## What the AI Will Set Up

### DNS Records
- `grid.s6securitylabs.com` → `10.10.1.133`
- `*.grid.s6securitylabs.com` → `10.10.1.133`

### SSL Certificate
- Wildcard: `*.grid.s6securitylabs.com`
- Via Let's Encrypt DNS-01 challenge
- Auto-renewal enabled

### Traefik Configuration
- Main dashboard routing
- Wildcard subdomain routing
- WebSocket support
- SSL termination

### Architecture
```
Internet
   ↓
Traefik (SSL + Routing)
   ↓
   ├─→ grid.s6securitylabs.com → Dashboard
   └─→ *.grid.s6securitylabs.com → NGINX → Websockify
```

## Example Conversation

**You:**
```
[Paste AI-PROMPT-DNS-ROUTING-SETUP.md contents]

My DNS provider is Cloudflare.
My API token is: [your-token]
Server IP: 10.10.1.133
```

**AI:**
```
I'll set up the DNS and routing for S6 Chromium Grid.

Step 1: Creating DNS records in Cloudflare...
✅ Created A record: grid.s6securitylabs.com → 10.10.1.133
✅ Created wildcard: *.grid.s6securitylabs.com → 10.10.1.133

Step 2: Configuring Let's Encrypt...
✅ Configured DNS-01 challenge with Cloudflare provider
✅ Requested wildcard certificate for *.grid.s6securitylabs.com

Step 3: Setting up Traefik routing...
✅ Main dashboard: grid.s6securitylabs.com → port 8080
✅ Instances: *.grid.s6securitylabs.com → NGINX → ports 6080-6089
✅ WebSocket headers configured

Step 4: Testing...
✅ DNS resolves correctly
✅ SSL certificate valid
✅ Dashboard accessible at https://grid.s6securitylabs.com
✅ Instance0 accessible at https://instance0.grid.s6securitylabs.com

Setup complete! All tests passed.
```

## Supported DNS Providers

The AI can work with:
- ✅ Cloudflare
- ✅ AWS Route53
- ✅ DigitalOcean
- ✅ Google Cloud DNS
- ✅ Azure DNS
- ✅ Namecheap
- ✅ GoDaddy
- ✅ Pi-hole (manual steps)
- ✅ Custom DNS servers

## Troubleshooting

### "I don't have an API token"

Ask your AI agent:
```
How do I create an API token for [Your DNS Provider]?
```

### "DNS not resolving"

AI will automatically:
1. Check DNS propagation
2. Verify record creation
3. Test with multiple DNS servers
4. Suggest cache flush commands

### "SSL certificate failed"

AI will:
1. Check DNS-01 challenge logs
2. Verify API credentials
3. Test DNS propagation
4. Retry with detailed error logging

### "WebSocket not connecting"

AI will:
1. Verify Traefik WebSocket headers
2. Check NGINX subdomain routing
3. Test WebSocket upgrade
4. Review logs for errors

## What You Need to Provide

**Minimum:**
- DNS provider name
- DNS provider API token/credentials
- Confirmation of server IP (10.10.1.133)

**Optional:**
- Existing Traefik config location
- Preferred email for Let's Encrypt
- Custom port mappings
- Firewall rules to check

## Post-Setup Checklist

After AI completes setup:

- [ ] DNS resolves: `dig grid.s6securitylabs.com`
- [ ] Wildcard works: `dig instance0.grid.s6securitylabs.com`
- [ ] SSL valid: Check https://grid.s6securitylabs.com in browser
- [ ] Dashboard loads: https://grid.s6securitylabs.com
- [ ] VNC works: Click "View" on Instance 1
- [ ] WebSocket connects: Check browser console (F12)

## Files Referenced

All documentation is in the repo:
- `AI-PROMPT-DNS-ROUTING-SETUP.md` - The AI prompt (use this)
- `TRAEFIK-LETSENCRYPT-GUIDE.md` - Technical details
- `SUBDOMAIN-ROUTING.md` - Architecture overview
- `DEPLOYMENT-SUBDOMAIN.md` - Deployment steps

## Need Help?

Ask the AI follow-up questions like:
- "How do I check if DNS propagated?"
- "Show me the Traefik logs"
- "Why is WebSocket failing?"
- "How do I regenerate the SSL certificate?"

The AI has full context and can troubleshoot!
