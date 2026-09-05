---
target: home-page
total_score: 20
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 1
timestamp: 2026-09-01T06-09-44Z
slug: apps-frontend-app-page-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector-evidence sub-agent)

Note: no browser automation available in this environment. Assessment A worked from source; Assessment B confirmed the dev server reachable and verified structural facts from raw HTML via curl.

## Home Page — Design Critique

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Carousel's position is announced to screen readers (aria-live) but invisible to sighted users |
| 2 | Match Between System and Real World | 3 | Domain-accurate copy (real zone names, real mechanics); undercut by #4/#5 below |
| 3 | User Control and Freedom | 2 | No path back out of the Sign Up->Login mismatch except browser back |
| 4 | Consistency and Standards | 2 | Logo isn't a home link; "Sign Up" routes to a screen whose only heading says "Login" |
| 5 | Error Prevention | 2 | The foreseeable Sign Up/Login expectation mismatch isn't prevented by any copy or routing signal |
| 6 | Recognition Rather Than Recall | 3 | Good icon+label pairing; carousel gives no visible count of how many photos exist |
| 7 | Flexibility and Efficiency of Use | n/a | First-visit Persuade landing page with exactly two possible actions - no power-user path applies |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and generous overall; the full-bleed tinted capability section reads as a stock pattern (see P2) |
| 9 | Error Recovery | 2 | Arrival via Sign Up gets zero reorientation - the page doesn't acknowledge the visitor came to register |
| 10 | Help and Documentation | n/a | Not expected at this stage of a marketing landing page |

Total: 20/32 (heuristics 7 and 10 n/a) -> Acceptable band (63%).

### Design Specificity Verdict

LLM assessment: The copy is genuinely product-specific - the headline encodes the actual locked-hold booking mechanic, and the capability grid uses CULibSpace's real zone taxonomy (Silent/Group/Common) rather than generic feature language. But the structure carrying that copy - sticky colored header with two CTA pills, photo-vs-text split hero, tinted icon+heading+blurb strip below the fold - is interchangeable SaaS-marketing furniture. The product's actual differentiator (real-time zone/seat visibility) is asserted in text only; nothing on the page visually proves "real-time."

Deterministic scan: 0 findings across all 7 files (exit 0). Confirms the technical/token layer is clean, but none of the priority issues below are patterns a static detector catches. Two existing gray-on-color suppressions (on topMenu.tsx/topMenuItem.tsx, documenting an earlier WCAG contrast fix) aren't masking anything relevant here.

Visual overlays: unavailable - no browser automation tool connected. Assessment B verified structural facts directly from served HTML instead: <main> present, clean h1->h2->h2 heading order, both <img> tags carry real alt text, aria-live/aria-label present on the carousel, no hard-coded hex colors outside Next.js's own error-overlay boilerplate.

### Overall Impression

The page is calm, on-brand in its restraint, and the words are actually about this product. What's missing is proof: the differentiator PRODUCT.md names (real-time visibility beating a walk-up line) never becomes visible, only claimed. And the single highest-stakes moment on the page - a first-time visitor clicking "Sign Up" - currently dead-ends on a screen that just says "Login."

### What's Working

1. Copy is drawn from real product truth, not filler - headline, subhead, and zone names are all product-accurate.
2. Deliberate accessibility work in specific, verifiable spots - skip-link, carousel aria-live announcement plus labeled prev/next buttons, consistent themed focus rings - confirmed structurally by Assessment B.
3. DESIGN.md's restraint mostly held under real editing pressure - two-tier radius, no pill shapes, Reading Rose kept to interactive elements almost everywhere.

### Priority Issues

**[P0] Sign Up leads to a page that says "Login," with no reorientation**
- Why it matters: this is the page's entire reason for existing - the primary conversion moment - and it currently reads as a bait-and-switch to a first-time visitor expecting registration.
- Fix: pass an intent signal (e.g. /login?intent=signup) that flips the heading/microcopy on arrival - "New here? Let's get you set up" - even before a dedicated signup route exists.
- Suggested command: /impeccable clarify

**[P1] Carousel has no visible position indicator for sighted users**
- Why it matters: the aria-live announcement serves screen-reader users, but a sighted visitor - on the mobile-majority audience this page is built for - has no way to tell how many photos exist or where they are in the sequence.
- Fix: add a small dot/count indicator in the existing neutral palette.
- Suggested command: /impeccable clarify or /impeccable delight

**[P2] The bg-rose-50 full-bleed capability section isn't in DESIGN.md's vocabulary and reads as generic SaaS chrome**
- Why it matters: DESIGN.md defines exactly two surface treatments (panel-muted at neutral-100, card-surface at white) - this section is neither, and a tall full-width tinted band pushes against the documented "white as 80-90% base" commitment. This wash was introduced deliberately during an earlier /impeccable colorize pass to separate the hero from this section - the critique's pushback is fair regardless of that intent, since it was never formalized as a documented pattern.
- Fix: either drop to white/neutral-100, or replace the flat wash with something that shows the actual differentiator (a zone/seat glimpse).
- Suggested command: /impeccable colorize or /impeccable distill

**[P3] Logo isn't a link back to home**
- Fix: wrap the logo Image in Link href="/".
- Suggested command: /impeccable clarify

**[P3] Header has no <nav> landmark**
- Why it matters: Home/Log In/Sign Up sit in plain divs - screen-reader users lose a navigable landmark for primary site navigation.
- Fix: wrap the three items in <nav aria-label="Primary">.
- Suggested command: /impeccable harden

### Persona Red Flags

Jordan (First-Timer): Clicks "Sign Up," expects registration, lands on a screen whose h1 literally says "Login" with a "User"/"Admin" toggle - no "create account" language anywhere. Likely bounces or hunts for a signup link that doesn't exist.

Casey (Distracted Mobile User): The carousel - the dominant visual on a phone screen, for an audience PRODUCT.md says is mostly mobile - only responds to tapping the arrow buttons (onClick only); no swipe gesture support.

Riley (Stress Tester): Rapid-clicking the carousel arrows has no debounce/transition guard, and only the first slide carries priority - repeated navigation on a slow connection can produce visible pop-in on the other three slides.

### Minor Observations

- Copy inconsistency: the hint link says "Sign in above" while the header button says "Log In" - same action, different verb.
- text-rose-600 is used on the capability icons, which aren't clickable - DESIGN.md reserves Reading Rose for interactive elements specifically; a minor rule stretch.
- The page ends abruptly after the capability grid - no footer, no closing CTA.
- layout.tsx's metadata description is still the Next.js default ("Generated by create next app") - untouched boilerplate.
- TopMenuItem's isActive never gets passed on Home, so current-page nav highlighting is unused.

### Questions to Consider

1. If live zone browsing is the real differentiator over a walk-up line, why does the hero show a generic photo carousel instead of anything that visually proves "real-time"?
2. Sign Up and Log In go to the identical destination today - if that stays true short-term, should the header even present two separate buttons, or does that duality create an expectation the design then has to walk back on arrival?
3. The page's only real ask lives entirely in the sticky header; the body's sole nudge is a low-weight link that tells the visitor to look elsewhere. What changes if the hero's white column carried the CTA directly, instead of pointing away from itself?
