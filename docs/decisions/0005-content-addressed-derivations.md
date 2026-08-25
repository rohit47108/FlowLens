# ADR-0005: Address derived results by complete immutable inputs

## Status

Accepted

## Date

2026-08-24

## Context

Revision counters prevent an obviously late result from becoming current, but they do not reproduce what a run meant. Claim-resolution policy, accepted observations, scenario configuration, constraints, calibration parameters, backend behavior, and numeric policy can change without being represented by a room revision alone.

Before/after experiments also become invalid if calibration rewrites the model that generated the prediction.

## Decision

Every observation derivation, model, simulation, optimization, recommendation, and experiment stores a content-addressed immutable input graph. The graph includes referenced record hashes and the versions of claim resolution, scenario, constraints, calibration, backend, solver, PRNG, tolerance, runtime mode, and evidence acceptance.

A versioned invalidation graph maps commands and policy changes to affected artifacts. Invalidation changes status and records a reason; it never deletes historical results. Cache reuse requires an exact supported content-graph match.

Claims are append-only. Active selection follows the versioned policy in the design specification. Simulated, predicted, and recommended categories never become observed inputs. Unsupported confidence propagation returns unknown rather than a guessed aggregate.

Experiments preserve immutable baseline and intervention snapshots, prediction model/run, accepted follow-up observations, residual method, and user calibration decision. Accepted calibration creates a new model version; it cannot rewrite the prediction model.

## Alternatives considered

### Use room revision IDs as run identity

- Rejected: revisions do not capture all policies, referenced content, runtime modes, or dependency versions.

### Delete stale derived results

- Rejected: deletion destroys auditability and before/after evidence.

### Recompute all results after every edit

- Rejected: safe but unnecessarily expensive; content identity allows exact reuse when inputs truly match.

## Consequences

- Run records are larger but independently auditable.
- Policy/version changes intentionally invalidate dependent results.
- Export/import must preserve canonical hashes and category distinctions.
- UI must distinguish current, stale, incompatible, missing-source, and superseded states.
