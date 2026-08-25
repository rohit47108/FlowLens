# Repository reconnaissance

Date: 2026-08-24
Phase: 0

## Baseline

- The repository began with `AGENTS.md` and `FLOWLENS_MASTER_PROMPT.md` only.
- `main` tracked `origin/main` at commit `eeef9f5`.
- There was no source tree, package manifest, build, test suite, application, deployment configuration, design system, persistence layer, or local data.
- The unmodified baseline therefore had no runnable command. No command result is represented as a passing application baseline.
- The working environment provides Node.js `24.17.0`, npm `11.13.0`, and a GitHub HTTPS remote at `origin`.

## Specification authority

`FLOWLENS_MASTER_PROMPT.md` is the product and acceptance authority. `AGENTS.md` supplies repository conventions and safety constraints. The pasted task attachment was compared with the repository master prompt after newline normalization; they contain the same substantive specification.

## Selected foundation

FlowLens will begin as a client-first React application built with Vite and strict TypeScript. Pure domain modules own room state, scientific inputs, reproducibility, and constraints. React Three Fiber projects that state into a Three.js scene. IndexedDB stores versioned local projects and evidence through a repository interface. Validated workers run vision, simulation, and optimization jobs.

This choice minimizes exposure of private room data, keeps the sample project usable without credentials or a backend, and provides a static deployment path. It does not imply that browser storage is encrypted, immune to eviction, or private from another user of the same browser profile.

## High-risk areas and controls

| Area | Initial risk | Required control |
| --- | --- | --- |
| Scientific credibility | A polished visualization could be mistaken for CFD or measured velocity. | Name the zone model, display assumptions and maturity level, retain provenance, and refuse unsupported precision. |
| State consistency | UI, scene, workers, persistence, and another tab could write incompatible revisions. | One domain command bus, compare-and-swap revisions, a tab lease, immutable run inputs, and stale-result rejection. |
| Local evidence storage | Video can exceed quota or be evicted, while claims remain. | Preflight size limits, atomic imports, storage status, checksums, explicit retention, export, and missing-source states. |
| Deletion | A live worker or cache can recreate deleted derived data. | Project tombstones, job cancellation, transactionally enumerated storage, and post-delete verification. |
| Hostile media | Browser-local parsing can still consume memory or exploit a decoder/parser. | Content sniffing, dimension/duration/count limits, parser isolation, cancellation, safe filenames, and no raw-data logging. |
| 3D accessibility | A labeled WebGL canvas is not an accessible editor. | A synchronized semantic entity table and transform forms driven by the same commands as pointer interaction. |
| Determinism | Browser floating point, key ordering, and asynchronous jobs can alter results. | Canonical serialization, stable ordering, seeded PRNG, tolerance policy, solver/adapter versions, and reproducibility hashes. |
| Migration recovery | IndexedDB upgrades are difficult to roll back after commit. | Export-before-major-upgrade, versioned pure migrations, transactional schema changes, fixtures, and recovery import. |
| Dependency drift | Latest packages can have incompatible peer ranges. | Lockfile, supported Node/browser matrix, current official-source verification, and CI installs with `npm ci`. |

## Capability posture

- Core manual room creation, deterministic sample data, editing, modeling, simulation, optimization, recommendation, verification, export, and deletion must work locally.
- Tracer analysis is unavailable for material claims until every required stage is implemented and its fixture gates pass. Quality-only processing may diagnose a clip but cannot infer direction.
- Camera capture, XR, native scanning, server sync, accounts, hosted collaboration, OpenAI features, and deployment are optional adapters. None is required for the core release.
- Vercel deployment remains unauthorized until the user explicitly approves a deployment action.

## Phase 0 evidence

- Repository, branch, remote, history, runtime, and file inventory inspected.
- Current primary documentation and package compatibility checked; see `docs/research/source-register.md`.
- Architecture challenged by a fresh-context adversarial review and strengthened before implementation.
- Design, ADRs, living plan, task list, and requirement matrix are versioned in the repository.
