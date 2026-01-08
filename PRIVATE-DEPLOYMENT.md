# Private Container Deployment Guide

This guide covers deploying s6-chromium-grid from a private GHCR registry to TrueNAS.

---

## Option 1: GHCR Authentication (Recommended)

Configure TrueNAS to authenticate with GitHub Container Registry.

### Step 1: Create GitHub Personal Access Token

1. Visit: https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Settings:
   - **Note**: `truenas-ghcr-access`
   - **Expiration**: 90 days or No expiration
   - **Scopes**: ✅ `read:packages`
4. **Generate token** and **copy immediately**

### Step 2: Configure TrueNAS

**In Custom App Configuration:**

**Image Settings:**
- **Repository**: `ghcr.io/s6securitylabs/s6-chromium-grid`
- **Tag**: `1.3.3` (or `latest`)

**Registry Credentials:**
- **Registry**: `ghcr.io`
- **Username**: Your GitHub username
- **Password**: The PAT token you copied

**Docker Compose Alternative:**
```yaml
services:
  s6-chromium-grid:
    image: ghcr.io/s6securitylabs/s6-chromium-grid:1.3.3
    # ... rest of config ...

# Add registry auth
x-docker-registry-config:
  ghcr.io:
    username: your-github-username
    password: ghp_yourTokenHere
```

---

## Option 2: Local Registry

Run a private container registry on your network.

### Setup Registry (One-time)

```bash
# On TrueNAS or another server
docker run -d \
  --name registry \
  --restart=always \
  -p 5000:5000 \
  -v /mnt/pool/registry:/var/lib/registry \
  registry:2

# Verify
curl http://localhost:5000/v2/_catalog
```

### Push Images to Local Registry

**Automated (Recommended):**
```bash
# From your dev machine with GHCR access
./push-to-local-registry.sh

# Or specify version
VERSION=1.3.3 REGISTRY=10.10.1.2:5000 ./push-to-local-registry.sh
```

**Manual:**
```bash
# Pull from GHCR
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:1.3.3

# Tag for local registry
docker tag ghcr.io/s6securitylabs/s6-chromium-grid:1.3.3 \
  10.10.1.2:5000/s6-chromium-grid:1.3.3

# Push
docker push 10.10.1.2:5000/s6-chromium-grid:1.3.3
```

### Use in TrueNAS

**Repository**: `10.10.1.2:5000/s6-chromium-grid`  
**Tag**: `1.3.3`

### Allow Insecure Registry (if needed)

```bash
# On TrueNAS, edit /etc/docker/daemon.json
{
  "insecure-registries": ["10.10.1.2:5000"]
}

# Restart Docker
systemctl restart docker
```

---

## Option 3: Manual Transfer

For air-gapped environments or one-off deployments.

### Export Image

```bash
# On machine with GHCR access
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:1.3.3
docker save ghcr.io/s6securitylabs/s6-chromium-grid:1.3.3 | \
  gzip > s6-chromium-grid-1.3.3.tar.gz
```

### Transfer to TrueNAS

```bash
# Via SCP
scp s6-chromium-grid-1.3.3.tar.gz root@10.10.1.2:/tmp/

# Or upload via TrueNAS web UI
```

### Import on TrueNAS

```bash
# SSH to TrueNAS
ssh root@10.10.1.2

# Load image
gunzip < /tmp/s6-chromium-grid-1.3.3.tar.gz | docker load

# Verify
docker images | grep s6-chromium-grid

# Cleanup
rm /tmp/s6-chromium-grid-1.3.3.tar.gz
```

### Use in TrueNAS

Use the full image name shown by `docker images`.

---

## Secure Local Registry (Production)

For production use, secure your local registry with TLS:

```bash
# Generate self-signed cert
mkdir -p /mnt/pool/registry/certs
openssl req -x509 -newkey rsa:4096 \
  -keyout /mnt/pool/registry/certs/registry.key \
  -out /mnt/pool/registry/certs/registry.crt \
  -days 365 -nodes \
  -subj "/CN=10.10.1.2"

# Run registry with TLS
docker run -d \
  --name registry \
  --restart=always \
  -p 5000:5000 \
  -v /mnt/pool/registry:/var/lib/registry \
  -v /mnt/pool/registry/certs:/certs \
  -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/registry.crt \
  -e REGISTRY_HTTP_TLS_KEY=/certs/registry.key \
  registry:2
```

---

## Comparison

| Option | Pros | Cons |
|--------|------|------|
| **GHCR Auth** | Simple, automatic updates | Requires internet, PAT management |
| **Local Registry** | No internet needed, full control | Setup overhead, manual image sync |
| **Manual Transfer** | Works everywhere | Very tedious for updates |

**Recommendation**: Use **GHCR Auth** for simplicity, or **Local Registry** if you want full control.

---

## Automation: GitHub Actions → Local Registry

Set up automatic sync from GHCR to your local registry:

```yaml
# .github/workflows/sync-to-local.yml
name: Sync to Local Registry
on:
  push:
    tags:
      - 'v*'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Pull from GHCR
        run: docker pull ghcr.io/s6securitylabs/s6-chromium-grid:${{ github.ref_name }}
      
      - name: Push to Local Registry
        run: |
          docker tag ghcr.io/s6securitylabs/s6-chromium-grid:${{ github.ref_name }} \
            ${{ secrets.LOCAL_REGISTRY }}/s6-chromium-grid:${{ github.ref_name }}
          docker push ${{ secrets.LOCAL_REGISTRY }}/s6-chromium-grid:${{ github.ref_name }}
        env:
          DOCKER_HOST: tcp://${{ secrets.LOCAL_REGISTRY_HOST }}:2375
```

*(Requires configuring secrets and Docker remote access)*

---

## Troubleshooting

### "manifest unknown" error
- Check you're using correct registry URL
- Verify image exists: `docker images | grep s6-chromium-grid`

### "unauthorized: authentication required"
- Check PAT token has `read:packages` scope
- Verify username/password in TrueNAS config
- Token not expired

### "x509: certificate signed by unknown authority"
- Add registry to insecure-registries (for local registry)
- Or properly configure TLS certificates

### Can't connect to local registry
- Check firewall allows port 5000
- Verify registry container is running: `docker ps | grep registry`
- Test: `curl http://REGISTRY_IP:5000/v2/_catalog`

---

## Security Best Practices

1. **Rotate PATs regularly** (90 day expiration recommended)
2. **Use TLS for local registry** in production
3. **Restrict network access** to registry (firewall rules)
4. **Use read-only tokens** (only `read:packages` scope)
5. **Keep registry on private network** (not exposed to internet)
