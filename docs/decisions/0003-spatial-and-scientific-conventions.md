# ADR-0003: Fix spatial and scientific conventions before rendering

## Status

Accepted

## Date

2026-08-24

## Context

Geometry, imports, rendering, accessibility forms, zones, simulations, optimization constraints, and persistence all depend on the same coordinate, unit, precision, and reproducibility rules. Retrofitting those rules would invalidate saved projects, fixtures, and run hashes.

FlowLens must communicate approximate zonal behavior without implying exact CFD, measured 3D velocity, infection probability, diagnosis, or guaranteed prevention.

## Decision

Use a right-handed world frame with dimensionally branded SI values for length, area, volume, time, angle, volumetric flow, CADR, source strength, concentration basis, thresholds, exposure proxies, schedules, energy, noise, cost, and supported uncertainty distributions:

- `+X`: room east/right.
- `+Y`: up.
- `+Z`: room south/toward the default isometric camera.
- Origin: floor at the boundary’s minimum `X/Z` corner.
- Stored rotation: normalized quaternion.
- UI rotation: degrees in intrinsic `Y-X-Z` order.
- Transform order: scale, rotation, translation.

Boundary adapters convert user units. Branded numeric types and dimension-aware conversion functions prevent accidental mixing. Transform serialization tolerance is `1e-6 m` for position/dimensions and `1e-7` per quaternion component.

The initial airflow backend is an identified directed-zone mass-balance model. Every backend declares supported quantities/units, outdoor and source conventions, conservation conditions, non-negativity/stiffness/non-convergence behavior, refusal codes, uncertainty method, maturity, and validation version. It stores a full content-addressed input snapshot, visible assumptions, solver/PRNG/tolerance/runtime versions, canonical input hash, seed, and warnings.

Canonical text uses Unicode NFC and UTC ISO-8601 instants. Non-finite values reject and negative zero normalizes to zero. Stable sorting and a repository-owned versioned seeded PRNG define deterministic ordering. WASM SIMD/threading mode is fixed per backend identity. Cross-runtime numeric tests use analytic tolerances rather than promising bit identity.

Image optical flow remains apparent 2D motion. Direction/relative-motion output is unavailable until the required vision stages, fixture gates, per-clip diagnostics, and user review pass. Physical velocity additionally requires a calibrated plane/scale, camera pose, lens distortion handling, image orientation, trustworthy frame timestamps, depth/planarity assumptions, and a supported tracer-to-air coupling model with uncertainty.

## Alternatives considered

### Renderer-native coordinates and units

- Rejected: Three.js conventions are an implementation detail and cannot define import/export or scientific contracts.

### Store Euler rotations

- Rejected: multiple equivalent representations and rotation-order ambiguity make round trips fragile.

### Label a particle/vector field as airflow analysis

- Rejected: visualization without a real stored run and evidence chain violates the product’s scientific boundary.

### Infer air changes per hour from qualitative video

- Rejected: 2D image motion lacks the calibration and physical model required for absolute exchange.

## Consequences

- Imported geometry and measurements must name their source unit and conversion.
- Recommendation precision cannot exceed input/model precision.
- Every backend publishes capabilities and validation scope; a future backend cannot inherit another backend’s claims.
- Scientific fixtures become compatibility artifacts and must remain versioned.

## Sources

- https://threejs.org/docs/#manual/en/introduction/Matrix-transformations
- https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html
