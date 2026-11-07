FROM node:20-alpine

WORKDIR /app

# Install libc6-compat for Next.js / Tailwind compatibility on alpine
RUN apk add --no-cache libc6-compat

# Copy workspace package manifests
COPY package*.json ./
COPY apps/frontend/package*.json ./apps/frontend/

# Install monorepo dependencies for frontend workspace
RUN npm install --workspace=apps/frontend

# Copy frontend source code
COPY apps/frontend ./apps/frontend

WORKDIR /app/apps/frontend

ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "dev"]
