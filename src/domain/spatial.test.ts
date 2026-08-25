import { describe, expect, it } from "vitest";
import { metres } from "./units";
import {
  applyTransform,
  makeQuaternion,
  makeTransform,
  normalizeQuaternion,
  vec3,
  WORLD_FRAME,
  WORLD_FRAME_VERSION,
} from "./spatial";

describe("spatial primitives", () => {
  it("exports an authoritative FlowLens world-frame declaration", () => {
    expect(WORLD_FRAME_VERSION).toBe("flowlens-rh-y-up-v1");
    expect(WORLD_FRAME).toEqual({
      version: WORLD_FRAME_VERSION,
      handedness: "right-handed",
      axes: {
        x: { direction: "+X", semantic: "room-east-right" },
        y: { direction: "+Y", semantic: "up" },
        z: {
          direction: "+Z",
          semantic: "room-south-default-isometric-camera",
        },
      },
      origin: {
        plane: "floor",
        xBoundary: "minimum",
        zBoundary: "minimum",
      },
      transformOrder: ["scale", "rotation", "translation"],
    });
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

  it("normalizes very large finite quaternions without overflow", () => {
    const normalized = normalizeQuaternion(
      makeQuaternion(
        Number.MAX_VALUE,
        Number.MAX_VALUE,
        Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
    );

    expect(normalized).toEqual({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 });
    expect(
      Math.hypot(normalized.x, normalized.y, normalized.z, normalized.w),
    ).toBeCloseTo(1, 12);
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

  it("canonicalizes finite transform positions into branded metres", () => {
    const transform = makeTransform({
      position: vec3(-0, 2, -3),
      rotation: makeQuaternion(0, 0, 0, 1),
      scale: vec3(1, 1, 1),
    });

    expect(transform.position).toEqual({ x: 0, y: 2, z: -3 });
    expect(Object.is(transform.position.x, -0)).toBe(false);
  });

  it("rejects non-finite transform positions", () => {
    const input = {
      position: vec3(Number.NaN, 0, 0),
      rotation: makeQuaternion(0, 0, 0, 1),
      scale: vec3(1, 1, 1),
    };

    expect(() => makeTransform(input)).toThrow("metres must be finite");
    expect(() =>
      makeTransform({
        ...input,
        position: vec3(0, Number.POSITIVE_INFINITY, 0),
      }),
    ).toThrow("metres must be finite");
  });
});
