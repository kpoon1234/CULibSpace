---
name: CULibSpace
description: A calm, campus-issued booking system for Chulalongkorn University's library seats
colors:
  chula-pink: "#db93b0"
  chula-pink-hover: "#e0a3bc"
  reading-rose: "#e11d48"
  reading-rose-deep: "#be123c"
  reading-rose-focus: "#fecdd3"
  reading-rose-tint: "#fff1f2"
  ink: "#171717"
  paper: "#ffffff"
  neutral-900: "#111827"
  neutral-800: "#1f2937"
  neutral-700: "#374151"
  neutral-600: "#4b5563"
  neutral-500: "#6b7280"
  neutral-400: "#9ca3af"
  neutral-300: "#d1d5db"
  neutral-200: "#e5e7eb"
  neutral-100: "#f3f4f6"
  error: "#dc2626"
  error-border: "#ef4444"
  overlay-scrim: "rgba(0, 0, 0, 0.4)"
typography:
  display:
    fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 10vw, 2.15rem)"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  sm: "6px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.reading-rose}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.reading-rose-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.neutral-700}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.reading-rose}"
    typography: "{typography.body}"
  input-text:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    typography: "{typography.body}"
  input-text-error:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  card-surface:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "32px"
  nav-topmenu:
    backgroundColor: "{colors.chula-pink}"
    height: "64px"
  panel-muted:
    backgroundColor: "{colors.neutral-100}"
    rounded: "{rounded.sm}"
    padding: "12px"
  button-secondary-compact:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.neutral-800}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
---

# Design System: CULibSpace

## Overview

**Creative North Star: "The Reading Room"**

CULibSpace's baseline mood is calm and utilitarian: this is a library first, and the interface should read as quiet, efficient, and operate-mode by default — minimal decoration, few flourishes, a task done without ceremony. Chula pink is the room's single accent, never the room itself: it marks brand chrome (the header) and interactive commitment (buttons, links), while the space around it stays white and unshowy.

But a reading room isn't silent everywhere, all the time — the second floor during exam season is a different room than the same floor on a quiet Tuesday. The system should be able to express real activity honestly (a near-full zone, a busy time slot) without abandoning its calm baseline or reaching for colors outside the pink/rose family to do it. Density and occupancy are content, not decoration; when future work builds zone/table availability views, let saturation, fill, or count — not new hues — carry that energy.

**Key Characteristics:**
- Calm, utilitarian baseline; brand color is rationed, not ambient
- Flat by default — shadow is reserved for surfaces that genuinely float (card, modal)
- Two-tier corner language: small on controls, generous on containers
- Room to express "busy" states honestly later, without breaking the palette

## Colors

The interactive/error scale is Tailwind-default-sourced (`bg-rose-600`, etc.). Chula Pink is the one custom-defined color in the system — a named CSS variable (`--chula-pink` / `--chula-pink-hover` in `globals.css`, surfaced as the `bg-chula-pink` / `hover:bg-chula-pink-hover` / `ring-offset-chula-pink` Tailwind utilities), not a Tailwind default.

### Primary
- **Chula Pink** (`#db93b0`): the header/brand chrome color — `TopMenu`'s background. Used once, at full strength, as the site's single largest color statement. Softened on 2026-09-01 from the original Tailwind `pink-400` default (`#f472b6`), which had been flagged since early on as reading too saturated/"hot pink" for the university's actual dusty-pink identity — this was the fix, not a further workaround.
- **Chula Pink Hover** (`#e0a3bc`): hover state for pink chrome (nav item hover fill), a lightened companion to the base tone. Not used as a resting color.

