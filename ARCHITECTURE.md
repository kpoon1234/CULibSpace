# 🏛️ CU LibSpace - System Architecture & Technical Specification

> **เอกสารข้อกำหนดสถาปัตยกรรมและโครงสร้างระบบกลาง (Single Source of Truth)**  
> โปรเจกต์ระบบจองที่นั่งห้องสมุดดิจิทัล (Digital Seat Reservation Platform) สำหรับนิสิต บุคลากร และบุคคลภายนอก

---

## 1. 📌 ภาพรวมโครงการ (Project Overview)

CU LibSpace เป็นระบบบริหารจัดการการจองที่นั่งและพื้นที่เรียนรู้ภายในห้องสมุด รองรับการยืนยันตัวตนสำหรับผู้ใช้ทั่วไปทุกคนผ่าน **Google Account Authentication** โดยระบบ Backend จะทำการวิเคราะห์และแยกประเภทผู้ใช้งานอัตโนมัติว่าเป็น นิสิต/บุคลากร (`UNIVERSITY`) หรือ บุคคลภายนอก (`OUTSIDE`) พร้อมระบบ Onboarding Flow เพื่อตรวจสอบสถานะโปรไฟล์ (`isProfileComplete`) 

ส่วนบรรณารักษ์/ผู้ดูแลระบบ (`Admin`) เข้าสู่ระบบผ่าน Admin Portal ด้วย Email + Password ปกติ

ระบบช่วยจัดการการจองที่นั่งแบบเรียลไทม์ ป้องกันการจองซ้ำ (Double Booking) ด้วย Temporary Lock Mechanism ตรวจสอบการเข้าใช้งานจริง (Check-in) จัดการบทลงโทษสำหรับผู้ไม่มาแสดงตัว (No-show Penalty) ระบบตั๋วสำหรับบุคคลภายนอก และการจัดการเรื่องแจ้งซ่อมอุปกรณ์/สถานที่

### 🎯 เป้าหมายหลัก (Core Objectives)
1. **Google Authentication & Progressive Onboarding**: เข้าใช้งานด้วย Google Account เดียวกันทุกคน โดย Backend แยกสิทธิ์อัตโนมัติ และนำทางผู้ใช้เข้าสู่แบบฟอร์มเติมเต็มโปรไฟล์เฉพาะครั้งแรก
2. **การจองแบบเรียลไทม์และยุติธรรม**: ป้องกันการจองซ้ำด้วย Concurrency Lock (Hold โต๊ะ 5 นาที) และจำกัดสิทธิ์ 1 คนต่อ 1 ที่นั่ง (1 User = 1 Active Booking Policy)
3. **ระบบบริหารจัดการคะแนนพฤติกรรม (Behavior Credit Score)**: ตัดคะแนนและระงับสิทธิ์อัตโนมัติหาก No-show หรือคะแนนต่ำกว่าเกณฑ์ (< 50.0 คะแนน)
4. **การเข้าถึงของบุคคลภายนอก (Visitor Ticketing System)**: รองรับการซื้อตั๋ว ชำระเงิน และตรวจสอบสิทธิ์ใช้งานตามช่วงเวลา
5. **ความยืดหยุ่นของเวลาเปิด-ปิด**: รองรับตารางเวลาปกติ ช่วงสอบ และวันหยุดพิเศษตามลำดับความสำคัญ (`priority`)

---

## 2. 🛠️ Tech Stack & System Architecture

```
+-----------------------------------------------------------------------+
|                           CLIENT / FRONTEND                           |
|  - Next.js (React) + TypeScript                                       |
|  - SWR (Stale-While-Revalidate) for Real-time Polling/State Sync      |
|  - Interactive 2D Map Component & Real-time Status Indicators        |
|  - Google OAuth Client Integration                                    |
+-----------------------------------------------------------------------+
                                   │
                           REST API (JSON)
                                   │
+-----------------------------------------------------------------------+
|                           SERVER / BACKEND                            |
|  - Node.js + Express.js + TypeScript                                  |
|  - Auth Service (Google OAuth Strategy, Token Verification & Auto-Map)|
|  - Admin Auth Service (Email + Password / bcrypt / JWT)               |
|  - Background Worker / Cron Jobs (No-show Worker & Expired Lock)      |
+-----------------------------------------------------------------------+
                                   │
                              Prisma ORM
                                   │
+-----------------------------------------------------------------------+
|                          DATABASE / STORAGE                           |
|  - PostgreSQL Database                                                |
|  - Polymorphic User Schema (Class Table Inheritance)                  |
|  - Optimizing Indexes for Fast Availability & Overlap Checks          |
+-----------------------------------------------------------------------+
```

