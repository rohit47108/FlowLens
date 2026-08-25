# FlowLens source register

Last verified: 2026-08-24

This register records the primary sources used for framework, browser, scientific-computing, and accessibility decisions. Sources inform implementation; they do not override the FlowLens specification or safety boundaries.

## Application foundation

| Decision | Primary source | Evidence used |
| --- | --- | --- |
| Use React 19 with a client-rendered application | [React: Creating a React App](https://react.dev/learn/creating-a-react-app) | React supports client-side applications and documents Vite as a valid from-scratch build path when framework server features do not fit the application. |
| Use Vite 8 for the local development and production bundle | [Vite: Getting Started](https://vite.dev/guide/) | Vite documents the React TypeScript template, production build behavior, browser baseline, and Node version requirements. |
| Suppress dependency lifecycle scripts during installation and verify registry signatures | [npm install](https://docs.npmjs.com/cli/install/) and [npm audit](https://docs.npmjs.com/cli/audit/) | npm documents `ignore-scripts` as the fail-closed install policy and `npm audit signatures` as the registry signature and provenance verification command. Project scripts invoked explicitly still run, while pre/post hooks remain suppressed. |
| Use React Router in declarative mode | [React Router: Picking a Mode](https://reactrouter.com/start/modes) | Declarative mode provides URL matching and navigation without imposing loaders, server rendering, or a server runtime. |
| Keep Three.js behind a React scene adapter | [React Three Fiber: Introduction](https://r3f.docs.pmnd.rs/getting-started/introduction) and [Your First Scene](https://r3f.docs.pmnd.rs/getting-started/your-first-scene) | React Three Fiber 9 pairs with React 19 and exposes Three.js objects through a React renderer. The domain remains authoritative; the scene is only a projection. |

## Local persistence and background work

| Decision | Primary source | Evidence used |
| --- | --- | --- |
| Use IndexedDB for structured projects and local blobs | [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | IndexedDB stores significant structured data and blobs asynchronously, follows same-origin policy, and is available in workers. Browser quota and eviction remain explicit product limitations. |
| Use Dexie as the IndexedDB adapter | [Dexie: React Tutorial](https://dexie.org/docs/Tutorial/React) | Dexie documents typed databases, versioned stores, React live queries, and the same-origin limitation. Domain repositories do not expose Dexie types. |
| Run heavy jobs outside the UI thread | [MDN: Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) | Dedicated workers execute laborious work away from the main thread and communicate using messages. FlowLens adds a validated job protocol, cancellation, timeouts, and stale-result rejection. |

## Computer vision

| Decision | Primary source | Evidence used |
| --- | --- | --- |
| Load a pinned local OpenCV.js build only through a capability adapter | [OpenCV: Using OpenCV.js](https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html) | OpenCV documents local hosting, asynchronous initialization, explicit matrix ownership, and a versioned prebuilt script. No runtime CDN is allowed for private evidence processing. |
| Treat optical flow as apparent 2D motion | [OpenCV: Optical Flow](https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html) | OpenCV documents sparse Lucas-Kanade and dense Farneback flow. FlowLens adds calibration checks, forward/backward consistency, stabilization diagnostics, and refuses unsupported physical velocity claims. |
| Release frame matrices and bound processing cadence | [OpenCV: Getting Started with Videos](https://docs.opencv.org/4.13.0/dd/d00/tutorial_js_video_display.html) | OpenCV documents video-frame capture, frame timing, and explicit `Mat.delete()` cleanup. |

## Testing and accessibility

| Decision | Primary source | Evidence used |
| --- | --- | --- |
| Use Vitest for pure domain and component tests | [Vitest: Features](https://vitest.dev/guide/features) and [Coverage](https://vitest.dev/guide/coverage.html) | Vitest shares Vite transforms, supports TypeScript, browser mode, and V8 coverage with explicit include rules. |
| Use Playwright for integrated browser workflows | [Playwright: Writing Tests](https://playwright.dev/docs/writing-tests) | Playwright provides isolated tests, actionability waiting, and web-first assertions suitable for keyboard, persistence, and responsive workflows. |
| Target WCAG 2.2 AA with a semantic alternative to the canvas | [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) | The standard covers keyboard access, focus, reflow, contrast, target size, status, and input assistance. FlowLens treats the synchronized form/table workspace as required functionality, not a canvas label. |

## Version snapshot

The following registry versions and compatibility ranges were checked with `npm view` on 2026-08-24:

- Node.js runtime in the repository environment: `24.17.0`; npm: `11.13.0`.
- React and React DOM: `19.2.8`.
- Vite: `8.2.2`; `@vitejs/plugin-react`: `6.1.0`.
- React Router: `8.3.0`.
- Three.js: `0.185.1`; React Three Fiber: `9.7.0`; Drei: `10.7.8`.
- TypeScript: `6.0.3`. TypeScript `7.0.2` was rejected because `@typescript-eslint/parser@8.68.0` currently declares support only below TypeScript 6.1.
- Zod: `4.4.3`; Dexie: `4.4.5`; Zustand: `5.0.15`.
- Vitest: `4.1.11`; Playwright: `1.62.1`.

Exact installed versions are recorded by `package-lock.json`; this snapshot explains why the initial ranges were chosen.
