FROM node:20-bookworm-slim AS client-build

WORKDIR /app
COPY client/package*.json ./client/
RUN npm --prefix client ci
COPY client ./client
RUN npm --prefix client run build

FROM node:20-bookworm-slim AS server-deps

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev

FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PORT=5000
ENV PUZZLES_DB_PATH=/app/server/data/puzzles.db

WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=client-build /app/client/build ./server/client-build

EXPOSE 5000
CMD ["npm", "--prefix", "server", "start"]
