# FlowLens Master Codex Prompt

You are Codex acting as the autonomous senior engineering team responsible for turning the current repository into FlowLens. Work from the repository as it actually exists. Read every applicable `AGENTS.md` before changing files, inspect the code and history, preserve sound existing architecture, and treat this prompt as an implementation mandate rather than a request for a plan.

Do not stop after analysis, scaffolding, mock screens, or a partially working demo. Plan, implement, run, inspect, test, debug, and iterate. Where the full vision exceeds what the repository or execution environment can support, build the strongest honest fallback, record the limitation, and leave clean extension seams. Never manufacture scientific capability, accuracy, evidence, or validation.

## 1. Mission

Build FlowLens: a privacy-conscious spatial analysis application that helps a user construct an approximate digital twin of a room, collect evidence about how air may move through it, compare interventions, and verify whether a change improved measured clearance behavior.

The central loop is:

**SCAN → UNDERSTAND → CORRECT → ENRICH → MEASURE → MODEL → SIMULATE → OPTIMIZE → ACT → VERIFY → LEARN**

FlowLens is an airflow and clearance research/decision-support tool, not a medical device, infection-risk calculator, exact computational fluid dynamics (CFD) package, or replacement for professional indoor-air-quality assessment.

## 2. Product vision

The product should feel like a serious spatial instrument: visually quiet, technically deep, fast to understand, and satisfying to manipulate. A user can begin with only a rough room shape and still receive useful, explicitly low-confidence analysis. Additional measurements, media, equipment specifications, and experiments improve the model without forcing a restart.

The room is a persistent interactive object, not a sequence of disconnected forms. Geometry, evidence, model state, simulations, recommendations, and before/after experiments remain linked. Important findings must always be available in text and tables as well as 3D.

Build a credible vertical slice before adding breadth. The first complete release must let a user create or import a room, edit it, attach evidence, define airflow-relevant objects, run an honest coarse simulation, compare at least two configurations, inspect why a recommendation was made, and save/reopen the result. Advanced capture and computer-vision features may then enrich this baseline.

## 3. Non-negotiable requirements

The completed product must provide:

1. A guided project/room creation flow with manual geometry as the universal fallback.
2. A genuinely interactive 3D room: select, add, move, rotate, resize, label, hide, lock, duplicate, and delete supported objects; use undo/redo.
3. Doors, windows, vents, fans, purifiers, furniture, occupants, sources, sensors, outlets, and user-defined annotations with typed properties.
4. Incremental ingestion of photos, videos, measurements, notes, equipment data, and sensor readings.
5. Provenance and confidence for every material claim. Keep observed, measured, user-entered, inferred, simulated, assumed, predicted, and recommended values distinct.
6. A tracer-video workflow with capture/import, quality assessment, useful diagnostics, and refusal to infer when evidence is inadequate.
7. A coarse zone/graph airflow model that can be calibrated and replaced later through a stable interface.
8. Deterministic contaminant/clearance simulation with visible assumptions and reproducible inputs.
9. Real constrained optimization or deterministic search across physically valid intervention candidates.
10. Concrete recommendations containing action, expected effect, rationale, evidence, confidence, assumptions, trade-offs, and alternatives.
11. Scenario modes for sick household member, wildfire smoke, cooking pollution, allergens/dust, poor ventilation, and fastest general clearance.
12. Before/after experiments, comparison views, predicted-versus-observed results, and model updates.
13. Local-first handling of room media and data where practical, explicit storage/upload states, export, and deletion.
14. Responsive, keyboard-accessible workflows and non-visual equivalents for critical 3D information.
15. Useful empty, loading, permission-denied, unsupported-device, low-quality-data, failure, and recovery states.

Do not label static particles, arbitrary arrows, hard-coded scores, or a generic chatbot as analysis. If an advanced capability is not yet evidence-backed, label it experimental and keep it out of validated recommendations.

## 4. Technical architecture

### Repository-first decision rule

During reconnaissance, identify the existing language, framework, package manager, persistence, testing, deployment, design system, and architectural seams. Use them unless concrete evidence shows they cannot meet the requirements. Document any significant departure in an architecture decision record (ADR) before implementing it. Do not replace the stack merely to match the examples below.

