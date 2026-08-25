# ADR-0007: Gate every material output centrally

## Status

Accepted

## Date

2026-08-24

## Context

A model or vision adapter can declare capabilities while still being insufficient for a requested claim. Fixture readiness also does not prove a particular clip is usable. If each UI, optimizer, exporter, recommendation formatter, or future assistant decides independently, unsupported quantities or precision can leak into material output.

## Decision

Introduce a versioned pure `ScientificAdmissibilityPolicy`. Inputs include requested output/quantity, source availability and checksum status, accepted evidence, per-evidence diagnostics, calibration, backend/vision capabilities, maturity and validation scope, uncertainty method, scenario, and requested precision.

The result is exactly one of:

- `ADMIT`: the requested output and precision are allowed.
- `RESTRICT`: only named quantities, vocabulary, units, and precision are allowed.
- `REFUSE`: no material claim may be created; stable reasons and the smallest useful missing evidence are returned.

Run activation, claim creation, optimizer objective selection, recommendation formatting, export, and future assistant output all require an admissibility decision. Adapter self-declarations and successful execution never bypass it.

## Alternatives considered

### Gate only in the user interface

- Rejected: exports, jobs, tests, and future adapters could bypass UI logic.

### Trust capability manifests

- Rejected: a declared algorithm does not establish per-input evidence quality, calibration, maturity, or supported claim vocabulary.

### Warn after producing a result

- Rejected: a warning does not prevent unsupported output from being stored, recommended, or exported.

## Consequences

- Capability, calibration, evidence, and policy versions become part of run identity.
- Restricted outputs use explicit allowlists rather than free-form hedging.
- Policy tests are acceptance gates for new backends and evidence types.
