import type { JSX } from "react";

export function App(): JSX.Element {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="application-header" aria-label="FlowLens application">
        <p className="application-label">Local browser workspace</p>
      </header>
      <main id="main-content" tabIndex={-1} aria-labelledby="flowlens-title">
        <h1 id="flowlens-title">FlowLens</h1>
        <p>
          FlowLens is a research and decision-support tool for understanding
          room airflow questions.
        </p>
        <p>
          It is non-diagnostic and does not guarantee airflow outcomes,
          environmental conditions, or safety decisions.
        </p>
        <section aria-labelledby="local-browser-posture">
          <h2 id="local-browser-posture">Local browser posture</h2>
          <p>
            This initial shell does not analyze room media or store project
            information. Browser storage and private local-first workflows are
            not implemented yet.
          </p>
        </section>
      </main>
    </>
  );
}
