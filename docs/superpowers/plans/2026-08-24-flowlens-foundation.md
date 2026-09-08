# FlowLens Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible application toolchain and the canonical, deterministic, local-first contracts on which every FlowLens workflow depends.

**Architecture:** Pure strict-TypeScript domain modules define state, units, revisions, constraints, determinism, and adapter contracts. React/Vite supplies the product runtime; Dexie, workers, and Three.js remain replaceable adapters outside the domain. Tests enter through public contracts and prove conflicts, stale results, migrations, and scientific invariants before UI breadth begins.

**Tech Stack:** Node 24, npm 11, React 19.2, Vite 8.2, TypeScript 6.0, Zod 4.4, Dexie 4.4, Zustand 5.0, Vitest 4.1, fast-check 4.9, fake-indexeddb 6.2, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-24-flowlens-design.md`

## Global constraints

- Internal length is metres, time is seconds, volume is cubic metres, and flow is cubic metres per second.
- World coordinates are right-handed with `+Y` up and stored rotations as normalized quaternions.
- The project aggregate is writable only through runtime-validated commands with expected revision IDs.
- Persisted records, imports, commands, worker messages, and adapter outputs are runtime trust boundaries.
- Core behavior has no server, account, external model, private fixture, runtime CDN, or credential dependency.
- Scientific output fails closed and never claims CFD, absolute velocity without calibration, infection probability, diagnosis, or prevention.
- Every task follows red-green-refactor, then focused verification, staged-diff inspection, secret/private-data scan, concise commit, and push.

## File map

```text
package.json                         canonical commands and exact dependencies
vite.config.ts                       React build and Vitest projects
eslint.config.js                     typed lint and React hook rules
src/app/                             runtime composition only
src/domain/                          browser-independent canonical contracts
src/persistence/                     repository interface and IndexedDB adapter
src/workers/                         versioned job schemas and controller
tests/fixtures/                      deterministic synthetic domain records
tests/integration/                   adapter and recovery behavior
```

---

### Task 1: Reproducible toolchain

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `.npmrc`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`

**Interfaces:**

- Produces: the canonical `dev`, `build`, `lint`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:e2e`, and `check` commands.
- Produces: a Vitest `unit` project using Node and a `ui` project using jsdom.

- [ ] **Step 1: Create the exact manifest**

Create `.npmrc` with `ignore-scripts=true` before the first install. This fail-closed policy prevents dependency lifecycle scripts from executing while leaving explicitly invoked project scripts available. Use `npm install --save-exact` for runtime packages and `npm install --save-dev --save-exact` for development packages. Set:

```json
{
  "name": "flowlens",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.15.0 <25" },
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build",
    "lint": "eslint . --max-warnings 0",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build"
  }
}
```

Install the compatibility-checked runtime graph exactly:

```powershell
npm install --save-exact react@19.2.8 react-dom@19.2.8 react-router@8.3.0 three@0.185.1 @react-three/fiber@9.7.0 @react-three/drei@10.7.8 zod@4.4.3 zustand@5.0.15 dexie@4.4.5 dexie-react-hooks@4.4.0
```

Install the development graph exactly:

```powershell
npm install --save-dev --save-exact vite@8.2.2 @vitejs/plugin-react@6.1.0 typescript@6.0.3 @types/node@24.13.3 @types/react@19.2.18 @types/react-dom@19.2.5 @types/three@0.185.4 eslint@10.9.1 @eslint/js@10.0.1 typescript-eslint@8.68.0 eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.4 prettier@3.9.6 vitest@4.1.11 @vitest/coverage-v8@4.1.11 jsdom@30.0.1 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.6 fast-check@4.9.0 fake-indexeddb@6.2.5 @playwright/test@1.62.1 @axe-core/playwright@4.13.0
```

- [ ] **Step 2: Configure strict compilation**

The compiler configuration must enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`, and `verbatimModuleSyntax`, with `moduleResolution: "Bundler"` and no emit.

- [ ] **Step 3: Configure lint and tests**

Use ESLint flat config with `@eslint/js`, `typescript-eslint`, React hooks, and React refresh. Include all domain source files in coverage and set initial domain thresholds to 90% statements/lines/functions and 85% branches; raise thresholds after the foundation is complete rather than excluding uncovered domain files.

