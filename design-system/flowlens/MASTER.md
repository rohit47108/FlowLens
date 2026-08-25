# FlowLens design system

This file is the visual and interaction source of truth for FlowLens. Page-specific files under `pages/` may tighten these rules but must not weaken accessibility, privacy, scientific provenance, or responsive workflow requirements.

## Product character

FlowLens is a local-first spatial airflow instrument for occupants, facility teams, researchers, and designers. It should feel calm, exact, and inspectable: more like a well-made field instrument than a dashboard or marketing site.

The central experience is a persistent workspace organized around room construction, evidence, modeling, comparison, recommendation, and verification. The 3D scene is important but never the only way to understand or operate the product.

## Visual direction

- Light, cool-neutral surfaces keep dense scientific information legible for long sessions.
- One deep airflow teal carries primary action and active-selection meaning. It is never the only state cue.
- The signature element is a **datum spine**: a thin, functional rail that exposes phase, coordinate/unit context, local-save state, and run status. Its tick marks and labels derive from real workspace state.
- Layout hierarchy comes from borders, alignment, typography, and whitespace. Avoid ornamental cards, glass effects, large gradients, and decorative charts.
- Corners remain precise. Shadows appear only where elevation is behaviorally real, such as a menu or dialog.

## Color tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#F2F5F3` | Application background |
| `--color-surface` | `#FFFFFF` | Panels, inputs, tables |
| `--color-surface-subtle` | `#E8EEEA` | Quiet grouped regions |
| `--color-ink` | `#14201B` | Primary text; 15.28:1 on canvas |
| `--color-ink-muted` | `#4C5B53` | Secondary text; 6.53:1 on canvas |
| `--color-border` | `#7D8C83` | Essential boundaries; 3.53:1 on white |
| `--color-border-subtle` | `#C8D1CC` | Non-essential separators |
| `--color-primary` | `#0B6B61` | Primary actions and active data; 5.81:1 on canvas |
| `--color-primary-strong` | `#074E47` | Hover/pressed action state |
| `--color-selection` | `#D7EEE9` | Selected row or entity background |
| `--color-info` | `#005FCC` | Informational state and focus; 5.45:1 on canvas |
| `--color-warning` | `#8A5200` | Restricted/uncertain state; 5.82:1 on canvas |
| `--color-danger` | `#A32824` | Refusal, invalid state, destructive action; 6.63:1 on canvas |
| `--color-on-primary` | `#FFFFFF` | Text on primary; 6.38:1 |

State indicators pair color with text, icon shape, line pattern, or border treatment. Forced-colors mode must preserve the same distinctions with system colors and borders.

## Typography

No font request may leave the device. Use installed/system faces only.

| Role | Stack | Guidance |
| --- | --- | --- |
| Display | `Bahnschrift, "Arial Narrow", "Segoe UI", sans-serif` | Product name and sparse workspace headings; restrained, never oversized |
| Interface | `Aptos, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif` | Controls, prose, tables, navigation |
| Data | `"Cascadia Mono", "SFMono-Regular", Consolas, monospace` | Coordinates, units, run IDs, numeric readouts |

- Base text is `1rem` with at least `1.5` line height.
- Use one `h1` per view and do not skip heading levels.
- Labels use sentence case. Data abbreviations retain their scientific casing.
- Minimum supporting text size is `0.8125rem`; body and control text remain at least `1rem` where space permits.

## Spacing, shape, and elevation

| Token | Value |
| --- | --- |
| `--space-1` | `0.125rem` |
| `--space-2` | `0.25rem` |
| `--space-3` | `0.5rem` |
| `--space-4` | `0.75rem` |
| `--space-5` | `1rem` |
| `--space-6` | `1.5rem` |
| `--space-7` | `2rem` |
| `--radius-control` | `0.25rem` |
| `--radius-panel` | `0.5rem` |
| `--radius-overlay` | `0.75rem` |
| `--shadow-overlay` | `0 0.75rem 2rem rgb(20 32 27 / 0.16)` |

Dense does not mean cramped. Controls preserve a comfortable 44 by 44 CSS-pixel target where practical and never fall below WCAG 2.2 AA target requirements.

## Workspace layout

Desktop and wide laptop:

