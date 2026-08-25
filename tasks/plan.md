# FlowLens implementation plan

## Overview

Build the FlowLens vertical slice in the master prompt’s Phase 0-15 order. Each phase uses thin, integrated increments: contract test, minimal behavior, focused verification, browser inspection when applicable, documentation/evidence update, adversarial review for non-trivial decisions, then a concise commit and push.

## Dependency graph

```text
source-backed spec and ADRs
  └─ canonical units, schemas, commands, revisions
      ├─ persistence, migrations, export, jobs
      │   └─ project shell and room lifecycle
      ├─ shared geometry and constraint evaluator
      │   ├─ accessible semantic editor
      │   ├─ Three.js scene projection
      │   └─ optimization feasibility
      ├─ evidence and claim pipeline
      │   ├─ tracer quality and motion observations
      │   └─ model calibration
      └─ model backend contract
          └─ deterministic simulation
              └─ constrained optimization
                  └─ recommendations
                      └─ experiments and calibration

cross-cutting: accessibility, privacy, security, observability, recovery,
performance, documentation, CI, browser verification
```

## Architecture decisions

- Client-first React/Vite foundation with a static core; see ADR-0001.
- Domain revisions and typed commands are authoritative; see ADR-0002.
- Fixed SI/spatial/determinism conventions and honest zonal science; see ADR-0003.
- Durable evidence, user-controlled source bytes, and caches have separate lifecycles; see ADR-0004.
- Runtime schemas guard imports, persisted records, commands, worker messages, adapter outputs, and exported projects.
- Scene, semantic UI, simulation, and optimization share canonical geometry and constraints.

## Phase plan

### Phase 0: Reconnaissance and contracts

- Record baseline, versions, primary sources, risks, assumptions, and capability posture.
- Accept the design specification and ADRs after adversarial review.
- Maintain the requirement matrix and phase checklist.
- Produce a detailed foundation plan with exact interfaces and red-green steps.

Checkpoint: phase documents contain no placeholders or contradictions; links resolve locally; clean diff; concise commits pushed.

### Phase 1: Canonical foundation

- Establish the locked React/Vite/TypeScript toolchain and CI-ready commands.
- Implement branded IDs/units, coordinate rules, entity/claim/project schemas, runtime validation, and versioned serialization.
- Implement idempotent commands, causal revisions, generated inverse-command undo/redo, lease fencing, shared constraints, canonical hashing, and a versioned deterministic PRNG.
- Implement claim resolution, confidence propagation, source-integrity state, the invalidation graph, central scientific admissibility, immutable run/model/recommendation/experiment contracts, and calibration boundaries.
- Implement repository contracts, staged IndexedDB transactions, migrations/recovery, fenced tab leases, hostile-input-safe export/import, tombstoned deletion, and scoped worker job protocols.

Checkpoint: unit/property/integration tests prove dimensional validity, round trips, idempotency/inverses, fencing/conflicts, staged cleanup, deterministic identity, provenance/source integrity/invalidation, scientific admissibility/contracts, migrations, stale jobs, bounded hostile parsing/packages, export/import, and achievable deletion semantics.

### Phase 2: Product shell and design system

- Build the project list/onboarding/workspace routes and synthetic sample project.
- Implement restrained tokens, typography, accessible primitives, status/error patterns, responsive panels, autosave state, and global recovery boundary.
- Add phase navigator, inspector shell, evidence/model panel, and command/action infrastructure.

Checkpoint: a user creates, opens, saves, and reopens a manual sample room by keyboard at desktop and narrow viewport sizes.

### Phase 3: Interactive room editor

- Project canonical geometry into React Three Fiber with WebGL detection and fallback.
- Add orbit/pan/zoom/presets, selection, add/move/rotate/resize, snapping, duplicate/delete, lock/hide, layers, undo/redo, and accessible form/table parity.
- Enforce shared constraints and resource disposal; add quality controls and real-run overlays only.

Checkpoint: scene/domain round trips meet tolerance; pointer and keyboard operations issue identical domain commands; low-capability fallback is complete.

### Phase 4: Creation, import, and correction

- Deliver the dimension-first manual room wizard.
- Add validated project/mesh import and camera permission/capability states.
- Keep unsupported/denied camera and XR paths inside the complete manual/import flow.

Checkpoint: create/correct/save/reopen works without hardware and malformed imports fail safely.

### Phase 5: Evidence ingestion

- Add atomic note, measurement, device specification, sensor CSV, photo, and video ingestion.
- Implement source states, checksums, EXIF/geolocation stripping, consent, quota preflight, retention, conflict resolution, and evidence/claim review.
- Complete export and cancellation-aware project/media deletion.

Checkpoint: incremental evidence preserves revisions and conflicts; raw evidence never appears in logs; storage states match browser records.

### Phase 6: Tracer-video analysis

- Generate controlled clips and known 2D motion fields before runtime analysis.
- Implement validated decode metadata, deterministic sampling, brightness/contrast/blur/dynamic-range/background-motion/tracer-visibility diagnostics.
- Add stabilization, reviewed masks/regions, segmentation, sparse/dense apparent flow, forward/backward consistency, outlier filtering, diagnostics overlay, and acceptance/refusal.
- Run the pinned local OpenCV.js capability in an isolated worker with cancellation and memory cleanup.

