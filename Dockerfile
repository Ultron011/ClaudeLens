# ClaudeLens — single image that serves the API and the built dashboard.
# Two stages: `build` has the whole workspace + dev deps to compile the dashboard; the runtime
# stage carries only the server's production deps, its source, shared/, and web/dist.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
# Copy every package manifest the workspace references so --frozen-lockfile resolves.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY cli/package.json ./cli/
RUN pnpm install --frozen-lockfile
COPY shared ./shared
COPY web ./web
RUN pnpm --filter @claudelens/web build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY cli/package.json ./cli/
# Server + its workspace deps (shared) only, no devDependencies.
RUN pnpm install --frozen-lockfile --prod --filter "@claudelens/server..." && pnpm store prune
COPY shared/src ./shared/src
COPY server/src ./server/src
COPY --from=build /app/web/dist ./web/dist

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
USER node
# node is PID 1's direct child (compose `init: true` supplies tini), so SIGTERM reaches the
# server's graceful-shutdown handler instead of being swallowed by pnpm/sh wrappers.
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/index.ts"]
