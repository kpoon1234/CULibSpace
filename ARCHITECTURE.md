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

### Module 2: Table Searching & Real-time Browsing (FR-2.1 - FR-2.4 | EPIC 2)
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

#### US7-4: Applying saved schedules and booking policies

- This task consumes saved settings, not the admin schedule/policy CRUD or settings UI.
  Settings writers must update/upsert `SystemConfig.configId = 1` (the existing seed contract).
  `bookingPolicyService.ts` reads and validates only the fields needed by each consumer;
  missing/invalid policy or failed reads return a safe `503`, never guessed defaults.
- Layout queries, time-specific holds and final booking validation share `ScheduleService`.
  Final booking reads schedules and policies again through its transaction client, so a hold
  does not bypass settings saved before confirmation. Existing issue/table/ticket/overlap guards remain.
- Schedule dates and local `date`/`timeSlot` inputs use `Asia/Bangkok`, independent of the server
  timezone. ISO timestamps must include an offset. Each covered calendar day uses its highest-priority
  schedule; equal top priorities fail with `SCHEDULE_CONFLICT`. Closed dates override operating hours,
  `is24Hours` covers the entire day, and intervals are half-open (ending at midnight does not use the next day).
- Compatibility decisions retained pending team confirmation: a date with **no saved schedule** uses
  the existing 08:00–21:00 regular hours; advance booking means a rolling `N * 24 hours` from now.
  No schema migration or booking-policy snapshot is added. Existing bookings continue using the latest
  saved early/late limits for check-in, cancellation and No-show; schedule changes do not cancel them.
- Cancellation closes when the saved early check-in window opens. Check-in includes the exact late
  boundary; No-show applies strictly after it. The worker rechecks the saved late threshold inside its
  transaction before deducting score, so a stale scan cannot ignore an extended grace period.
- `GET /api/system-config/booking-limits` exposes the five saved booking policy fields with `no-store`.
  Existing active-booking metadata uses the same early/late values. Hold expiry (5 minutes), score
  deduction (10 points) and ticket/payment settings are unchanged.
- Regression coverage: `test_booking_policy.ts`, `test_saved_schedules.ts`, and
  `test_saved_booking_rules_integration.ts`. The integration suite requires a distinct PostgreSQL
  `TEST_DATABASE_URL` ending in `_test`, an empty operating-schedule table, and cleans its own fixtures.
  It runs in `npm run test:integration --workspace=apps/backend` and therefore in the existing PR checks.

#### US7-3: Issue-driven facility availability

- Reuses the issue statuses from US7-1/US7-2. `IssueReport.blocksTable` defaults to
  `false`; only `IN_PROGRESS` can block a table. `PENDING` and `COMPLETED` normalize
  this flag to `false` (also enforced by a database CHECK constraint).
- Effective closure is **stored `Table.status = CLOSED` OR any `IN_PROGRESS`
  issue with `blocksTable = true`**. Issue changes do not overwrite stored
  `Table.status`: manual closure stays independent, and completing one issue
  cannot reopen a table blocked by another issue. Layout re-evaluates bookings
  and holds after reopening, using its existing time-window logic.
- `facilityAvailabilityService.ts` owns the shared predicate and
  `applyIssueAvailabilityChange(tx, issueId, { status, blocksTable })` helper.
  The **Poom/Andy status-and-notes API** must authorize the admin, validate its
  request, and call this helper **before any issue status/flag write**, inside
  the same interactive transaction as its `ManageIssue` audit entry. The helper
  acquires the table row lock before changing the issue, then checks blocking
  issues once after the update. If the table is closed, any remaining hold
  fields are cleared (including partial/stale holds on an already closed table).
  Empty holds are not rewritten. Do not write the status first or call the
  helper after committing the audit. Any subsequent audit error must roll back
  the entire transaction. This task adds no duplicate admin endpoint or UI.
- The **Kla/Nine admin form** should expose an opt-in “Close table while fixing”
  checkbox only for `IN_PROGRESS`, and send an explicit boolean. The existing
  admin list API exposes `blocksTable` so the UI can initialize the checkbox;
  no second list endpoint is added. A composite index on
  `(tableId, status, blocksTable)` supports the shared availability predicate.
- Hold and finalized booking operations use the same table lock and re-check
  issue availability inside their transactions, returning `TABLE_CLOSED` when
  blocked. A stale map/hold token cannot bypass this check. Existing floor-plan
  polling (20 seconds) and `CLOSED` display are reused; no WebSocket is added.
- The expiration worker locks expired rows in ascending `tableId` order inside
  its transaction, with `FOR UPDATE SKIP LOCKED`. Rows held by another transaction
  are left to a later tick instead of creating an inverted wait cycle with
  `acquireLock`. Cleanup updates only the locked IDs which are still expired;
  it cannot clear a renewed hold. Direct cleanup errors propagate to tests/callers,
  while the scheduled worker logs failed ticks and keeps running.
