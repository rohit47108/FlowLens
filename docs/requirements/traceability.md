# Requirement-to-evidence matrix

Last updated: 2026-08-24

Status meanings:

- `Planned`: mapped to a concrete phase and proof target; implementation evidence does not exist yet.
- `Implemented`: source behavior exists, but the complete proof target is not yet current.
- `Proven`: current automated and required browser/manual evidence satisfies the criterion.
- `Blocked`: a named external dependency prevents proof after the strongest local fallback is complete.

No requirement is promoted from `Planned` or `Implemented` based on source inspection alone.

## Non-negotiable product requirements

| ID | Requirement | Phase | Proof target | Status |
| --- | --- | --- | --- | --- |
| N1 | Guided room creation with universal manual fallback | 2, 4 | Playwright create/manual/import/denied-camera paths; saved project fixture | Planned |
| N2 | Interactive 3D add/select/move/rotate/resize/label/hide/lock/duplicate/delete with undo/redo | 3 | Domain command tests, transform round trips, pointer and keyboard E2E | Planned |
| N3 | Typed doors, windows, vents, fans, purifiers, furniture, occupants, sources, sensors, outlets, annotations | 1, 3 | Exhaustive schema tests, object palette and inspector E2E | Planned |
| N4 | Incremental photos, video, measurements, notes, equipment, sensors | 5 | Atomic ingestion/reopen tests for every evidence type | Planned |
| N5 | Provenance and confidence for every material claim | 1, 5 | Claim invariant/property tests; UI/export inspection | Planned |
| N6 | Fail-closed tracer-video workflow with quality diagnostics | 6 | Controlled good/bad fixtures, refusal reasons, review E2E | Planned |
| N7 | Replaceable directed-zone airflow model | 7 | Backend contract tests and editable zone workflow | Planned |
| N8 | Deterministic contaminant/clearance simulation | 8 | Analytic one/two-zone fixtures, run hash/replay tests | Planned |
| N9 | Real constrained deterministic optimization | 9 | Enumerable known-optimum/Pareto fixtures and feasibility properties | Planned |
| N10 | Concrete traceable recommendations | 10 | Candidate-to-recommendation contract tests and rationale E2E | Planned |
| N11 | Six behaviorally distinct scenarios | 8-10 | Snapshot/invariant tests proving objectives, constraints, and warnings differ | Planned |
| N12 | Before/after prediction, observation, residual, and model update | 11 | Immutable experiment/calibration integration tests and E2E | Planned |
| N13 | Local-first storage/upload states, export, deletion | 1, 5 | IndexedDB migration/export/delete/privacy tests and browser storage inspection | Planned |
| N14 | Responsive keyboard workflows and nonvisual 3D equivalents | 2, 3, 12 | Keyboard-only E2E, semantic table parity, axe and manual review | Planned |
| N15 | Complete empty/loading/permission/unsupported/low-quality/failure/recovery states | 2-15 | State catalog tests, failure injection E2E, responsive screenshots | Planned |

## Acceptance criteria

| ID | Criterion | Phase | Proof target | Status |
| --- | --- | --- | --- | --- |
| A1 | Fresh clone installs, starts, builds, and demos without secrets | 0-2, 15 | Clean `npm ci`, `npm run check`, documented startup, sample E2E | Planned |
| A2 | Create/edit/undo/save/reload/export room | 1-4 | Integrated Playwright workflow and exported fixture re-import | Planned |
| A3 | Scene and canonical state synchronize within tolerances | 1, 3 | Projection and serialization property tests plus browser transform E2E | Planned |
| A4 | Denied/unsupported capture retains complete manual/import workflow | 4 | Permission/feature stubs and fallback E2E | Planned |
| A5 | Evidence adds without losing revisions | 1, 5 | Revision history and incremental ingestion integration tests | Planned |
| A6 | Conflicting claims remain auditable under visible policy | 1, 5 | Claim-resolution property/integration tests and inspector E2E | Planned |
| A7 | Good tracer fixture meets direction tolerance; bad fixtures refuse correctly | 6 | Synthetic motion fixture suite with predefined thresholds | Planned |
| A8 | Baseline simulation matches analytic cases, units, non-negativity, reproducibility | 7, 8 | Analytic/invariant tests and stored-run replay | Planned |
| A9 | Optimization obeys constraints and beats or ties baseline with alternatives | 9 | Known search-space and Pareto tests plus comparison E2E | Planned |
| A10 | Recommendations trace to runs/evidence without unjustified precision | 10 | Provenance/precision contract tests and UI/export inspection | Planned |
| A11 | Scenario changes affect real model/optimization behavior and warnings | 8-10 | Cross-scenario behavior tests | Planned |
| A12 | Experiment shows prediction, observation, residual, versioned calibration decision | 11 | Experiment integration suite and verification E2E | Planned |
| A13 | Critical workflows work by keyboard with text/table equivalents | 2, 3, 12 | Keyboard-only Playwright project and focused manual review | Planned |
| A14 | No known high-severity issue, secrets/private fixtures, unclear storage/deletion | 5, 13, 15 | Threat model, dependency/secret scan, malformed inputs, deletion inspection | Planned |
| A15 | Build, type, lint, unit/integration/E2E/accessibility/performance checks pass | 13-15 | Current CI and local release-gate logs | Planned |
| A16 | Real browser inspected at desktop/mobile across console/network/focus/error/loading/reduced motion | 12-15 | Browser audit checklist, traces, and reviewed screenshots | Planned |
| A17 | Documentation distinguishes implemented, experimental, unvalidated, unavailable | Every phase | Status docs and final verification report reviewed against product | Planned |

## Phase evidence ledger

| Phase | Current evidence | Remaining gate |
| --- | --- | --- |
| 0 | Repository inventory, current source register, accepted spec, ADRs, risk register, this matrix | Commit/push phase artifacts; foundation plan self-review |
| 1 | Design contracts only | Red-green-refactor foundation implementation and invariant suite |
| 2-15 | No implementation evidence yet | Corresponding plan, behavior, automated checks, and browser/manual proof |
