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
CN="${SSL_CN:-*.grid.s6securitylabs.com}"
DAYS="${SSL_DAYS:-3650}"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "=== Generating Wildcard Self-Signed SSL Certificate ==="
    echo "Common Name: $CN"
    echo "Valid for: $DAYS days"

    # Create temporary OpenSSL config for wildcard cert with SANs
    cat > /tmp/ssl.conf <<SSLCONF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = AU
ST = South Australia
L = Adelaide
O = S6 Security Labs
OU = Chromium Grid
CN = $CN

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = grid.s6securitylabs.com
DNS.2 = *.grid.s6securitylabs.com
DNS.3 = dashboard.grid.s6securitylabs.com
DNS.4 = instance0.grid.s6securitylabs.com
DNS.5 = instance1.grid.s6securitylabs.com
DNS.6 = instance2.grid.s6securitylabs.com
DNS.7 = instance3.grid.s6securitylabs.com
DNS.8 = instance4.grid.s6securitylabs.com
DNS.9 = instance5.grid.s6securitylabs.com
DNS.10 = instance6.grid.s6securitylabs.com
DNS.11 = instance7.grid.s6securitylabs.com
DNS.12 = instance8.grid.s6securitylabs.com
DNS.13 = instance9.grid.s6securitylabs.com
SSLCONF

    openssl req -x509 -nodes -days "$DAYS" \
        -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -config /tmp/ssl.conf

    rm /tmp/ssl.conf
    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"
    echo "✓ Wildcard certificate generated for *.grid.s6securitylabs.com!"
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