### 💻 Stack Components:
- **Frontend**: Next.js (TypeScript), React, SWR (สำหรับ Real-time Status Polling), Google OAuth Client SDK
- **Backend**: Express.js (TypeScript), RESTful APIs, Node-Cron/Worker (สำหรับตรวจสอบ No-show และปลด Lock โต๊ะที่หมดเวลา)
- **Database**: PostgreSQL
- **ORM**: Prisma ORM

---

## 3. 🗄️ วิเคราะห์โครงสร้างฐานข้อมูล (Database Schema & Model Analysis)

อ้างอิงจาก `apps/backend/prisma/schema.prisma` ล่าสุด โครงสร้างฐานข้อมูลถูกวางไว้อย่างเป็นระบบ ดังนี้:

### 3.1 Polymorphic Identity System (Class Table Inheritance)
- **`User`**: ตารางหลักเก็บข้อมูลผู้ใช้ทั่วไป
  - `uid` (Int, PK)
  - `phone` (`String?`, VarChar 10, Unique - กำหนดเป็น Optional เพื่อรองรับ Google First Login)
  - `isProfileComplete` (`Boolean`, Default `false` - ตัวแปรควบคุมการเปลี่ยนหน้าไปยัง Onboarding Form)
  - `email` (String, Unique)
  - `firstname`, `lastname` (String)
  - `behaviourScore` (Decimal 4,1, Default 100.0)
  - `userType` (`UserType` Enum: `UNIVERSITY`, `THAI`, `FOREIGN`)
- **`UniversityUser`**: สืบทอดจาก `User` สำหรับนิสิต/บุคลากร (`studentId` Unique)
- **`OutsideUser`**: สืบทอดจาก `User` สำหรับบุคคลภายนอก ผูกสัมพันธ์ไปยัง `ThaiUser` หรือ `ForeignUser` และ `Ticket`
  - **`ThaiUser`**: เก็บ `citizenId` (VarChar 13, Unique)
  - **`ForeignUser`**: เก็บ `passportId` (VarChar 9, Unique)
- **`Admin`**: บรรณารักษ์/ผู้ดูแลระบบ แยกตารางอิสระเพื่อความปลอดภัย เก็บ `email` (Unique) และ `password` (bcrypt hash)

### 3.2 Spatial & Concurrency Control (Zone & Table)
- **`Zone`**: แบ่งประเภทพื้นที่ (`SILENT`, `GROUP`, `COMMON`)
- **`Table`**: เก็บสิ่งอำนวยความสะดวก (`numberOfSeat`, `plugCap`, `hasTvScreen`) และกลไก Concurrency Hold Lock:
  - `lockToken` (`String?`): โทเค็นล็อกโต๊ะชั่วคราวขณะยืนยันการจอง
  - `lockedUntil` (`DateTime?`): เวลาหมดอายุของการล็อก (timeout 5 นาที)

### 3.3 Booking & Overlap Indexes
- **`Booking`**: เก็บข้อมูลการจอง (`startDateTime`, `endDateTime`, `arriveTime`, `status`: `PENDING`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `NO_SHOW`)
- **Indexes สำคัญ**:
  - `idx_booking_table_overlap`: ป้องกันการจองโต๊ะซ้ำในเวลาเดียวกัน
  - `idx_booking_user_overlap`: บังคับนโยบาย 1 คนจองได้ 1 โต๊ะในเวลาเดียวกัน
  - `idx_booking_noshow_worker`: สำหรับ Cron Worker ค้นหาการจองที่ไม่มาเช็กอิน

