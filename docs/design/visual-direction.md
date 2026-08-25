# FlowLens visual direction

Status: Accepted for implementation

Date: 2026-08-24

## Subject, audience, and job

FlowLens is a local-first spatial airflow instrument. Its audience spans occupants who need understandable guidance, facility teams who need inspectable assumptions, and researchers/designers who need reproducible evidence and runs.

The workspace's single job is to keep the room → evidence → model → simulation → recommendation → verification loop understandable without hiding uncertainty or turning the product into a dashboard.

## First-pass direction

- Palette: cool neutral canvas, white working surfaces, dark green-black text, airflow teal for primary action, blue focus/information, amber restriction, and brick-red refusal/destruction.
- Type: device-local Bahnschrift for sparse display moments, Aptos/Segoe UI for interface text, and Cascadia Mono/Consolas for coordinates, units, and run identifiers.
- Layout: a persistent three-region workspace with a compact navigator, dominant spatial stage, contextual inspector, and a lower evidence/run rail. Narrow screens convert the same workflow into guided steps.
- Signature: a functional datum spine carrying project, phase, units, persistence, and run state. It references real spatial-instrument readouts rather than decorating the interface.
- Motion: short state transitions only. Scientific motion is user-controllable; reduced-motion changes are honored live.

## Skill/database evidence

The UI design database was queried twice for a restrained, dense scientific engineering workspace. Its closest matches proposed marketing conversion patterns, soft UI, generic blue/orange SaaS colors, remote Google Fonts, scroll reveals, and shadow-heavy cards.

Those matches were rejected because they conflict with the accepted product specification: FlowLens is not a landing page or dashboard, must not make runtime font requests, avoids ornamental elevation, and uses motion only when it communicates scientific or interaction state. The useful database guidance retained was dense responsive spacing, visible focus, accessible role-based testing, 44-pixel touch targets where practical, live reduced-motion handling, and an accessible non-canvas alternative for Three.js.

## Critique and revision

The first pass risked reading as a generic enterprise dashboard if the side panels became uniform cards. The revision removes card-grid composition and makes the datum spine, stage, inspector, and evidence rail continuous parts of one instrument surface.

The first pass also risked making provenance states too color-dependent. The revision assigns every scientific state a text label and a distinct line, glyph, or shape treatment. Confidence is never represented by opacity alone.

The typography direction initially considered downloaded technical faces. That would weaken the no-egress privacy posture and delay first render, so the accepted system uses local font stacks only.

Only one direction survived the brief critique, so no competing prototype track is warranted. The conditional `prototype` phase remains inactive.

## Implementation contract

The authoritative tokens, layout behavior, state grammar, privacy rules, and delivery checks live in `design-system/flowlens/MASTER.md`. UI implementation must read that file before creating or changing a page. A page-specific override may refine but not weaken it.