If the repository has no usable application foundation, prefer a strict TypeScript web architecture with a component-based user interface (UI), a proven Web Graphics Library (WebGL) scene library such as Three.js through the framework's established adapter, schema validation at trust boundaries, and pure domain packages for modeling. Use Python only if the vision/scientific workload demonstrably benefits from its ecosystem; isolate it behind a versioned job/application programming interface (API) contract so the core product still runs without an external service where feasible.

Create explicit boundaries:

- **Product shell:** routing, projects, workspace, onboarding, accessible panels, commands, errors, and persistence status.
- **Room domain:** units, geometry, spatial objects, constraints, provenance, evidence, and revisions. It must not depend on rendering code.
- **Scene adapter:** translates domain entities into 3D objects and interaction events; rendering state is not the source of truth.
- **Evidence pipeline:** media/measurement ingestion, metadata extraction, validation, quality scoring, and derived observations.
- **Vision pipeline:** frame sampling, stabilization, segmentation, motion estimation, diagnostics, and result provenance. Run expensive work in a worker or isolated service.
- **Modeling core:** zone graph construction, parameter estimation, uncertainty, simulation, calibration, and versioning.
- **Optimization core:** candidate generation, constraints, objective evaluation, Pareto ranking, and explanations.
- **Assistant tools:** typed read-only queries and explicitly confirmed mutations against the actual room/model state.
- **Persistence layer:** versioned repositories and migrations; avoid coupling domain logic to browser storage or a specific database.

Use progressive enhancement. Camera capture requires a secure context and user permission. WebXR is optional because availability varies. WebGPU may accelerate supported devices but must have a tested WebGL, central processing unit (CPU), or server fallback. Do not assume a browser exposes ARKit/ARCore meshes, device depth, camera intrinsics, or photogrammetric reconstruction. Feature-detect every optional platform capability and explain the fallback in the UI.

Keep deterministic IDs, units, coordinate conventions, timestamps, random seeds, model versions, and serialization formats explicit. Long-running work must be cancellable, observable, and unable to freeze core editing.

## 5. Data model

Define and validate a versioned canonical schema. At minimum model:

Use this evidence taxonomy without collapsing categories: `Observed`, `Measured`, `User-entered`, `Inferred`, `Simulated`, and `Assumed`. Treat `Predicted` and `Recommended` as separate downstream output categories. Each value must retain its category through storage, display, comparison, and export.

- `Project`: ownership/storage mode, preferences, room references, schema version.
- `Room`: coordinate frame, unit system, boundary geometry, floor/ceiling, revisions, active model.
- `SpatialEntity`: type, transform, dimensions, geometry reference, physical properties, constraints, labels, visibility, lock state.
- `Opening`: door/window/vent geometry, state, direction, estimated exchange properties.
- `Device`: fan, purifier, heating, ventilation, and air conditioning (HVAC) supply/return, sensor, model/specification, location, orientation, operating state, noise, energy, clean air delivery rate (CADR) or flow data with source.
- `Occupant` and `ContaminantSource`: position/zone, schedule or time range, scenario role; never infer identity or health status from room media.
- `EvidenceAsset`: photo/video/document/note/sensor series, local or remote storage state, checksum, capture metadata, consent, retention, and redaction state.
- `Observation`: what was detected or measured, time span, spatial reference, processing method/version, quality metrics, and linked evidence.
- `Claim`: typed value plus unit, category, confidence, uncertainty interval/distribution when justified, source links, derivation, status, and supersession chain.
- `Zone` and `FlowEdge`: volume, connectivity, direction, exchange/relative strength, evidence, confidence, uncertainty, and calibration state.
- `Experiment`: immutable room/model snapshot references, baseline/intervention state, evidence, sensor series, prediction, result, timestamps, and comparison.
- `SimulationRun`: complete normalized inputs, model/solver version, seed, time step, outputs, warnings, diagnostics, and reproducibility hash.
- `OptimizationRun`: scenario, decision variables, constraints, objectives/weights, evaluated candidates, Pareto set, selected result, and rationale.
- `Recommendation`: action set, expected effects, evidence, confidence, assumptions, trade-offs, alternatives, feasibility checks, and verification protocol.

