# ==============================================================================
# CULibSpace Frontend Dockerfile (Multi-stage Build for Next.js Production)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base Image
# ใช้ Node 22 บน Alpine Linux (ขนาดเบา ~130MB)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS base

# กำหนด Working Directory หลักภายใน Container
WORKDIR /app

# ติดตั้ง libc6-compat:
# จำเป็นอย่างยิ่งสำหรับ Next.js เพื่อให้ SWC Compiler (Rust binary) ทำงานบน Alpine Linux (musl libc) ได้
RUN apk add --no-cache libc6-compat

# ------------------------------------------------------------------------------
# Stage 2: Builder
# ใช้สำหรับรัน 'next build' เพื่อ Bundle และ Optimize โค้ด React/Next.js
# ------------------------------------------------------------------------------
FROM base AS builder

# คัดลอก Package Manifests เพื่อใช้ประโยชน์จาก Docker Layer Cache
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

# ติดตั้ง Dependencies ทั้งหมด (รวม DevDependencies) สำหรับการ build Next.js
# --workspace=apps/frontend: ติดตั้งเฉพาะของ frontend
# --ignore-scripts: ข้าม lifecycle scripts เช่น husky
RUN npm ci --workspace=apps/frontend --ignore-scripts

# คัดลอก Source Code ของ frontend เข้ามา
COPY apps/frontend ./apps/frontend

# รับ Build Arguments และแปลงเป็น Environment Variables ในช่วง build:
# NEXT_PUBLIC_API_URL: สำหรับ remote domain ให้เป็น "" เพื่อให้ browser ใช้ relative path ผ่าน Next.js rewrite
# INTERNAL_API_URL: URL ภายในวง Docker Network ชี้ไปที่ Backend (http://backend:8080)
ARG NEXT_PUBLIC_API_URL=""
ARG INTERNAL_API_URL=http://backend:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV INTERNAL_API_URL=${INTERNAL_API_URL}

# สั่ง Build Next.js Production Bundle (ผลลัพธ์จะอยู่ที่ .next/)
RUN npm run build --workspace=apps/frontend

# ------------------------------------------------------------------------------
# Stage 3: Runtime (Production Image ตัวจริง)
# ทิ้ง Build Tools และ DevDependencies ทั้งหมด เหลือเฉพาะ Production Assets
# ------------------------------------------------------------------------------
FROM base AS runtime

WORKDIR /app

# คัดลอก Package Manifests เพื่อติดตั้งเฉพาะ Production Dependencies
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

# ติดตั้งเฉพาะ Production Dependencies:
# --omit=dev: ไม่ลง DevDependencies เช่น typescript, tailwindcss, eslint
# npm cache clean --force: ลบแคช npm ทิ้งเพื่อประหยัดพื้นที่ดิสก์
RUN npm ci --workspace=apps/frontend --omit=dev --ignore-scripts && npm cache clean --force

# คัดลอกเฉพาะ Artifacts ที่ได้จากการ Build มายัง Runtime:
# - .next: ไฟล์ HTML, JavaScript bundles, CSS ที่ถูก optimize แล้ว
# - public: Static assets เช่น รูปภาพ, โลโก้, ฟอนต์
# - next.config.ts: คอนฟิกการทำงาน เช่น URL Rewrites (/api/* -> backend)
# --chown=node:node: กำหนดสิทธิ์ให้ User 'node' เป็นเจ้าของไฟล์
COPY --from=builder --chown=node:node /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder --chown=node:node /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=node:node /app/apps/frontend/next.config.ts ./apps/frontend/next.config.ts
COPY --from=builder --chown=node:node /app/apps/frontend/package.json ./apps/frontend/package.json

WORKDIR /app/apps/frontend

# Environment Variables สำหรับ Runtime:
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV INTERNAL_API_URL=http://backend:8080

# ประกาศพอร์ตที่ Frontend เปิดให้บริการ
EXPOSE 3000

# สลับจาก root user มาใช้ non-root user 'node' เพื่อความปลอดภัยด้าน DevSecOps
USER node

# คำสั่งเริ่มต้นการทำงานของ Next.js ในโหมด Production (เร็วและเสถียรกว่า next dev มหาศาล)
CMD ["/app/node_modules/.bin/next", "start"]