Checkpoint: good fixture direction lies within the predefined angular tolerance; every bad fixture refuses for the expected reason; no physical velocity appears without calibration.

### Phase 7: Directed-zone model

- Implement zones, flow edges, automatic suggestions, user editing, evidence links, uncertainty, model maturity, and backend capability identity.
- Validate mass-balance inputs and shared geometry/constraint relationships.

Checkpoint: model construction and edits remain traceable to room/evidence revisions and invalid flows fail closed.

### Phase 8: Simulation

- Implement the compartment solver, scenario/source/device inputs, cancellation, normalized caching, and uncertainty only through a named supported method.
- Provide metrics, time-series table/chart, spatial overlays, scrubber, warnings, and downloadable run data.

Checkpoint: analytic fixtures, conservation cases, non-negativity, cache invalidation, cancellation, and replay pass.

### Phase 9: Optimization

- Implement scenario-specific variables, candidate generation, shared feasibility checks, deterministic bounded search, Pareto ranking, sensitivity, and fragile-gain rejection.
- Record evaluated candidates, seed, constraints, objectives, and baseline comparison.

Checkpoint: enumerable fixtures find known optima/Pareto sets and never return infeasible actions.

### Phase 10: Recommendations

- Generate structured actions from actual feasible candidate runs with expected effect, rationale, evidence, confidence, assumptions, trade-offs, alternatives, precision cap, and verification protocol.
- Add typed local project queries and confirmed mutation previews; core explanations do not require a language model.

Checkpoint: every recommendation trace resolves, unsupported questions name missing evidence, and no synthetic/generic answer is presented as analysis.

### Phase 11: Verification and learning

- Persist immutable baseline/intervention snapshots, follow-up observations, predictions, residuals, and calibration proposals.
- Require review before bounded parameter changes and preserve pre/post model versions.

Checkpoint: before/after E2E displays prediction, observation, residual, decision, and model history.

### Phase 12: Accessibility and interaction polish

- Complete keyboard parity, focus order/restoration, forced colors, reduced motion, reflow, touch targets, live status, accessible tables/summaries, and responsive guided editing.
- Perform automated and focused manual assistive-technology checks.

Checkpoint: critical workflow is complete without canvas interaction, precision pointer input, motion, or color perception.

### Phase 13: Validation, security, and recovery

- Close unit/property/integration/vision/science/E2E/accessibility/privacy/recovery evidence gaps.
- Threat-model and test hostile imports, archive traversal, oversized work, prompt injection in evidence, XSS surfaces, worker failure, offline behavior, migration failure, and deletion.
- Audit dependencies, secrets, licenses, headers, CSP, and network behavior.

Checkpoint: requirement matrix has current proof or a named external blocker; no known high-severity issue remains.

### Phase 14: Performance and observability

- Instrument privacy-safe marks for startup, interactions, frames, long tasks, jobs, memory proxies, solver/search duration, and failures.
- Profile representative projects; apply lazy loading, worker transfers, adaptive density, instancing, disposal, and cache fixes only where measured.
- Enforce bundle and critical-path budgets in CI.

Checkpoint: documented budgets pass on representative desktop/mobile profiles or a tested fallback activates.

### Phase 15: Release audit

- Review all flows as a new user and an expert; fix dead ends, unclear scientific language, responsive defects, runtime/console/network errors, and stale documentation.
- Run the full clean-install release gate, inspect final diffs for secrets/private artifacts/meta prose, and write the final verification and limitations report.
- Activate deployment only if separately authorized; otherwise prove the production bundle locally and document the unperformed external step.

Checkpoint: every Definition of Done item is proven, explicitly user-scoped out, or blocked by a named external dependency with the strongest local fallback complete.

## Parallelization policy

- Define and test shared contracts sequentially before dependent work.
- Parallelize independent fixtures, accessible views, documentation, and reviews only after their contracts are stable.
- Every parallel change is inspected and integrated by the primary agent before testing or committing.
- Shared package/config/persistence files remain single-writer work.

## Commit and push policy

- Commit one verified feature slice or coherent documentation decision at a time.
- Use concise conventional messages such as `feat: add room revision commands`.
- Before each commit: inspect staged diff, scan for secrets/private paths/meta prose, run focused checks, and ensure the tree excludes artifacts.
- Push every meaningful green checkpoint to `origin/codex/flowlens-build`; never force-push shared history.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Product breadth causes disconnected scaffolding | High | Work vertical slices, require end-to-end checkpoints, and keep placeholders out of closed criteria. |
| Browser/WASM vision is too slow or unsupported | High | Quality/refusal workflow first, bounded workers, local OpenCV capability detection, synthetic fixtures, explicit unavailable state. |
| Coarse model is overinterpreted | High | Maturity labels, assumptions, evidence links, precision caps, analytic tests, and careful language. |
| IndexedDB quota/eviction loses evidence | High | Preflight, visible source state, checksums, export, missing-source handling, and separated caches. |
| WebGL editor excludes users or weak devices | High | Canonical semantic editor, keyboard parity, static/table fallback, adaptive quality. |
| Dependency churn breaks compatibility | Medium | Exact lockfile, primary-source checks, Node/browser matrix, Renovation only after full gate. |