- [ ] **Step 4: Verify dependency compatibility and lockfile**

Run:

```powershell
npm ci
npm audit signatures
npm audit --audit-level=high
npm run typecheck
npm run lint
```

Expected: install-time lifecycle scripts remain suppressed, registry signatures/provenance verify, no high-severity advisory is present, and commands execute with zero peer-dependency warnings attributable to the selected React, R3F, TypeScript, ESLint, and Node versions. Type checking may report missing application entry files until Task 2; configuration itself must parse.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add package.json package-lock.json .npmrc tsconfig.json vite.config.ts eslint.config.js
git diff --staged
git commit -m "chore: add application toolchain"
git push -u origin codex/flowlens-build
```

### Task 2: Minimal accessible application runtime

**Files:**

- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/app.tsx`
- Create: `src/app/app.test.tsx`
- Create: `src/styles.css`

**Interfaces:**

- Consumes: Task 1 Vite and Vitest configuration.
- Produces: `App(): JSX.Element` and a browser entry with a named `main` landmark.

- [ ] **Step 1: Write the failing application test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("identifies FlowLens as non-diagnostic decision support", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "FlowLens" })).toBeInTheDocument();
    expect(screen.getByText(/research and decision-support tool/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Prove the test is red**

Run `npm run test -- src/app/app.test.tsx`.

Expected: failure because `src/app/app.tsx` does not exist.

- [ ] **Step 3: Implement the smallest runtime**

`App` renders a skip link, named header, `main`, accurate non-diagnostic copy, and a local-storage posture. `main.tsx` uses `createRoot`, `StrictMode`, and a checked root element. CSS defines system fonts, visible focus, readable foreground/background tokens, and reduced-motion behavior without marketing decoration.

- [ ] **Step 4: Prove green and build**

Run:

```powershell
npm run test -- src/app/app.test.tsx
npm run typecheck
npm run build
```

Expected: all pass; `dist/` is ignored.

- [ ] **Step 5: Commit and push**

```powershell
git add index.html src/main.tsx src/app/app.tsx src/app/app.test.tsx src/styles.css
git commit -m "feat: add FlowLens application shell"
git push
```

### Task 3: Branded IDs, units, and spatial primitives

**Files:**

- Create: `src/domain/identity.ts`
- Create: `src/domain/units.ts`
- Create: `src/domain/spatial.ts`
- Create: `src/domain/units.test.ts`
- Create: `src/domain/spatial.test.ts`

**Interfaces:**

- Produces: `ProjectId`, `RoomId`, `EntityId`, `RevisionId`, `CommandId`, `ClaimId`, `EvidenceId`, `RunId`, `JobId`, `LeaseFence`.
- Produces: branded length, area, volume, time, angle, volumetric flow, CADR, source rate, concentration basis, threshold, exposure proxy, schedule, energy, noise, cost, and supported uncertainty values.
- Produces: `Vec3<T>`, `Quaternion`, `Transform`, `makeQuaternion`, `normalizeQuaternion`, `metres`, `feetToMetres`, `cubicMetres`.

- [ ] **Step 1: Write unit and transform failures**

Tests must assert:

```ts
expect(feetToMetres(10)).toBeCloseTo(3.048, 12);
expect(() => metres(Number.NaN)).toThrow("metres must be finite");
expect(() => cubicMetres(0)).toThrow("volume must be greater than zero");
expect(normalizeQuaternion(makeQuaternion(0, 0, 0, 2))).toEqual({ x: 0, y: 0, z: 0, w: 1 });
expect(() => normalizeQuaternion(makeQuaternion(0, 0, 0, 0))).toThrow("quaternion magnitude must be greater than zero");
```

Add a fast-check property that feet-to-metres-to-feet round trips finite values from `0.01` through `1000` within `1e-10` relative tolerance.

- [ ] **Step 2: Run red tests**

Run `npm run test -- src/domain/units.test.ts src/domain/spatial.test.ts`.

Expected: both fail because modules are absent.

- [ ] **Step 3: Implement validated constructors**

Constructors reject non-finite and dimensionally invalid values. Conversion returns both the canonical value and source-unit/precision provenance. IDs use non-empty branded strings from a deterministic caller-provided factory; domain code does not call `Math.random()` or current time. Export `WORLD_FRAME_VERSION = "flowlens-rh-y-up-v1"`.

- [ ] **Step 4: Verify**

Run the focused tests, `npm run typecheck`, and `npm run lint`.

Expected: pass with no unchecked numeric cast outside validated constructors.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/identity.ts src/domain/units.ts src/domain/spatial.ts src/domain/units.test.ts src/domain/spatial.test.ts
git commit -m "feat: add canonical spatial units"
git push
```

### Task 4: Canonical project and provenance schemas

**Files:**

- Create: `src/domain/project-schema.ts`
- Create: `src/domain/project-schema.test.ts`
- Create: `tests/fixtures/minimal-project.ts`
- Create: `src/domain/errors.ts`

**Interfaces:**

- Consumes: Task 3 branded IDs, units, and transforms.
- Produces: `ProjectSchema`, `RoomSchema`, `SpatialEntitySchema`, `ClaimSchema`, `EvidenceAssetSchema`, `parseProject`, and inferred readonly domain types.
- Produces: evidence category union with `OBSERVED`, `MEASURED`, `USER_ENTERED`, `INFERRED`, `SIMULATED`, `ASSUMED`, `PREDICTED`, `RECOMMENDED` kept distinct.

- [ ] **Step 1: Write boundary tests**

Create a valid minimal fixture and assert it parses. Mutate one field at a time and assert stable error codes for:

- unknown schema version;
- non-positive room height;
- zero quaternion;
- claim confidence below `0` or above `1`;
- `RECOMMENDED` claim without recommendation derivation;
- evidence marked `ON_DEVICE` without checksum and byte length, or `MISSING`/`CORRUPT` without a revisioned availability reason;
- an occupant record that includes inferred identity or health status;
- a non-finite transform value.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/domain/project-schema.test.ts`.

Expected: failure because the schema parser is absent.

- [ ] **Step 3: Implement discriminated, strict schemas**

Every object schema uses strict object handling. `parseProject(input: unknown)` returns:

```ts
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BoundaryValidationError };
```

Unknown fields and invalid dimensions fail; they are not silently stripped. Raw evidence is referenced by checksum, never embedded in the canonical project aggregate.

- [ ] **Step 4: Verify schemas and fixture privacy**

Run focused tests, typecheck, lint, and:

```powershell
rg -n -i "gps|latitude|longitude|patient|diagnosis|password|api[_-]?key|secret" tests src
```

Expected: only intentional rejection-test terms appear; no private values or credentials.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/project-schema.ts src/domain/project-schema.test.ts src/domain/errors.ts tests/fixtures/minimal-project.ts
git commit -m "feat: define project provenance schema"
git push
```

### Task 5: Revisioned domain commands and history

**Files:**

- Create: `src/domain/commands.ts`
- Create: `src/domain/project-aggregate.ts`
- Create: `src/domain/history.ts`
- Create: `src/domain/project-aggregate.test.ts`
- Create: `src/domain/history.test.ts`

**Interfaces:**

- Consumes: Task 4 canonical project types.
- Produces: strict `ProjectCommandSchema`, `dispatchProjectCommand(project, command, context)`, `CommandResult`, `HistoryState`, `undo`, and `redo`.

- [ ] **Step 1: Write conflict and mutation tests**

Assert that:

```ts
const result = dispatchProjectCommand(project, moveEntityCommand, context);
expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.project.revisionId).not.toBe(project.revisionId);
  expect(project.rooms[0]?.entities[0]?.transform.position).toEqual(originalPosition);
}
```

Also assert locked entities reject movement, a stale `expectedRoomRevision` returns `REVISION_CONFLICT` without mutation, an old lease fence returns `LEASE_FENCED`, the same idempotency key returns its original result, duplicate creates a new deterministic ID, delete preserves an auditable command record, and generated inverse-command undo/redo reproduces exact canonical state.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/domain/project-aggregate.test.ts src/domain/history.test.ts`.

