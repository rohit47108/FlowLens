import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Room, SpatialEntity } from "./project-schema";
import { makeQuaternion, makeTransform, vec3 } from "./spatial";
import { metres } from "./units";
import {
  ConstraintEvaluator,
  type ConstraintContext,
  type DeviceRequirement,
} from "./constraints";

type EntityOverrides = Partial<SpatialEntity> & {
  readonly transform?: SpatialEntity["transform"];
  readonly dimensions?: SpatialEntity["dimensions"];
};

function entity(
  id: string,
  x: number,
  y: number,
  z: number,
  overrides: EntityOverrides = {},
): SpatialEntity {
  return {
    type: "GENERIC",
    entityId: id as SpatialEntity["entityId"],
    label: id,
    transform: makeTransform({
      position: vec3(x, y, z),
      rotation: makeQuaternion(0, 0, 0, 1),
      scale: vec3(1, 1, 1),
    }),
    dimensions: {
      xMetres: metres(1),
      yMetres: metres(1),
      zMetres: metres(1),
    },
    geometryReference: null,
    visibility: "VISIBLE",
    locked: false,
    constraintLabels: [],
    genericKind: "FURNITURE",
    ...overrides,
  } as SpatialEntity;
}

function device(
  id: string,
  x: number,
  y: number,
  z: number,
  overrides: EntityOverrides = {},
): SpatialEntity {
  return {
    ...entity(id, x, y, z),
    type: "DEVICE",
    deviceKind: "PURIFIER",
    operatingState: "OFF",
    ...overrides,
  } as SpatialEntity;
}

function opening(
  id: string,
  x: number,
  z: number,
  rotation = makeQuaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2),
): SpatialEntity {
  return {
    ...entity(id, x, 0, z),
    type: "OPENING",
    openingKind: "WINDOW",
    state: "CLOSED",
    transform: makeTransform({
      position: vec3(x, 0, z),
      rotation,
      scale: vec3(1, 1, 1),
    }),
    dimensions: {
      xMetres: metres(1),
      yMetres: metres(2),
      zMetres: metres(0.1),
    },
  } as SpatialEntity;
}

function room(entities: readonly SpatialEntity[] = []): Room {
  return {
    roomId: "room-synthetic" as Room["roomId"],
    revisionId: "revision-synthetic" as Room["revisionId"],
    label: "Synthetic room",
    frameVersion: "flowlens-rh-y-up-v1",
    unitSystem: "SI",
    heightMetres: metres(3),
    boundary: {
      kind: "RECTANGULAR",
      widthMetres: metres(10),
      depthMetres: metres(8),
    },
    entities,
    activeModelReference: null,
  };
}

const emptyContext: ConstraintContext = {
  wallAttachments: [],
  deviceRequirements: [],
  outlets: [],
  nonSolidEntityIds: [],
  overridePermissions: [],
  overrideRequests: [],
};

function requirement(
  entityId: string,
  outlet: DeviceRequirement["outlet"] = {
    state: "UNKNOWN",
  },
): DeviceRequirement {
  return {
    entityId: entityId as SpatialEntity["entityId"],
    clearance: {
      minXMetres: metres(0.5),
      maxXMetres: metres(0.5),
      minYMetres: metres(0),
      maxYMetres: metres(0.5),
      minZMetres: metres(0.5),
      maxZMetres: metres(0.5),
    },
    evidenceIds: ["evidence-requirement" as never],
    claimIds: [],
    outlet,
  };
}

function codes(report: ReturnType<typeof ConstraintEvaluator.evaluate>) {
  return report.violations.map((violation) => violation.code);
}

