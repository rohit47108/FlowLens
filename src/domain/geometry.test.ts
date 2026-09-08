import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SpatialEntity } from "./project-schema";
import { applyTransform, makeQuaternion, makeTransform, vec3 } from "./spatial";
import { metres } from "./units";
import { boundsForEntity, inverseTransformPoint } from "./geometry";

function genericEntity(
  transform = makeTransform({
    position: vec3(5, 1, 10),
    rotation: makeQuaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2),
    scale: vec3(2, 0.5, 1),
  }),
): SpatialEntity {
  return {
    type: "GENERIC",
    entityId: "entity-box" as SpatialEntity["entityId"],
    label: "Synthetic box",
    transform,
    dimensions: {
      xMetres: metres(2),
      yMetres: metres(4),
      zMetres: metres(6),
    },
    geometryReference: null,
    visibility: "VISIBLE",
    locked: false,
    constraintLabels: [],
    genericKind: "FURNITURE",
  };
}

describe("boundsForEntity", () => {
  it("uses a bottom-centre anchor and all tilted, non-uniformly scaled corners", () => {
    const entity = genericEntity();
    const original = structuredClone(entity);

    const bounds = boundsForEntity(entity);

    expect(bounds.min.x).toBeCloseTo(3, 12);
    expect(bounds.max.x).toBeCloseTo(5, 12);
    expect(bounds.min.y).toBeCloseTo(-1, 12);
    expect(bounds.max.y).toBeCloseTo(3, 12);
    expect(bounds.min.z).toBeCloseTo(7, 12);
    expect(bounds.max.z).toBeCloseTo(13, 12);
    expect(entity).toEqual(original);
  });
});

describe("inverseTransformPoint", () => {
  it("round-trips scale, rotation, and translation within the spatial tolerances", () => {
    const finite = fc.double({
      min: -100,
      max: 100,
      noNaN: true,
      noDefaultInfinity: true,
    });
    const positive = fc.double({
      min: 0.05,
      max: 20,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        positive,
        positive,
        positive,
        (px, py, pz, qx, qy, qz, qwRaw, x, y, z, sx, sy, sz) => {
          const qw =
            Math.abs(qx) + Math.abs(qy) + Math.abs(qz) + Math.abs(qwRaw) === 0
              ? 1
              : qwRaw;
          const transform = makeTransform({
            position: vec3(px, py, pz),
            rotation: makeQuaternion(qx, qy, qz, qw),
            scale: vec3(sx, sy, sz),
          });
          const point = vec3(metres(x), metres(y), metres(z));

          const roundTrip = inverseTransformPoint(
            transform,
            applyTransform(transform, point),
          );

          expect(roundTrip.x).toBeCloseTo(point.x, 6);
          expect(roundTrip.y).toBeCloseTo(point.y, 6);
          expect(roundTrip.z).toBeCloseTo(point.z, 6);
        },
      ),
      { seed: 20_260_904, numRuns: 100, endOnFailure: true },
    );
  });
});
