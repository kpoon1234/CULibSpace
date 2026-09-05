---
version: 1
slug: "apps-frontend-app-page-tsx"
primary_target: "apps/frontend/app/page.tsx"
related_targets: ["apps/frontend/components/HomeComponent/SplitHero.tsx","apps/frontend/components/HomeComponent/HeroCarousel.tsx","apps/frontend/components/HomeComponent/icons.tsx","apps/frontend/components/Topmenu/topMenu.tsx"]
---

## Scope & visitor mode

Pre-authentication home page. Mode: Persuade (visitor decides to Log In or Sign Up).

## Audience, job, action

CU students/staff (free), outside visitors (paid, separate flow), occasional admins — mostly arriving on mobile, before any auth. Job: understand what CULibSpace is and find Log In / Sign Up within seconds. Action: Log In or Sign Up, both in the header (not the page body), both currently routing to `/login` — no separate `/signup` route or onboarding modal exists yet.

## Proof / content

Real product facts only (PRODUCT.md): live Silent/Group/Common zone browsing, advance reservation with a locked hold, penalty-free cancellation, automatic no-show release. No fabricated stats or testimonials.

## Chosen direction & memorable moment

Split-screen first viewport: left column (white, headline + subhead + a quiet pointer back to the header CTAs), right column (`HeroCarousel`, rendered inside `SplitHero` — true-color photos, no duotone/tint/overlay, cycled via left/right arrow controls, circular looping). CTAs live permanently in `TopMenu`, not the page body — Log In ghost/text, Sign Up filled Reading Rose, both `rounded-md` (no pill — confirmed against DESIGN.md's two-tier shape system). Below fold: flat 2-up capability grid, icon + heading + one line, no card containers, no photography.

## Reusable pattern for future pages

- Header-level CTAs (`TopMenu`) are now inherited by every route automatically — no future page needs its own CTA row.
- The 55/45 white-panel + photo split scaffold (`SplitHero`) is the intended template for future pages that need this structure (e.g. onboarding modal content, profile settings intro).

## Unresolved / builder discretion

- Photo crop position (`objectPosition: '30% 40%'`) was a starting estimate from the comp — worth eyeballing against real breakpoints, not treated as final.
- Sign Up currently points at `/login` (same as Log In) since no dedicated onboarding entry point is built yet — update this brief if/when a real Sign Up destination ships.
- Three of the four carousel slides are placeholder SVGs (`public/img/placeholder-{silent,group,common}-zone.svg`), labeled by real zone type rather than generic — swap them for real photography in `HeroCarousel.tsx`'s `slides` array (single point of change) when the photo set is ready.

## Motion

None. A scroll-linked parallax was built and then explicitly reverted — the user's actual request was an image carousel, not parallax. The hero now cycles through `slides` via left/right arrow controls (circular, `rounded-md`, neutral gray icons — Reading Rose stays reserved for primary CTAs per the One Brand Color Rule), with no animation beyond the instant slide swap.