Expected: missing command/aggregate modules.

- [ ] **Step 3: Implement immutable command handling**

Support foundation commands `CREATE_ROOM`, `RENAME_PROJECT`, `ADD_ENTITY`, `MOVE_ENTITY`, `RESIZE_ENTITY`, `ROTATE_ENTITY`, `SET_ENTITY_VISIBILITY`, `SET_ENTITY_LOCK`, `DUPLICATE_ENTITY`, and `DELETE_ENTITY`. The caller supplies deterministic command/entity/revision IDs, idempotency key, UTC timestamp, causal parent, next revision, and lease fence. Each successful command stores a validated inverse command. A remote edit/import/migration/tombstone/fence change marks incompatible history non-applicable. Exhaustive switches end in an `assertNever` helper.

- [ ] **Step 4: Verify mutation and determinism properties**

Use `Object.freeze` on fixtures in tests and fast-check command sequences up to 50 operations. The same input project/context/command sequence must produce the same project and history.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/commands.ts src/domain/project-aggregate.ts src/domain/history.ts src/domain/project-aggregate.test.ts src/domain/history.test.ts
git commit -m "feat: add revisioned room commands"
git push
```

### Task 6: Shared geometry constraints

**Files:**

- Create: `src/domain/geometry.ts`
- Create: `src/domain/constraints.ts`
- Create: `src/domain/constraints.test.ts`
- Create: `src/domain/geometry.test.ts`

**Interfaces:**

- Consumes: Task 3 spatial primitives and Task 4 entities/rooms.
- Produces: `AxisAlignedBounds`, `boundsForEntity`, `ConstraintEvaluator.evaluate(room, proposedEntity, context)`, `ConstraintReport`, and stable constraint codes.

- [ ] **Step 1: Write invariant tests**

Cover room-boundary exit, negative/zero dimensions, collision, wall-bound opening, locked entity, device clearance, outlet reach, allowed explicit override, and tangent non-collision. Add transform round-trip properties with the spec tolerances.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/domain/constraints.test.ts src/domain/geometry.test.ts`.

