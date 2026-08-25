import { describe, expect, it } from "vitest";
import { WORLD_FRAME_VERSION } from "./spatial";
import { parseProject } from "./project-schema";
import { minimalProject } from "../../tests/fixtures/minimal-project";

function invalidResult(input: unknown) {
  const result = parseProject(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected invalid project input");
  }
  return result.error;
}

function setAtPath(
  input: object,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const finalSegment = path.at(-1);
  if (finalSegment === undefined) {
    throw new Error("A mutation path must not be empty.");
  }

  let current: unknown = input;
  for (const segment of path.slice(0, -1)) {
    if (current === null || typeof current !== "object") {
      throw new Error("A mutation path must resolve to an object.");
    }
    current = (current as Record<string, unknown>)[String(segment)];
  }
  if (current === null || typeof current !== "object") {
    throw new Error("A mutation path must resolve to an object.");
  }
  (current as Record<string, unknown>)[String(finalSegment)] = value;
}

describe("canonical project schema", () => {
  it("parses the deterministic synthetic fixture without mutating it", () => {
    const input = structuredClone(minimalProject);
    const original = structuredClone(input);

    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(input).toEqual(original);
    expect(result.value.schemaVersion).toBe("flowlens-project-v1");
    expect(result.value.rooms[0]?.frameVersion).toBe(WORLD_FRAME_VERSION);
    expect(result.value.rooms[0]?.heightMetres).toBe(2.4);
    expect(result.value.rooms[0]?.entities[0]?.transform.rotation).toEqual({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
    });
  });

  it("keeps every evidence category distinct at the canonical boundary", () => {
    const result = parseProject(structuredClone(minimalProject));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(result.value.claims.map((claim) => claim.category)).toEqual([
      "OBSERVED",
      "MEASURED",
      "USER_ENTERED",
      "INFERRED",
      "SIMULATED",
      "ASSUMED",
      "PREDICTED",
      "RECOMMENDED",
    ]);
  });

  it("normalizes output IDs, SI units, and transforms through Task 3 constructors", () => {
    const input = structuredClone(minimalProject);
    setAtPath(
      input,
      ["rooms", 0, "entities", 0, "transform", "position", "x"],
      -0,
    );
    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(result.value.projectId).toBe("project-synthetic-001");
    expect(
      Object.is(result.value.rooms[0]?.entities[0]?.transform.position.x, -0),
    ).toBe(false);
    expect(result.value.claims[0]?.quantity.unit).toBe("m");
  });

  it("rejects an unknown schema version with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["schemaVersion"], "future-project-v2");

    const error = invalidResult(input);

    expect(error.code).toBe("UNKNOWN_SCHEMA_VERSION");
    expect(error.path).toEqual(["schemaVersion"]);
  });

  it("rejects a non-positive room height with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["rooms", 0, "heightMetres"], 0);

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_ROOM_HEIGHT");
    expect(error.path).toEqual(["rooms", 0, "heightMetres"]);
  });

  it("rejects a zero quaternion with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["rooms", 0, "entities", 0, "transform", "rotation"], {
      x: 0,
      y: 0,
      z: 0,
      w: 0,
    });

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_QUATERNION");
    expect(error.path).toEqual([
      "rooms",
      0,
      "entities",
      0,
      "transform",
      "rotation",
    ]);
  });

  it.each([-0.01, 1.01])(
    "rejects out-of-range claim confidence %s with a stable code",
    (confidence) => {
      const input = structuredClone(minimalProject);
      setAtPath(input, ["claims", 0, "confidence"], confidence);

      const error = invalidResult(input);

      expect(error.code).toBe("INVALID_CLAIM_CONFIDENCE");
      expect(error.path).toEqual(["claims", 0, "confidence"]);
    },
  );

  it("rejects a recommendation without its recommendation derivation", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 7, "derivation"], null);

    const error = invalidResult(input);

    expect(error.code).toBe("MISSING_RECOMMENDATION_DERIVATION");
    expect(error.path).toEqual(["claims", 7, "derivation"]);
  });

  it("rejects a recommendation derivation on another evidence category", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 0, "derivation"], {
      kind: "RECOMMENDATION",
      runId: "run-synthetic-001",
      modelVersion: "synthetic-zone-model-v1",
      method: "deterministic-synthetic-search",
    });

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_CLAIM_DERIVATION");
    expect(error.path).toEqual(["claims", 0, "derivation"]);
  });

  it("rejects an on-device evidence record without checksum and byte length", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["evidence", 0, "availability"], { state: "ON_DEVICE" });

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_EVIDENCE_AVAILABILITY");
    expect(error.path).toEqual(["evidence", 0, "availability"]);
  });

  it.each(["MISSING", "CORRUPT"] as const)(
    "rejects %s evidence without a revisioned availability reason",
    (state) => {
      const input = structuredClone(minimalProject);
      setAtPath(input, ["evidence", 0, "availability"], { state });

      const error = invalidResult(input);

      expect(error.code).toBe("INVALID_EVIDENCE_AVAILABILITY");
      expect(error.path).toEqual(["evidence", 0, "availability"]);
    },
  );

  it.each(["identity", "healthStatus", "diagnosis"] as const)(
    "rejects an occupant %s attribute without exposing its value",
    (forbiddenKey) => {
      const input = structuredClone(minimalProject);
      setAtPath(input, ["rooms", 0, "entities", 0], {
        type: "OCCUPANT",
        entityId: "entity-occupant-001",
        label: "Occupant marker",
        transform: {
          position: { x: 1, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        dimensions: { xMetres: 0.5, yMetres: 1.7, zMetres: 0.5 },
        geometryReference: null,
        visibility: "VISIBLE",
        locked: false,
        constraintLabels: [],
        location: { kind: "POSITION" },
        schedule: { startSecond: 0, endSecond: 3600 },
        scenarioRole: "SYNTHETIC_OCCUPANT",
        [forbiddenKey]: "DO_NOT_LEAK_SENTINEL",
      });

      const error = invalidResult(input);

      expect(error.code).toBe("FORBIDDEN_OCCUPANT_ATTRIBUTE");
      expect(error.path).toEqual(["rooms", 0, "entities", 0]);
      expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_SENTINEL");
    },
  );

  it("rejects non-finite transform coordinates with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(
      input,
      ["rooms", 0, "entities", 0, "transform", "position", "x"],
      Number.POSITIVE_INFINITY,
    );

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_TRANSFORM");
    expect(error.path).toEqual([
      "rooms",
      0,
      "entities",
      0,
      "transform",
      "position",
      "x",
    ]);
  });

  it.each([
    {
      mutate: (input: object) => {
        setAtPath(input, ["extra"], "not-allowed");
      },
      path: ["extra"],
    },
    {
      mutate: (input: object) => {
        setAtPath(input, ["rooms", 0, "boundary", "extra"], "not-allowed");
      },
      path: ["rooms", 0, "boundary", "extra"],
    },
  ])("rejects unknown fields at $path", ({ mutate, path }) => {
    const input = structuredClone(minimalProject);
    mutate(input);

    const error = invalidResult(input);

    expect(error.code).toBe("UNKNOWN_FIELD");
    expect(error.path).toEqual(path);
  });

  it("rejects raw evidence content and does not leak serialized input", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["evidence", 0, "content"], "DO_NOT_LEAK_SENTINEL");

    const error = invalidResult(input);

    expect(error.code).toBe("UNKNOWN_FIELD");
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_SENTINEL");
    expect(JSON.stringify(error)).not.toContain(
      '"content":"DO_NOT_LEAK_SENTINEL"',
    );
  });
});
