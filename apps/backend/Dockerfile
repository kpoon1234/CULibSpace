FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

# Copy workspace package manifests
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/

# Install dependencies skipping lifecycle hooks like husky (prevents exit code 127)
RUN npm install --workspace=apps/backend --ignore-scripts

# Copy backend source code
COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
