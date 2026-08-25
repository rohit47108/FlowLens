# Phase 0 verification report

Date: 2026-08-24
Branch: `codex/flowlens-build`
Scope: repository reconnaissance, source-backed design, adversarial architecture review, planning, and context rules

## Outcome

Phase 0 establishes an implementation-ready contract and evidence plan. It does not claim that the FlowLens application, toolchain commands, tests, or product workflows exist yet. Those begin in Phase 1.

## Baseline evidence

| Check | Command or method | Result |
| --- | --- | --- |
| Repository inventory | `rg --files` before edits | Only `AGENTS.md` and `FLOWLENS_MASTER_PROMPT.md` existed. |
| Git state | `git status --short --branch`, `git log --oneline -10`, `git remote -v` | Clean `main` at `eeef9f5`, tracking `origin/main`; GitHub HTTPS remote configured. |
| Runtime | `node --version`, `npm --version` | Node `v24.17.0`, npm `11.13.0`. |
| Existing commands | Manifest search | No manifest or runnable baseline command existed. |
| Attached brief | Newline-normalized raw comparison | The pasted attachment and repository master prompt differed only by a trailing blank line. |
| Prior memory | Targeted `MEMORY.md` search for FlowLens | No project entry found; no stale prior decision was used. |

## Source evidence

Current official React, Vite, React Router, React Three Fiber, Dexie, MDN, OpenCV, Vitest, Playwright, and W3C documentation was inspected. Registry metadata was checked for exact current versions, licenses, engines, and critical peer ranges. The resulting decisions and deep links are recorded in `docs/research/source-register.md`.

The compatibility check rejected TypeScript `7.0.2` for the initial graph because `typescript-eslint@8.68.0` declares TypeScript support below `6.1.0`. The accepted foundation pins TypeScript `6.0.3`.

## Adversarial architecture review

Three bounded fresh-context cycles attempted to disprove the architecture.

### Cycle 1

Valid findings added authoritative commands/revisions, multi-tab conflicts, migration recovery, evidence retention/deletion, validation at every adapter, spatial/unit rules, canonical determinism, stale-run protection, worker lifecycle, fail-closed vision, untrusted-media controls, an accurate local privacy boundary, semantic accessibility, shared constraints, backend capabilities, dependency reproducibility, optimization sensitivity, and canonical interchange.

### Cycle 2

Valid findings added lease fencing, idempotent/causal/inverse command semantics, staged transactions, interruption cleanup, project-scoped blobs, complete immutable run graphs, numeric/text/time normalization, claim resolution/confidence/supersession, invalidation, immutable experiments/calibration, stronger backend/velocity/per-clip contracts, scoped worker capability tokens, hostile archive limits, source-vs-sanitized evidence identity, recommendation traces, focus restoration/live status, full dimensional types, and an enforceable egress policy.

### Cycle 3 and rulings

The skill’s three-cycle breaker was reached. No fourth architecture review was run.

| Finding | Classification and ruling | Cost if wrong |
| --- | --- | --- |
| A tab cannot erase another suspended tab’s RAM or force it closed during deletion. | Valid and actionable. The contract now promises persistent tombstone/fence denial, best-effort peer acknowledgement, local cleanup, persistent absence verification, and explicit live-memory/external-download limits. | Private bytes could remain visible in a previously loaded peer tab until it resumes or closes. Product copy and tests must not overclaim deletion. |
| Migration recovery was undefined. | Contract misread caused by the condensed review artifact; the full spec already required versioned pure transforms, a migration lease/fence, atomic upgrade, prior-format export, recovery export, and compatibility import. Wording was strengthened. | A browser-specific upgrade failure could still require manual recovery; fixture and failure-injection tests are mandatory. |
| ZIP rules lacked an interchange contract. | Contract misread caused by the condensed artifact; the full spec already named a canonical manifest, sorted records, checksums, media/redaction, and atomic validation. Exact paths, hash scope, semantic graph validation, and all-or-nothing publication were added. | A format ambiguity would break deterministic recovery/import compatibility. Canonical package fixtures become long-lived compatibility evidence. |
| Capability declarations did not prevent unsupported material claims. | Valid and actionable. ADR-0007 adds a central `ADMIT`/`RESTRICT`/`REFUSE` scientific admissibility policy required by activation, claims, optimization, recommendations, exports, and future assistants. | A policy omission could leak unsupported quantity, vocabulary, or precision despite adapter warnings. Bypass tests are required. |
| Browser eviction could leave evidence looking reproducible. | Valid and actionable. Source availability/checksum is now revisioned provenance verified on open, activation, and storage errors, feeding invalidation without rewriting history. | Integrity checks add I/O cost and cannot prevent eviction; they ensure the product reports it honestly. |
| Supported hostile files lacked an assigned isolation boundary. | Valid and actionable. Every file type must be sniffed and parsed/decoded under type-specific budgets in a disposable capability-scoped ingestion worker before UI/domain/scene consumption. | Browser decoders and WASM still carry platform risk; strict budgets, termination, and malformed fixtures reduce but do not eliminate it. |

Cross-model CLI review was not invoked. The autonomous goal run announced that skip; no external model process received project material without explicit per-invocation authorization.

## Planning and context checks

- The accepted design covers objective, exact stack, future commands, structure, code style, tests, boundaries, and success criteria.
- ADR-0001 through ADR-0007 record expensive-to-reverse decisions.
- `tasks/plan.md` preserves the master prompt’s Phase 0-15 order and checkpoints.
- The Phase 1 detailed plan contains 13 independently testable tasks with explicit files, interfaces, red-green commands, and commits.
- `tasks/todo.md` and `docs/requirements/traceability.md` use conservative status: later requirements remain `Planned`.
- `AGENTS.md` now supplies the persistent stack, module boundaries, canonical commands, safety rules, and commit discipline needed by future sessions.
- `docs/skill-activation.md` maps every requested and conditional skill to its activation gate.

The installed `incremental-implementation`, `test-driven-development`, and `security-and-hardening` skills reference `definition-of-done.md`, `testing-patterns.md`, and `security-checklist.md` files that are absent from the installed skill tree. Their complete primary `SKILL.md` workflows remain usable; FlowLens’s own Definition of Done, testing strategy, and security boundary are the documented fallback.

## Fresh hygiene checks

The following checks were run after the Phase 0 edits:

```powershell
git diff --check
rg -n -i "\b(TBD|TODO)\b|implement later|fill in details|appropriate error handling|similar to task" AGENTS.md docs tasks .gitignore --glob "!docs/verification/phase-0.md"
rg -n -i "as an ai|ai-generated|generated by|chatgpt|claude" AGENTS.md docs tasks .gitignore --glob "!docs/verification/phase-0.md"
```

Result: `git diff --check` reported no whitespace error; placeholder and meta-prose scans returned no matches. Git emitted only its Windows line-ending notice for the existing `AGENTS.md` working copy.

## Phase gate

Phase 0 may be committed when the staged diff and secret/private-path scan are clean and the branch push succeeds. Phase 1 must begin with the locked toolchain task; no application success criterion is promoted by this report.
