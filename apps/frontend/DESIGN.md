---
name: CULibSpace
description: A calm, campus-issued booking system for Chulalongkorn University's library seats
colors:
  # Reading Lamp palette (2026-09-03). Every ramp generated in OKLCH.
  canvas: "#fdf9f4"
  paper: "#ffffff"
  ink: "#1d140d"
  chula-pink: "#db93b0"
  chula-pink-hover: "#e0a3bc"
  claret-50: "#fff1f3"
  claret-100: "#fedfe2"
  claret-200: "#fbbfc6"
  claret-300: "#ef8d9a"
  claret-400: "#de5f75"
  claret-500: "#c1365a"
  claret-600: "#a12049"
  claret-700: "#840e38"
  claret-800: "#670228"
  claret-900: "#4e001c"
  brass-50: "#fcf4e6"
  brass-100: "#f8e9d2"
  brass-200: "#efd7b3"
  brass-300: "#e2be89"
  brass-400: "#d2a563"
  brass-500: "#c18d3d"
  brass-600: "#a06f29"
  brass-700: "#7e541b"
  brass-800: "#5c3a0d"
  brass-900: "#422707"
  stone-50: "#fbfaf9"
  stone-100: "#f6f5f3"
  stone-200: "#eae7e5"
  stone-300: "#d7d3d1"
  stone-400: "#a5a09d"
  stone-500: "#76706c"
  stone-600: "#5a544f"
  stone-700: "#453e39"
  stone-800: "#2d2823"
  stone-900: "#1c1713"
  scarlet-600: "#d52e1e"
  scarlet-500: "#ed4d36"
  scarlet-200: "#ffc9bd"
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
    backgroundColor: "{colors.claret-600}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.claret-700}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.stone-700}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.claret-600}"
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
    backgroundColor: "{colors.stone-100}"
    rounded: "{rounded.sm}"
    padding: "12px"
  button-secondary-compact:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.stone-800}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
---

# Design System: CULibSpace

## Overview

**Creative North Star: "The Reading Room"**

CULibSpace's baseline mood is calm and utilitarian: this is a library first, and the interface should read as quiet, efficient, and operate-mode by default — minimal decoration, few flourishes, a task done without ceremony. Chula pink is the room's single piece of brand chrome, never the room itself; Claret carries interactive commitment (buttons, links, focus), and the space around both is warm paper rather than screen white.

The room is lit. As of the Reading Lamp palette (2026-09-03) the world is warm throughout — cream canvas, warm ink, warm neutrals — because the previous cool blue-gray neutrals fought the warm accent on every screen and flattened the whole thing into generic product chrome. Warmth is the identity here; a cool gray reintroduced anywhere is drift.

But a reading room isn't silent everywhere, all the time — the second floor during exam season is a different room than the same floor on a quiet Tuesday. The system expresses that activity honestly, and since 2026-09-03 it has a dedicated channel for it: **Brass**. Density and occupancy are content, not decoration, and giving them their own hue is what stops a full zone from competing with a call to action or an error. Let fill, count, and brass depth carry that energy together — never claret, and never color alone.

**Key Characteristics:**
- Calm, utilitarian baseline; brand color is rationed, not ambient
- Warm throughout — paper and lamplight, never cool gray
- Three colors with three jobs: Chula Pink brands, Claret acts, Brass measures
- Flat by default — shadow is reserved for surfaces that genuinely float (card, modal)
- Two-tier corner language: small on controls, generous on containers
- Room to express "busy" states honestly later, without breaking the palette

## Colors

**Reading Lamp** (adopted 2026-09-03), replacing the original Tailwind-default-sourced palette. The reading room by lamplight: warm paper, claret cloth bindings, brass fittings. Every ramp is generated in OKLCH so lightness steps evenly and chroma tapers toward white; the values live in `globals.css` as `--stone-*`, `--claret-*`, `--brass-*`, and `--scarlet-*`.

**The `gray-*`, `rose-*`, and `red-*` Tailwind utilities are remapped in this project** and no longer emit Tailwind's stock values — `@theme inline` in `globals.css` points them at the stone, claret, and scarlet ramps. Read the values, not the utility names. This keeps the palette definable in one file instead of scattered across every `className`, and it is why a palette change here does not require touching every component.

### Why the previous palette was replaced
Three measured defects, not a matter of taste:

1. **The two brand colors were not in the same family.** Chula Pink sits at OKLCH hue 354 / chroma 0.094; the old Reading Rose (`#e11d48`) at hue 18 / chroma 0.222 — **2.4x the chroma, 24 degrees of hue apart**. A muted institutional header sat above urgent commerce-red buttons, and the two never read as one system.
2. **Every neutral was cool while every accent was warm.** The old ramp was Tailwind's default gray at **hue 257-265 (blue)**. Headings, body copy, borders, and tile edges were all subtly blue under a warm pink accent. This temperature fight, more than any single hue, is why the page read as generic SaaS rather than as a reading room.
3. **The action color and the error color were the same red.** Old Reading Rose at hue 18 and the old error `#dc2626` at hue 27 were **9 degrees apart**. "Book this table" and "something went wrong" carried nearly the same signal.

### Surfaces
- **Canvas** (`#fdf9f4`): the page ground — warm cream, the desk. The `--background` CSS var and `bg-canvas`. Off-white, not white; it satisfies the "white as the base" brand commitment as the dominant light surface while giving raised sheets something to sit on.
- **Paper** (`#ffffff`): raised surfaces — bento tiles, the login card. `bg-paper`. The canvas/paper split is what bounds a tile, with the hairline border only reinforcing it; this is why tile borders may stay below 3:1 without the tile losing its edge.
- **Ink** (`#1d140d`): warm near-black, the `--foreground` var. Replaces the old neutral `#171717`.

### Chula Pink — brand chrome (unchanged)
- **Chula Pink** (`#db93b0`): the header/brand chrome color — `TopMenu`'s background, and the only place it appears. Deliberately carried through the Reading Lamp change untouched: the palette work was about the colors around it, not about it. Softened on 2026-09-01 from Tailwind `pink-400` (`#f472b6`), which read as hot pink against the university's dusty-pink identity.
- **Chula Pink Hover** (`#e0a3bc`): hover fill for pink chrome. Never a resting color.

### Claret — the action color
The "you can act here" signal: primary buttons, links, focus rings, selection. Hue 8, one family with Chula Pink's hue 354 rather than a stranger beside it.
- **Claret 600** (`#a12049`): the canonical CTA fill and link color. 7.45:1 on paper, 7.11:1 on canvas.
- **Claret 700** (`#840e38`): CTA hover — and the **resting** fill for a CTA sitting on Chula Pink chrome (see the Chrome Step rule below).
- **Claret 800** (`#670228`): hover for a CTA on chrome.
- **Claret 500** (`#c1365a`): focus rings (`ring-rose-500`), 5.33:1 on paper.
- **Claret 200** (`#fbbfc6`): input focus-ring tint (`ring-rose-200`) and `::selection` background.

### Brass — the density channel
The second accent, and the reason this direction was chosen over a warm-neutral correction alone. Hue ~75. **Brass encodes occupancy, density, and highlight; it is never an action color and never a link.** Before it existed, every meaningful state in the app had to be expressed in one red, so occupancy competed with action and error.
- **Brass 600 / 700 / 800** (`#a06f29` / `#7e541b` / `#5c3a0d`): the three density steps in `ZoneAvailabilityGraphic`, darkening as a zone fills. Each clears 3:1 against the `stone-200` track (3.55, ~5.4, 8.26) — the earlier rose fills measured 1.58 and 2.24 against their tint track and were effectively invisible at low fill.
- Lighter brass steps (`50`-`400`) are available for tinted highlight surfaces; none is in use yet.

### Stone — the warm neutral ramp
Hue 58-68, replacing Tailwind's cool gray. Mapped onto `gray-*`.
- **Stone 900** (`#1c1713`): headings (`text-gray-900`). **800** (`#2d2823`): secondary/outline button text. **700** (`#453e39`): form labels. **600** (`#5a544f`): body copy, 7.46:1 on paper. **500** (`#76706c`): captions and placeholder text, 4.88:1 on paper. **400** (`#a5a09d`): disabled/decorative only — at 2.59:1 it must not carry text. **300** (`#d7d3d1`): input and button borders. **200** (`#eae7e5`): dividers, tile borders, the footer rule, and the zone-graphic track. **100** (`#f6f5f3`): segmented-control track.

