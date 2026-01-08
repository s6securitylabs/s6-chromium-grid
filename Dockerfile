FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    fonts-noto-cjk \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    xvfb \
    x11vnc \
    fluxbox \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libegl1-mesa \
    intel-media-va-driver \
    vainfo \
    iptables \
    dumb-init \
    procps \
    locales \
    tzdata \
    nodejs \
    npm \
    python3-websockify \
    python3-numpy \
    curl \
    unzip \
    socat \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen

RUN curl -L https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.zip -o /tmp/novnc.zip \
    && unzip /tmp/novnc.zip -d /opt \
    && mv /opt/noVNC-1.4.0 /opt/novnc \
    && rm /tmp/novnc.zip

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN groupadd -r render || true \
    && groupadd -r chrome \
    && useradd -r -g chrome -G audio,video,render chrome \
    && mkdir -p /home/chrome/Downloads /data /tmp/.X11-unix /dashboard \
    && chown -R chrome:chrome /home/chrome /data \
    && chmod 1777 /tmp/.X11-unix

COPY dashboard/package.json /dashboard/
WORKDIR /dashboard
RUN npm install --omit=dev && npm cache clean --force

COPY dashboard/ /dashboard/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /

EXPOSE 8080
EXPOSE 9222 9223 9224 9225 9226 9227 9228 9229 9230 9231
EXPOSE 5900 5901 5902 5903 5904 5905 5906 5907 5908 5909
EXPOSE 6080 6081 6082 6083 6084 6085 6086 6087 6088 6089

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/entrypoint.sh"]
