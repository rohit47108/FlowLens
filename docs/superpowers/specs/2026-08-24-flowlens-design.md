# FlowLens design specification

Status: Accepted implementation mandate
Date: 2026-08-24
Product authority: `FLOWLENS_MASTER_PROMPT.md`

## Objective

FlowLens is a privacy-conscious spatial research and decision-support application. It lets a person build an approximate room twin, attach auditable evidence, run an explicit coarse zone model, compare feasible interventions, and verify changes with before/after observations. It is not a medical device, infection-risk calculator, exact CFD system, or substitute for professional indoor-air-quality assessment.

The first release succeeds when its synthetic sample project demonstrates the complete local loop:

`create → correct → enrich → model → simulate → optimize → recommend → act → verify → learn`

Every material value must retain category, source, confidence, uncertainty when justified, revision identity, and model/solver provenance.

## Assumptions fixed for implementation

1. The primary product is a modern browser application; native and XR capture remain optional adapters.
2. Core workflows run without a server, account, external model, paid credential, camera, or private media.
3. Browser-local storage means “on this browser profile and origin,” not encrypted or shared-device private.
4. The first scientific backend is a transparent directed-zone mass-balance model, never CFD.
5. Canonical dimensional types cover length, area, volume, time, angle, volumetric flow, CADR, source rate, concentration basis, threshold, exposure proxy, schedule time, energy, noise, cost, and each supported uncertainty distribution. Boundary conversion never erases the source unit or measurement precision.
6. The world frame is right-handed: `+X` east/right, `+Y` up, `+Z` south/toward the default camera; floor origin is the room boundary’s minimum `X/Z` corner. Euler UI values are degrees in intrinsic `Y-X-Z` order; serialized rotations are normalized quaternions.
7. User-visible placement and result precision is capped by input precision and uncertainty.
8. Hosted deployment and OpenAI-backed assistance require separate authorization. Structured local explanations remain part of core FlowLens.

## Technology stack

Initial exact versions are recorded by the lockfile. The accepted compatibility set is:

- Node.js `24.17.x` and npm `11.x`.
- React/React DOM `19.2.8`.
- Vite `8.2.2` with `@vitejs/plugin-react` `6.1.0`.
- TypeScript `6.0.3` in strict mode.
- React Router `8.3.0`, declarative client routing.
- Three.js `0.185.1`, React Three Fiber `9.7.0`, and Drei `10.7.8`.
- Zod `4.4.3` for runtime contracts.
- Zustand `5.0.15` for ephemeral UI state only; canonical room state stays in the domain store.
- Dexie `4.4.5` for the IndexedDB adapter.
- Vitest `4.1.11`, fast-check `4.9.0`, fake-indexeddb `6.2.5`, and Playwright `1.62.1`.
- OpenCV.js `4.13.0` as a locally hosted, checksum-pinned optional vision capability after its fixture gate is implemented.

No third-party runtime script, analytics endpoint, font service, or CDN may receive evidence-path requests.

## Canonical commands

These commands become executable with the foundation manifest:

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproduce the locked dependency graph. |
| `npm run dev` | Start the local Vite application. |
| `npm run build` | Type-check and create the production bundle. |
| `npm run lint` | Run static lint checks without mutation. |
| `npm run format:check` | Verify source and documentation formatting. |
| `npm run typecheck` | Run project TypeScript checks without emitting output. |
| `npm run test` | Run deterministic unit and integration tests once. |
| `npm run test:coverage` | Run the relevant coverage gate. |
| `npm run test:e2e` | Run Playwright browser workflows. |
| `npm run check` | Run formatting, lint, type, test, and build gates. |

## Project structure

```text
src/
  app/             routing, workspace composition, error boundaries
  domain/          canonical schemas, commands, units, geometry, revisions
  persistence/     repository contracts, IndexedDB adapter, migrations, export
  scene/           one-way Three.js projection and interaction adapters
  evidence/        validated ingestion, metadata, retention, claims
  vision/          capability contract, quality pipeline, OpenCV worker adapter
  modeling/        zones, flow edges, model backend interfaces
  simulation/      deterministic solver, metrics, cache identity
  optimization/    candidates, shared constraints, Pareto ranking
  recommendations/ traceable explanations and verification protocols
  experiments/     immutable snapshots, residuals, calibration decisions
  workers/         validated job protocol and worker entry points
  observability/   privacy-safe events, diagnostics, performance marks
  ui/              tokens, accessible primitives, charts, tables, status patterns
tests/
  fixtures/        deterministic synthetic media and scientific cases
  integration/     cross-module contracts and persistence recovery
e2e/               Playwright user workflows and accessibility checks
public/            non-sensitive local assets only
docs/              architecture, science, privacy, setup, evidence, verification
tasks/             living plan and checklist
```