### Scarlet — error only
- **Scarlet 600** (`#d52e1e`): error text, 4.95:1 on paper. Hue 30 — **22 degrees from claret's hue 8**, and 10 points lighter, so action and error now read apart instead of as one red.
- **Scarlet 500** (`#ed4d36`): error borders. **Scarlet 200** (`#ffc9bd`): error focus-ring tint.

### Named Rules
**The One Brand Color Rule.** Chula Pink appears once, as header chrome, at full strength (never tinted or diluted), and nowhere else. Anything that needs to look pink for an *interactive* reason uses Claret instead — the two never substitute for each other.

**The Chrome Step Rule.** A filled CTA changes stop depending on its ground: Claret 600 on paper or canvas, **Claret 700 on Chula Pink chrome**. This is not inconsistency — it is what keeps the control's boundary legible on a mid-tone bar. The header Sign Up button previously used the old rose against Chula Pink at **1.97:1**, failing the 3:1 non-text contrast requirement on the surface's single most important action; Claret 700 measures **4.19:1** there with white text at 10:1. Never place Claret 600 on the pink bar.

**Brass Is Not Clickable.** Brass marks how full something is. If a brass element can be clicked, either it is the wrong color or the affordance belongs in claret.

**No Designed Dark Theme.** The old `prefers-color-scheme: dark` block set `#eed9df` behind `#ededed` text — about **1.05:1**, i.e. invisible. It was removed on 2026-09-03 in favor of `color-scheme: light`, so dark-scheme visitors get the readable light palette. This is an explicit deferral, not a dark theme; a real one needs deliberate design work, not an inversion.

### Browser surfaces
Text selection, the caret, and the scrollbar are themed from the palette in `globals.css` rather than left at browser defaults: `::selection` is Claret 200 on Claret 900, `caret-color` and `accent-color` are Claret 600, and `scrollbar-color` is Stone 300 on Canvas.

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
- **Home page:** three stacked regions on Canvas, top to bottom — the `SplitHero` first viewport, the Capability Bento Grid, and the Site Footer. No tinted or full-bleed colored band separates them; the body is the warm Canvas cream throughout, bento tiles read as Paper sheets on it, and the footer is set off by a single Stone 200 top rule. Horizontal padding steps `px-6 sm:px-10 lg:px-16 xl:px-24` and is shared by all three regions so their left edges align down the page.
- **Selling copy vs. footer content:** value-proposition content (what the product does) lives in the white body only; the footer carries navigation, contact, and copyright and no marketing copy at all. Established 2026-09-03 after the capability grid was found sitting at the page bottom on a tinted band, where it read as footer chrome rather than as the page's core argument.
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
- **Primary** (modal `Continue`, admin-login submit, hero CTA): Claret 600 background (`#a12049`) → Claret 700 on hover (`#840e38`), white text, `px-3 py-2 text-sm font-medium`. On Chula Pink chrome this steps one stop deeper — see the Chrome Step Rule.
- **Secondary / Outline** (Google sign-in): white background, `border-gray-300`, gray-800 text, `hover:bg-gray-50`.
- **Secondary / Outline, compact** (`button-secondary-compact`): the same white/`border-gray-300`/gray-800 pairing at reduced scale — `px-3 py-1.5 text-xs` instead of `px-4 py-2 text-sm` — for a secondary action demoted inside a Muted Secondary-Action Panel (see below). Never use the compact size for a button standing alone at page/card level; it only reads correctly nested inside that panel's already-quieter context.
- **Ghost / Text** (Forgot password link, modal Cancel): no fill; rose-600 text with underline-on-hover, or gray-600 text with a subtle gray-100 hover background.

### Muted Secondary-Action Panel
A self-contained block (`panel-muted`) for demoting one legitimate action below another without hiding it: `bg-gray-50`, `rounded-md`, `p-3`, contents centered in a `flex-col` with `gap-2`. Holds one short `text-xs text-gray-600` line naming what the action is an alternative to (e.g. "or continue with"), then one compact secondary/outline button (see above). Introduced on the login page's User tab to demote Google sign-in beneath email/password; reusable anywhere a second, legitimate-but-secondary path needs to sit visibly beside a primary one without competing for weight — e.g. a future visitor sign-up screen offering a Google shortcut beneath a primary email registration form.