- **Existing bookings are unchanged:** this task prevents new holds/bookings;
  it does not cancel, relocate, stop an active booking, deny existing check-in,
  or change no-show penalties. The team must agree the existing-booking policy
  before wiring this helper into a production admin closure flow. Workers can
  continue updating stored booking status without removing effective closure.
- Reuses PR #63's issue schema/services, now merged into main; its existing
  status migration is unchanged. This branch adds only US7-3 changes.
  `npm test --workspace=apps/backend` runs the mock facility suite;
  `npm run test:integration --workspace=apps/backend` includes real PostgreSQL
  issue/hold/booking/expiration-worker races and rollback checks, guarded by a distinct
  `TEST_DATABASE_URL` whose database name ends in `_test`.

#### US7-3: Admin issue status and notes API

- `PATCH /api/admin/issues/:issueId` requires an admin Bearer token and an
  existing admin account. The issue ID must be a positive PostgreSQL integer.
  The JSON body contains exactly these required fields:

  ```json
  {
    "status": "In Progress",
    "blocksTable": true,
    "notes": "Waiting for a replacement power socket"
  }
  ```

- Status labels match the list API: `Pending`, `In Progress`, `Completed`.
  Any of the three statuses can be selected, including reopening a completed
  report or saving notes without changing its status. `blocksTable` must always
  be an explicit boolean; the shared availability helper normalizes it to
  `false` for `Pending` and `Completed`. The UI should send the current status
  and checkbox value when changing only notes.
- Notes are trimmed and limited to 2,000 characters. Send `"notes": ""` to
  clear the current notes. Each save appends a `ManageIssue` record with the
  authenticated admin ID and notes in `info`; earlier records and the original
  user report remain intact. No new schema or migration is required.
- The helper's issue/availability update, hold cleanup, and audit insert run in
  one transaction. All API updates share the helper's table lock; server audit
  timestamps increase strictly per issue so rapid saves cannot collide on the
  compound audit key or return an older note as the latest one.
- Success returns `{ success: true, message, data }`, where `data` contains
  `issueId`, `tableId`, `status`, `blocksTable`, `closed` (effective facility
  closure), `notes`, `updatedBy`, and `updatedAt` (ISO audit timestamp).
  `GET /api/admin/issues` also includes the latest `notes` on each issue,
  defaulting to `""` before the first update. Responses disable caching.
- Invalid IDs/payloads return `400`, missing authentication returns `401`,
  non-admin or deleted admin accounts return `403`, and missing issues return
  `404` with `ISSUE_NOT_FOUND`. Unexpected transaction failures return `500`
  and roll back both issue and hold changes. Existing booking, check-in, and
  no-show policies remain as documented above; deployment of closure controls
  still depends on the team's existing-booking policy decision.
- `npm run test:issues --workspace=apps/backend` runs the isolated controller,
  route authorization, list, and facility suites. With a separate migrated
  `TEST_DATABASE_URL` ending in `_test`, run
  `npm run test:issues:integration --workspace=apps/backend` to check real
  status/notes persistence, concurrent saves, and full audit-failure rollback.

---

## 5. 🌐 API Specification & Endpoint Structure

### 5.1 Authentication Module (`/api/auth`)
- `POST /api/auth/google-login` : เข้าสู่ระบบด้วย Google Token (ส่งคืน JWT Session และค่า `isProfileComplete`)
- `POST /api/auth/complete-profile` : บันทึกข้อมูล Onboarding (Phone สำหรับ CU / Phone + CitizenID หรือ Passport สำหรับ Outside) และอัปเดต `isProfileComplete = true`
- `POST /api/auth/admin-login` : เข้าสู่ระบบบรรณารักษ์ (Email + Password)
- `GET /api/auth/me` : ดึงข้อมูลส่วนตัว, สิทธิ์ผู้ใช้, คะแนนพฤติกรรม และสถานะโปรไฟล์
- `PUT /api/auth/profile` : แก้ไขข้อมูลส่วนตัว (เบอร์โทรศัพท์)

### 5.2 Table & Zone Module (`/api/tables`)
- `GET /api/tables/layout` : ดึงผังโซนและโต๊ะทั้งหมด พร้อมกรองด้วย Query Parameters (`zoneType`, `plugCap`, `hasTvScreen`, `date`, `timeSlot`)
- `GET /api/tables/:tableId/availability` : ตรวจสอบช่วงเวลาว่างของโต๊ะที่เลือก

### 5.3 Booking Module (`/api/bookings`)
- `POST /api/bookings/hold` : สั่ง Hold ล็อกโต๊ะชั่วคราว 5 นาที (`lockToken`)
- `POST /api/bookings` : ยืนยันการจองโต๊ะ
- `GET /api/bookings/my-history` : ดึงประวัติการจองของผู้ใช้ (เรียงลำดับจากล่าสุด)
- `POST /api/bookings/:bookingId/check-in` : เช็กอินเข้าใช้งานโต๊ะ
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
