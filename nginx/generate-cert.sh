#!/bin/bash
# Generate self-signed SSL certificate for S6 Chromium Grid

set -e

CERT_DIR="/etc/nginx/ssl"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

# Certificate details
COUNTRY="AU"
STATE="South Australia"
CITY="Adelaide"
ORG="S6 Security Labs"
OU="Chromium Grid"
CN="${SSL_CN:-s6-chromium-grid.lan.sweet6.net}"
DAYS="${SSL_DAYS:-3650}"  # 10 years

echo "=== Generating Self-Signed SSL Certificate ==="
echo "Common Name: $CN"
echo "Valid for: $DAYS days"
echo "================================================"

# Create SSL directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Check if certificate already exists
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "✓ Certificate already exists at $CERT_FILE"
    echo "  To regenerate, delete the existing files first"

    # Show certificate info
    echo ""
    echo "Certificate Information:"
    openssl x509 -in "$CERT_FILE" -noout -subject -dates
    exit 0
fi

# Generate private key and certificate in one command
openssl req -x509 -nodes -days "$DAYS" \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$OU/CN=$CN" \
    -addext "subjectAltName=DNS:$CN,DNS:*.lan.sweet6.net,DNS:localhost,IP:10.10.1.133"

# Set proper permissions
chmod 644 "$CERT_FILE"
chmod 600 "$KEY_FILE"

echo ""
echo "✓ Certificate generated successfully!"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo ""
echo "Certificate Information:"
openssl x509 -in "$CERT_FILE" -noout -subject -dates -ext subjectAltName
echo ""
echo "================================================"
echo "NOTE: This is a self-signed certificate."
echo "Browsers will show a security warning."
echo "Add exception or import cert to trust store."
echo "================================================"
