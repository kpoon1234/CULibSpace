FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copy workspace package manifests
COPY package*.json ./
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/backend/package*.json ./apps/backend/

# Install dependencies skipping lifecycle hooks like husky (prevents exit code 127)
RUN npm install --workspace=apps/frontend --ignore-scripts

# Copy frontend source code
COPY apps/frontend ./apps/frontend

WORKDIR /app/apps/frontend

ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "dev"]
