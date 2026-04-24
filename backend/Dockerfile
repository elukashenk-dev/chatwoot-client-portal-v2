# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile --filter @chatwoot-client-portal-v2/backend...

FROM deps AS build

COPY backend backend
RUN pnpm --dir backend build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json

RUN pnpm install --frozen-lockfile --prod --filter @chatwoot-client-portal-v2/backend...

COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/drizzle drizzle

EXPOSE 3301

USER node

CMD ["node", "backend/dist/server.js"]
