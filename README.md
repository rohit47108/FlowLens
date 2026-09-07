# FlowLens

FlowLens is a local-first room and airflow research workspace under development. The intended workflow is to create a room, attach evidence, compare coarse zonal simulations and interventions, and verify changes with before/after measurements.

**Current status: foundation only.** The repository contains an accessible application shell, typed SI units and coordinates, validated project/provenance schemas, and revisioned room commands with undo/redo tests. The interactive 3D editor, persistence, tracer analysis, simulation, optimization and experiments are not yet available as complete user workflows. See the [implementation checklist](tasks/todo.md) and [requirement evidence](docs/requirements/traceability.md).

## Run locally

Use Node.js 24 (at least 24.15, below 25) and npm 11. From the repository directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No account, API key, camera or private room media is required for the foundation shell or synthetic tests. The lockfile pins dependencies; `.npmrc` disables dependency lifecycle scripts during installation.

## Checks

```sh
npm run check
```

This runs formatting, lint, strict TypeScript checking, unit/component tests and the production build. For focused development, use `npm run test -- src/domain/history.test.ts`. `npm run build` writes the production bundle to `dist/`. Browser and coverage scripts are reserved in the manifest, but their full release gates are not yet implemented; passing `check` alone does not prove product acceptance.

## Architecture and boundaries

- `src/domain/`: browser-independent canonical state, units, revisions and commands.
- `src/app/`: application composition and semantic shell.
- `tests/fixtures/`: deterministic synthetic data only.
- `docs/decisions/`: architecture and scientific conventions.

Planned scene, evidence, vision, modeling, simulation, optimization, persistence and experiment adapters remain separate from the authoritative domain. Read [AGENTS.md](AGENTS.md), the [master requirements](FLOWLENS_MASTER_PROMPT.md), and the [accepted design](docs/superpowers/specs/2026-08-24-flowlens-design.md) before contributing.

FlowLens is not a medical device, infection-risk calculator, exact CFD package or professional indoor-air-quality assessment. Future optical-flow outputs describe apparent image motion unless supported calibration establishes more. Room media must remain private by default; selecting a file will not authorize an upload. The current foundation does not yet provide media storage, project export or verified deletion.
