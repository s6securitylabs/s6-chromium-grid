#!/bin/bash
set -e

REGISTRY="${REGISTRY:-10.10.1.2:5000}"
IMAGE_NAME="s6-chromium-grid"
VERSION="${VERSION:-latest}"

echo "=== Pushing s6-chromium-grid to local registry ==="
echo "Registry: $REGISTRY"
echo "Version: $VERSION"

echo "Pulling from GHCR..."
docker pull ghcr.io/s6securitylabs/s6-chromium-grid:$VERSION

echo "Tagging for local registry..."
docker tag ghcr.io/s6securitylabs/s6-chromium-grid:$VERSION \
  $REGISTRY/$IMAGE_NAME:$VERSION

if [ "$VERSION" != "latest" ]; then
    echo "Also tagging as latest..."
    docker tag ghcr.io/s6securitylabs/s6-chromium-grid:$VERSION \
      $REGISTRY/$IMAGE_NAME:latest
fi

echo "Pushing to local registry..."
docker push $REGISTRY/$IMAGE_NAME:$VERSION

if [ "$VERSION" != "latest" ]; then
    docker push $REGISTRY/$IMAGE_NAME:latest
fi

echo "✓ Successfully pushed to $REGISTRY/$IMAGE_NAME:$VERSION"
echo ""
echo "Use in TrueNAS:"
echo "  Repository: $REGISTRY/$IMAGE_NAME"
echo "  Tag: $VERSION"
