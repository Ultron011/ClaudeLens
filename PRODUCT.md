# Product

## Register

product

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
rhythm and a confident use of the warm "Claude ember" accent, not in decoration.

## Anti-references

- Generic dark SaaS admin template (evenly-spaced identical cards, big
  gradient hero metric, tracked-uppercase eyebrow over every section).
- Consumer-analytics dashboards heavy on chart chrome and color for its own sake.
- Anything that reads as "AI-generated dashboard": glassmorphism, side-stripe
  cards, gradient text.

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
5. **Identity preserved.** Dark surface + Claude-ember accent are committed brand;
   evolve the layout and typography, don't relitigate the palette.

## Accessibility & Inclusion

Body text ≥ 4.5:1 contrast on its surface (bump the existing muted grays where
they fall short). Full keyboard navigation and visible focus rings on all
interactive elements. Every animation has a `prefers-reduced-motion` fallback.