### 3.4 Visitor Ticketing System
- **`Ticket`**: สำหรับ `OutsideUser` มีสถานะ `PAID` / `UNPAID` และช่วงเวลาครอบคลุมสิทธิ์การใช้บริการ (`idx_ticket_active_coverage`)

### 3.5 Operational Schedule & System Configuration
- **`OperatingSchedule`**: ตารางเวลาเปิด-ปิดตามช่วงวัน พร้อมระบบ `priority` (1=ปกติ, 2=ช่วงสอบ, 3=วันหยุดพิเศษ/ปิดปรับปรุง)
- **`SystemConfig`**: ค่ากำหนดเงื่อนไขของระบบ เช่น `maxBookingDurationMinutes`, `lateThresholdMinutes`, `earlyCheckInMinutes`, `minScoreToBook`, `maxAdvanceBookingDays`

---

## 4. 🧩 รายละเอียดโมดูลและตรรกะทางธุรกิจ (Module Breakdown & Business Logic)

### Module 1: Authentication & Profile Management (FR-1.1 - FR-1.6 | EPIC 1)
- **Google OAuth Login Flow**:
  1. ผู้ใช้ล็อกอินผ่าน Google Account
  2. Backend ทำการ Verify Token และตรวจสอบ `email` domain:
     - หากเป็นอีเมลจุฬาฯ (`@chula.ac.th` หรือ `@student.chula.ac.th`) $
ightarrow$ กำหนด `userType = UNIVERSITY`
     - หากเป็นอีเมลทั่วไป (`@gmail.com` ฯลฯ) $
ightarrow$ กำหนด `userType = THAI` หรือ `FOREIGN` (ตามการระบุเอกสาร)
  3. Backend ตรวจสอบค่า `isProfileComplete`:
     - **ถ้า `isProfileComplete === true`**: บายพาสฟอร์ม และเปลี่ยนหน้าไปยัง Main Dashboard ทันที
     - **ถ้า `isProfileComplete === false`**:
       - นิสิต/บุคลากร $
ightarrow$ เปลี่ยนหน้าไปยัง **Phone Setup Form** (บังคับกรอกเบอร์โทร 10 หลัก)
       - บุคคลภายนอก $
ightarrow$ เปลี่ยนหน้าไปยัง **Visitor Setup Form** (บังคับกรอกเบอร์โทร 10 หลัก + Citizen ID 13 หลัก หรือ Passport ID 9 หลัก)
  4. เมื่อกรอกข้อมูลสมบูรณ์ $
ightarrow$ ระบบบันทึกข้อมูล และอัปเดต `isProfileComplete = true`
- **Admin Authentication**: บรรณารักษ์ล็อกอินผ่าน Admin Portal โดยใช้ Email + Password (bcrypt hash)
- **Profile Management**: ผู้ใช้สามารถดูคะแนนพฤติกรรม (`behaviourScore`) ประวัติการถูกตัด/เพิ่มคะแนน (`ManageScore`) และแก้ไขเบอร์โทรศัพท์ได้

### Module 2: Seat Searching & Real-time Browsing (FR-2.1 - FR-2.4 | EPIC 2)
- **Interactive 2D Map**: แสดงผังโซน (Silent, Group, Common) และตำแหน่งโต๊ะ
- **Real-time Status Polling (SWR)**: ดึงสถานะโต๊ะ (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `CLOSED`) แบบเรียลไทม์
- **Filtering System**: กรองโต๊ะตามประเภทโซน, ปลั๊กไฟ (`plugCap`), จอ TV (`hasTvScreen`)
- **Future Availability Search**: ตรวจสอบความว่างของโต๊ะล่วงหน้าตาม วัน และช่วงเวลาที่ต้องการ

### Module 3: Table Reservation & Concurrency Management (FR-3.1 - FR-3.5 | EPIC 3)
- **Pre-booking Validation Rules**:
  1. คะแนนพฤติกรรมผู้ใช้ ต้อง `>= SystemConfig.minScoreToBook` (เช่น >= 50.0 คะแนน)
  2. ระยะเวลาจอง ต้องไม่เกิน `SystemConfig.maxBookingDurationMinutes`
  3. ผู้ใช้ไม่มี active booking อื่นที่ทับซ้อน (1 User = 1 Active Booking Policy)
  4. บุคคลภายนอก ต้องมี `Ticket` สถานะ `PAID` ครอบคลุมช่วงเวลาที่จะจอง