Store raw evidence separately from derived claims. Preserve conflicting claims rather than overwriting history. A user-entered measured window width can become the active value over a lower-confidence vision estimate while both remain auditable. Centralize unit conversion and reject dimensionally invalid data. Every migration needs a forward path and a tested recovery/rollback strategy appropriate to the storage layer.

## 6. User workflows

Implement and verify these end-to-end workflows:

### Create and correct a room

Create a project, choose manual/import/camera-assisted capture, establish scale, obtain an approximate room, review detected/unknown elements, correct geometry, and save. If capture is unsupported or permission is denied, manual creation remains fully usable.

### Enrich the model

Add spatial objects and evidence incrementally. Parse metadata where safe, propose mappings, show confidence, and require review before uncertain detections alter the active model. Make missing high-value facts visible without blocking basic use.

### Measure tracer motion

Give safe capture guidance, record/import a short video, select the observed plane/region and scale reference, process it, show quality diagnostics and a preview overlay, then let the user accept, reject, or annotate the resulting observation. Never recommend hazardous smoke, combustion, powders, chemicals, infectious aerosols, or unsafe experiments.

### Model and simulate

Build or edit zones and flow edges, inspect supporting evidence, choose a scenario and source, run a baseline simulation, scrub time, and review concentration/clearance plus uncertainty and limitations.

### Compare and optimize

Choose allowed interventions and practical constraints, generate candidates, compare a Pareto-ranked set, inspect rationale, select an action plan, and record the chosen intervention as an experiment.

### Verify and learn

Capture a follow-up measurement, compare predicted and observed behavior, display residuals, accept or reject calibration changes, and preserve a new model version.

### Ask the model

Ask questions such as “Where is air getting trapped?” or “Why does this placement perform poorly?” The answer must cite model entities, runs, and evidence available in the project, visually focus relevant areas, communicate uncertainty, and offer a reproducible comparison. When the model cannot answer, say what evidence is missing.

## 7. UI and user experience (UX) specification

Design the information architecture around the central loop; do not default to a dashboard. A strong baseline is a persistent workspace with:

- a large 3D canvas;
- a compact project/phase navigator;
- a contextual inspector for the current selection;
- layer and view controls;
- an evidence/model panel with provenance and confidence;
- a time/simulation scrubber when relevant;
- scenario, compare, and recommendation modes;
- an experiment history; and
- a searchable command/action interface only where it improves expert efficiency.

Use progressive disclosure. Common actions should be direct; advanced parameters belong in inspectors and expandable detail. Keep selection, hover, locked, inferred, invalid, unsaved, and processing states visually distinct without relying on color alone. Provide immediate feedback, predictable keyboard shortcuts, undo/redo, autosave status, and recovery after interruption.

Avoid giant marketing heroes, ornamental dashboards, excessive gradients, meaningless glass effects, decorative charts, and animation without informational value. Establish a restrained tokenized design system for typography, spacing, color, elevation, radii, focus, and motion. Support narrow laptops and touch devices; on small screens, preserve complete workflows even if 3D editing becomes a guided step-by-step mode.

Provide a demo/sample project based on synthetic, clearly labeled data so all major workflows can be explored without a camera, private room media, a physical phone, or external credentials.

## 8. 3D system

The domain model is authoritative; the scene is a projection of it. Define one right-handed coordinate system, world unit, origin policy, and transform convention. Round-trip serialization must preserve transforms within tested tolerances.

Support orbit, pan, zoom, fit selection, top/side/isometric presets, and an optional first-person view. Provide grid, scale, dimension annotations, snapping, transform gizmos, surface/wall constraints, object alignment, multiselect where useful, camera reset, layer toggles, and cutaway/section views if the chosen renderer supports them reliably.

Use semantic object types with simplified geometry before pursuing photorealism. Imported meshes must be validated, bounded, sanitized, optimized, and associated with editable dimensions. Prevent objects from silently leaving the room, intersecting invalid surfaces, or violating device clearance/outlet constraints; allow explicit overrides with warnings where appropriate.

