# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS app
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig ca-certificates && rm -rf /var/lib/apt/lists/*
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node scripts/generate.mjs ./scripts/generate.mjs
RUN --mount=type=secret,id=proxy_ca,mode=0444 \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci; else npm ci; fi
COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN mkdir -p /app/data/assets /home/node/.cache/fontconfig
ENV FONTCONFIG_PATH=/etc/fonts
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]
