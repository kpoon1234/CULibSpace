# ==============================================================================
# CULibSpace Backend Dockerfile (Multi-stage Build for Production)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base Image
# ใช้เป็นฐานสำหรับทุก stage เพื่อแชร์ dependencies ระดับระบบปฏิบัติการ
# ------------------------------------------------------------------------------
FROM node:22-alpine AS base

# กำหนด Working Directory หลักภายใน Container
WORKDIR /app

# ติดตั้ง System Packages ที่จำเป็น:
# - openssl: จำเป็นสำหรับ Prisma Query Engine ในการเชื่อมต่อ Database ผ่าน SSL/TLS
# - libc6-compat: ไลบรารีจำลอง glibc เพื่อให้ Native Binaries รันบน Alpine (musl libc) ได้อย่างราบรื่น
# --no-cache: ไม่เก็บไฟล์แคชของ package index เพื่อให้ Image มีขนาดเล็กที่สุด
RUN apk add --no-cache openssl libc6-compat

# ------------------------------------------------------------------------------
# Stage 2: Builder
# ใช้สำหรับ Compile TypeScript เป็น JavaScript และ Generate Prisma Client
# ------------------------------------------------------------------------------
FROM base AS builder

# คัดลอกเฉพาะไฟล์ Package Manifests เข้ามาก่อน
# การแยกบรรทัดนี้ช่วยใช้ประโยชน์จาก Docker Layer Cache (ไม่ต้อง npm ci ใหม่ถ้า dependencies ไม่เปลี่ยน)
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# ติดตั้ง Dependencies ทั้งหมด (รวม DevDependencies) สำหรับการ build
# --workspace=apps/backend: ติดตั้งเฉพาะของ backend ในโครงสร้าง Monorepo
# --ignore-scripts: ข้าม lifecycle scripts (เช่น husky git hooks) ป้องกัน error 127 ใน container
RUN npm ci --workspace=apps/backend --ignore-scripts

# คัดลอก Source Code ของ backend ทั้งหมดเข้ามา
COPY apps/backend ./apps/backend

# สลับ Working Directory เข้าไปยังโฟลเดอร์ของ backend
WORKDIR /app/apps/backend

# 1. npx prisma generate: สร้าง Prisma Client types และ binaries จาก schema.prisma
# 2. npm run build:dist: ทำการ Compile TypeScript (src/) ออกมาเป็น JavaScript (dist/)
RUN npx prisma generate && npm run build:dist

# ------------------------------------------------------------------------------
# Stage 3: Runtime (Production Image ตัวจริง)
# ทิ้ง TypeScript Compiler, DevDependencies, และ Source Code ทั้งหมด
# คัดลอกมาเฉพาะไฟล์ที่จำเป็นต่อการรัน ช่วยให้ขนาดเล็กและปลอดภัยสูง (Least Privilege)
# ------------------------------------------------------------------------------
FROM base AS runtime

WORKDIR /app

# คัดลอก Package Manifests เพื่อติดตั้งเฉพาะ Production Dependencies
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# ติดตั้งเฉพาะ Production Dependencies เท่านั้น:
# --omit=dev: ตัด DevDependencies ทั้งหมดออก (เช่น typescript, tsx, @types/*)
# npm cache clean --force: ล้างไฟล์แคชของ npm ทิ้งทันทีเพื่อประหยัดพื้นที่ดิสก์
RUN npm ci --workspace=apps/backend --omit=dev --ignore-scripts && npm cache clean --force

# คัดลอกผลลัพธ์ที่ได้จาก Builder Stage เข้ามาที่ Runtime:
# --chown=node:node: กำหนดสิทธิ์ให้ User 'node' เป็นเจ้าของไฟล์ทันที
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=node:node /app/apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend

# กำหนดโหมดการทำงานเป็น Production (เพิ่มประสิทธิภาพของ Express และ Libraries ต่างๆ)
ENV NODE_ENV=production

# ประกาศพอร์ตที่แอปพลิเคชันเปิดให้บริการ (เอกสารเชิงสัญลักษณ์สำหรับ Docker)
EXPOSE 8080

# สลับจาก root user มาใช้ non-root user 'node' ที่ Alpine เตรียมไว้ให้
# เป็น Best Practice ด้าน DevSecOps เพื่อป้องกันการถูกยึด Host หาก Container ถูกโจมตี
USER node

# คำสั่งเริ่มต้นการทำงานของ Backend ด้วย Node.js (รันจากไฟล์ JavaScript ที่ compile แล้ว)
CMD ["node", "dist/server.js"]
