FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app

# Install ffmpeg and dependencies
RUN apt-get update && apt-get install -y ffmpeg wget ca-certificates && rm -rf /var/lib/apt/lists/*

# Download N_m3u8DL-RE (auto-detect architecture)
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      "amd64") ARCH="linux-x64" ;; \
      "arm64") ARCH="linux-arm64" ;; \
      *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    wget -q -O /usr/local/bin/N_m3u8DL-RE \
      "https://github.com/nilaoda/N_m3u8DL-RE/releases/latest/download/N_m3u8DL-RE_${ARCH}" && \
    chmod +x /usr/local/bin/N_m3u8DL-RE

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

ENV DATABASE_URL="file:/app/data/stream-recorder.db"
ENV NODE_ENV=production

EXPOSE 3000
VOLUME ["/app/data", "/data/videos"]
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server/index.js"]