```text
┌──────────────────────── datum spine: project · phase · units · saved ─┐
├──────────────┬────────────────────────────────────┬─────────────────────┤
│ phase /      │                                    │ contextual          │
│ project nav  │          room / result stage       │ inspector           │
│              │                                    │                     │
├──────────────┴────────────────────────────────────┴─────────────────────┤
│ evidence · model · run status · time / compare controls                │
└─────────────────────────────────────────────────────────────────────────┘
```

- The stage receives the available area; side panels stay compact and scroll independently.
- Selection in the scene and non-visual entity table shares one stable semantic identity.
- Advanced controls live in contextual inspectors, not permanent global chrome.
- At narrow laptop widths, one side panel becomes a user-controlled drawer; focus returns to its trigger on close.

Small screens and touch:

```text
┌──────── datum spine ────────┐
│ current guided step         │
│                             │
│ stage or form/table view    │
│                             │
├─────────────────────────────┤
│ Back       status      Next │
└─────────────────────────────┘
```

- Preserve the complete workflow as guided steps; never remove scientific inputs or results just to fit.
- Provide explicit buttons/fields for every drag-only action.
- Avoid horizontal page scrolling at 320 CSS pixels and support reflow at 400% zoom.

## Components and interaction

- Prefer native links, buttons, inputs, tables, disclosure widgets, and dialogs.
- Visible labels precede fields. Units are part of the label or an associated description, not placeholder-only text.
- Buttons use stable text matching the resulting status message: “Save project” produces “Project saved.”
- Primary action: filled teal with white text. Secondary action: white surface, ink text, essential border. Destructive action remains visually separate and requires clear scope.
- Use SVG icons only when an icon adds recognition; every icon-only control has an accessible name.
- Hover never reveals essential information. Active/pressed/focus/disabled states remain distinct without motion.
- Focus uses a `3px` `--color-info` outline with `2px` offset and is never removed.
- Errors are placed beside the affected field, announced, and explain the recovery action. Scientific refusals distinguish invalid input from insufficient evidence.
- Dynamic save, analysis, simulation, and worker state uses a polite live region; destructive or blocking failures use an assertive alert.

## Scientific and provenance states

| State | Required non-color treatment |
| --- | --- |
| Measured or observed | Solid mark plus explicit provenance label |
| User-entered | Square edit glyph plus “User-entered” label |
| Inferred | Dashed boundary/line plus “Inferred” label |
| Assumed | Dotted boundary/line plus “Assumed” label |
| Simulated or predicted | Directional hatch plus run ID and time |
| Recommended | Action marker plus source candidate/run link |
| Restricted | Warning triangle plus restricted vocabulary explanation |
| Refused or invalid | Stop shape plus reason and recovery path |
| Unsaved | Text status plus open-circle marker |
| Processing | Text progress, determinate value when available, and cancel control |

Do not encode confidence as opacity alone. Every critical visualization includes a legend, units, time context, uncertainty, and synchronized text/table alternative.

## Motion

- Default transitions last `160ms` to `220ms` and communicate state or spatial continuity.
- Animate `transform` and `opacity`; avoid layout-changing width/height animation.
- Do not add scroll reveals, parallax, ambient movement, or automatic camera motion.
- Honor live changes to `prefers-reduced-motion`. In reduced motion, stop particles and camera interpolation while preserving progress and state feedback.
- Provide pause and speed controls for scientific animations independent of the OS preference.

## Privacy and performance

- Do not load remote fonts, icons, images, analytics, or design assets at runtime.
- Reserve stage and media dimensions to avoid layout shift.
- Lazy-load heavy 3D, vision, and analysis adapters behind explicit workflow entry points.
- Keep the application shell useful when WebGL is missing and expose the entity/form/table workflow first-class.

## Required checks before UI delivery

- Semantic landmarks and a first-focus skip link reach the named main region.
- Keyboard order follows the visible workflow; no trap is possible.
- Focus is visible and not obscured by persistent rails or drawers.
- Text contrast is at least 4.5:1; essential boundaries and focus indicators are at least 3:1.
- Touch targets, zoom/reflow, forced colors, and reduced motion are verified.
- Layout is checked at 320, 768, 1024, and 1440 CSS pixels.
- Scene actions have form/button equivalents and results have text/table alternatives.
- Loading, empty, invalid, insufficient-evidence, offline, and recovery states are intentional.
- No runtime request is made for visual assets or fonts.
- Console, network, and accessibility scans are clean in a real browser.