- **Corner Style:** `rounded-md` (6px) — matches control radius, not container radius; the panel is a grouping device, not a card.
- **Background:** Stone 100 (`#f6f5f3`) — one step off Paper, enough to read as a distinct region without introducing a border.
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
- **Style:** the header is a single `<nav aria-label="Primary">` landmark inside the sticky `<header>`. The left cluster — 48px logo + a `Headline`-role "CULibSpace" wordmark (`text-lg font-semibold text-ink`) — is one `Link` to `/`, replacing the earlier standalone "Home" tab (`TopMenuItem` is retired). Log In (ghost, `text-ink`) and Sign Up (filled, `bg-rose-700` — Claret 700, per the Chrome Step Rule) sit right-aligned; both `rounded-md`, no pill.
- **Contrast:** nav text on Chula Pink chrome uses `text-ink`, not white — white measured 2.65:1 against the original `#f472b6` and failed WCAG AA; `text-neutral-900` measured 6.77:1 there and Ink now measures 7.61:1 against the current softened `#db93b0` (contrast only improves as the chrome lightens). The *filled* Sign Up button on that same bar was never checked until 2026-09-03, when it measured 1.97:1 and was fixed to Claret 700 at 4.19:1.
- **Layout:** no fixed-width tabs — content hugs its own width with responsive padding (`px-3 sm:px-4` on the header) so it doesn't overflow on narrow viewports.

### Split Hero + Photo Carousel (signature component)
The home page's first viewport (`SplitHero` + `HeroCarousel`) replaced the earlier full-bleed banner-with-scrim pattern. Left column: Paper, headline + subhead + the page's primary CTA ("Reserve a table now" → `/login`, the canonical Claret filled button) with one quiet `text-xs text-gray-500` helper line beneath naming the CU-account requirement. The earlier claret text link to `/login` was demoted to that helper line on 2026-09-03 so the hero has exactly one link to the booking path, not two. Column split is `lg:grid-cols-[1.4fr_1fr]` — widened from `1.15fr_1fr` in the same pass, with `xl:px-24` padding, to give the text column more measure on large viewports. Right column: a true-color photo carousel — no duotone, no overlay chip — with `rounded-md` left/right arrow controls (`bg-white/90`, neutral icon, Claret focus ring) and small `rounded-full` dot indicators (Claret when active). The dots are the one place a fully-rounded shape appears; that's a status-indicator convention distinct from the button-radius vocabulary, not a new button shape. Stacks to a single column below `lg`.

### Capability Bento Grid
The home page's value-proposition section: six capabilities in an asymmetric grid on Paper, sitting immediately after the hero rather than at the page bottom. One tile is elevated — "Live zone visibility" spans `lg:col-span-2 lg:row-span-2` and leads with a real graphic (see below); the other five stay compact icon + heading + blurb. That asymmetry is the point: elevating every item would rebuild the same repetitive tile rhythm at a larger size, and elevating none leaves the product's central claim — real-time availability — asserted in prose but never shown. Grid runs `1 → 2 (sm) → 3 (lg)` columns; at `lg` the large tile plus five small ones fill a 3×3 grid exactly, with no empty cells.

- **Tile:** `rounded-xl` (container radius), `border-gray-200`, `p-6`, no fill and no shadow — flat, consistent with the Floating-Surface-Only Rule. The border, not a background tint, is what bounds a tile.
- **Heading level:** tiles use `<h3>` under one `sr-only` `<h2>` ("What CULibSpace does") that names the section for screen readers without adding a visible heading.

**Reverses the earlier tinted-band decision.** Through 2026-09-01 this content sat at the bottom of the page on a full-bleed `bg-rose-50` tinted band — the app's only full-width tinted section — introduced by an `/impeccable colorize` pass, flagged by a later `/impeccable critique` as closer to generic SaaS chrome than a deliberate choice, and then knowingly kept as a documented exception. It was removed on 2026-09-03: the position and the tint together made the page's core selling content read as footer chrome. Separation from the hero is now carried by the tile borders and section padding rather than by a background color. The exception is closed, not merely unused — don't reintroduce a full-bleed tinted band here without a new decision.

### Zone Availability Graphic
The illustrative mockup inside the elevated bento tile (`ZoneAvailabilityGraphic`), and the first place the product's real-time claim is shown rather than described. Three zone rows (Silent, Group, Common), each a label, a `rounded-full` fill bar, and an explicit `{open} of {total} open` count.