- [ ] **Step 3: Implement one deterministic evaluator**

Return all violations in stable code/entity order:

```ts
export interface ConstraintReport {
  readonly isFeasible: boolean;
  readonly violations: readonly ConstraintViolation[];
  readonly warnings: readonly ConstraintWarning[];
}
```

Overrides may convert only explicitly overridable violations into warnings and must include a user-entered reason. Safety-critical invalid dimensions, non-finite values, and locked mutations are never overridable.

- [ ] **Step 4: Verify**

Run focused tests, typecheck, lint, and mutation-free fast-check sequences.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/geometry.ts src/domain/constraints.ts src/domain/constraints.test.ts src/domain/geometry.test.ts
git commit -m "feat: enforce shared room constraints"
git push
```

### Task 7: Canonical serialization and run identity

**Files:**

- Create: `src/domain/canonical-json.ts`
- Create: `src/domain/deterministic-random.ts`
- Create: `src/domain/run-identity.ts`
- Create: `src/domain/run-identity.test.ts`
- Create: `src/domain/deterministic-random.test.ts`

**Interfaces:**

- Produces: `canonicalStringify`, `sha256Canonical`, `createSeededRandom`, `RunPreconditions`, `RunIdentity`, and `canActivateRun`.

- [ ] **Step 1: Write determinism and staleness tests**

Assert key order does not alter canonical output/hash, Unicode variants normalize to NFC, UTC timestamps reject locale-dependent forms, negative zero normalizes to zero, non-finite values reject, ID-keyed collections sort, the same algorithm/version/seed emits the same first 100 values, different seeds diverge, and one changed project/room/model/evidence/claim-policy/scenario/constraint/calibration/fence input makes `canActivateRun` return `STALE_RUN`.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/domain/run-identity.test.ts src/domain/deterministic-random.test.ts`.

- [ ] **Step 3: Implement canonical identity**

Use Web Crypto-compatible SHA-256 and a documented pure `xoshiro128**` implementation seeded from four unsigned 32-bit words. Do not use `Math.random()`, locale sorting, local time, or insertion order. Run identity includes a content-addressed immutable input graph; model/solver/adapter/PRNG/policy versions; tolerance profile; WASM SIMD/thread mode; normalized input hash; seed; and all precondition revisions/fence.