Modules may import lower-level contracts, never UI/rendering implementations. `domain` has no React, Three.js, browser storage, or worker dependency.

## Code style

Use two-space indentation, named exports, strict types, descriptive `kebab-case` files, and discriminated unions for variants. Units and revision IDs appear in names or branded types.

```ts
export type Metres = number & { readonly __unit: "metres" };

export interface MoveEntityCommand {
  readonly type: "MOVE_ENTITY";
  readonly commandId: CommandId;
  readonly idempotencyKey: string;
  readonly projectId: ProjectId;
  readonly leaseFence: LeaseFence;
  readonly parentRevision: RevisionId;
  readonly expectedRoomRevision: RevisionId;
  readonly entityId: EntityId;
  readonly positionMetres: Vec3<Metres>;
}

export type CommandResult<T> =
  | { readonly ok: true; readonly value: T; readonly revision: RevisionId }
  | { readonly ok: false; readonly error: DomainError };
```

Comments explain scientific, safety, compatibility, or non-obvious intent. They do not restate code or mention assistants.

## Authoritative state and commands

The canonical project aggregate is the only writable room state. Pointer gestures, keyboard editing, inspector forms, imports, calibration, and assistant proposals all produce validated domain commands. The scene, accessible entity table, charts, and inspectors are read models.

Every mutation includes a globally unique command ID, idempotency key, causal parent revision, expected aggregate/room revisions, and current lease fencing epoch. A command either commits its new immutable revision and audit event in one transaction, returns the prior committed result for the same idempotency key, or returns a typed conflict without mutation. Scene objects never directly own persisted transforms.

Undo stores a validated generated inverse command against the revision produced by the forward command; redo generates a new command ID against the current causal parent. Undo/redo never blindly replays an obsolete expected revision. After a remote edit, import, migration, deletion request, or lease takeover, incompatible history entries become visible non-applicable records and require an explicit branch/reapply choice.

Cross-tab editing uses a renewable project lease plus `BroadcastChannel` invalidation. Each lease acquisition increments a monotonically increasing fencing epoch stored with the project. Every transaction and job activation checks that epoch as well as compare-and-swap revisions, preventing a suspended or expired tab from writing after takeover. A stale tab becomes read-only until it reloads or explicitly takes over.

Aggregate commands that span metadata, audit records, source bytes, observations, and derived state use a staged operation record. Content is written under an uncommitted operation ID, validated, then made visible with the aggregate revision and audit event in one IndexedDB transaction. Startup and bounded background cleanup remove abandoned stages; no read model can observe staged records.

## Spatial and constraint contracts

All geometry uses the fixed coordinate and unit conventions in this spec. Import adapters convert at the boundary and retain source unit, stated precision, and calibration record. Dimension schemas reject invalid combinations such as CADR encoded as a velocity or source rate combined with an incompatible concentration basis.

A shared pure `ConstraintEvaluator` handles room bounds, collision, surface attachment, openings, locks, device clearance, outlet reach, scenario safety, and explicit user overrides. Scene manipulation, form editing, simulation validation, and optimization call the same evaluator. Overrides retain warnings and provenance.

Transform round trips must remain within `1e-6 m` position/size and `1e-7` quaternion component tolerance. User output is normally no more precise than centimetres unless a higher-quality measurement supports it.

## Evidence, claims, and retention

Raw evidence and derived records are separate.

- Durable: project revisions, accepted evidence metadata/checksums, observations, claims, model versions, immutable run inputs, selected result summaries, experiments, and calibration decisions.
- User-controlled source: imported media and documents. Storage status is `SELECTED`, `VALIDATING`, `ON_DEVICE`, `MISSING`, `DELETION_PENDING`, `DELETED`, or `EXPORT_ONLY`.
- Rebuildable cache: thumbnails, decoded frames, flow fields, spatial render buffers, and unselected candidate details.

Imports preflight count, content signature, bytes, dimensions, duration, frame rate, codec support, and quota headroom, but the preflight is advisory. Bytes enter a project-scoped staged area in bounded chunks; a final transaction publishes the evidence record only after checksum and complete-size validation. Interrupted stages are resumable only when their source fingerprint and consent still match, otherwise they are garbage-collected. FlowLens never deduplicates sensitive source bytes across projects, avoiding cross-project hash/timing disclosure and deletion coupling.

