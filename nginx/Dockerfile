FROM nginx:1.25-alpine

# Install openssl for certificate generation
RUN apk add --no-cache openssl

# Copy NGINX configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create SSL directory
RUN mkdir -p /etc/nginx/ssl

# Create entrypoint script that generates cert then starts nginx
RUN cat > /docker-entrypoint-custom.sh <<'EOF'
#!/bin/sh
set -e

CERT_FILE="/etc/nginx/ssl/cert.pem"
KEY_FILE="/etc/nginx/ssl/key.pem"
CN="${SSL_CN:-s6-chromium-grid.lan.sweet6.net}"
DAYS="${SSL_DAYS:-3650}"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "=== Generating Self-Signed SSL Certificate ==="
    echo "Common Name: $CN"
    echo "Valid for: $DAYS days"

    openssl req -x509 -nodes -days "$DAYS" \
        -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=AU/ST=South Australia/L=Adelaide/O=S6 Security Labs/OU=Chromium Grid/CN=$CN" \
        -addext "subjectAltName=DNS:$CN,DNS:*.lan.sweet6.net,DNS:localhost,IP:10.10.1.133"

    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"
    echo "✓ Certificate generated successfully!"
else
    echo "✓ Certificate already exists"
fi

echo "Starting NGINX..."
exec nginx -g "daemon off;"
EOF

RUN chmod +x /docker-entrypoint-custom.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80 443

CMD ["/docker-entrypoint-custom.sh"]
