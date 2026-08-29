# Architecture Decision Record (ADR-001)
## Data Modeling for Polymorphic User Inheritance, Google-Only User Auth, Schedule Priority Hierarchy, and Concurrency Locking Mechanism

- **Status**: Approved / Implemented
- **Date**: 2026-08-29
- **Author**: Senior Software & Database Architect Agent
- **Project**: CU LibSpace (Digital Seat Reservation Platform)
- **Tech Stack**: Next.js (App Router), Express.js (TypeScript), PostgreSQL, Prisma ORM, SWR, NextAuth.js

---

## 1. Context & Problem Statement

CU LibSpace is designed to solve severe seat hogging and peak-demand congestion at Chulalongkorn University Central Library (Office of Academic Resources).

The software architecture requires robust database modeling under the following architectural challenges:
1. **Unified Google Authentication for All Users**:
   - **University Users**: Authenticate via Chula Google Account (`@student.chula.ac.th` / `@chula.ac.th`).
   - **Outside Visitors (Thai & Foreign)**: Authenticate via personal Google Account (`@gmail.com`), followed by a first-time onboarding step to record National ID (13-digit Thai Citizen ID) or Passport ID (9-character Passport).
   - Because all users authenticate via Google OAuth, the `User` table does not store user passwords, eliminating password hash management risks for end-users.
2. **Dedicated Admin Credentials**:
   - Librarians/Admins authenticate via internal administrative credentials (`Admin` table with `email` and `password` hashed using `bcrypt`).
3. **High-Concurrency Race Conditions**:
   - High traffic during peak study hours leads to simultaneous booking attempts on identical tables and timeslots, managed by temporary hold locks (5-minute TTL).
4. **Dynamic Operating Schedules & Priority Hierarchy**:
   - Avoid global mutable opening hours conflicts (e.g. 24h exam weeks vs 08:00-21:00 regular weeks) by structuring time-slot operating schedules with date ranges and priority levels.
5. **Behavior Credit Penalty & Auditability**:
   - Behavior scores dictate booking eligibility (suspended if score < 50.0), demanding immutable audit tracking for score deductions and facility issue resolutions.

---

## 2. Decision Matrix & Architectural Choices

```
                                  +---------------------------------------+
                                  |              User (Base)              |
                                  |  - uid (PK)                           |
                                  |  - phone (UNIQUE)                     |
                                  |  - behaviour_score (Decimal 4,1)      |
                                  |  - email (UNIQUE)                     |
                                  |  - user_type (UNIVERSITY/THAI/FOREIGN)|
                                  +-------------------+-------------------+
                                                      |
                         +----------------------------+---------------------------+
                         | 1:1 (CTI)                                              | 1:1 (CTI)
                         v                                                        v
           +---------------------------+                            +---------------------------+
           |      UniversityUser       |                            |        OutsideUser        |
           |  - uid (PK, FK -> User)   |                            |  - uid (PK, FK -> User)   |
           |  - studentid (UNIQUE)     |                            +-------------+-------------+
           +---------------------------+                                          |
                                                               +------------------+------------------+
                                                               | 1:1 (CTI)                           | 1:1 (CTI)
                                                               v                                     v
                                                 +---------------------------+         +---------------------------+
                                                 |         ThaiUser          |         |        ForeignUser        |
                                                 |  - uid (PK, FK -> Outside)|         |  - uid (PK, FK -> Outside)|
                                                 |  - citizenid (UNIQUE)     |         |  - passportid (UNIQUE)    |
                                                 +---------------------------+         +---------------------------+
```

### 2.1. Authentication Architecture (Google OAuth for Users + bcrypt for Admins)
- **All Users (Inside & Outside):** Authenticate via Google OAuth (Sign in with Google).
  - Domain validation separates Chula Members (`@student.chula.ac.th` / `@chula.ac.th`) from Outside Visitors (`@gmail.com`).
  - First-time outside visitors complete a mandatory onboarding modal to record Citizen ID / Passport ID and Phone number.
- **Admin Staff:** Authenticate via Email + Password with bcrypt on the `Admin` table.

---

### 2.2. Operating Schedule Priority Hierarchy (`OperatingSchedule`)
To eliminate the architectural flaw of static global hours invalidating future advance bookings, the system models schedules with date intervals and priority:

| Priority | Category | Example Date Range | Hours / Mode |
| :--- | :--- | :--- | :--- |
| **3 (Highest)** | Public Holiday / Maintenance | 2026-05-01 (Labor Day) | Closed (`isClosed = true`) |
| **2 (Medium)** | Exam Period | 2026-09-01 – 2026-09-14 | 24 Hours (`is24Hours = true`) |
| **1 (Default)** | Regular Semester | 2026-01-01 – 2026-12-31 | 08:00 – 21:00 |

- **Booking Query Rule**: When a user queries or books a slot on date $D$, the system resolves the schedule matching $D$ with `MAX(priority)`.

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
| `User` | `"user"` | Base user entity authenticated via Google OAuth (no user password) |
| `UniversityUser` | `"university_user"` | Subtype for Chula students/staff (`studentId`) |
| `OutsideUser` | `"outside_user"` | Base subtype for external visitors |
| `ThaiUser` | `"thai"` | Subtype for Thai visitors (`citizenId`) |
| `ForeignUser` | `"foreign_user"` | Subtype for Foreign visitors (`passportId`) |
| `Admin` | `"admin"` | Administrative librarian account with bcrypt password |
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
# 1. รัน Container PostgreSQL
docker compose up -d

# 2. รันคำสั่งเดียว Reset Database + Migrate + Seed ทั้งหมด
npm run db:fresh

# 3. เริ่มรันระบบ
npm run dev
```
