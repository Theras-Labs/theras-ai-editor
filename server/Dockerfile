# Theras AI server (AI proxy). Build context = server/.
FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
CMD ["bun", "src/main.ts"]