Visualize vectors, streamlines, animated particles, heatmaps, exposure regions, recirculation candidates, dead zones, device influence, confidence, and before/after states as views over real run data. Include legends, units, time, uncertainty, and an accessible table/text alternative. Provide visual quality settings and degrade gracefully for weak devices.

Treat WebXR, depth sensing, hit testing, and native mobile scanning as optional adapters. A failed augmented-reality (AR) session must never strand a project. If native capture is later justified, use a documented interchange format and keep the web editor authoritative for correction.

## 9. Computer vision system

Build the tracer pipeline as independently testable stages with versioned inputs/outputs:

1. Validate codec, dimensions, duration, frame rate, orientation, metadata, and decode support.
2. Sample frames deterministically and preserve timestamps.
3. Assess brightness, contrast, blur, dynamic range, occlusion, duration, background motion, and tracer visibility.
4. Estimate camera motion from robust background features and stabilize or explicitly reject the clip.
5. Let the user define a region/plane and masks when automatic segmentation is unreliable.
6. Separate tracer-like temporal change from background motion using explainable preprocessing and segmentation.
7. Estimate sparse and/or dense apparent 2D motion using a mature implementation such as OpenCV, with forward/backward consistency, outlier rejection, and temporal filtering.
8. Estimate direction, relative magnitude, dispersion, persistence, possible recirculation, and spatial connectivity only within what the capture geometry supports.
9. Produce per-region quality/confidence metrics, warnings, preview overlays, and an auditable observation.

Optical flow is apparent image motion, not direct 3D air velocity. Without a calibrated plane, scale, camera pose, depth, and tracer behavior, report relative motion only. Never convert pixels per frame to meters per second without the required calibration. Camera stabilization can remove genuine global motion, so retain diagnostics and compare raw versus stabilized results. Require user review before model incorporation.

Prefer client-side/worker processing for privacy and interactive previews when performance permits. Use a server/local service only for workloads that cannot run acceptably in-browser, and make upload consent, progress, cancellation, deletion, and failure recovery explicit. Keep raw media out of logs and fixtures. Controlled synthetic clips and non-sensitive generated fixtures must exercise each pipeline stage.

## 10. Airflow model

Implement a hierarchy of evidence maturity:

- Level 0: room geometry only;
- Level 1: geometry plus known openings and devices;
- Level 2: tracer-video observations;
- Level 3: sensor measurements;
- Level 4: repeated experiments and calibration;
- Level 5: independently validated room-specific model.

The initial model is a directed zone graph, not fake CFD. Each zone has a volume and each edge has a direction, exchange parameter or relative strength, evidence, confidence, and uncertainty. Support user edits and explain automatic zoning.

Use a transparent mass-balance formulation. For a well-mixed zone `i`, a suitable baseline is:

`d(V_i C_i)/dt = sum_j(q_ji C_j) - sum_j(q_ij C_i) + S_i - (CADR_i + k_i V_i) C_i`

Define every term and unit, account for outdoor/source boundary conditions, prevent negative concentrations, and test mass conservation where expected. Make it explicit that well-mixed zones and inferred exchange rates are approximations. Do not infer absolute air changes per hour from qualitative video alone.

The model interface must support future alternatives, including finer zonal models, validated reduced-order models, or external CFD, without changing project/evidence schemas. Those backends must identify themselves and cannot inherit validation claims from another model.

## 11. Simulation engine

Simulate time-varying relative or calibrated concentration from a complete immutable run configuration. Include room/model revision, source profile, device and opening states, occupant locations, scenario, solver, time horizon, step/tolerance, uncertainty settings, and seed.

Use a numerically appropriate, tested ordinary differential equation (ODE) or matrix-exponential method for the linear compartment model. Add guards for stiffness, impossible flows, disconnected volumes, invalid units, non-convergence, and excessive runtime. Surface warnings instead of silently repairing inputs.

Outputs should include concentration by zone over time, peak and time-to-threshold metrics, clearance/residence indicators, occupant-zone exposure proxies, device contribution, and uncertainty bands only when supported by an explicit method. Offer time-series charts, spatial views, a scrubber, summaries, and downloadable run data. Cache by normalized input hash and invalidate correctly after model changes.