### Secondary
- **Reading Rose** (`#e11d48`): the interactive/CTA color — primary submit buttons, links, focus accents. This is the "you can act here" signal, distinct from the brand-only Chula Pink. Deliberately kept at its original saturation when Chula Pink was softened (2026-09-01): Reading Rose is a functional/semantic color, not a brand-identity one, and muting it would trade away CTA findability for brand-purity it doesn't need — the opposite of what a "you can act here" signal is for. If anything, a quieter chrome makes it read more clearly.
- **Reading Rose Deep** (`#be123c`): hover/active state for Reading Rose elements.
- **Reading Rose Focus** (`#fecdd3`): focus-ring tint on form inputs (`focus:ring-rose-200`).
- **Reading Rose Tint** (`#fff1f2`): active-state background for nav items (currently wired via an `isActive` prop that no page passes yet).

### Neutral
- **Paper** (`#ffffff`): page and card background; the CSS var `--background` in light mode.
- **Ink** (`#171717`): the CSS var `--foreground`; primary body text color.
- **Neutral 900** (`#111827`): headings (`text-gray-900`).
- **Neutral 800** (`#1f2937`): secondary/outline button text (`text-gray-800`), including its compact variant.
- **Neutral 700** (`#374151`): form labels (`text-gray-700`).
- **Neutral 600** (`#4b5563`): secondary/body copy (`text-gray-600`).
- **Neutral 500** (`#6b7280`): inactive segmented-tab text.
- **Neutral 400** (`#9ca3af`): input placeholder text.
- **Neutral 300** (`#d1d5db`): default input/button borders.
- **Neutral 200** (`#e5e7eb`): dividers (reserved; not yet used in a component).
- **Neutral 100** (`#f3f4f6`): segmented-control track background.

### Named Rules
**The One Brand Color Rule.** Chula Pink appears once, as header chrome, at full strength (never tinted or diluted), and nowhere else. Everything that needs to look "pink" for an interactive reason (a button, a link, a focus ring) uses Reading Rose instead — the two never substitute for each other.

## Typography

**Body Font:** Geist Sans (with `ui-sans-serif, system-ui, sans-serif` fallback) — loaded via `next/font/google` in `layout.tsx`, exposed as `--font-geist-sans`, mapped to `--font-sans` in `@theme inline`, and consumed by `body { font-family: var(--font-sans); }` in `globals.css`. Geist Mono is also loaded (`--font-geist-mono` / `--font-mono`) but has no consumer yet — reserved for a future monospace need (data, code, measurements), not general UI text.

**Character:** A distinctive, humanist grotesk rather than a system default — deliberately chosen over Arial/Helvetica, which reads as an unstyled, overused fallback rather than an intentional voice. Geist keeps the calm/utilitarian baseline without borrowing the platform's default sans.

### Hierarchy
- **Display** (700, 48px / `text-5xl`, line-height 1.1): the home hero title ("CULibSpace") over the banner image.
- **Title** (600, `clamp(2rem, 10vw, 2.15rem)` ≈ 32–34px): the login card heading ("Login" / "Admin Login").
- **Headline** (600, 18px / `text-lg`): dialog/section headings (Forgot Password modal title).
- **Body** (500, 14px / `text-sm`): form labels, nav items, modal body copy, button labels.
- **Label** (400, 12px / `text-xs`): field error/helper text — the smallest role in use.

## Layout

- **Header:** sticky, full-width, fixed 64px height (`h-16`), horizontal flex; logo (48px square) on the left, nav items as fixed 150px-wide tabs.
- **Login page:** single centered card, `max-w-[450px]`, `p-8` internal padding, `gap-4` vertical rhythm, on a full-viewport-minus-header column (`min-h-[calc(100dvh-4rem)]`) that pins the card vertically centered via `my-auto`.
- **Home page:** full-bleed hero banner, fixed `h-[500px]`, image via `object-cover`, content centered both axes over a 40% black scrim.
- **Density:** compact controls throughout — `px-3 py-2` inputs, `px-4 py-1.5` segmented tabs — nothing loose or spacious; consistent with the utilitarian baseline.
- **Responsive:** minimal explicit breakpoint handling observed so far (`p-4 sm:p-8` on the login page is the only responsive rule); most spacing is fixed rather than fluid.

## Elevation & Depth

