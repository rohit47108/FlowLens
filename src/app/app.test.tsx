import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("identifies FlowLens as non-diagnostic decision support", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "FlowLens" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/research and decision-support tool/i),
    ).toBeInTheDocument();
  });
});