- [ ] **Step 4: Verify fixed vectors**

Store fixed hash and PRNG vectors in the tests and run them under Node and Chromium before closing Phase 1.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/canonical-json.ts src/domain/deterministic-random.ts src/domain/run-identity.ts src/domain/run-identity.test.ts src/domain/deterministic-random.test.ts
git commit -m "feat: add reproducible run identity"
git push
```

### Task 8: Repository contract and IndexedDB compare-and-swap

**Files:**

- Create: `src/persistence/project-repository.ts`
- Create: `src/persistence/indexeddb-project-repository.ts`
- Create: `src/persistence/database.ts`
- Create: `tests/integration/project-repository.test.ts`
- Create: `tests/setup/indexeddb.ts`
- Create: `src/domain/local-command-journal.ts`
- Create: `src/domain/local-command-journal.test.ts`

**Interfaces:**

- Consumes: Task 4 parser and Task 5 revisions.
- Produces: `ProjectRepository` with `get`, `openSession`, `list`, `create`, command-bearing fenced `commitMutation`, staged operations, `markDeletionPending`, and `deleteAllProjectData`; plus `rehydrateLocalCommandJournal`.
- ADR-0009 supersedes the original illustrative raw replacement-project CAS signature. CAS stays an adapter-private primitive. Mutation outcomes expose both the committed result and the current session so an exact historical retry cannot roll the head backward.

```ts
export interface ProjectRepository {
  get(projectId: ProjectId): Promise<RepositoryResult<Project>>;
  openSession(projectId: ProjectId): Promise<RepositoryResult<ProjectSession>>;
  list(): Promise<RepositoryResult<readonly ProjectSummary[]>>;
  create(project: Project): Promise<RepositoryResult<Project>>;
  commitMutation(mutation: RepositoryMutation): Promise<RepositoryResult<RepositoryMutationOutcome>>;
  beginStage(projectId: ProjectId, fence: LeaseFence, plan: StagePlan): Promise<RepositoryResult<StageId>>;
  commitStage(stageId: StageId, expected: RevisionId, fence: LeaseFence): Promise<RepositoryResult<Project>>;
  markDeletionPending(request: DeletionRequest): Promise<RepositoryResult<DeletionReceipt>>;
  deleteAllProjectData(projectId: ProjectId): Promise<RepositoryResult<void>>;
}
```

- [ ] **Step 1: Write adapter contract tests**

Using fake-indexeddb, prove create/get/list, persisted-record revalidation, duplicate conflict, stale revision/fence conflict, successful atomic revision/audit update, idempotency replay, invisible partial stage, interrupted-stage cleanup, corrupt-record refusal, tombstoned read/write refusal, project-ID resurrection refusal, best-effort peer acknowledgement behavior, and persistent absence verification without claiming peer-RAM erasure.

Also prove local-journal replay regenerates complete committed artifacts/history from its root, refuses corrupt projections, preserves the current session on an exact old-command retry, invalidates history against a newer durable fence, refuses new events at capacity without truncation, and allows terminal deletion/retry at capacity without requiring content replay. `DeletionRequest` includes project ID, expected revision, fence and stable request ID; its durable receipt contains no private content. External package history never gains local replay authority.

- [ ] **Step 2: Prove red**

Run `npm run test -- tests/integration/project-repository.test.ts src/domain/local-command-journal.test.ts`.

- [ ] **Step 3: Implement the Dexie adapter**

Database version 1 stores projects, revisions, commands/idempotency results, evidence metadata, project-scoped source blobs, observations, runs, cache metadata, stages, jobs, leases/fencing epochs, and tombstones by explicit project ID indexes. Repository methods wrap transactions and translate adapter exceptions into stable repository error codes without exposing private record values. Reads exclude uncommitted stage records.

- [ ] **Step 4: Verify reopen and failure atomicity**

Close/reopen the fake database between writes. Force exceptions during staged chunking and final publication; assert the earlier revision remains active, no staged data is visible, and startup reconciliation removes abandoned bytes.

- [ ] **Step 5: Commit and push**

```powershell
git add src/persistence/project-repository.ts src/persistence/indexeddb-project-repository.ts src/persistence/database.ts tests/integration/project-repository.test.ts tests/setup/indexeddb.ts src/domain/local-command-journal.ts src/domain/local-command-journal.test.ts
git commit -m "feat: persist projects with revision checks"
git push
```

### Task 9: Migration recovery and canonical export

**Files:**

- Create: `src/persistence/migrations.ts`
- Create: `src/persistence/project-package.ts`
- Create: `tests/integration/migrations.test.ts`
- Create: `tests/integration/project-package.test.ts`
- Create: `tests/fixtures/project-package-v1.ts`

**Interfaces:**

- Consumes: Task 4 schemas, Task 7 canonical hashing, Task 8 repository.
- Produces: `migrateProjectRecord`, `exportProjectPackage`, `inspectProjectPackage`, and `importProjectPackage`.

- [ ] **Step 1: Write migration and package rejection tests**

Prove idempotent current-version migration, a fixture migration with exact expected result, unsupported-future-version refusal, checksum mismatch, duplicate/NFC-confusable path, `../` traversal, absolute path, symlink, nested archive, compression-ratio bomb, entry/expanded-byte/JSON-depth/key/string limit, identifier collision, active SVG, unsupported subformat, media-redaction export, unauthenticated-package label, and round-trip canonical equivalence.

- [ ] **Step 2: Prove red**

Run `npm run test -- tests/integration/migrations.test.ts tests/integration/project-package.test.ts`.

- [ ] **Step 3: Implement pure migrations and package inspection**

The manifest includes format/schema versions, project ID, export timestamp supplied by the caller, sorted entries, stored/expanded bytes, SHA-256, authentication state, media inclusion, and redaction decisions. Raw originals and sanitized derivatives keep different IDs/hashes/consent. Inspection validates all metadata and record schemas before a repository transaction begins. No archive entry is executed or rendered as markup.

- [ ] **Step 4: Verify deterministic export**

The same project and caller-supplied export timestamp must generate byte-identical canonical records and manifest hashes. Media order follows checksum then evidence ID.

- [ ] **Step 5: Commit and push**

```powershell
git add src/persistence/migrations.ts src/persistence/project-package.ts tests/integration/migrations.test.ts tests/integration/project-package.test.ts tests/fixtures/project-package-v1.ts
git commit -m "feat: add recoverable project packages"
git push
```

### Task 10: Validated worker job protocol

**Files:**

- Create: `src/workers/job-protocol.ts`
- Create: `src/workers/job-controller.ts`
- Create: `src/workers/job-controller.test.ts`
- Create: `src/workers/test-worker.ts`
- Create: `src/workers/test-worker.test.ts`

**Interfaces:**

- Consumes: Task 7 run identity.
- Produces: `JobRequestSchema`, `JobMessageSchema`, `JobController`, `JobResourceBudget`, and typed progress/result/refusal/failure/cancel messages.

- [ ] **Step 1: Write protocol and lifecycle tests**

Prove malformed messages reject, progress is monotonic from `0` through `1`, cancellation acknowledges within the cooperative grace period, non-cooperative work terminates and releases stages/reservations, deadlines refuse, queue/resource limits reject before worker start, transferred buffers are not reused, reused/forged/expired capability tokens reject, workers cannot durably write, crashes map to a redacted `WORKER_CRASH`, and stale/fenced results remain detached.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/workers/job-controller.test.ts src/workers/test-worker.test.ts`.

