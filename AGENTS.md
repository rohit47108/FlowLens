# Repository Guidelines

This guide records the current repository state and the conventions for building FlowLens safely and reproducibly.

## Project structure

The repository currently contains the FlowLens specification in `FLOWLENS_MASTER_PROMPT.md`; no application source, manifest, tests, or deployment configuration exists yet. As implementation begins, keep the following boundaries explicit: `src/` for product code, `tests/` for automated tests and synthetic fixtures, `public/` or `assets/` for non-sensitive static assets, and `docs/` for setup, scientific limitations, and architecture decision records. Keep room-domain, rendering, computer-vision, simulation, optimization, and persistence code in separate modules.

## Build, test, and development commands

There are no repository commands to run yet because no package or build manifest exists. Do not invent commands in pull requests. Once the stack is chosen, document the canonical commands here and in `README.md`, such as `npm run dev` for local development, `npm run build` for a production build, and `npm test` for the full suite.

## Coding style and naming

Follow the formatter, linter, and type checker adopted by the project. Until a stack-specific convention exists, use two-space indentation, strict typing, `PascalCase` for components and classes, `camelCase` for functions and values, and descriptive `kebab-case` filenames. Keep units, coordinate systems, provenance, and confidence values explicit. Record major architectural or modeling choices in `docs/decisions/` rather than burying rationale in code.

## Testing guidelines

Add tests with each behavior change. Cover domain invariants, unit conversion, provenance resolution, geometry, computer-vision quality rejection, simulation conservation, optimization constraints, persistence, accessibility, and browser workflows. Use deterministic synthetic media and fixtures; never add private room scans or sensor data. Name tests after observable behavior, for example `rejectsUnusableTracerVideo`.

## Commits and pull requests

Git history has no commits yet, so use concise imperative messages such as `feat: add room model schema` or `test: cover zone mass balance`. Keep commits focused. Pull requests should explain the user-visible change, link an issue when one exists, list verification commands and results, include screenshots for UI changes, and call out scientific assumptions, privacy effects, and known limitations.

## Safety and agent instructions

Read this file and `FLOWLENS_MASTER_PROMPT.md` before editing. Preserve the non-diagnostic boundary, never claim exact CFD or unsupported precision, keep uploaded room media private by default, and fail closed when evidence is insufficient. Inspect the running product and relevant tests before claiming a feature is complete.
