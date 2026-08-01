# Product

## Users

Engineers and interns on the BeyondChats team who use Claude Code daily. They
open ClaudeLens to learn *how* teammates work with the agent — which prompts,
skills, and subagents turn token spend into real output — and to find exemplary
sessions worth copying. Context: an internal, trusted, self-hosted tool viewed
on desktop during a workday. Everyone is authenticated as the same shared team
account, so identity is by chosen display **name**, not email.

## Product Purpose

A self-hosted, auto-populated gallery of the team's Claude Code sessions.
Install the plugin, connect once, and sessions sync automatically (tracking is
on by default; any session/project can be opted out with a slash-command switch
that stops data before it's sent). The dashboard's job is to make the team's real agent usage
**browsable by person → project → session → transcript**, so learning is a
matter of navigating, not digging. Success = a teammate finds and reads a
relevant session in seconds and leaves with a concrete technique.

## Brand Personality

Sharp, quiet, engineer-native. Three words: **precise, fast, legible.** It
should feel like a tool engineers live in (Linear, Raycast, Vercel) — dense
data, understated chrome, speed over spectacle. Personality shows in typographic
rhythm and one confident, deep emerald accent, not in decoration.

## Pinned references

`references/dribble-ref-01..04` and the two shadcn dashboard shots are the
committed visual direction, pinned by the product owner. `-01` and `-02` set the
world actually built: a light grey-green ground, white cards that lift on a soft
shadow, a persistent left rail, and a single filled-accent hero tile in a KPI
band. Take structure and density from them, not just mood.

## Anti-references

- Generic SaaS admin template (evenly-spaced identical cards, big gradient hero
  metric, tracked-uppercase eyebrow over every section).
- Consumer-analytics dashboards heavy on chart chrome and color for its own sake.
  In particular: a different hue per chart when each chart has one series — hue
  can only encode something when there is something to distinguish.
- Anything that reads as "AI-generated dashboard": glassmorphism, side-stripe
  cards, gradient text.
- Unicode glyphs standing in for an icon system.

## Design Principles

1. **Navigation is the product.** People → projects → sessions → transcript must
   feel like drilling with zero friction; every level answers "who/what/how much"
   at a glance.
2. **Data-forward, quiet chrome.** Numbers and names carry the page; borders and
   backgrounds recede. Tabular numerals, tight alignment, real density.
3. **Earned familiarity.** Standard affordances done well; the tool disappears
   into the task. No invented controls.
4. **Every state designed.** Loading (skeletons), empty (teach the flow), hidden/
   opted-out, featured — all first-class, never afterthoughts.
5. **Identity: light ground, one emerald accent.** A grey-green page with white
   cards and a deep emerald (`#157551`) are the committed brand, following the
   pinned references above. Three voices only — emerald, the neutrals, and ink;
   amber and red exist as *status*, never as decoration. Evolve layout and
   typography freely, but don't reintroduce extra hues: the previous palette
   accumulated a blue and a violet nobody had designed for, and they had to be
   retired. Concrete tokens and rules live in `DESIGN.md`.

   *This principle previously read "dark surface + Claude-ember accent are
   committed brand". That was superseded during the dashboard redesign when the
   references above were pinned. Kept visible so the reversal is a recorded
   decision rather than apparent drift.*

## Accessibility & Inclusion

Body text ≥ 4.5:1 contrast on its surface — and on a light ground that means
checking against the **hover** surface too, not just the card, since that is the
tier that only fails while a user is pointing at it. Full keyboard navigation and
visible focus rings on all interactive elements. Every animation has a
`prefers-reduced-motion` fallback. Colour is never the only carrier of a
distinction: transcript roles, for instance, differ by side and fill as well.
