/// <reference types="vite/client" />

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("FlowLens could not find its application root.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
