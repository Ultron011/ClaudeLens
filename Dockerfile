# ClaudeLens — single image that serves the API and the built dashboard.
FROM node:22-slim

RUN corepack enable
WORKDIR /app

# Install workspace deps first (better layer caching). Copy every package
# manifest the workspace references so --frozen-lockfile resolves.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY cli/package.json ./cli/
RUN pnpm install --frozen-lockfile

# App source + build the dashboard into web/dist (served by the API).
COPY . .
RUN pnpm --filter @claudelens/web build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Boot runs the schema migration (idempotent) then listens.
CMD ["pnpm", "--filter", "server", "start"]
