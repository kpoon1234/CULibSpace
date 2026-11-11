FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

FROM base AS builder

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci --workspace=apps/backend --ignore-scripts

COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

RUN npx prisma generate && npm run build:dist

FROM base AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci --workspace=apps/backend --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=node:node /app/apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend

ENV NODE_ENV=production

EXPOSE 8080

USER node

CMD ["node", "dist/server.js"]