Flat by default. The only two elements carrying a `box-shadow` are the login card and the Forgot Password modal; the header, buttons, and inputs are flat with border/color doing the separation work instead. This is a confirmed posture, not an oversight: shadow is reserved to mark a surface that genuinely floats above the page, not applied as ambient decoration.

### Shadow Vocabulary
- **Card float** (`box-shadow: 0 5px 15px 0 hsla(220,30%,5%,0.05), 0 15px 35px -5px hsla(220,25%,10%,0.05)`): the login card's soft, diffused lift off the page.
- **Modal** (`shadow-xl`, Tailwind default): the Forgot Password dialog's elevation off the scrim.

### Named Rules
**The Floating-Surface-Only Rule.** Shadow appears only on a card or modal that sits above the page plane. Buttons, inputs, and chrome stay flat; don't add hover-lift shadows to controls without a deliberate decision to expand the vocabulary.

## Shapes

Two-tier corner language: `rounded-md` (6px) on interactive controls (buttons, inputs, segmented-tab buttons), `rounded-xl` (12px) on containers (the login card, the modal). No sharp corners and no fully-rounded (pill) shapes appear anywhere in the current implementation. Borders are thin (1px, `border-gray-300`) and only appear on inputs and the outline-style Google button — filled buttons carry no border.

## Components

### Buttons
- **Shape:** `rounded-md` (6px) on every button variant.
- **Primary** (modal `Continue`, admin-login submit): Reading Rose background (`#e11d48`) → deep rose on hover (`#be123c`), white text, `px-3 py-2 text-sm font-medium`. This is the canonical, and now consistent, primary-button pairing across the app.
- **Secondary / Outline** (Google sign-in): white background, `border-gray-300`, gray-800 text, `hover:bg-gray-50`.
- **Secondary / Outline, compact** (`button-secondary-compact`): the same white/`border-gray-300`/gray-800 pairing at reduced scale — `px-3 py-1.5 text-xs` instead of `px-4 py-2 text-sm` — for a secondary action demoted inside a Muted Secondary-Action Panel (see below). Never use the compact size for a button standing alone at page/card level; it only reads correctly nested inside that panel's already-quieter context.
- **Ghost / Text** (Forgot password link, modal Cancel): no fill; rose-600 text with underline-on-hover, or gray-600 text with a subtle gray-100 hover background.

### Muted Secondary-Action Panel
A self-contained block (`panel-muted`) for demoting one legitimate action below another without hiding it: `bg-gray-50`, `rounded-md`, `p-3`, contents centered in a `flex-col` with `gap-2`. Holds one short `text-xs text-gray-600` line naming what the action is an alternative to (e.g. "or continue with"), then one compact secondary/outline button (see above). Introduced on the login page's User tab to demote Google sign-in beneath email/password; reusable anywhere a second, legitimate-but-secondary path needs to sit visibly beside a primary one without competing for weight — e.g. a future visitor sign-up screen offering a Google shortcut beneath a primary email registration form.

- **Corner Style:** `rounded-md` (6px) — matches control radius, not container radius; the panel is a grouping device, not a card.
- **Background:** Neutral 100 (`#f3f4f6`) — one step off Paper, enough to read as a distinct region without introducing a border.
- **Contents:** centered, `gap-2` (8px) between the label line and the button.
- **Don't** nest a `card-surface` or add a shadow inside this panel — it stays flat, consistent with the Floating-Surface-Only Rule.

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px).
- **Background:** Paper (`#ffffff`).
- **Shadow Strategy:** Card float shadow (see Elevation & Depth) — the only decoration marking it as a raised surface; no border.
- **Internal Padding:** 32px (`p-8`), `gap-4` (16px) between stacked children.

### Inputs / Fields
- **Style:** `rounded-md`, 1px `border-gray-300`, `px-3 py-2 text-sm`, gray-400 placeholder.
- **Focus:** `focus:ring-2 focus:ring-rose-200` — a soft rose glow, no border-color shift.
- **Error:** border switches to `red-500`, focus ring to `red-200`, with a `text-xs text-red-600` message below the field.

