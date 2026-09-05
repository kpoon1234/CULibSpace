# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **CU (Chulalongkorn University) students/staff** — primary users. Book library tables/seats for free via Google SSO (`/api/auth/google`), domain-restricted to university accounts.
- **Outside visitors** (Thai nationals and foreign nationals, tracked separately by citizen ID / passport ID) — book seats through a paid ticketing flow, distinct from the free CU booking flow.
- **Library admins** — manage facility issue reports and adjust user behaviour scores; log in via a role-specific email/password flow (`/api/admin/login`).

## Product Purpose

CULibSpace digitizes an entirely manual library seating process: before this system, seating was first-come-first-served walk-up only, with no digital sign-in, no way to check real-time availability before arriving, no way to reserve a specific table/zone in advance, and no accountability for no-shows or seat-hogging.

Success means: students/staff/visitors can see real-time seat/zone availability and reserve a table in advance; no-shows are auto-detected and the seat is released back to availability; accountability is enforced through a visible, auditable behaviour score.

## Positioning

There is no prior digital tool to replace or copy — the differentiator is the mechanism a walk-up system structurally cannot offer: real-time zone/table browsing, hold-based double-booking prevention, automatic no-show detection with behaviour-score consequences, and a paid ticketing path for non-CU visitors running alongside the free CU booking path.

## Operating Context

- The library is organized into zones by type (Silent, Group, Common); tables within a zone carry seat count, plug capacity, and TV-screen amenity as filterable attributes.
- Library open/close hours vary by period (normal hours, exam periods, closures/maintenance) via a prioritized operating schedule, not a fixed weekly calendar.
- One active booking per user account, enforced system-wide; max advance booking days, max booking duration, late/early check-in grace windows, and minimum behaviour score to book are all configurable (not hardcoded product facts).
- Real-time table status is expected to be polling-driven (the stack ships SWR and the schema indexes are named for "real-time availability / SWR polling filters").

## Capabilities and Constraints

Confirmed functional scope (FR numbering as given by the user; FR-1 is authentication, covered under Users above):

- **FR-2** — Real-time seat/table status and zone-based browsing before arrival.
- **FR-3** — Advance table reservation with time-slot selection, one active booking per user, and hold-based double-booking prevention (lock token / locked-until on the table).
- **FR-4** — Check-in verification with automatic no-show detection that releases the seat back to availability.
- **FR-5** — Penalty-free cancellation, alongside an automatic behaviour credit score system for no-shows, with visible score history for accountability.
- **FR-6** — Paid ticketing for outside (non-CU) visitors, kept separate from the free CU student/staff booking flow.
- **FR-7** — Facility/equipment issue reporting tied to specific tables, with an admin queue tracking fix status.

Constraints:
- Frontend-backend integration is not fully wired yet: the login page's endpoint routing (`/api/login` vs `/api/admin/login`) is the contract with the backend, but submit handlers for the user/Google role are UI stubs (`console.log`) rather than live calls.
- Bilingual (Thai/English) UI is a planned future consideration, **not** a binding requirement now: ship English-only UI text (labels, errors, buttons), but avoid layout or copy decisions that assume English-length strings only, so Thai localization later isn't painful. Thai currently appears only in code comments (intentional — see Brand Commitments) and is not translated UI copy.

## Brand Commitments

- White as the base (80–90% of the UI), Chula pink used only as an accent stripe — never a full-page pink background, never the Inter font. (Recorded project-wide in the repo root `CLAUDE.md`.)
- Thai-language code comments are intentional, reflecting the Chulalongkorn University target audience — not a language error to "fix," and not itself a signal that UI copy should be Thai.
- Existing brand assets: CU library logo (`public/img/Logo.jpg`), library banner photograph (`public/img/CU_lib1.png`).

## Evidence on Hand

- `public/img/Logo.jpg` — CU library logo, currently used in the site header.
- `public/img/CU_lib1.png` — library banner photo, currently used as the home page hero image.
- No real testimonials, pricing, case studies, press, or finished user-facing copy exist yet beyond placeholder UI strings ("CULibSpace", form labels) — future work must not fabricate these.

## Product Principles

1. **Real-time truth over stale state** — seat/table availability, locks, and status must reflect live backend state; false availability or stale double-booking risk directly undermines the product's core value over the walk-up baseline.
2. **Free CU access, paid outside access** — the free/paid split between CU-affiliated users and outside visitors is a structural product fact, not a cosmetic toggle; keep the two flows distinguishable rather than merging them into one generic "sign up" path.
3. **Accountability without punitive friction** — no-show handling and the behaviour score should inform and deter, not block; cancellation stays penalty-free by design.
4. **English now, Thai-ready later** — no i18n infrastructure or translations yet, but don't lock in layouts or copy choices that would make adding Thai localization painful later.
5. **Restraint in brand expression** — Chula pink is an accent stripe on a white-majority base, never a dominant color or full-bleed background.