- **Temporary Lock Mechanism (Double Booking Protection)**:
  - เมื่อผู้ใช้เริ่มยืนยันจอง ระบบจะสร้าง `lockToken` และอัปเดต `lockedUntil = now() + 5 minutes`
  - หากจองสำเร็จ อัปเดตสถานะเป็น `PENDING`
  - หากไม่มีการยืนยันภายใน 5 นาที Background Worker จะคืนสถานะโต๊ะเป็น `AVAILABLE`

### Module 4: Check-in, Verification & Penalty Worker (FR-4.1 - FR-5.4 | EPIC 4 & 5)
- **Check-in Logic**:
  - เช็กอินได้ล่วงหน้าไม่เกิน `SystemConfig.earlyCheckInMinutes`
  - เมื่อเช็กอินสำเร็จ: อัปเดต `Booking.status = ACTIVE`, `Booking.arriveTime = now()`, `Table.status = OCCUPIED`
- **Automated No-show Worker (Cron Job)**:
  - ทำงานทุกๆ 1 นาที ตรวจสอบการจองสถานะ `PENDING` ที่เกินเวลาเริ่ม + `SystemConfig.lateThresholdMinutes` (เช่น สายเกิน 15 นาที)
  - อัปเดต `Booking.status = NO_SHOW`, คืนสถานะ `Table.status = AVAILABLE`
  - ตัดคะแนนพฤติกรรมอัตโนมัติ และบันทึกประวัติลง `ManageScore`
- **Auto Suspension Policy**: หากคะแนนลดลงเหลือ `< 50.0` ระบบจะระงับสิทธิ์การจองโต๊ะใหม่ทันที

### Module 5: Visitor Ticketing System (FR-6.1 - FR-6.3 | EPIC 6)
- บุคคลภายนอกชำระเงินซื้อตั๋วเข้าใช้งานตามช่วงเวลา $
ightarrow$ เมื่อชำระสำเร็จ อัปเดต `Ticket.status = PAID` และสามารถนำตั๋วไปใช้จองโต๊ะได้

### Module 6: Facility & Issue Management (FR-7.1 - FR-7.5 | EPIC 7)
- ผู้ใช้ส่งรายงานแจ้งปัญหาอุปกรณ์/สถานที่ (`IssueReport`)
- Admin ตรวจสอบรายการ อัปเดตสถานะปัญหา (`ManageIssue`) และปรับสถานะโต๊ะเป็น `CLOSED` หากชำรุด
- Admin ตั้งค่าตารางเวลาเปิด-ปิด (`OperatingSchedule`) และเงื่อนไขระบบ (`SystemConfig`)

---

## 5. 🌐 API Specification & Endpoint Structure

### 5.1 Authentication Module (`/api/auth`)
- `POST /api/auth/google-login` : เข้าสู่ระบบด้วย Google Token (ส่งคืน JWT Session และค่า `isProfileComplete`)
- `POST /api/auth/complete-profile` : บันทึกข้อมูล Onboarding (Phone สำหรับ CU / Phone + CitizenID หรือ Passport สำหรับ Outside) และอัปเดต `isProfileComplete = true`
- `POST /api/auth/admin-login` : เข้าสู่ระบบบรรณารักษ์ (Email + Password)
- `GET /api/auth/me` : ดึงข้อมูลส่วนตัว, สิทธิ์ผู้ใช้, คะแนนพฤติกรรม และสถานะโปรไฟล์
- `PUT /api/auth/profile` : แก้ไขข้อมูลส่วนตัว (เบอร์โทรศัพท์)

### 5.2 Seat & Zone Module (`/api/seats`)
- `GET /api/seats/layout` : ดึงผังโซนและโต๊ะทั้งหมด พร้อมกรองด้วย Query Parameters (`zoneType`, `plugCap`, `hasTvScreen`, `date`, `timeSlot`)
- `GET /api/seats/:tableId/availability` : ตรวจสอบช่วงเวลาว่างของโต๊ะที่เลือก