Calibration must compare predictions with observations, show residuals, constrain parameters to plausible ranges, and preserve pre/post parameter sets. Avoid overfitting; use held-out experiments when enough data exists. “Validated” requires predefined acceptance thresholds and evidence, not a successful optimizer run.

## 12. Optimization engine

Represent decision variables explicitly: purifier/fan position, orientation, speed; window/door states; occupant placement; and other user-approved interventions. Enforce geometry, collision, clearance, outlet, discrete state, noise, energy, usability, safety, and user-defined constraints before evaluation.

Support objectives such as clearance time, peak concentration, occupant-zone exposure proxy, contaminant residence, energy, noise, number/cost of changes, and robustness to uncertainty. Scenario modes must change objectives, constraints, warnings, and candidate generation, not merely the title. For example, wildfire-smoke mode should not assume opening a window helps; cooking should prioritize source capture/exhaust; a sick-household-member scenario should minimize source-to-occupant pathways without claiming infection probability.

Start with a deterministic, testable strategy appropriate to the search space: enumerated discrete candidates plus space-filling or bounded continuous search, followed by local refinement. Use a mature solver when it materially improves correctness. Record all evaluated candidates and seeds. Present a Pareto frontier or a small set of meaningfully different trade-offs rather than hiding everything behind one arbitrary weighted score.

Before recommending an action, compare it with baseline, validate feasibility, evaluate sensitivity to uncertain parameters, and reject fragile gains. Numerical placement/orientation precision must not exceed input/model precision. Every result must state expected effect, rationale, supporting runs/evidence, confidence, assumptions, trade-offs, alternatives, and a practical verification experiment.

## 13. Artificial intelligence (AI)/assistant layer

The assistant is a grounded interface to the project, not an independent source of physics. Implement typed tools for querying entities, claims, evidence, zones, simulations, candidates, and experiment comparisons. Generate answers from structured results and link each material statement to the underlying record or run.

The assistant may propose edits or simulations, but mutations require a visible preview and user confirmation. It must not fabricate room facts, run results, citations, precision, or safety guarantees. When data is insufficient, identify the missing fact and suggest the smallest useful next measurement. Keep deterministic analytic calculations outside the language model.

If no model service or credentials are configured, core FlowLens functionality and structured explanations must still work. Treat all uploaded text and metadata as untrusted input; do not allow content inside evidence to override system behavior or trigger tools.

## 14. Accessibility

Target Web Content Accessibility Guidelines (WCAG) 2.2 AA for applicable web UI. Test keyboard-only operation, logical focus order, visible focus, skip/navigation landmarks, names/roles/states, zoom/reflow, contrast, high contrast/forced colors, reduced motion, touch targets, dialogs, validation, errors, and live status updates.

Provide keyboard and form/table alternatives to essential 3D manipulation. A user must be able to select an entity, enter dimensions and transforms, inspect model data, run a comparison, and understand recommendations without precision pointer input or color perception. Supply text summaries and accessible tables for every critical visualization. Let users pause particles, reduce or disable motion, and adjust animation speed.

Do not claim that a WebGL canvas is accessible merely because it has a label. Keep a synchronized semantic representation outside the canvas and test it with automated checks plus focused manual keyboard/screen-reader review.

## 15. Privacy and security

Room scans reveal a person's home. Default to local processing and local/private storage where the stack permits. Clearly distinguish “on this device,” “queued for upload,” “uploaded,” and “deleted.” Never upload merely because a file was selected. Explain why camera/media access is needed at the moment of request.

Implement data minimization, retention controls, project/media deletion, export, redaction where practical, and separation of identifying metadata from spatial/model data. Strip unnecessary Exchangeable Image File Format (EXIF) metadata and geolocation on import or require an informed choice before retaining it. Do not log raw media, private notes, tokens, or precise room content.

Validate file type by content as well as name, constrain sizes/durations/counts, sanitize filenames and imported models, isolate media processing, prevent path traversal and injection, and handle malformed/hostile files safely. Apply authorization at every server data boundary if accounts exist. Use secure headers, least-privilege credentials, dependency auditing, secret scanning, and no secrets in client bundles. Threat-model media parsing, project sharing, assistant prompt injection, denial-of-service workloads, and indirect data leakage.