- [ ] **Step 3: Implement controller and deterministic test worker**

Use injected `WorkerFactory`, scheduler, clock, token source, and stage repository so tests do not sleep. A worker receives a single-use operation/revision/fence-scoped capability but no repository. The controller validates every inbound/outbound message and current fence/tombstone before staging output, removes listeners, revokes owned object URLs, releases result buffers/reservations, reconciles partial stages, and caps one active heavy job per project by default.

- [ ] **Step 4: Verify lifecycle and full foundation**

Run:

```powershell
npm run test -- src/workers/job-controller.test.ts src/workers/test-worker.test.ts
npm run test:coverage
npm run check
git diff --check
```

Expected: all gates pass; coverage includes every `src/domain` file; no build or private artifact is tracked.

- [ ] **Step 5: Commit and push**

```powershell
git add src/workers/job-protocol.ts src/workers/job-controller.ts src/workers/job-controller.test.ts src/workers/test-worker.ts src/workers/test-worker.test.ts
git commit -m "feat: add bounded worker jobs"
git push
```

### Task 11: Claim resolution and invalidation graph

**Files:**

- Create: `src/domain/claim-resolution.ts`
- Create: `src/domain/invalidation.ts`
- Create: `src/domain/policies.ts`
- Create: `src/domain/claim-resolution.test.ts`
- Create: `src/domain/invalidation.test.ts`

