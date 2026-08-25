# ADR-0002: Make domain revisions authoritative

## Status

Accepted

## Date

2026-08-24

## Context

FlowLens will have several representations of one project: React views, a Three.js scene, semantic tables/forms, IndexedDB records, undo history, worker inputs, and immutable scientific runs. Independent mutation from any representation would create silent divergence and could attach a late result to the wrong room.

IndexedDB is shared by tabs on the same origin. Long-running workers can complete after a room changes. Deletion and migrations can race with open tabs or active jobs.

## Decision

The canonical project aggregate is writable only through a typed domain command bus. Every command carries a command ID, idempotency key, causal parent, expected revision ID, and lease fencing epoch. A successful command atomically returns a new immutable revision and audit event; an idempotency replay returns its prior result; a mismatched revision or fence returns a conflict without mutation.

The React workspace, Three.js scene, semantic table, charts, and inspectors are projections. Pointer, keyboard, form, import, calibration, and future assistant mutations all dispatch the same commands. Undo/redo replays or inverts commands through that boundary.

Undo stores generated inverse commands. Redo creates a new command against the current causal parent. A remote edit, import, migration, tombstone, or lease takeover makes incompatible history visibly non-applicable instead of replaying it against a different state.

Project editing uses both:

1. a renewable cross-tab lease with a monotonically increasing fencing epoch for understandable and split-brain-safe behavior; and
2. compare-and-swap persistence for correctness even if a lease is lost.

Every worker job captures an immutable content-addressed input graph plus project, room, model, evidence, claim-policy, scenario, constraint, calibration, adapter, and lease-fence versions. A result is stored as a detached run and becomes active only if the complete graph and fencing preconditions still match. Validated job messages support progress, refusal, cancellation, failure, deadlines, and resource budgets. Workers cannot import repositories or write durable state; only the controller can stage and commit validated output. Cancellation escalates to worker termination and staged-resource cleanup after a bounded grace period.

Mutations that span records or blobs use invisible staged operation IDs and a final aggregate transaction; abandoned stages are cleaned on startup. Deletion writes a non-content tombstone and advances the lease fence before cancellation and storage removal. Peer notification and cleanup are best effort; the durable fence denies future repository reads/writes and forces resumed tabs to clear in-memory state. Persistent absence can be verified, but RAM in a suspended tab cannot be erased by another tab. A tombstoned project ID cannot be resurrected by import.

## Alternatives considered

### React or Zustand state as the room source of truth

- Rejected: UI stores are not transaction, migration, multi-tab, or scientific revision boundaries.

### Three.js object transforms as canonical geometry

- Rejected: direct renderer mutation would bypass units, constraints, keyboard editing, undo, persistence, and solver validation.

### Last-write-wins persistence

- Rejected: it silently loses edits and makes late scientific results appear current.

## Consequences

- Commands and adapters require runtime schemas even when TypeScript types exist.
- Conflicts are visible product states with reload/take-over/reapply recovery.
- Job output remains auditable even when stale, but cannot silently update the active model.
- Deterministic domain code can be tested without React, WebGL, IndexedDB, or real workers.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
