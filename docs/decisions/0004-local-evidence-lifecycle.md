# ADR-0004: Separate durable evidence, source bytes, and caches

## Status

Accepted

## Date

2026-08-24

## Context

Room images and video are sensitive and can exceed browser quota. Browser storage can be evicted, shared across tabs, or exposed to another user of the same browser profile. Thumbnails, decoded frames, and optical-flow fields have different audit value from accepted claims and source checksums.

Deleting only the visible project record would leave source bytes, metadata, worker buffers, or caches behind. Deleting while a worker runs could recreate derived data.

## Decision

Use three data classes:

- Durable records: revisions, evidence metadata/checksums, accepted observations and claims, models, run inputs/summaries, experiments, and calibration decisions.
- User-controlled source bytes: explicitly stored media/documents with visible lifecycle states and retention controls.
- Rebuildable caches: thumbnails, decoded frames, flow fields, render buffers, and unselected candidate detail.

Imports validate content signatures and bounded metadata before decoding and estimate quota, but do not treat quota preflight as a guarantee. They write bounded chunks to a project-scoped staging area and atomically publish metadata/source references only after complete checksum and size validation. Interrupted stages are resumed only against the same source fingerprint and consent or garbage-collected. Sensitive source bytes are not deduplicated across projects.

Canonical `.flowlens` export is the recovery and portability boundary. It uses a versioned manifest, sorted JSON records, SHA-256 checksums, optional media inclusion, and explicit redaction. The restricted archive rejects symlinks, nested archives, duplicate/confusable paths, traversal, compression bombs, excessive entries/expanded bytes/JSON depth, identifier collisions, active SVG, and unsupported subformats before commit. Checksums prove integrity, not authorship, so unsigned packages are labeled unauthenticated.

Raw originals and sanitized derivatives have separate IDs, hashes, consent, retention, and provenance. Stripping EXIF/geolocation never changes the original record or implies that a derivative is the original.

Project deletion uses a non-content tombstone, lease-fence advance, best-effort peer notification/acknowledgement, local decoder/job cancellation, object-URL/buffer cleanup, enumerated removal of history/audit/derived/source/cache records, and persistent absence verification. FlowLens cannot forcibly erase another suspended tab's RAM or a download copied outside app-controlled storage; those limits are disclosed. Resumed tabs deny repository access and clear the fenced project.

Source availability/checksum is revisioned provenance state. Presence is verified on open, before dependent activation, and after storage errors; missing or corrupt bytes invalidate reproducibility without rewriting historical claims.

All supported files are sniffed and bounded inside disposable capability-scoped ingestion workers before their output reaches UI, scene, model, or long-lived analysis code. Evidence processing uses locally bundled runtime code; raw bytes and private values are excluded from logs and diagnostics.

## Alternatives considered

### Store all artifacts indefinitely in IndexedDB

- Rejected: it exhausts quota and obscures which records are required for auditability.

### Store metadata only and retain `File` handles implicitly

- Rejected: browser/session handle lifetime is not a durable source guarantee and cannot support reliable reopen/export.

### Upload media for reliability

- Rejected: a hosted storage boundary is not required for the core product and would need explicit consent, authorization, access control, retention, and deletion design.

## Consequences

- Missing or evicted source bytes become a visible provenance state; existing claims are not silently deleted or represented as fully reproducible.
- Cache eviction is safe and deterministic rebuild rules are documented.
- Export size and source inclusion are visible before creation.
- “On this device” copy must state the browser-profile/origin limitation.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
