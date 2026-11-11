FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache libc6-compat

FROM base AS builder

COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

RUN npm ci --workspace=apps/frontend --ignore-scripts

COPY apps/frontend ./apps/frontend

ARG NEXT_PUBLIC_API_URL=""
ARG INTERNAL_API_URL=http://backend:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV INTERNAL_API_URL=${INTERNAL_API_URL}

RUN npm run build --workspace=apps/frontend

FROM base AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

RUN npm ci --workspace=apps/frontend --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder --chown=node:node /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder --chown=node:node /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=node:node /app/apps/frontend/next.config.ts ./apps/frontend/next.config.ts
COPY --from=builder --chown=node:node /app/apps/frontend/package.json ./apps/frontend/package.json

WORKDIR /app/apps/frontend

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV INTERNAL_API_URL=http://backend:8080

EXPOSE 3000

USER node

CMD ["/app/node_modules/.bin/next", "start"]