**Interfaces:**

- Consumes: Task 4 claim/project schemas and Task 7 content identity.
- Produces: `ClaimResolutionPolicy`, `resolveClaimSet`, `ConfidenceMethod`, `InvalidationPolicy`, `computeInvalidations`, and `DerivedArtifactStatus`.

- [ ] **Step 1: Write semantic provenance tests**

Prove that explicit user selection wins without deleting alternatives; superseded claims retain links/reasons; incompatible units cannot compete; measured and user-entered categories stay distinct; simulated/predicted/recommended values never become observed inputs; unknown propagation method produces unknown confidence; and conflict/export ordering is deterministic.

Add invalidation tests showing that a moved wall stales zoning and all dependent runs/recommendations, a renamed label does not stale scientific results, a device-state edit stales scenario runs but preserves raw evidence, a claim-policy change stales derived active values, and an exact content-graph match permits cache reuse.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/domain/claim-resolution.test.ts src/domain/invalidation.test.ts`.

- [ ] **Step 3: Implement versioned policies**

The default resolution order is explicit user selection, compatible non-superseded measured claim, user-entered claim, observed claim, inferred claim, then assumed claim. Ties remain conflicts unless a deterministic policy criterion is explicitly recorded; confidence never breaks a semantic tie silently. Invalidation rules are data keyed by command and dependency kind, return reasons, and do not delete artifacts.

- [ ] **Step 4: Verify property behavior**

Use fast-check to permute claim/artifact insertion order and prove identical resolutions/invalidation sets. Run focused tests, typecheck, and lint.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/claim-resolution.ts src/domain/invalidation.ts src/domain/policies.ts src/domain/claim-resolution.test.ts src/domain/invalidation.test.ts
git commit -m "feat: resolve claims with provenance"
git push
```

### Task 12: Scientific backend, recommendation, and experiment contracts

**Files:**

- Create: `src/modeling/model-backend.ts`
- Create: `src/recommendations/recommendation-schema.ts`
- Create: `src/experiments/experiment-schema.ts`
- Create: `src/modeling/model-backend.test.ts`
- Create: `src/experiments/experiment-schema.test.ts`

**Interfaces:**

- Consumes: Task 3 dimensional values, Task 4 provenance types, Task 6 constraints, Task 7 run identity, and Task 11 policies.
- Produces: `ModelBackendManifestSchema`, `ModelBackend`, `RecommendationSchema`, `ExperimentSchema`, and `CalibrationDecisionSchema`.

- [ ] **Step 1: Write contract refusal tests**

Assert that a backend manifest rejects missing quantity/unit support, boundary/source conventions, conservation/non-negativity/stiffness/non-convergence behavior, uncertainty method, refusal taxonomy, maturity, or validation version. Assert a recommendation rejects an action/effect without linked feasible candidate metrics, input evidence/claims, assumptions, scenario warnings, confidence method, precision cap, alternatives, and verification protocol.

