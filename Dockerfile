FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      "amd64") ARCH="linux-x64" ;; \
      "arm64") ARCH="linux-arm64" ;; \
      *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    wget -q -O /usr/local/bin/N_m3u8DL-RE \
      "https://github.com/nilaoda/N_m3u8DL-RE/releases/latest/download/N_m3u8DL-RE_${ARCH}" && \
    chmod +x /usr/local/bin/N_m3u8DL-RE

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.env.example ./.env.example

EXPOSE 3000
VOLUME ["/app/data", "/data/videos"]

ENV DATABASE_URL=file:./data/app.db
ENV PORT=3000
ENV ENGINE_MODE=real

CMD ["node", "dist/server/main.js"]
