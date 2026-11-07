FROM node:20-alpine

WORKDIR /app

# Install dependencies needed by prisma on alpine
RUN apk add --no-cache openssl libc6-compat

# Copy workspace package manifests
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

# Install monorepo dependencies for backend workspace
RUN npm install --workspace=apps/backend

# Copy backend source code
COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