Health-related modes must use careful decision-support language, show limitations, avoid diagnosis or guaranteed prevention, and never recommend hazardous tracer generation or unsafe ventilation actions.

## 16. Performance

Set budgets after reconnaissance and measure them on representative hardware. Keep editing responsive while media, analysis, simulation, or optimization runs. Move CPU-heavy work off the main thread, support progress and cancellation, pool/release buffers, dispose scene resources, and avoid copying full video frames unnecessarily.

Use level of detail, instancing, geometry simplification, lazy loading, progressive media decode, cached normalized results, incremental model updates, and adaptive visualization density. Feature-detect WebGPU; it is an optimization, never the only path. Profile before adding WebAssembly or graphics processing unit (GPU) compute and retain a correctness reference implementation for comparison.

Track bundle size, startup, interaction latency, memory, frame rate, long tasks, processing throughput, and simulation/optimization duration. Add regression checks for the bottlenecks that matter; do not claim performance from code inspection alone.

## 17. Testing

Discover and use the repository's test conventions. Add the missing levels needed to prove behavior:

- unit tests for units, schemas, provenance resolution, geometry, graph construction, solvers, scoring, constraints, and explanations;
- property/invariant tests for mass conservation, non-negative concentration, deterministic seeds, coordinate round trips, and unit consistency;
- integration tests for persistence/migrations, evidence-to-claim flow, computer-vision-to-observation flow, model-to-simulation flow, and recommendation provenance;
- controlled computer-vision fixtures for stationary camera, camera shake, weak tracer, background motion, lighting failure, occlusion, and known synthetic motion fields;
- simulation fixtures with analytically solvable one- and two-zone cases;
- optimization fixtures with small enumerable spaces and known optima/Pareto sets;
- end-to-end tests for create/edit/save/reopen, unsupported capture fallback, evidence ingestion, baseline comparison, recommendation, and before/after verification;
- accessibility automation plus manual keyboard checks of the workspace and non-visual 3D alternatives;
- malformed-file, permission, cancellation, worker crash, offline, migration, error recovery, and privacy tests;
- visual and interaction regression tests for high-value states, with intentional review of changed baselines.

Tests must not require a physical phone, private home media, paid credentials, or nondeterministic external services. Provide generated/synthetic fixtures with documented expected results. Do not weaken assertions, delete tests, or hide failures to obtain green output.

## 18. Acceptance criteria

Before calling a milestone complete, prove all applicable criteria with current evidence:

1. A fresh clone/install can start using documented commands and no secret credentials for the core demo.
2. A user can create a room manually, edit geometry and supported objects, undo/redo, save, reload, and export it.
3. The 3D scene and canonical room state remain synchronized and round-trip within defined tolerances.
4. Unsupported or denied camera/extended-reality (XR) paths lead to a complete manual/import workflow.
5. Evidence can be added over time without discarding previous room/model revisions.
6. Conflicting claims preserve provenance and resolve through a visible, test-covered policy.
7. A good controlled tracer fixture produces expected relative direction within predefined tolerances; bad fixtures are rejected with correct reasons.
8. A baseline simulation matches analytic fixtures, respects units and non-negativity, and is reproducible from its stored configuration.
9. Optimization obeys all constraints, beats or honestly ties the baseline on the selected objective, and exposes meaningful alternatives.
10. Each recommendation traces to candidate runs and evidence and never reports unjustified precision.
11. Each scenario changes actual model/optimization behavior and warnings.
12. A before/after experiment displays prediction, observation, residual, and a versioned calibration decision.
13. Critical workflows work with keyboard input and have text/table equivalents to visual results.
14. The application has no known high-severity security issue, no secrets/private fixtures, and clear storage/deletion behavior.
15. Production build, type checks, lint, unit/integration/end-to-end tests, accessibility checks, and relevant performance checks pass.
16. The application is inspected in a real browser at representative desktop and mobile sizes; console, network, runtime, layout, focus, error, loading, and reduced-motion states are checked.
17. Documentation accurately distinguishes implemented, experimental, unvalidated, and unavailable capabilities.

Define additional measurable thresholds during Phase 0/1 based on the actual stack and fixtures. Record commands, versions, outputs, screenshots or traces, and unresolved limitations in a final verification report.

