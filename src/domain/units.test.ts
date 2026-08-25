import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  cadr,
  concentrationBasis,
  cost,
  cubicMetres,
  cubicMetresPerSecond,
  degrees,
  energy,
  exposureProxy,
  feetToMetres,
  metres,
  metresToFeet,
  noise,
  schedule,
  sourceRate,
  squareMetres,
  supportedUncertainty,
  threshold,
  timeSeconds,
} from "./units";
import { commandId, createProjectId, leaseFence, roomId } from "./identity";

describe("canonical units", () => {
  it("converts international feet to canonical metres exactly", () => {
    expect(feetToMetres(10)).toBeCloseTo(3.048, 12);
  });

  it("round trips finite foot values through canonical metres", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: 0.01,
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (feet) => {
          const roundTripped = metresToFeet(feetToMetres(feet));
          expect(Math.abs(roundTripped - feet) / feet).toBeLessThanOrEqual(
            1e-10,
          );
        },
      ),
    );
  });

  it("rejects non-finite length values", () => {
    expect(() => metres(Number.NaN)).toThrow("metres must be finite");
    expect(Object.is(metres(-0), -0)).toBe(false);
  });

  it("rejects non-positive volumes", () => {
    expect(() => cubicMetres(0)).toThrow("volume must be greater than zero");
    expect(() => cubicMetres(-1)).toThrow("volume must be greater than zero");
  });

  it("validates every dimensional constructor at its boundary", () => {
    expect(() => squareMetres(-1)).toThrow("area must be non-negative");
    expect(() => timeSeconds(0)).toThrow("time must be greater than zero");
    expect(() => degrees(Number.POSITIVE_INFINITY)).toThrow(
      "angle must be finite",
    );
    expect(() => cubicMetresPerSecond(-1)).toThrow(
      "volumetric flow must be non-negative",
    );
    expect(() => cadr(-1)).toThrow("CADR must be non-negative");
    expect(() => sourceRate(-1)).toThrow("source rate must be non-negative");
    expect(() => concentrationBasis(-1)).toThrow(
      "concentration basis must be non-negative",
    );
    expect(() => threshold(-1)).toThrow("threshold must be non-negative");
    expect(() => exposureProxy(-1)).toThrow(
      "exposure proxy must be non-negative",
    );
    expect(() => schedule(-1)).toThrow("schedule must be non-negative");
    expect(() => energy(-1)).toThrow("energy must be non-negative");
    expect(() => noise(-1)).toThrow("noise must be non-negative");
    expect(() => cost(2, "")).toThrow("currency must be a non-empty string");
  });

  it("preserves boundary conversion provenance without boxing canonical numbers", () => {
    const result = feetToMetres.withProvenance(10, 0.125);

    expect(result).toEqual({
      canonical: 3.048,
      source: { value: 10, unit: "ft", precision: 0.125 },
    });
    expect(typeof result.canonical).toBe("number");
  });

  it("validates supported uncertainty variants", () => {
    expect(
      supportedUncertainty({ kind: "interval", lower: 1, upper: 2 }),
    ).toEqual({ kind: "interval", lower: 1, upper: 2 });
    expect(() =>
      supportedUncertainty({ kind: "interval", lower: 2, upper: 1 }),
    ).toThrow("uncertainty interval lower bound must not exceed upper bound");
    expect(() =>
      supportedUncertainty({ kind: "standard-deviation", value: -1 }),
    ).toThrow("uncertainty standard deviation must be non-negative");
  });
});

describe("deterministic identity construction", () => {
  it("brands non-empty values supplied by caller-owned factories", () => {
    const factory = () => "project-001";

    expect(createProjectId(factory)).toBe("project-001");
    expect(roomId(() => "room-001")).toBe("room-001");
    expect(commandId(() => "command-001")).toBe("command-001");
  });

  it("rejects empty identity output and invalid fencing state", () => {
    expect(() => createProjectId(() => "")).toThrow(
      "project ID must be non-empty",
    );
    expect(() => leaseFence(-1)).toThrow(
      "lease fence must be a non-negative safe integer",
    );
    expect(() => leaseFence(1.5)).toThrow(
      "lease fence must be a non-negative safe integer",
    );
    expect(() => leaseFence(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "lease fence must be a non-negative safe integer",
    );
  });
});
