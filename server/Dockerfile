# Theras AI server (AI proxy). Build context = server/.
FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY tsconfig.json ./
COPY src ./src
# The external asset index (written by scripts/build-asset-index.ts). The server reads it at start.
COPY data ./data
ENV NODE_ENV=production
CMD ["bun", "src/main.ts"]
