# ADR-0009: Recover local command authority through validated journals

## Status

Accepted; implementation pending foundation Task 8.

## Date

2026-09-07

## Context

The initial repository sketch accepted a replacement `Project` through public compare-and-swap. That cannot prove the replacement came from a validated command or atomically account for its audit, history and idempotency artifacts. Task 5 also deliberately denies replay authority to cloned receipts: IndexedDB structured cloning does not preserve module-issued identity, and an unkeyed checksum is not authentication.

## Decision

Keep replacement/CAS private to the IndexedDB adapter. Public mutation accepts a discriminated command/undo/redo intent and preserves the existing envelope's project, causal parent, expected revisions, identifiers and fence. Keep project reads and add a session read containing project plus history. Return typed stable failures, the committed command result (including replay status), and the current authoritative session. An exact retry may return an old committed result but must not replace the current session/head with that old project.

Persist an immutable validated root and a bounded ordered local journal alongside committed projections. A domain-owned local-journal recovery function parses bounded inert records, replays command/history intents using the existing domain functions, compares complete regenerated projections and final head/history/receipts, and returns newly issued records. Derive revision sets; do not trust caller-supplied lists or promote cloned receipts into authority. Keep history-invalidating events explicit.

This is a trusted local recovery boundary, not an authorship verifier. Corrupt records reject; coherent rewriting of same-origin data is not authenticated. External packages must not feed embedded audit, history, receipt or idempotency records into local recovery. Import establishes a new root or uses an explicit import command; historical package material remains unauthenticated provenance rather than live edit authority.

Prepare/replay outside the final write transaction where possible. Inside publication, re-read and compare the exact root/journal identity, head, fence and tombstone; mismatch returns a conflict with zero writes. Publish the new head, revision, journal event, audit, history/receipt and idempotency result atomically. Hashing, decoding and peer acknowledgements remain outside this transaction. Do not silently upgrade a stale caller request during an optimistic retry.

Aggregate-changing stages carry validated domain intents, not replacement projects. Keep staged bytes invisible until size/checksum validation and fenced final publication. Initial creation may establish a validated root only for a never-used project ID. A mutation unsupported by the current command vocabulary returns a stable refusal until its feature phase adds the command; persistence cannot bypass the command boundary to approximate it.

### Capacity

Do not truncate, rebase, compact or evict a replay-required prefix in Task 8. Event/record bounds cannot exceed the domain's 4,096-record limit. At capacity, refuse new edits with `CAPACITY_EXCEEDED` and zero writes; exact retries that satisfy current fence/tombstone checks remain available without appending.

Lease fences and tombstones are durable independently of the content journal. Check them before replay. A newer durable fence invalidates the reopened effective history with `FENCE_CHANGE` after journal validation; it cannot revive old edit authority. The next permitted journal event records the observed fence/invalidation. No new edit event is permitted at capacity.

### Terminal deletion

Deletion is separate from content-journal publication. Its initial transaction atomically writes the non-content tombstone, advanced fence and minimal durable deletion receipt with stable request identity/status. It needs neither journal capacity nor successful replay of corrupt content. Matching deletion retries return the existing receipt/status without another fence advance and may resume idempotent cleanup.

After persistent absence verification, retain only the non-content receipt/tombstone needed for non-resurrection. Peer acknowledgements are best effort; this cannot erase another suspended tab's RAM or files already downloaded outside app-controlled storage.

## Alternatives considered

- Public raw-project CAS: rejected because structurally valid replacements can bypass commands and lose audit/history semantics.
- Trust a stored receipt checksum: rejected because a writer can replace both payload and checksum.
- Truncate the journal at capacity: rejected because the immutable root would no longer reproduce the surviving suffix or its revision/idempotency history.
- Introduce signing infrastructure: not required for local recovery, and outside this phase's local-first scope; no authenticity claim is made.

## Consequences

- Task 8 adds a domain journal recovery seam and command-bearing repository API; the earlier illustrative replacement-project signature is superseded.
- Reopen and publication must test full causal equivalence, exact retries after later edits, corrupt projections, interrupted staging, tombstones and capacity behavior.
- Large-history reconstruction needs profiling; the existing public undo/redo baseline is not a persistence performance pass.
- Product consumers must distinguish the historical committed retry result from the current authoritative session.

## Sources

- [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()): transaction completion, scope and auto-commit constraints (checked 2026-09-07).
- ADR-0002, ADR-0004, and the foundation Task 5 issued-record contract.
