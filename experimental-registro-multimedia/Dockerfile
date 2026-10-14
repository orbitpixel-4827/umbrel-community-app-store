FROM node:22-bookworm-slim

WORKDIR /app

COPY server/package*.json ./server/
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && cd server \
  && npm install --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server ./server
COPY public ./public

EXPOSE 3000

CMD ["node", "server/server.js"]
