import { describe, expect, it } from "vitest";
import { metres } from "./units";
import {
  applyTransform,
  makeQuaternion,
  makeTransform,
  normalizeQuaternion,
  vec3,
  WORLD_FRAME_VERSION,
} from "./spatial";

describe("spatial primitives", () => {
  it("exports the immutable FlowLens world-frame version", () => {
    expect(WORLD_FRAME_VERSION).toBe("flowlens-rh-y-up-v1");
  });

  it("normalizes quaternions", () => {
    expect(normalizeQuaternion(makeQuaternion(0, 0, 0, 2))).toEqual({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
    });
  });

  it("rejects zero-magnitude quaternions", () => {
    expect(() => normalizeQuaternion(makeQuaternion(0, 0, 0, 0))).toThrow(
      "quaternion magnitude must be greater than zero",
    );
  });

  it("rejects non-finite quaternion components", () => {
    expect(() => makeQuaternion(0, 0, Number.NaN, 1)).toThrow(
      "quaternion component must be finite",
    );
  });

  it("applies transforms in scale, rotation, translation order", () => {
    const quarterTurnAroundY = makeQuaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2);
    const transform = makeTransform({
      position: vec3(metres(10), metres(5), metres(1)),
      rotation: quarterTurnAroundY,
      scale: vec3(2, 1, 1),
    });

    const transformed = applyTransform(
      transform,
      vec3(metres(1), metres(0), metres(0)),
    );

    expect(transformed.x).toBeCloseTo(10, 12);
    expect(transformed.y).toBeCloseTo(5, 12);
    expect(transformed.z).toBeCloseTo(-1, 12);
  });

  it("rejects zero or non-finite scale components", () => {
    const input = {
      position: vec3(metres(0), metres(0), metres(0)),
      rotation: makeQuaternion(0, 0, 0, 1),
      scale: vec3(0, 1, 1),
    };

    expect(() => makeTransform(input)).toThrow(
      "scale x must be greater than zero",
    );
  });
});
