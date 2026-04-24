# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile --filter @chatwoot-client-portal-v2/frontend...

COPY frontend frontend
RUN pnpm --dir frontend build

FROM caddy:2-alpine

COPY infra/production/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
