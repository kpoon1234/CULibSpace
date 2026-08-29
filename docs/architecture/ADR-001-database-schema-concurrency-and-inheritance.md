# Architecture Decision Record (ADR-001)
## Data Modeling for Polymorphic User Inheritance, Schedule Priority Hierarchy, and Concurrency Locking Mechanism

- **Status**: Approved / Implemented
- **Date**: 2026-08-29
- **Author**: Senior Software & Database Architect Agent
- **Project**: CU LibSpace (Digital Seat Reservation Platform)
- **Tech Stack**: Next.js (App Router), Express.js (TypeScript), PostgreSQL, Prisma ORM, SWR

---

## 1. Context & Problem Statement

CU LibSpace is designed to solve severe seat hogging and peak-demand congestion at Chulalongkorn University Central Library (Office of Academic Resources).

The software architecture requires robust database modeling under the following architectural challenges:
1. **Polymorphic User Hierarchy**: Three distinct user types (`UNIVERSITY`, `THAI`, `FOREIGN`) plus administrative roles (`ADMIN`), each with unique regulatory identification (10-digit Student ID, 13-digit Thai Citizen ID, 9-digit Passport ID) sharing core profile attributes, required unique email, credentials, and behavior credit scores.
2. **High-Concurrency Race Conditions**: High traffic during exam periods leads to simultaneous booking attempts on identical tables and timeslots.
3. **Dynamic Operating Schedules & Priority Hierarchy**: Avoid global mutable opening hours conflicts (e.g. 24h exam weeks vs 08:00-21:00 regular weeks) by structuring time-slot operating schedules with date ranges and priority levels.
4. **Separation of Concerns for Visualization**: Decoupling physical spatial rendering logic to the Frontend layer (Next.js SVG/Canvas) while keeping the database `Table` model clean and relational.
5. **Behavior Credit Penalty & Auditability**: Behavior scores dictate booking eligibility (suspended if score < 50.0), demanding immutable audit tracking for score deductions and facility issue resolutions.

---

## 2. Decision Matrix & Architectural Choices

### 2.1. Polymorphic User Modeling: Class Table Inheritance (CTI)
- Maintain normalized base `user` and subtype tables (`university_user`, `outside_user`, `thai`, `foreign_user`) linked via 1-to-1 primary foreign keys (`uid`) with `ON DELETE CASCADE`.
- Preserves strict `NOT NULL` and `UNIQUE` constraints directly at the database engine level (e.g., `email` VARCHAR(100) UNIQUE, `studentId` VARCHAR(10) UNIQUE, `citizenId` VARCHAR(13) UNIQUE).
- Supports dual authentication: Google OAuth for University members (`password = NULL`) and Email + Password with bcrypt for Outside Users and Admins.

---

### 2.2. Operating Schedule Priority Hierarchy (`OperatingSchedule`)
To eliminate the architectural flaw of static global hours invalidating future advance bookings, the system models schedules with date intervals and priority:

| Priority | Category | Example Date Range | Hours / Mode |
| :--- | :--- | :--- | :--- |
| **3 (Highest)** | Public Holiday / Maintenance | 2026-05-01 (Labor Day) | Closed (`isClosed = true`) |
| **2 (Medium)** | Exam Period | 2026-09-01 – 2026-09-14 | 24 Hours (`is24Hours = true`) |
| **1 (Default)** | Regular Semester | 2026-01-01 – 2026-12-31 | 08:00 – 21:00 |

- **Booking Query Rule**: When a user queries or books a slot on date $D$, the system resolves the schedule matching $D$ with `MAX(priority)`.
- **Integrity Rule**: Admin cannot narrow the operating hours of an active schedule if overlapping bookings already exist without triggering an explicit batch cancellation workflow with zero user penalty.

---

### 2.3. Concurrency Locking & Double-Booking Prevention

```
[ Client Request: Hold Table ]
              │
              ▼
┌────────────────────────────────────────────────────────┐
│  Backend Transaction: Lock Table (Temporary Hold Lock) │
│  - Verify Table != 'Closed'                            │
│  - Check Existing Active Hold (lockedUntil > NOW())    │
│  - Check Overlapping Bookings ('Pending'/'Active')     │
│  - Set lockToken = UUID, lockedUntil = NOW() + 5 min   │
└─────────────────────────────┬──────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
         [ Success ]                     [ Failed ]
              │                               │
              ▼                               ▼
    Return Lock Token to UI         Return 409 Conflict
 (User has 5 min to confirm)       ("Seat currently locked")
              │
              ▼
[ Client Request: Confirm Booking ]
              │
              ▼
┌────────────────────────────────────────────────────────┐
│  Backend Prisma $transaction: Finalize Booking         │
│  - Verify lockToken matches                            │
│  - Verify User Behaviour Score >= 50.0                 │
│  - Enforce 1-Booking-Per-User Policy                   │
│  - INSERT INTO booking (status: 'Pending')             │
│  - Clear Table lockToken & lockedUntil                 │
└────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Overview & Entity Mapping

| Prisma Model | DB Table (`@@map`) | Description |
| :--- | :--- | :--- |
| `User` | `"user"` | Base user entity with credentials, phone, score, required email, password, and user type |
| `UniversityUser` | `"university_user"` | Subtype for Chula students/staff (`studentId`) |
| `OutsideUser` | `"outside_user"` | Base subtype for external visitors |
| `ThaiUser` | `"thai"` | Subtype for Thai visitors (`citizenId`) |
| `ForeignUser` | `"foreign_user"` | Subtype for Foreign visitors (`passportId`) |
| `Admin` | `"admin"` | Administrative librarian account with required email |
| `Zone` | `"zone"` | Library zones (`Silent`, `Group`, `Common`) |
| `Table` | `"table"` | Study tables with amenities (`plugCap`, `hasTvScreen`) and hold lock fields |
| `Booking` | `"booking"` | Reservation transactions with lifecycle statuses |
| `Ticket` | `"ticket"` | External visitor access passes (`Paid`, `Unpaid`) |
| `IssueReport` | `"issue_report"` | Maintenance & facility issue reports |
| `ManageIssue` | `"manage_issue"` | Admin resolution logs for issues |
| `ManageScore` | `"manage_score"` | Score adjustment audit history |
| `OperatingSchedule`| `"operating_schedule"`| Time-bound library operating hours with Priority Hierarchy |
| `SystemConfig` | `"system_config"` | General system configuration (durations, check-in thresholds) |

---

## 4. Local Setup & Migration Guide

```bash
# 1. เข้าสู่ไดเรกทอรี Backend
cd apps/backend

# 2. ตั้งค่าไฟล์ Environment (ตรวจสอบ DATABASE_URL)
cp .env.example .env

# 3. รัน Migration เพื่อสร้าง Database Schema บน PostgreSQL
npx prisma migrate dev --name init_culibspace_schema

# 4. สร้าง Prisma Client Type Definitions
npx prisma generate

# 5. รัน Seed Data เพื่อเติมข้อมูลทดสอบเริ่มต้น
npx prisma db seed

# 6. (ทางเลือก) เปิดดูข้อมูลใน GUI ด้วย Prisma Studio
npx prisma studio
```