### 5.3 Booking Module (`/api/bookings`)
- `POST /api/bookings/hold` : สั่ง Hold ล็อกโต๊ะชั่วคราว 5 นาที (`lockToken`)
- `POST /api/bookings` : ยืนยันการจองที่นั่ง
- `GET /api/bookings/my-history` : ดึงประวัติการจองของผู้ใช้ (เรียงลำดับจากล่าสุด)
- `POST /api/bookings/:bookingId/check-in` : เช็กอินเข้าใช้งานที่นั่ง
- `POST /api/bookings/:bookingId/cancel` : ยกเลิกการจองก่อนถึง cutoff time

### 5.4 Visitor Ticket Module (`/api/tickets`)
- `POST /api/tickets/purchase` : ชำระเงินซื้อตั๋วบุคคลภายนอก
- `GET /api/tickets/my-tickets` : เรียกดูตั๋วและประวัติการซื้อ

### 5.5 Facility Issue Module (`/api/issues`)
- `POST /api/issues` : สมาชิกแจ้งปัญหาอุปกรณ์/โต๊ะ
- `GET /api/issues` : [Admin] เรียกดูรายการแจ้งปัญหาทั้งหมด
- `PATCH /api/issues/:issueId` : [Admin] อัปเดตสถานะการแก้ไขปัญหา

### 5.6 Admin & System Management Module (`/api/admin`)
- `POST /api/admin/adjust-score` : [Admin] ปรับคะแนนพฤติกรรมของผู้ใช้พร้อมระบุเหตุผล
- `GET/PUT /api/admin/schedules` : [Admin] ดูและแก้ไขตารางเวลาเปิด-ปิดห้องสมุด
- `GET/PUT /api/admin/config` : [Admin] ดูและแก้ไขค่า System Configuration

---

## 6. 📂 Standard Project Folder Structure (Monorepo Workspaces)

โปรเจกต์ใช้โครงสร้างแบบ **Monorepo (npm workspaces)** โดยแบ่งโค้ดออกเป็น `apps/backend` และ `apps/frontend` ภายใต้ไดเรกทอรี `apps/` ดังนี้:

```
CULibSpace/
├── apps/
│   ├── backend/                      # Express.js + TypeScript REST API Server
│   │   ├── prisma/
│   │   │   ├── migrations/           # Database migration SQL files
│   │   │   ├── schema.prisma         # Prisma DB Schema definition
│   │   │   └── seed.ts               # Database seeder with developer test dataset
│   │   ├── src/
│   │   │   ├── controllers/          # Request handlers & HTTP responses (e.g. authController.ts)
│   │   │   ├── middlewares/          # Auth JWT, RBAC Guard, Token validation
│   │   │   ├── routes/               # Express routes mapping (e.g. authRoutes.ts)
│   │   │   ├── services/             # Business logic (e.g. authService.ts)
│   │   │   ├── utils/                # Helper utilities (jwt.ts, roleMapper.ts)
│   │   │   ├── passport.ts           # Google OAuth2 Strategy & Passport configuration
│   │   │   ├── server.ts             # Express server entry point & middleware mounting
│   │   │   ├── test_unit.ts          # Unit test suite
│   │   │   └── test_integration.ts   # Integration test suite
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                     # Next.js (App Router) + React + TypeScript Client
│       ├── app/                      # Next.js App Router directory
│       │   ├── auth/callback/        # OAuth callback handler (page.tsx)
│       │   ├── login/                # User & Admin Login UI (page.tsx)
│       │   ├── layout.tsx            # Root layout
│       │   ├── page.tsx              # Main Dashboard / Landing Page
│       │   └── globals.css           # Tailwind & global styles
│       ├── components/               # Reusable UI components
│       │   ├── HomeComponent/        # Banner, Dashboard widgets
│       │   ├── Login/                # Google Icons, Forgot Password modals
│       │   └── Topmenu/              # Navigation bar & menu items
│       ├── package.json
│       └── next.config.ts
├── docker-compose.yml                # PostgreSQL Database container
├── package.json                      # Root workspace scripts & dev tools
└── ARCHITECTURE.md                   # System Architecture Specification
```