- **Encoding:** occupancy is carried by fill length plus the count; density steps through rose tints only — `bg-rose-300` under 60% full, `bg-rose-400` at 60–90%, `bg-rose-600` above 90% — on a `bg-rose-100` track. This is the "express busy through saturation, fill, or count" rule (see Do's) in its first real use. A green/amber/red status dot was considered on 2026-09-03 and rejected: it would have introduced the app's first hues outside the pink/rose family, and it would have leaned on color alone where the count already carries the meaning unambiguously.
- **Honesty:** the numbers are sample values, not live data, and the graphic carries a `text-xs text-gray-500` caption saying so ("Sample view — sign in for today's live numbers."). When the real FR-2 view ships, this stays a mockup or is replaced outright — it must never present fabricated numbers as live state (Product Principle 1, "Real-time truth over stale state").
- **Bars are not buttons:** the `rounded-full` fill bars follow the carousel dots' status-indicator convention, not the button-radius vocabulary.

### Site Footer
Mounted in `app/layout.tsx` below `<main>`, so every route carries it. Navigation and contact only — no marketing or value-proposition copy, which belongs in the white body above.

- **Surface:** Paper with a single `border-t border-gray-200` rule. No tint, no shadow, no full-bleed color.
- **Structure:** a `1 → 2 (sm) → 3 (lg)` column grid — brand mark + one-line product description, a `<nav aria-label="Footer">` link list (Home / Log In / Sign Up), and an `<address>` block — over a bottom bar holding the copyright line and social links, divided by a second Stone 200 rule.
- **Type roles:** `text-sm font-semibold text-gray-900` column headings, `text-sm text-gray-600` links and contact lines, `text-xs text-gray-500` copyright. Links are ghost-style: no fill, rose-600 with underline on hover.
- **Placeholder data:** the address, email (`contact@culibspace.example`), phone, and all three social `href`s are deliberately generic placeholders, marked as such in code comments. Do not substitute real Chulalongkorn University contact details until the library supplies approved data — inventing institutional contact information is a fabrication risk, not a copy gap (see PRODUCT.md, "Evidence on Hand").

## Do's and Don'ts

### Do:
- **Do** keep Chula Pink to brand chrome only (header) and Claret to everything interactive (buttons, links, focus) — the One Brand Color Rule. Density and occupancy go to Brass, never to Claret.
- **Do** use the two-tier radius scale: `rounded-md` (6px) for controls, `rounded-xl` (12px) for containers.
- **Do** keep shadow rare — only a genuinely floating surface (card, modal) gets one.
- **Do** let occupancy/density UI (zone and table availability) express "busy" honestly through brass depth, fill length, and an explicit count together — never through color alone. The Zone Availability Graphic is the reference implementation to copy when the real FR-2 view is built.
- **Do** use Geist Sans (via `var(--font-sans)`) as the UI typeface — not Arial, Helvetica, or another platform-default sans.
- **Do** define new colors as OKLCH ramp steps in `globals.css` and let the remapped `gray-*` / `rose-*` / `red-*` utilities pick them up, rather than hardcoding a hex in a `className`.

### Don't:
- **Don't** treat `#db93b0` as a verified-authoritative Chula Pink reference — it's a considered, deliberately desaturated design judgment (2026-09-01), not a value checked against an official university brand guideline. Revisit if a real reference source surfaces. It was carried through the 2026-09-03 Reading Lamp change untouched, deliberately.
- **Don't** reintroduce the login page's full-page `bg-pink-100` background or the blue-tinted radial gradient (`hsl(210,100%,97%)` → white) that sat under it. Both were removed on 2026-09-03: the pink field violated the binding project rule against a full-page pink background, and the cool gradient fought the warm palette. The login page now sits on Canvas with the card as Paper.
- **Don't** read `color-scheme: light` in the dark-media block as a dark theme decision — it is a deferral. The previous `#eed9df` / `#ededed` placeholder measured about 1.05:1 and was removed as unreadable on 2026-09-03; a real dark mode needs deliberate design work, not an inversion of this palette.
- **Don't** use a full-page pink background or the Inter font — a binding project-wide rule from the repo root `CLAUDE.md`. The login page violated the pink half of this rule until 2026-09-03.
- **Don't** assume `gray-*`, `rose-*`, or `red-*` mean what they mean in stock Tailwind — they are remapped to Stone, Claret, and Scarlet in `globals.css`.
- **Don't** put Brass on anything clickable, or Claret on anything that merely reports a quantity. The two channels are the point of this palette.