The raw original, sanitized derivative, and derived observation have different IDs, checksums, retention states, and provenance links. The user chooses whether to retain the original metadata-bearing source, retain only the sanitized derivative, or process transiently and export no source. Removing EXIF/geolocation produces a new derivative; it never changes the original hash or masquerades as the original.

Source availability and checksum verification are first-class revisioned provenance state. The repository verifies source presence/checksum on project open, before a dependent run activates, after quota/storage errors, and through a bounded periodic integrity check. `ON_DEVICE` transitions to `MISSING` or `CORRUPT` in a new evidence-state revision when bytes disappear or fail validation. The invalidation graph updates reproducibility and active-result eligibility without erasing or rewriting the historical claim.

Deletion first writes a non-content tombstone and advances the lease fence, making all historic content unreadable through repositories and preventing project-ID resurrection on import. It rejects new jobs and writes, cancels work owned by the deleting tab, broadcasts a best-effort peer cancellation/close request, records acknowledgements from responsive tabs, revokes locally owned object URLs, removes undo/audit payloads, observations, runs, exports held inside app storage, durable/source/cache records, and verifies persistent origin-storage absence before reducing the tombstone to a minimal deletion receipt. A browser tab cannot erase bytes already loaded in another suspended tab's RAM, force that tab to close, or delete a `.flowlens` download outside browser-controlled storage; these limits are stated before deletion. On resume, a peer must check the durable fence/tombstone before any read, render, or write and clear its in-memory project. Raw media, notes, tokens, precise geometry, and identifying metadata never enter logs.

## Claim resolution and invalidation

Claims are append-only records. A deterministic resolution policy selects an active claim by explicit user choice first, then non-superseded compatible measured values, then user-entered, observed, inferred, and assumed values according to a versioned policy; simulated, predicted, and recommended outputs never become observed inputs. Conflicting claims remain visible in storage, UI, comparison, and export.

Confidence is not averaged by default. Derivations list input claim IDs and apply a named conservative propagation method; absent method support produces unknown confidence/uncertainty. Supersession adds a link and reason rather than overwriting a record.

A versioned invalidation graph maps aggregate changes to derived artifacts. Geometry, opening, device, source, zone, evidence acceptance, claim-resolution, scenario, constraint, and calibration changes mark affected observations, models, simulations, candidates, recommendations, and experiment comparability as stale or incompatible. Content-addressed inputs allow reuse only when the complete immutable dependency graph matches.

## Persistence, migrations, and interchange

Domain repository interfaces expose versioned project aggregates and compare-and-swap operations; they do not expose Dexie. Persisted records are validated every time they cross into domain code.

Each migration is a versioned pure fixture-tested transform plus an IndexedDB schema transaction coordinated by a migration lease/fence. The upgrade transaction does not expose partially transformed stores and aborts back to the prior version on failure. Before a major or lossy migration, the UI requires a canonical prior-format export. If an upgrade cannot open, a minimal recovery path exports validated raw/prior records without running the new application model; the prior canonical `.flowlens` format remains importable through an explicit compatibility transform. Other tabs receive best-effort close requests and stay read-only until the migration receipt/fence is visible.

The portable `.flowlens` package is a restricted ZIP container whose root `manifest.json` names format/schema versions, canonical world/unit/policy versions, project ID, export instant, media/redaction mode, and sorted entries. Canonical domain records live at `records/<kind>/<id>.json`; source or sanitized media live at `evidence/<evidence-id>/<checksum>.<safe-extension>`. Each manifest entry hashes the exact uncompressed canonical bytes, names expanded/stored length and provenance role, and the manifest itself is canonicalized for the package hash. The format permits only stored/deflated regular files; rejects symlinks, nested archives, duplicate or Unicode-confusable normalized paths, absolute/traversal paths, excessive compression ratios, excessive entry count, total expanded bytes, JSON depth/keys/string length, identifier collisions, SVG active content, and unsupported media/mesh/document subformats. Import semantically validates the complete content graph in a project-scoped stage and publishes it all-or-nothing. Checksums detect integrity, not authorship; unsigned packages are labeled unauthenticated.

## Worker and run protocol

Every worker message is a Zod-validated discriminated union. Jobs include job ID, type, capability version, immutable content-addressed input snapshot, project/room/model/evidence revisions, claim-resolution/scenario/constraint/calibration versions, lease fence, single-use controller capability token, seed, deadline, resource budget, and creation time. Progress, result, cancellation, refusal, and failure use versioned schemas.

