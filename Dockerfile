# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable \
    && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
    && mkdir -p /tmp/package \
    && pnpm pack --pack-destination /tmp/package


FROM nginx:1.29-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1


FROM node:22-bookworm-slim AS cli

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable \
    && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

COPY --from=build /tmp/package/*.tgz /tmp/package.tgz
COPY docker/cli-package.json ./package.json
RUN --mount=type=cache,id=pnpm-cli,target=/pnpm/store \
    pnpm add /tmp/package.tgz sharp@0.34.5 \
    && rm /tmp/package.tgz \
    && pnpm store prune

WORKDIR /data

ENTRYPOINT ["node", "/app/node_modules/@pilio/gemini-watermark-remover/bin/gwr.mjs"]
CMD ["--help"]
