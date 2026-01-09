#!/bin/bash
# Deploy S6 Chromium Grid to Production Server
# Usage: ./deploy-production.sh [server] [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER="${1:-root@10.10.1.133}"
VERSION="${2:-2.2.0}"
DEPLOY_DIR="/root/s6-chromium-grid"
COMPOSE_FILE="docker-compose.production.yml"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}S6 Chromium Grid - Production Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Server: ${GREEN}$SERVER${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo -e "Deploy Dir: ${GREEN}$DEPLOY_DIR${NC}"
echo ""

# Check if server is reachable
echo -e "${YELLOW}→${NC} Checking server connectivity..."
if ! ssh -o ConnectTimeout=5 "$SERVER" "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Cannot connect to server $SERVER"
    exit 1
fi
echo -e "${GREEN}✓${NC} Server is reachable"

# Check if Docker is installed
echo -e "${YELLOW}→${NC} Checking Docker on server..."
if ! ssh "$SERVER" "command -v docker > /dev/null 2>&1"; then
    echo -e "${RED}✗${NC} Docker is not installed on the server"
    exit 1
fi
echo -e "${GREEN}✓${NC} Docker is installed"

# Create deployment directory
echo -e "${YELLOW}→${NC} Creating deployment directory..."
ssh "$SERVER" "mkdir -p $DEPLOY_DIR/nginx"
echo -e "${GREEN}✓${NC} Directory created"

# Copy files to server
echo -e "${YELLOW}→${NC} Copying deployment files..."
scp "$COMPOSE_FILE" "$SERVER:$DEPLOY_DIR/docker-compose.yml"
scp ".env.production" "$SERVER:$DEPLOY_DIR/.env"
scp -r nginx/* "$SERVER:$DEPLOY_DIR/nginx/"
echo -e "${GREEN}✓${NC} Files copied"

# Pull latest image
echo -e "${YELLOW}→${NC} Pulling Docker image (v$VERSION)..."
ssh "$SERVER" "cd $DEPLOY_DIR && docker pull ghcr.io/s6securitylabs/s6-chromium-grid:$VERSION"
echo -e "${GREEN}✓${NC} Image pulled"

# Stop existing containers
echo -e "${YELLOW}→${NC} Stopping existing containers..."
ssh "$SERVER" "cd $DEPLOY_DIR && docker compose down || true"
echo -e "${GREEN}✓${NC} Containers stopped"

# Start new containers
echo -e "${YELLOW}→${NC} Starting new containers..."
ssh "$SERVER" "cd $DEPLOY_DIR && docker compose up -d"
echo -e "${GREEN}✓${NC} Containers started"

# Wait for services to be healthy
echo -e "${YELLOW}→${NC} Waiting for services to become healthy..."
sleep 10

# Check container status
echo -e "${YELLOW}→${NC} Checking container status..."
ssh "$SERVER" "cd $DEPLOY_DIR && docker compose ps"

# Test HTTP endpoint
echo -e "${YELLOW}→${NC} Testing HTTP endpoint (port 80)..."
if ssh "$SERVER" "curl -s -o /dev/null -w '%{http_code}' http://localhost/health" | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓${NC} HTTP endpoint is responding"
else
    echo -e "${YELLOW}⚠${NC} HTTP endpoint returned unexpected status (may need time to start)"
fi

# Test HTTPS endpoint
echo -e "${YELLOW}→${NC} Testing HTTPS endpoint (port 443)..."
if ssh "$SERVER" "curl -k -s -o /dev/null -w '%{http_code}' https://localhost/health" | grep -q "200"; then
    echo -e "${GREEN}✓${NC} HTTPS endpoint is responding"
else
    echo -e "${YELLOW}⚠${NC} HTTPS endpoint returned unexpected status (may need time to start)"
fi

# Show logs
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Recent logs:${NC}"
echo -e "${BLUE}========================================${NC}"
ssh "$SERVER" "cd $DEPLOY_DIR && docker compose logs --tail=20"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Dashboard URLs:"
echo -e "  HTTP:  ${BLUE}http://s6-chromium-grid.lan.sweet6.net${NC} (redirects to HTTPS)"
echo -e "  HTTPS: ${BLUE}https://s6-chromium-grid.lan.sweet6.net${NC} (self-signed cert)"
echo -e "  CDP:   ${BLUE}ws://s6-chromium-grid.lan.sweet6.net:9222${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} Browser will show security warning for self-signed certificate"
echo -e "      Add security exception or import certificate to trust store"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:    ssh $SERVER 'cd $DEPLOY_DIR && docker compose logs -f'"
echo -e "  Restart:      ssh $SERVER 'cd $DEPLOY_DIR && docker compose restart'"
echo -e "  Stop:         ssh $SERVER 'cd $DEPLOY_DIR && docker compose down'"
echo -e "  Status:       ssh $SERVER 'cd $DEPLOY_DIR && docker compose ps'"
echo ""
