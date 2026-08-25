# ADR-0006: Deny unexpected production egress

## Status

Accepted

## Date

2026-08-24

## Context

Local processing is not private if runtime code, fonts, source maps, telemetry, error reporters, WASM fallbacks, or speculative fetches contact third parties. Offline tests alone can miss intermittent or state-specific network behavior. A service worker could also retain private-derived assets after project deletion.

## Decision

The serverless core locally bundles scripts, workers, WASM, styles, icons, and fonts. Production permits same-origin static asset requests during application load and declares `connect-src 'none'` after load. It contains no analytics, telemetry, hosted error reporting, runtime CDN fallback, third-party font, or published production source map.

FlowLens ships no service worker until a separate ADR defines cache inventory, updates, project deletion, and privacy semantics. Browser tests intercept every request and fail on any destination or request class outside the explicit production allowlist. Evidence selection and processing do not initiate network activity.

Deployment headers must include a reviewed Content Security Policy and compatible Trusted Types posture. A static meta policy is included for local artifact testing; a host-specific header audit remains required before deployment.

## Alternatives considered

### Permit trusted CDNs for heavy OpenCV assets

- Rejected: evidence timing and referrer/network metadata would cross an unnecessary third-party boundary, and runtime availability would become network-dependent.

### Add a service worker for offline installation immediately

- Rejected: the core can run from locally served static assets, while private cache inventory/deletion and upgrade behavior need dedicated design and tests.

### Rely only on privacy documentation

- Rejected: enforceable policy and network evidence are stronger than copy describing intended behavior.

## Consequences

- The production bundle is larger and must lazy-load heavy same-origin assets.
- Hosted sync, analytics, external assistance, and error reporting require new authorization and an ADR that changes the egress policy visibly.
- Vercel or another host is not considered verified until actual response headers and network behavior are inspected.