describe("ConstraintEvaluator.evaluate", () => {
  it.each([
    { label: "zero", value: 0 },
    { label: "negative", value: -1 },
  ])("returns INVALID_DIMENSIONS for $label dimensions", ({ value }) => {
    const proposed = entity("entity-proposed", 2, 0, 2, {
      dimensions: {
        xMetres: value,
        yMetres: 1,
        zMetres: 1,
      } as SpatialEntity["dimensions"],
    });

    expect(
      codes(ConstraintEvaluator.evaluate(room(), proposed, emptyContext)),
    ).toContain("INVALID_DIMENSIONS");
  });

  it.each([
    {
      label: "non-finite position",
      proposed: {
        ...entity("entity-proposed", 2, 0, 2),
        transform: {
          ...entity("temporary", 2, 0, 2).transform,
          position: { x: Number.NaN, y: 0, z: 2 },
        },
      } as SpatialEntity,
      code: "NON_FINITE_VALUE",
    },
    {
      label: "zero rotation",
      proposed: entity("entity-proposed", 2, 0, 2, {
        transform: {
          ...entity("temporary", 2, 0, 2).transform,
          rotation: { x: 0, y: 0, z: 0, w: 0 },
        } as SpatialEntity["transform"],
      }),
      code: "INVALID_ROTATION",
    },
  ])("returns $code for a $label without throwing", ({ proposed, code }) => {
    expect(() =>
      ConstraintEvaluator.evaluate(room(), proposed, emptyContext),
    ).not.toThrow();
    expect(
      codes(ConstraintEvaluator.evaluate(room(), proposed, emptyContext)),
    ).toContain(code);
  });

  it("rejects invalid room geometry before geometry calculations", () => {
    const invalidRoom = {
      ...room(),
      boundary: { kind: "RECTANGULAR", widthMetres: 0, depthMetres: 8 },
    } as Room;

    expect(
      codes(
        ConstraintEvaluator.evaluate(
          invalidRoom,
          entity("p", 2, 0, 2),
          emptyContext,
        ),
      ),
    ).toContain("INVALID_ROOM_GEOMETRY");
  });

  it("reports an entity that exits the room boundary", () => {
    const report = ConstraintEvaluator.evaluate(
      room(),
      entity("entity-proposed", 0.4, 0, 2),
      emptyContext,
    );

    expect(report.isFeasible).toBe(false);
    expect(codes(report)).toContain("ROOM_BOUNDS");
  });

  it("reports conservative box overlap with hidden solids", () => {
    const hidden = entity("entity-hidden", 2, 0, 2, { visibility: "HIDDEN" });
    const report = ConstraintEvaluator.evaluate(
      room([hidden]),
      entity("entity-proposed", 2.25, 0, 2),
      emptyContext,
    );

    expect(codes(report)).toContain("COLLISION");
    expect(report.warnings.map((warning) => warning.code)).toContain(
      "CONSERVATIVE_COLLISION",
    );
  });

  it("does not collide on tangent contact or with an explicitly non-solid ID", () => {
    const existing = entity("entity-existing", 2, 0, 2);
    const tangent = ConstraintEvaluator.evaluate(
      room([existing]),
      entity("entity-tangent", 3, 0, 2),
      emptyContext,
    );
    const nonSolid = ConstraintEvaluator.evaluate(
      room([existing]),
      entity("entity-overlap", 2, 0, 2),
      { ...emptyContext, nonSolidEntityIds: [existing.entityId] },
    );

    expect(codes(tangent)).not.toContain("COLLISION");
    expect(codes(nonSolid)).not.toContain("COLLISION");
  });

  it("requires a wall attachment and validates all four outward-face corners", () => {
    const proposed = opening("opening-proposed", 0.05, 2);
    const missing = ConstraintEvaluator.evaluate(
      room(),
      proposed,
      emptyContext,
    );
    const attached = ConstraintEvaluator.evaluate(room(), proposed, {
      ...emptyContext,
      wallAttachments: [{ entityId: proposed.entityId, wall: "MIN_X" }],
    });
    const cornerOnly = opening(
      "opening-corner",
      0.05,
      2,
      makeQuaternion(0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)),
    );

    expect(codes(missing)).toContain("WALL_ATTACHMENT");
    expect(codes(attached)).not.toContain("WALL_ATTACHMENT");
    expect(
      codes(
        ConstraintEvaluator.evaluate(room(), cornerOnly, {
          ...emptyContext,
          wallAttachments: [{ entityId: cornerOnly.entityId, wall: "MIN_X" }],
        }),
      ),
    ).toContain("WALL_ATTACHMENT");
  });

  it("accepts either local-Z sign for a wall-normal opening", () => {
    const proposed = opening(
      "opening-proposed",
      0.05,
      2,
      makeQuaternion(0, -Math.SQRT1_2, 0, Math.SQRT1_2),
    );

    const report = ConstraintEvaluator.evaluate(room(), proposed, {
      ...emptyContext,
      wallAttachments: [{ entityId: proposed.entityId, wall: "MIN_X" }],
    });

    expect(codes(report)).not.toContain("WALL_ATTACHMENT");
  });

  it("uses the existing entity lock authoritatively and permits display-only changes", () => {
    const existing = entity("entity-locked", 2, 0, 2, { locked: true });
    const moved = entity("entity-locked", 2.001, 0, 2, { locked: false });
    const displayOnly = {
      ...existing,
      label: "Renamed",
      visibility: "HIDDEN",
    } as SpatialEntity;

    expect(
      codes(
        ConstraintEvaluator.evaluate(room([existing]), moved, emptyContext),
      ),
    ).toContain("LOCKED_MUTATION");
    expect(
      codes(
        ConstraintEvaluator.evaluate(
          room([existing]),
          displayOnly,
          emptyContext,
        ),
      ),
    ).not.toContain("LOCKED_MUTATION");
  });

  it("treats an exact negated quaternion as the same locked rotation", () => {
    const existing = entity("entity-locked", 2, 0, 2, { locked: true });
    const proposed = {
      ...existing,
      locked: false,
      transform: {
        ...existing.transform,
        rotation: { x: 0, y: 0, z: 0, w: -1 },
      },
    } as SpatialEntity;

    expect(
      codes(
        ConstraintEvaluator.evaluate(room([existing]), proposed, emptyContext),
      ),
    ).not.toContain("LOCKED_MUTATION");
  });

  it("enforces proposed device clearance against obstacles and room surfaces", () => {
    const proposed = device("device-proposed", 0.75, 0, 3);
    const obstacle = entity("entity-obstacle", 1.6, 0, 3);
    const report = ConstraintEvaluator.evaluate(room([obstacle]), proposed, {
      ...emptyContext,
      deviceRequirements: [requirement(proposed.entityId)],
    });

    expect(codes(report)).toContain("DEVICE_CLEARANCE");
    expect(
      report.violations.some(
        (violation) =>
          violation.code === "DEVICE_CLEARANCE" &&
          violation.entityIds.includes(obstacle.entityId),
      ),
    ).toBe(true);
  });

  it("enforces existing-device clearance when a non-device moves into it", () => {
    const existingDevice = device("device-existing", 5, 0, 3);
    const report = ConstraintEvaluator.evaluate(
      room([existingDevice]),
      entity("entity-proposed", 6, 0, 3),
      {
        ...emptyContext,
        deviceRequirements: [requirement(existingDevice.entityId)],
      },
    );

    expect(codes(report)).not.toContain("COLLISION");
    expect(codes(report)).toContain("DEVICE_CLEARANCE");
  });

  it("warns stably when device requirements are missing", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const report = ConstraintEvaluator.evaluate(room(), proposed, emptyContext);

    expect(report.isFeasible).toBe(true);
    expect(report.warnings.map((warning) => warning.code)).toContain(
      "DEVICE_REQUIREMENTS_UNASSESSED",
    );
  });

  it("checks required outlet reach from the transformed local connector", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const required = requirement(proposed.entityId, {
      state: "REQUIRED",
      connectorLocalPosition: vec3(metres(0.5), metres(0.5), metres(0)),
      cableLengthMetres: metres(2),
      eligibleOutletIds: ["outlet-a", "outlet-b"],
    });
    const report = ConstraintEvaluator.evaluate(room(), proposed, {
      ...emptyContext,
      deviceRequirements: [required],
      outlets: [
        {
          outletId: "outlet-a",
          position: vec3(metres(7), metres(0.5), metres(3)),
          evidenceIds: ["evidence-outlet" as never],
          claimIds: [],
        },
        {
          outletId: "outlet-b",
          position: vec3(metres(6), metres(0.5), metres(3)),
          evidenceIds: ["evidence-outlet" as never],
          claimIds: [],
        },
      ],
    });

    expect(codes(report)).toContain("OUTLET_REACH");
    expect(report.warnings.map((warning) => warning.code)).toContain(
      "STRAIGHT_LINE_CABLE",
    );
  });

  it("accepts any one eligible reachable outlet", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const report = ConstraintEvaluator.evaluate(room(), proposed, {
      ...emptyContext,
      deviceRequirements: [
        requirement(proposed.entityId, {
          state: "REQUIRED",
          connectorLocalPosition: vec3(metres(0), metres(0.5), metres(0)),
          cableLengthMetres: metres(2),
          eligibleOutletIds: ["outlet-far", "outlet-near"],
        }),
      ],
      outlets: [
        {
          outletId: "outlet-far",
          position: vec3(metres(9), metres(0.5), metres(3)),
          evidenceIds: ["evidence-far" as never],
          claimIds: [],
        },
        {
          outletId: "outlet-near",
          position: vec3(metres(4), metres(0.5), metres(3)),
          evidenceIds: ["evidence-near" as never],
          claimIds: [],
        },
      ],
    });

    expect(codes(report)).not.toContain("OUTLET_REACH");
    expect(report.warnings.map((warning) => warning.code)).toContain(
      "STRAIGHT_LINE_CABLE",
    );
  });

  it("reports OUTLET_REACH when no eligible outlets are supplied", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const report = ConstraintEvaluator.evaluate(room(), proposed, {
      ...emptyContext,
      deviceRequirements: [
        requirement(proposed.entityId, {
          state: "REQUIRED",
          connectorLocalPosition: vec3(metres(0), metres(0.5), metres(0)),
          cableLengthMetres: metres(2),
          eligibleOutletIds: [],
        }),
      ],
    });

    expect(codes(report)).toContain("OUTLET_REACH");
  });

  it("requires provenance when outlet power is declared NOT_REQUIRED", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const missingProvenance = {
      ...requirement(proposed.entityId, { state: "NOT_REQUIRED" }),
      evidenceIds: [],
      claimIds: [],
    };

    expect(
      codes(
        ConstraintEvaluator.evaluate(room(), proposed, {
          ...emptyContext,
          deviceRequirements: [missingProvenance],
        }),
      ),
    ).toContain("INVALID_CONTEXT");
  });

  it("returns INVALID_CONTEXT for malformed numeric context and unresolved outlets", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const malformed = {
      ...emptyContext,
      deviceRequirements: [
        {
          ...requirement(proposed.entityId, {
            state: "REQUIRED",
            connectorLocalPosition: vec3(metres(0), metres(0), metres(0)),
            cableLengthMetres: metres(2),
            eligibleOutletIds: ["missing-outlet"],
          }),
          clearance: {
            ...requirement(proposed.entityId).clearance,
            maxXMetres: Number.NaN,
          },
        },
      ],
    } as unknown as ConstraintContext;

    expect(
      codes(ConstraintEvaluator.evaluate(room(), proposed, malformed)),
    ).toContain("INVALID_CONTEXT");
  });

  it("returns NON_FINITE_VALUE when finite dimensions overflow transformed bounds", () => {
    const proposed = entity("entity-proposed", 1, 0, 1, {
      dimensions: {
        xMetres: metres(1),
        yMetres: metres(1e308),
        zMetres: metres(1),
      },
      transform: makeTransform({
        position: vec3(1, 0, 1),
        rotation: makeQuaternion(0, 0, 0, 1),
        scale: vec3(1, 2, 1),
      }),
    });
    const hugeRoom = {
      ...room(),
      heightMetres: metres(1e308),
    } as Room;

    expect(() =>
      ConstraintEvaluator.evaluate(hugeRoom, proposed, emptyContext),
    ).not.toThrow();
    expect(
      codes(ConstraintEvaluator.evaluate(hugeRoom, proposed, emptyContext)),
    ).toContain("NON_FINITE_VALUE");
  });

  it("returns NON_FINITE_VALUE when finite clearance expansion overflows", () => {
    const proposed = device("device-proposed", 5e307, 0, 3, {
      dimensions: {
        xMetres: metres(1e308),
        yMetres: metres(1),
        zMetres: metres(1),
      },
    });
    const hugeRoom = {
      ...room(),
      boundary: {
        kind: "RECTANGULAR",
        widthMetres: metres(1e308),
        depthMetres: metres(8),
      },
    } as Room;
    const deviceRequirement = {
      ...requirement(proposed.entityId),
      clearance: {
        minXMetres: metres(0),
        maxXMetres: metres(1e308),
        minYMetres: metres(0),
        maxYMetres: metres(0),
        minZMetres: metres(0),
        maxZMetres: metres(0),
      },
    };
    const context = {
      ...emptyContext,
      deviceRequirements: [deviceRequirement],
    };

    expect(() =>
      ConstraintEvaluator.evaluate(hugeRoom, proposed, context),
    ).not.toThrow();
    expect(
      codes(ConstraintEvaluator.evaluate(hugeRoom, proposed, context)),
    ).toContain("NON_FINITE_VALUE");
  });

  it("returns NON_FINITE_VALUE when a finite connector transform overflows", () => {
    const proposed = device("device-proposed", 3, 0, 3, {
      transform: makeTransform({
        position: vec3(3, 0, 3),
        rotation: makeQuaternion(0, 0, 0, 1),
        scale: vec3(2, 1, 1),
      }),
    });
    const context = {
      ...emptyContext,
      deviceRequirements: [
        requirement(proposed.entityId, {
          state: "REQUIRED",
          connectorLocalPosition: vec3(metres(1e308), metres(0), metres(0)),
          cableLengthMetres: metres(1),
          eligibleOutletIds: [],
        }),
      ],
    };

    expect(() =>
      ConstraintEvaluator.evaluate(room(), proposed, context),
    ).not.toThrow();
    expect(
      codes(ConstraintEvaluator.evaluate(room(), proposed, context)),
    ).toContain("NON_FINITE_VALUE");
  });

  it("returns NON_FINITE_VALUE when a finite outlet delta overflows", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const context: ConstraintContext = {
      ...emptyContext,
      deviceRequirements: [
        requirement(proposed.entityId, {
          state: "REQUIRED",
          connectorLocalPosition: vec3(metres(1e308), metres(0), metres(0)),
          cableLengthMetres: metres(1),
          eligibleOutletIds: ["outlet-far"],
        }),
      ],
      outlets: [
        {
          outletId: "outlet-far",
          position: vec3(metres(-1e308), metres(0), metres(0)),
          evidenceIds: ["evidence-outlet" as never],
          claimIds: [],
        },
      ],
    };

    const report = ConstraintEvaluator.evaluate(room(), proposed, context);

    expect(codes(report)).toContain("NON_FINITE_VALUE");
    expect(codes(report)).not.toContain("OUTLET_REACH");
  });

  it("rejects malformed provenance reference IDs as INVALID_CONTEXT", () => {
    const proposed = device("device-proposed", 3, 0, 3);
    const malformed = {
      ...requirement(proposed.entityId),
      evidenceIds: ["bad reference"],
    } as unknown as DeviceRequirement;

    expect(
      codes(
        ConstraintEvaluator.evaluate(room(), proposed, {
          ...emptyContext,
          deviceRequirements: [malformed],
        }),
      ),
    ).toContain("INVALID_CONTEXT");
  });

  it("demotes only an authorized matching collision and retains its details and normalized reason", () => {
    const existing = entity("entity-b", 2, 0, 2);
    const proposed = entity("entity-a", 2.25, 0, 2);
    const report = ConstraintEvaluator.evaluate(room([existing]), proposed, {
      ...emptyContext,
      overridePermissions: [
        {
          code: "COLLISION",
          entityIds: [existing.entityId, proposed.entityId],
        },
      ],
      overrideRequests: [
        {
          code: "COLLISION",
          entityIds: [proposed.entityId, existing.entityId],
          reason: "  Reviewed temporary overlap  ",
        },
      ],
    });

    expect(report.isFeasible).toBe(true);
    expect(codes(report)).not.toContain("COLLISION");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: "COLLISION_OVERRIDDEN",
        reason: "Reviewed temporary overlap",
        violation: expect.objectContaining({
          code: "COLLISION",
          entityIds: [proposed.entityId, existing.entityId],
        }),
      }),
    );
  });

  it.each([
    { label: "unmatched", reason: "No collision exists", duplicate: false },
    { label: "duplicate", reason: "Known collision", duplicate: true },
    { label: "control", reason: "Bad\u0000reason", duplicate: false },
  ])(
    "rejects $label override requests as INVALID_CONTEXT",
    ({ reason, duplicate }) => {
      const existing = entity("entity-b", 2, 0, 2);
      const proposed = entity("entity-a", duplicate ? 2.25 : 5, 0, 2);
      const permission = {
        code: "COLLISION" as const,
        entityIds: [existing.entityId, proposed.entityId] as const,
      };
      const request = { ...permission, reason };
      const report = ConstraintEvaluator.evaluate(room([existing]), proposed, {
        ...emptyContext,
        overridePermissions: duplicate
          ? [permission, permission]
          : [permission],
        overrideRequests: [request],
      });

      expect(codes(report)).toContain("INVALID_CONTEXT");
    },
  );

  it("sorts violations by code then code-unit entity IDs without mutating inputs", () => {
    const existing = entity("entity-Z", 0.4, 0, 2);
    const proposed = device("entity-a", 0.4, 0, 2);
    const context: ConstraintContext = {
      ...emptyContext,
      deviceRequirements: [requirement(proposed.entityId)],
    };
    const inputRoom = room([existing]);
    const originalRoom = structuredClone(inputRoom);
    const originalEntity = structuredClone(proposed);
    const originalContext = structuredClone(context);

    const report = ConstraintEvaluator.evaluate(inputRoom, proposed, context);
    const keys = report.violations.map(
      (violation) => `${violation.code}:${violation.entityIds.join(":")}`,
    );

    expect(keys).toEqual([...keys].sort());
    expect(inputRoom).toEqual(originalRoom);
    expect(proposed).toEqual(originalEntity);
    expect(context).toEqual(originalContext);
  });

  it("is deterministic and mutation-free for fixed-seed tangent placements", () => {
    const existing = entity("entity-existing", 2, 0, 2);

    fc.assert(
      fc.property(
        fc.constantFrom(-1, 1),
        fc.double({ min: 0, max: 1e-7, noNaN: true, noDefaultInfinity: true }),
        (direction, delta) => {
          const proposed = entity(
            "entity-proposed",
            2 + direction * (1 + delta),
            0,
            2,
          );
          const inputRoom = room([existing]);
          const original = structuredClone({
            inputRoom,
            proposed,
            emptyContext,
          });

          const first = ConstraintEvaluator.evaluate(
            inputRoom,
            proposed,
            emptyContext,
          );
          const second = ConstraintEvaluator.evaluate(
            inputRoom,
            proposed,
            emptyContext,
          );

          expect(first).toEqual(second);
          expect(codes(first)).not.toContain("COLLISION");
          expect({ inputRoom, proposed, emptyContext }).toEqual(original);
        },
      ),
      { seed: 20_260_906, numRuns: 64, endOnFailure: true },
    );
  });
});