Assert an experiment rejects mutable/current project references, a prediction made from the post-calibration model, missing accepted follow-up observation, residual without method/version, calibration without explicit user decision, and held-out evaluation chosen after fitting.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/modeling/model-backend.test.ts src/experiments/experiment-schema.test.ts`.

- [ ] **Step 3: Implement strict capability schemas**

The model interface accepts only an immutable normalized snapshot and returns a validated detached run/refusal. Recommendation output is structured records, never arbitrary analysis text. Experiment snapshots are content addressed; calibration always creates a new model version and keeps the prediction model unchanged.

- [ ] **Step 4: Verify schema round trips and category separation**

Round-trip valid synthetic manifests/recommendations/experiments through canonical serialization and prove every provenance category, unit, model version, and evidence/run link survives.

- [ ] **Step 5: Commit and push**

```powershell
git add src/modeling/model-backend.ts src/recommendations/recommendation-schema.ts src/experiments/experiment-schema.ts src/modeling/model-backend.test.ts src/experiments/experiment-schema.test.ts
git commit -m "feat: define scientific result contracts"
git push
```

### Task 13: Source integrity, bounded ingestion, and admissibility

**Files:**

- Create: `src/evidence/source-integrity.ts`
- Create: `src/evidence/ingestion-contract.ts`
- Create: `src/domain/scientific-admissibility.ts`
- Create: `src/evidence/source-integrity.test.ts`
- Create: `src/domain/scientific-admissibility.test.ts`

**Interfaces:**

- Consumes: Task 4 evidence/claim schemas, Task 7 identity, Task 11 invalidation, and Task 12 capability manifests.
- Produces: `verifyEvidenceSource`, `EvidenceAvailabilityTransition`, `IngestionBudgetSchema`, `IngestionResultSchema`, `ScientificAdmissibilityPolicy`, and `AdmissibilityDecision`.

- [ ] **Step 1: Write availability, isolation, and policy failures**

Prove that missing/corrupt source checks create a new availability revision, preserve historical claims, and invalidate reproducibility/activation. Prove an ingestion result cannot be accepted without content signature, observed bytes/dimensions/type-specific counts, budget receipt, disposable-worker capability ID, and sanitized output schema.

For admissibility, prove quality-only vision refuses direction, missing calibrated plane restricts output to relative image motion, missing source bytes refuses reproducible recommendation activation, a geometry-only model restricts vocabulary/precision, an insufficient model maturity cannot claim validation, and a fully supported synthetic analytic case admits its declared quantity only.

- [ ] **Step 2: Prove red**

Run `npm run test -- src/evidence/source-integrity.test.ts src/domain/scientific-admissibility.test.ts`.

- [ ] **Step 3: Implement pure policy and ingestion contracts**

`AdmissibilityDecision` is a discriminated union of `ADMIT`, `RESTRICT`, and `REFUSE`. Restricted decisions carry allowlisted quantities, units, vocabulary tokens, and maximum precision; refused decisions carry stable reasons and the smallest missing evidence. The ingestion contract defines file-type caps for archive, JSON, CSV, image, video, mesh, and document workers; no parsed result reaches UI/domain code without validation.

- [ ] **Step 4: Verify insertion-order and bypass resistance**

Permute evidence/capability ordering and prove identical decisions. Attempt claim creation, run activation, recommendation formatting, and export through test adapters without an admissibility receipt and assert each refuses.

- [ ] **Step 5: Commit and push**

```powershell
git add src/evidence/source-integrity.ts src/evidence/ingestion-contract.ts src/domain/scientific-admissibility.ts src/evidence/source-integrity.test.ts src/domain/scientific-admissibility.test.ts
git commit -m "feat: gate scientific outputs"
git push
```

## Foundation checkpoint

- [ ] `npm ci` succeeds from the committed lockfile on Node 24.
- [ ] Dependency lifecycle scripts remain suppressed and npm registry signatures/provenance verify.
- [ ] `npm run check` passes.
- [ ] Focused property and integration suites prove units, transforms, schemas, command idempotency/inverses, lease fencing, staged operations, constraints, determinism, claim resolution/invalidation, stale runs, source integrity, bounded ingestion, repository conflicts, migration/package safety, worker lifecycle, backend capabilities, central admissibility, recommendation traceability, and experiment immutability.
- [ ] A real Chromium run confirms the hash/PRNG vectors and minimal application shell.
- [ ] The requirement matrix links Phase 1 evidence without promoting later product criteria.
- [ ] Changed code, tests, and docs contain no secrets, private artifacts, assistant/meta prose, stale placeholders, or generated build output.
- [ ] Every green increment is present on `origin/codex/flowlens-build` with a concise commit.