Workers never import a persistence adapter and cannot write durable records. They return validated output only to the main controller, which checks the unforgeable per-job token, operation scope, lease fence, current tombstone, deadline, and input identity before a staged durable transaction. Every selected file is content-sniffed and parsed/decoded only inside a disposable capability-scoped ingestion worker before data reaches a UI, scene, model, or long-lived worker. File-type-specific budgets cap bytes, archive expansion, pixels, frames, duration, rows/columns, JSON depth, mesh vertices/indices/materials/textures, document pages, time, and output. Cooperative cancellation is checked at bounded intervals. The controller terminates a non-cooperative worker after its grace period, releases reserved storage and buffers, removes partial stages, and records a privacy-safe reconciliation event. Queue length, input bytes, decoded pixels, frame count, iterations, candidates, and output bytes are capped. Transferred buffers have explicit ownership and are released after completion.

Results persist as detached immutable runs. They become active only if the complete content-addressed input graph and every expected revision/fence still match; otherwise they remain inspectable as stale results. Run identity captures canonical input hash, seed, stable ordering policy, claim/scenario/constraint/calibration policy versions, solver/model/adapter/PRNG versions, numeric tolerance profile, WASM threading/SIMD mode, and runtime family.

## Determinism and scientific output

All stochastic search uses a repository-owned versioned seeded PRNG. Collection iteration is explicitly sorted by normalized identifiers. Canonical text is Unicode NFC, timestamps are UTC ISO-8601 instants parsed without locale/time-zone defaults, negative zero normalizes to zero, and non-finite values reject. Hash input uses canonical serialization. Solver tolerances, step policy, rounding, WASM SIMD/threading mode, and supported runtime family are part of the backend contract. Tests use analytic tolerances and a recorded cross-browser envelope rather than claiming bit-for-bit floating-point identity.

Every model backend declares supported quantities, dimensions, source/outdoor boundary conventions, conservation conditions, non-negativity strategy, stiffness/non-convergence behavior, uncertainty support, refusal codes, capability/validation version, and model maturity. The initial backend implements the documented well-mixed zone equation, prevents negative concentrations within tolerance, surfaces impossible flows and disconnected volumes, and proves conservation on closed analytic fixtures. Model maturity and validation claims never transfer between backends.

A central versioned `ScientificAdmissibilityPolicy` evaluates the requested output type against source availability, accepted evidence, calibration, model/vision capability, maturity, validation scope, uncertainty support, scenario, and requested precision. It returns `ADMIT`, `REFUSE` with stable reasons, or `RESTRICT` with an allowlisted vocabulary/quantity/precision contract. Run activation, claim creation, optimizer objectives, recommendation formatting, exports, and future assistants must pass this policy; adapter self-declarations alone never authorize a material claim.

Optimization uses the shared feasibility evaluator, scenario-specific candidate generation, baseline comparison, Pareto dominance, sensitivity checks over supported uncertain parameters, fragile-gain rejection, and a precision policy.

The recommendation contract is not free text. Each action and expected-effect statement links to candidate/run metrics, input claims/evidence, assumptions, scenario-specific warnings, confidence/uncertainty method, feasibility report, precision cap, trade-offs, meaningfully different alternatives, and a practical verification protocol. A structured local formatter may render this contract; an assistant or UI cannot add unsupported material claims.

## Experiment and calibration boundary

An experiment is an immutable aggregate containing baseline room/model/content snapshot, intervention snapshot, prediction run, accepted follow-up observations, residual calculation, comparison policy, and a user-approved calibration decision. Calibration creates a new model version and never rewrites the model that produced the prediction. Rejected proposals remain auditable. Held-out experiment IDs and acceptance thresholds are fixed before fitting when enough evidence exists.

## Vision capability and refusal contract

Vision is a staged capability, not a boolean. Its manifest declares supported codecs, frame sizes, quality metrics, stabilization, segmentation, sparse/dense flow, calibration requirements, and algorithm versions.

Quality-only processing may report brightness, blur, contrast, motion contamination, duration, and actionable capture diagnostics. It must return `INSUFFICIENT_CAPABILITY` for tracer direction or relative motion. User-video observations cannot be accepted until the stabilization, segmentation, flow, consistency, outlier, and fixture gates are enabled.

Fixture readiness and individual evidence quality are separate gates. Every clip retains versioned per-stage metrics/refusal reasons, raw-versus-stabilized diagnostics, user-selected plane/region/masks, and an acceptance decision. No observation affects the active model until the user accepts it against the exact processed preview and warnings.

Optical flow is apparent 2D image motion. Absolute velocity requires a calibrated plane and spatial scale, camera pose, lens-distortion model or justified negligible-distortion claim, image orientation, trustworthy per-frame timestamps, depth/planarity assumptions, and a supported tracer-to-air coupling model with uncertainty. A missing prerequisite produces a refusal, never a guessed conversion.

