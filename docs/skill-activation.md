# Skill activation ledger

Last updated: 2026-08-24

This ledger maps the requested skills to the phase where their instructions govern work. `Activated` means the skill file was read and its workflow materially applied; it does not mean the corresponding product phase is complete.

| Skill | Activation phase | Current state | Application |
| --- | --- | --- | --- |
| source-driven-development | 0 and each dependency/API decision | Activated | Current primary docs and registry compatibility drive stack choices and source register. |
| spec-driven-development | 0 | Activated | Accepted design spec, boundaries, success criteria, and living artifacts precede code. |
| context-engineering | 0 and every phase transition | Activated | `AGENTS.md`, focused phase plans, source files, tests, and current errors form the context hierarchy. |
| doubt-driven-development | 0 and non-trivial decisions | Activated | Architecture completed the bounded three-cycle fresh-context adversarial review; rulings are in the Phase 0 report. TDD red tests serve behavioral doubt cycles later. |
| planning-and-task-breakdown | 0 and phase transitions | Activated | Dependency graph, vertical phases, checkpoints, and small tasks live in `tasks/` and detailed plans. |
| api-and-interface-design | 0-1 and adapter changes | Activated | Contract-first domain, repository, job, model, recommendation, and experiment interfaces. |
| documentation-and-adrs | Every phase | Activated | Source register, design, ADRs, evidence matrix, and phase reports preserve rationale. |
| git-workflow-and-versioning | Every change | Activated | `codex/flowlens-build`, focused conventional commits, staged review, and regular pushes. |
| incremental-implementation | 1-15 | Activated for Phase 1 | Execute one tested vertical slice and checkpoint at a time. |
| test-driven-development | 1-15 | Activated for Phase 1 | Red-green-refactor for behavior, property/integration/E2E tests by risk. |
| security-and-hardening | 1, 5, 6, 13, 15 | Activated for architecture and Phase 1 | Trust boundaries, staged storage, hostile files, CSP, privacy, dependency and secret audit. |
| frontend-design | 2, 3, 12, 15 | Scheduled | Restrained spatial-instrument design language and coherent workspace composition. |
| ui-ux-pro-max | 2, 12, 15 | Scheduled | Evidence-backed interaction patterns, responsive states, and design-system decisions. |
| frontend-ui-engineering | 2-5, 8-12 | Scheduled | Production React implementation of accessible responsive workflows. |
| accessibility | 2, 3, 12, 15 | Scheduled | WCAG 2.2 AA, keyboard/semantic parity, automated plus manual checks. |
| vercel-react-best-practices | 1-15 because React was selected | Activated for Phase 1 | Direct imports, lazy heavy modules, derived state, stable component identity, and one-time initialization; no deployment implication. |
| 3d-web-experience | 0 architecture and Phase 3 implementation | Activated for architecture | R3F/Three selection, semantic geometry, adaptive quality, WebGL fallback. |
| computer-vision-opencv | 0 architecture and Phase 6 implementation | Activated for architecture | Staged OpenCV.js capability, apparent-motion boundary, fixtures, memory cleanup. |
| playwright-core | 2 onward; primary in 13-15 | Scheduled | Stable locator/actionability patterns for integrated browser workflows. |
| browser:control-in-app-browser | 2 onward; primary in 12-15 | Scheduled | Inspect the running app, console, network, focus, responsive and recovery states. |
| code-review-and-quality | Every checkpoint; primary in 13-15 | Scheduled | Multi-axis review of diffs, tests, architecture, security, performance, and maintainability. |
| impeccable | 12 and 15 | Scheduled | Final interface craft pass after full workflows exist. |
| web-quality-audit | 13 and 15 | Scheduled | Accessibility, performance, security, SEO-applicability, and best-practice audit. |
| performance-optimization | 14 | Scheduled | Profile first, optimize measured bottlenecks, enforce regression budgets. |
| observability-and-instrumentation | 2 foundation, primary in 14 | Scheduled | Privacy-safe product/job diagnostics and performance marks. |
| shipping-and-launch | 15 | Scheduled | Release readiness, honest limitations, version/changelog and rollback posture. |
| ci-cd-and-automation | 1 foundation, primary in 13-15 | Scheduled | Reproducible GitHub checks, artifacts, security and performance gates. |
| code-simplification | After each behavior is correct; final pass in 15 | Conditional | Simplify only after green correctness evidence, without changing contracts. |
| debugging-and-error-recovery | Whenever a failure appears | Conditional | Activate on the first test/build/browser failure and retain exact evidence. |
| prototype | Only if competing UI directions require comparison | Not triggered | The master brief already fixes one coherent workspace direction; no competing prototype is currently needed. |
| computer-use:computer-use | Only for native/OS interaction | Not triggered | Browser and terminal workflows are sufficient so far. |
| deploy-to-vercel | Only after explicit deployment authorization | Not authorized | Production build and host readiness may be proven locally; no external deployment occurs. |
| openai-docs | Only if OpenAI APIs are implemented | Not triggered | Core structured explanations require no hosted model. |

Plugin/capability posture:

- Browser capabilities will exercise the real product, not substitute screenshots for interaction checks.
- Computer capability is reserved for a native/OS-only gate.
- Vercel guidance may inform React quality; deployment remains separately authorized.
- Superpowers process skills govern brainstorming, planning, subagent execution, and verification.
- GitHub is the configured `origin`; verified feature commits are pushed regularly without force-push.

Superpowers process activations:

- `using-superpowers`: skill-first routing and process precedence.
- `brainstorming`: architectural path; the user-supplied master brief served as the approved implementation design.
- `writing-plans`: detailed spec-linked Phase 1 execution plan.
- `using-git-worktrees`: isolated-workspace detection and setup before implementation.
- `subagent-driven-development`: fresh implementer and independent review per planned task.
- `verification-before-completion`: fresh evidence before commits, phase transitions, and completion claims.
