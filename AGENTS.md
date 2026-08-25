# Repository Guidelines

This guide records the current repository state and the conventions for building FlowLens safely and reproducibly. The product authority is `FLOWLENS_MASTER_PROMPT.md`; the accepted implementation design is `docs/superpowers/specs/2026-08-24-flowlens-design.md`.

## Project structure

Use `src/app/` for runtime composition, `src/domain/` for browser-independent canonical state, `src/persistence/` for repository adapters, `src/scene/` for the Three.js projection, `src/evidence/` and `src/vision/` for ingestion and analysis, and separate `src/modeling/`, `src/simulation/`, `src/optimization/`, `src/recommendations/`, and `src/experiments/` modules. Put deterministic synthetic fixtures in `tests/fixtures/`, integrated browser workflows in `e2e/`, non-sensitive static assets in `public/`, decisions and scientific limitations in `docs/`, and living execution state in `tasks/`.

The canonical domain may not import React, Three.js, Dexie, or worker implementations. The scene and semantic UI are projections; all mutations enter through validated revisioned domain commands. Shared units, geometry, constraints, provenance, and run identity must not be reimplemented in adapters.

## Build, test, and development commands

The accepted stack is Node.js 24, npm 11, React 19, Vite 8, and strict TypeScript 6. After the Phase 1 manifest lands, use only these canonical commands:

- `npm ci` installs the exact lockfile.
- `npm run dev` starts the local application.
- `npm run build` type-checks and creates the production bundle.
- `npm run lint` runs static checks without mutation.
- `npm run format:check` verifies formatting.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run test` runs unit and integration tests once.
- `npm run test:coverage` runs the coverage gate.
- `npm run test:e2e` runs Playwright workflows.
- `npm run check` runs the local release gate.

Do not report a command as available until its manifest entry is committed. Use focused Vitest paths during red-green development, then the proportionate integrated gate before committing.

## Coding style and naming

Use two-space indentation, strict typing, named exports, `PascalCase` for components and classes, `camelCase` for functions and values, and descriptive `kebab-case` filenames. Prefer discriminated unions and readonly data. Keep units, coordinate systems, revision IDs, provenance, confidence, solver/model versions, and deterministic seeds explicit. Validate every external boundary with runtime schemas. Record major architectural or modeling choices in `docs/decisions/` rather than burying rationale in code.

## Testing guidelines

Use red-green-refactor for every behavior change. Cover domain invariants, unit conversion, provenance resolution, geometry, revision conflicts, deterministic identity, migration/recovery, computer-vision quality rejection, simulation conservation, optimization constraints, persistence, deletion, accessibility, and browser workflows. Use deterministic synthetic media and fixtures; never add private room scans or sensor data. Name tests after observable behavior, for example `rejectsUnusableTracerVideo`.

## Commits and pull requests

Use concise conventional messages such as `feat: add room model schema` or `test: cover zone mass balance`. Keep commits focused, run proportionate checks, inspect the staged diff, and scan for secrets/private artifacts before committing. Push each meaningful green checkpoint to the current `codex/` branch without force-pushing. Pull requests should explain the user-visible change, link an issue when one exists, list verification commands and results, include screenshots for UI changes, and call out scientific assumptions, privacy effects, and known limitations.

## Safety and agent instructions

Read this file and the task-relevant sections of `FLOWLENS_MASTER_PROMPT.md`, the accepted design, ADRs, and active phase plan before editing. Preserve the non-diagnostic boundary, never claim exact CFD or unsupported precision, keep room media local/private by default, and fail closed when evidence is insufficient. Selecting a file never authorizes upload. Hosted services, deployment, analytics, accounts, sharing, OpenAI features, and processing private media outside the browser require explicit user authorization. Inspect the running product and relevant tests before claiming a feature is complete.