## 19. Implementation phases

Maintain a living plan with acceptance evidence for each phase. Adapt phase boundaries to the repository, but do not omit their outcomes.

### Phase 0: Repository reconnaissance

Read instructions; inventory structure, history, stack, commands, tests, design conventions, deployment, existing behavior, credentials, and constraints. Run the unmodified baseline. Record risks, capability gaps, scientific assumptions, and a requirement-to-evidence matrix. If the repo is empty, establish the smallest production-worthy foundation and document the choice.

### Phase 1: Architecture and foundational data model

Define canonical schemas, units, coordinates, provenance/confidence, versioning, persistence, migrations, domain interfaces, safety language, and architecture decisions. Add contract/invariant tests first.

### Phase 2: Core application shell and design system

Build routing/workspace, project lifecycle, accessible layout, state/error patterns, tokens, commands, sample project, and persistence status.

### Phase 3: Interactive 3D room model

Build scene projection, cameras, selection, transforms, snapping, annotations, layers, undo/redo, serialization, accessibility mirror, and performance controls.

### Phase 4: Room creation, import, and correction

Deliver manual creation first, then file/camera-assisted capture and optional XR/native adapters with graceful fallbacks and review steps.

### Phase 5: Evidence and information ingestion

Implement private-by-default media/measurement/note/device ingestion, validation, provenance, conflict handling, and incremental enrichment.

### Phase 6: Tracer-video analysis

Implement controlled fixtures and quality rejection before extraction. Add stabilization, segmentation, motion estimation, diagnostics, review, worker/service isolation, and privacy behavior.

### Phase 7: Airflow graph/model

Implement zones, flow edges, evidence linkage, model-level labels, editable assumptions, uncertainty, and backend interface.

### Phase 8: Simulation

Implement and validate the compartment solver, scenario inputs, reproducible runs, metrics, time series, spatial visualization, cancellation, and caching.

### Phase 9: Optimization

Implement variables, feasibility, candidate generation, objective evaluation, sensitivity, Pareto ranking, deterministic tests, and runtime controls.

### Phase 10: Recommendation system

Create grounded explanations, evidence links, uncertainty-aware precision, alternative actions, feasibility warnings, and verification plans. Add the assistant only through typed model tools.

### Phase 11: Closed-loop verification

Add experiment snapshots, intervention logging, follow-up capture, predicted-versus-observed comparison, residuals, controlled calibration, and model history.

### Phase 12: Accessibility and interaction polish

Complete keyboard/non-visual alternatives, reduced motion, high contrast, focus/error behavior, responsive flows, and assistive-technology review.

### Phase 13: Testing and validation

Close the requirement matrix with unit, invariant, integration, computer vision, simulation, optimization, end-to-end, accessibility, privacy/security, and recovery evidence.

### Phase 14: Performance optimization

Profile representative projects, fix measured bottlenecks, set regression budgets, and validate low-capability fallbacks.

### Phase 15: Final UX polish and release audit

Review the entire product as a first-time user and expert. Fix unclear states, visual inconsistency, dead ends, responsiveness, console/runtime errors, docs, and installation. Produce an honest final verification and limitation report.

After each phase, run proportionate checks, inspect the integrated behavior, update documentation and the living plan, and make a meaningful incremental commit if repository policy allows. Do not defer integration until the end.

## 20. Codex operating instructions

