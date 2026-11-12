FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3002
ENV DB_PATH=/data/gestao-confeccao.sqlite

EXPOSE 3002
CMD ["node", "server/dist/index.js"]