### Navigation
- **Style:** the header is a single `<nav aria-label="Primary">` landmark inside the sticky `<header>`. The left cluster — 48px logo + a `Headline`-role "CULibSpace" wordmark (`text-lg font-semibold text-neutral-900`) — is one `Link` to `/`, replacing the earlier standalone "Home" tab (`TopMenuItem` is retired). Log In (ghost, `text-neutral-900`) and Sign Up (filled, `bg-rose-600`) sit right-aligned; both `rounded-md`, no pill.
- **Contrast:** nav text on Chula Pink chrome uses `text-neutral-900`, not white — white measured 2.65:1 against the original `#f472b6` and failed WCAG AA; `text-neutral-900` measured 6.77:1 there and measures ~7.5:1 against the current softened `#db93b0` (contrast only improves as the chrome lightens).
- **Layout:** no fixed-width tabs — content hugs its own width with responsive padding (`px-3 sm:px-4` on the header) so it doesn't overflow on narrow viewports.

### Split Hero + Photo Carousel (signature component)
The home page's first viewport (`SplitHero` + `HeroCarousel`) replaced the earlier full-bleed banner-with-scrim pattern. Left column: Paper, headline + subhead + a quiet Reading Rose link back to the header CTAs. Right column: a true-color photo carousel — no duotone, no overlay chip — with `rounded-md` left/right arrow controls (`bg-white/90`, neutral icon, Reading Rose focus ring) and small `rounded-full` dot indicators (Reading Rose when active). The dots are the one place a fully-rounded shape appears; that's a status-indicator convention distinct from the button-radius vocabulary, not a new button shape. Stacks to a single column below `lg`.

### Capability Highlight Band (documented exception)
The home page's below-fold capability grid sits on a full-bleed `bg-rose-50` (Reading Rose Tint) band rather than Paper or the Muted Secondary-Action Panel's Neutral 100 — the only full-width tinted section in the app. Introduced during an `/impeccable colorize` pass to separate the hero from this section with real, restrained color rather than whitespace alone. A later `/impeccable critique` flagged it as outside the documented surface vocabulary and closer to generic SaaS chrome than a deliberate choice; reviewed and kept as-is on 2026-09-01 rather than reverted. Recorded here so it reads as an accepted exception, not undocumented drift, next time this page is audited or critiqued.

## Do's and Don'ts

### Do:
- **Do** keep Chula Pink to brand chrome only (header) and Reading Rose to everything interactive (buttons, links, focus) — the One Brand Color Rule.
- **Do** use the two-tier radius scale: `rounded-md` (6px) for controls, `rounded-xl` (12px) for containers.
- **Do** keep shadow rare — only a genuinely floating surface (card, modal) gets one.
- **Do** let future occupancy/density UI (zone and table availability) express "busy" honestly through saturation, fill, or count rather than new hues outside the pink/rose family.
- **Do** use Geist Sans (via `var(--font-sans)`) as the UI typeface — not Arial, Helvetica, or another platform-default sans.

### Don't:
- **Don't** treat `#db93b0` as a verified-authoritative Chula Pink reference — it's a considered, deliberately desaturated design judgment (2026-09-01), not a value checked against an official university brand guideline. Revisit if a real reference source surfaces. Reading Rose (`rose-600`/`rose-700`) was reviewed at the same time and kept as-is — that decision is closed, not open.
- **Don't** extend the login page's blue-tinted radial gradient (`hsl(210,100%,97%)` → white) sitting under the pink-100 background — it reads as a mismatched leftover (likely copied from a template), not a deliberate two-tone effect.
- **Don't** treat the `prefers-color-scheme: dark` background swap to `#eed9df` as a designed dark theme — it's an open, undecided placeholder; a real dark mode needs deliberate design work later, not silent extension of this value.
- **Don't** use a full-page pink background or the Inter font — a binding project-wide rule from the repo root `CLAUDE.md`.
