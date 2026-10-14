FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm install

COPY backend backend
COPY frontend frontend

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/music-stats.sqlite
ENV IMAGE_CACHE_DIR=/app/data/image-cache
ENV FRONTEND_DIST_PATH=/app/frontend/dist

EXPOSE 3001

CMD ["node", "backend/src/server.js"]
