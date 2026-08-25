# ADR-0001: Use a client-first React architecture

## Status

Accepted

## Date

2026-08-24

## Context

FlowLens begins without an application foundation. Its core workload is an interactive, local-first spatial editor with WebGL, structured offline data, deterministic scientific engines, background jobs, and no required account or server. Private room evidence should remain in the browser unless the user deliberately chooses a future upload path.

React’s current documentation recommends a framework for many applications but permits a from-scratch build tool when an application’s constraints are not well served by a full-stack framework. Vite documents a React TypeScript path, production static bundles, and the current Node compatibility floor. React Three Fiber 9 is the documented React 19 renderer for Three.js.

## Decision

Use React 19, Vite 8, strict TypeScript 6, React Router declarative mode, React Three Fiber 9, and Three.js. The application is a client-rendered single-page application whose core release builds to static assets.

Pure TypeScript modules own the room domain, evidence contracts, model, simulation, optimization, and recommendations. React owns composition and view state. Three.js is accessed through a scene adapter and never becomes the persistence model. Browser services sit behind versioned interfaces.

Pin exact transitive versions in `package-lock.json` and locally bundle runtime assets. The core application must operate after load without network access.

## Alternatives considered

### Next.js App Router

- Benefits: integrated routing, server components, server endpoints, code splitting, and strong Vercel support.
- Rejected for the initial release: it adds a server/rendering model that core FlowLens does not require and makes the local-only evidence boundary harder to reason about. A future hosted shell can consume the same domain packages.

### React Router framework mode

- Benefits: type-safe route modules, data APIs, SPA/SSR/static strategies, and route-level code splitting.
- Rejected for the initial release: FlowLens does not need server loaders or route-owned persistence. Declarative mode provides the small URL surface required now and can be upgraded additively.

### Vanilla Three.js application

- Benefits: maximum direct renderer control and fewer React integration layers.
- Rejected: FlowLens has a large synchronized semantic UI, inspector forms, tables, dialogs, and stateful workflows. React Three Fiber provides a documented scene renderer without making Three.js state authoritative.

## Consequences

- Static hosting is possible, but deployment remains a separately authorized action.
- Initial load and 3D/vision chunks require explicit performance budgets and lazy loading.
- Browser storage quota, eviction, shared-profile access, and origin isolation must be explained accurately.
- Server sync, accounts, collaboration, and hosted computation require new adapters and threat-model decisions; they are not implicit features.
- Vite and R3F APIs used in code must link to their current official documentation in the source register or a nearby decision record.

## Sources

- https://react.dev/learn/creating-a-react-app
- https://vite.dev/guide/
- https://reactrouter.com/start/modes
- https://r3f.docs.pmnd.rs/getting-started/introduction