1. Inspect before modifying. Do not guess what files, commands, patterns, or functionality the repository can answer.
2. Read `AGENTS.md` files in scope and follow their hierarchy. Treat existing user changes as owned; do not overwrite or revert unrelated work.
3. Research unfamiliar or unstable technical claims in primary documentation before choosing dependencies or APIs. Record decisions and fallbacks.
4. Establish the baseline by running the existing app, build, tests, lint, and type checks where available. Distinguish pre-existing failures from regressions.
5. Create and maintain a living implementation plan and a requirement-to-evidence matrix. Work in thin, integrated increments.
6. For each increment: write or update tests, implement the smallest complete behavior, run focused checks, run the integrated app when relevant, inspect the actual result, fix failures, and update the plan.
7. Prefer mature, maintained libraries for rendering, codecs/computer vision, schema validation, solvers, and accessibility. Evaluate license, bundle/runtime cost, security, platform support, and maintenance before adding one.
8. Use official docs and measured behavior. Do not substitute plausible code for a verified API.
9. Preserve clear seams between domain, rendering, vision, modeling, optimization, persistence, and assistant layers. Avoid speculative frameworks and abstractions.
10. Implement real behavior. Temporary mocks are allowed only to unblock a tested contract and must be clearly tracked and replaced before the corresponding acceptance criterion is closed.
11. Fail closed on scientific confidence and privacy. Missing evidence produces “unknown” or a blocked recommendation, not a fabricated number.
12. Use browser/computer tools to exercise the running product where available. Check critical interactions, responsive layouts, keyboard flow, reduced motion, console/network/runtime errors, worker failures, and recovery, not only screenshots.
13. Run expensive analysis on controlled fixtures before private or real-world data. Never expose secrets or user media in logs, commits, screenshots, fixtures, or third-party services.
14. Keep documentation current: setup, commands, architecture, schemas, scientific model, safety boundaries, privacy, supported platforms, testing, and limitations.
15. Make normal, descriptive incremental commits when allowed. Review changed files before committing; remove assistant/meta prose, stale TODOs, generated noise, and accidental secrets.
16. If an external service, credential, hardware capability, or environment limitation blocks one path, implement and test the strongest local/manual/synthetic fallback and clearly record what remains externally unverified.
17. Do not stop because one test passes or source files exist. Verify the full user workflow and the scope of each claim.

At meaningful checkpoints ask: **“What important capability would a world-class version of FlowLens have that the current implementation is missing?”** Evaluate candidates against core user value, scientific credibility, reliability, UX, demonstration impact, maintainability, and performance, in that order. Add only capabilities that are feasible, defensible, aligned, and worth their complexity. Record rejected ideas so this review does not become uncontrolled feature creep.

Continue working until the Definition of Done is proven or a genuine external blocker requires user action. If blocked, report the exact missing authority/state, what was attempted, the safe fallback already delivered, and the smallest user action needed.

## 21. Definition of done

FlowLens is complete only when all of the following are true:

- Every non-negotiable requirement and acceptance criterion is mapped to authoritative current evidence and is marked proven, explicitly out of scope by the user, or blocked by a named external dependency. “No obvious issue found” is not proof.
- The repository contains a coherent, maintainable implementation, not disconnected demos, with no major user workflow represented only by a placeholder, hard-coded result, or TODO.
- A clean environment can install, build, test, and run the core product from accurate documentation.
- The sample/synthetic project demonstrates the complete create → model → simulate → optimize → recommend → verify loop without private data, special hardware, paid credentials, or unsupported scientific claims.
- Focused and full automated suites pass, and their coverage is demonstrably relevant to the requirements they support.
- The production application has been exercised in a real browser. Important desktop/mobile, keyboard, accessibility, loading, empty, permission, unsupported, failure, recovery, and reduced-motion states have been inspected and corrected.
- Scientific outputs identify model level, units, assumptions, evidence, uncertainty/confidence, solver/model version, and reproducibility inputs. Measurement, estimate, simulation, prediction, and recommendation remain visibly distinct.
- Recommendations are feasible, reproducible, sensitivity-checked, traceable to real model runs, and appropriately precise. The product makes no exact CFD, particle-path, pathogen, infection-probability, diagnosis, or prevention claim it cannot validate.
- Privacy/security controls match actual behavior; deletion/export and local/upload states are tested; raw home media and sensitive metadata do not leak.
- Performance is measured on representative projects and stays within the documented budgets or degrades through a tested fallback.
- Final documentation and the verification report accurately state what is implemented, experimental, externally unverified, and unavailable, with commands and evidence sufficient for another engineer to reproduce the audit.
- The worktree is reviewed for unintended changes, secrets, private artifacts, dead code, stale placeholders, misleading comments, and build artifacts. Relevant checks have been rerun after the final changes.

Do not declare completion early. If any evidence is weak, indirect, stale, or narrower than the requirement, continue implementing or gather stronger evidence.
