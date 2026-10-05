# LendMatch, self-hosted. Build:  docker compose build     Run:  docker compose up -d
# BASE_IMAGE: override to use a private registry mirror or a hardened internal Node image (Debian-based, Node 20+).
ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's query engine needs OpenSSL. The slim image lacks it (installed here); full images already have it, and then
# nothing is downloaded, which also lets a build on a network that blocks the Debian mirrors succeed.
RUN if ! command -v openssl >/dev/null 2>&1; then \
      apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*; \
    fi

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

# The runtime image keeps node_modules in full: it also runs `prisma migrate deploy` and the cache commands (tsx).
FROM base AS run
ENV NODE_ENV=production PORT=3000
COPY --chown=node:node --from=build /app /app
USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["npm", "start"]