## Accessibility and interaction

The WebGL scene and semantic workspace consume the same revisioned read model and issue the same commands. Every semantic entity has a stable DOM identity derived from its canonical ID. Selection, filtering, virtualization, concurrent revisions, deletion, and modal transitions follow a documented focus-restoration policy; a deleted target returns focus to the nearest surviving parent/action. Every entity is selectable through a table/tree; transforms, dimensions, labels, visibility, lock state, and typed properties are editable with forms. Critical vectors, zones, time series, comparisons, confidence, and recommendations have text/table equivalents.

Keyboard users can create a room, add/select/edit an entity, undo/redo, run a comparison, inspect evidence, choose an intervention, and record verification without precision pointer input. Worker progress, save/conflict state, errors, and completion use appropriately throttled live regions. Focus, reduced motion, forced colors, 400% zoom/reflow, touch targets, and narrow-screen guided editing follow WCAG 2.2 AA acceptance checks.

## Privacy and security boundary

“On this device” is described accurately as browser-profile/origin storage. FlowLens does not promise encryption against someone with device/profile access. The threat model includes XSS reading local data, hostile media, archive traversal/decompression bombs, parser exhaustion, prompt injection in evidence, stale worker output, third-party network leakage, and shared-device exposure.

Evidence paths use locally bundled code and system fonts. Production enforces an explicit egress allowlist: same-origin static assets only, no analytics/telemetry/error-reporting endpoint, no external font/CDN/WASM fallback, no production source-map publication, and `connect-src 'none'` for the serverless core. FlowLens ships no service worker until a separate cache/deletion ADR exists. Browser network tests block and fail on any unexpected request, while CSP/Trusted Types compatibility, secure headers, dependency auditing, secret scanning, output encoding, file limits, content sniffing, parser isolation, and safe error redaction remain release gates. Selecting a file never uploads it.

## Testing strategy

- Unit and property tests cover schemas, units, geometry, revisions, canonical serialization, constraints, model invariants, solvers, optimization, and explanation precision.
- Integration tests cover command idempotency/inverses through persistence, lease fencing/conflicts, staged writes/cleanup, migrations/recovery, ingestion-to-claim, invalidation, worker cancellation/staleness, modeling-to-run, export/import, and deletion.
- Synthetic vision fixtures cover stationary scenes, known 2D motion, camera shake, weak tracer, lighting failure, occlusion, and background motion.
- Analytic one- and two-zone fixtures cover conservation, decay, exchange, non-negativity, and deterministic identity.
- Playwright covers create/edit/save/reopen/export, lease takeover, manual capture fallback, evidence refusal and acceptance, scenario comparison, recommendation, verification, keyboard/focus/live-status alternatives, responsive layouts, production egress, offline/recovery, and accessibility automation.
- Focused manual browser checks cover real WebGL interaction, keyboard order, reduced motion, forced colors, console, network, worker failures, storage denial, and desktop/mobile layout.

Coverage is evidence, not the definition of correctness. Domain/scientific branches receive high thresholds; generated adapters and browser-only glue are justified separately in the verification report.

## Boundaries

Always:

- Write a failing test or adversarial fixture before each behavior change.
- Validate untrusted data at every adapter boundary.
- Preserve provenance, model identity, units, revisions, and evidence links.
- Run proportionate checks before every focused commit and push verified increments.
- Keep manual/local/synthetic fallbacks usable.

Require explicit user authorization:

- Deploying to Vercel or any host.
- Enabling cloud storage, accounts, sharing, analytics, or third-party uploads.
- Adding an OpenAI or other hosted model integration.
- Processing private media through an external service.

Never:

- Commit secrets, private room media, raw user fixtures, or build output.
- Claim exact CFD, 3D particle paths, infection probability, diagnosis, or prevention.
- Convert image motion to physical velocity without complete calibration.
- Treat a quality-only or synthetic vision implementation as real tracer analysis.
- Silently repair invalid scientific input or overwrite conflicting claims.

## Success criteria

The 17 acceptance criteria and Definition of Done in `FLOWLENS_MASTER_PROMPT.md` remain authoritative. `docs/requirements/traceability.md` maps each criterion to current evidence. A criterion is `Proven` only after its implementation, automated checks, and required browser/manual evidence are current.

No unresolved design question blocks the local core. Optional deployment, hosted collaboration, native capture, external CFD, and hosted AI remain explicit extension decisions rather than hidden prerequisites.
