FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run setup:engine -- --force
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app

# Install ffmpeg and dependencies
RUN apt-get update && apt-get install -y ffmpeg wget ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/bin/N_m3u8DL-RE /usr/local/bin/N_m3u8DL-RE
RUN chmod +x /usr/local/bin/N_m3u8DL-RE

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

ENV DATABASE_URL="file:/app/data/stream-recorder.db"
ENV NODE_ENV=production

EXPOSE 3000
VOLUME ["/app/data", "/data/videos"]
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server/index.js"]
