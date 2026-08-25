import { metres, type Metres } from "./units";

declare const normalizedQuaternionBrand: unique symbol;
declare const scaleBrand: unique symbol;

export const WORLD_FRAME_VERSION = "flowlens-rh-y-up-v1";

export const WORLD_FRAME = Object.freeze({
  version: WORLD_FRAME_VERSION,
  handedness: "right-handed",
  axes: Object.freeze({
    x: Object.freeze({ direction: "+X", semantic: "room-east-right" }),
    y: Object.freeze({ direction: "+Y", semantic: "up" }),
    z: Object.freeze({
      direction: "+Z",
      semantic: "room-south-default-isometric-camera",
    }),
  }),
  origin: Object.freeze({
    plane: "floor",
    xBoundary: "minimum",
    zBoundary: "minimum",
  }),
  transformOrder: Object.freeze(["scale", "rotation", "translation"]),
});

export type Vec3<T> = Readonly<{
  x: T;
  y: T;
  z: T;
}>;

export type Quaternion = Readonly<{
  x: number;
  y: number;
  z: number;
  w: number;
}>;

type NormalizedQuaternion = Quaternion & {
  readonly [normalizedQuaternionBrand]: "normalized-quaternion";
};

type Scale = number & {
  readonly [scaleBrand]: "scale";
};

export type Transform = Readonly<{
  position: Vec3<Metres>;
  rotation: NormalizedQuaternion;
  scale: Vec3<Scale>;
}>;

export type TransformInput = Readonly<{
  position: Vec3<number>;
  rotation: Quaternion;
  scale: Vec3<number>;
}>;

export function vec3<T>(x: T, y: T, z: T): Vec3<T> {
  return { x, y, z };
}

function finiteComponent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("quaternion component must be finite");
  }

  return value === 0 ? 0 : value;
}

export function makeQuaternion(
  x: number,
  y: number,
  z: number,
  w: number,
): Quaternion {
  return {
    x: finiteComponent(x),
    y: finiteComponent(y),
    z: finiteComponent(z),
    w: finiteComponent(w),
  };
}

export function normalizeQuaternion(
  quaternion: Quaternion,
): NormalizedQuaternion {
  const maximumComponent = Math.max(
    Math.abs(quaternion.x),
    Math.abs(quaternion.y),
    Math.abs(quaternion.z),
    Math.abs(quaternion.w),
  );
  if (maximumComponent === 0) {
    throw new Error("quaternion magnitude must be greater than zero");
  }

  const x = quaternion.x / maximumComponent;
  const y = quaternion.y / maximumComponent;
  const z = quaternion.z / maximumComponent;
  const w = quaternion.w / maximumComponent;
  const scaledMagnitude = Math.hypot(x, y, z, w);

  return makeQuaternion(
    x / scaledMagnitude,
    y / scaledMagnitude,
    z / scaledMagnitude,
    w / scaledMagnitude,
  ) as NormalizedQuaternion;
}

function positiveScale(value: number, component: "x" | "y" | "z"): Scale {
  if (!Number.isFinite(value)) {
    throw new Error(`scale ${component} must be finite`);
  }
  if (value <= 0) {
    throw new Error(`scale ${component} must be greater than zero`);
  }

  return value as Scale;
}

export function makeTransform({
  position,
  rotation,
  scale,
}: TransformInput): Transform {
  return {
    position: vec3(metres(position.x), metres(position.y), metres(position.z)),
    rotation: normalizeQuaternion(rotation),
    scale: vec3(
      positiveScale(scale.x, "x"),
      positiveScale(scale.y, "y"),
      positiveScale(scale.z, "z"),
    ),
  };
}

export function applyTransform(
  transform: Transform,
  point: Vec3<Metres>,
): Vec3<Metres> {
  const x = point.x * transform.scale.x;
  const y = point.y * transform.scale.y;
  const z = point.z * transform.scale.z;
  const { x: qx, y: qy, z: qz, w: qw } = transform.rotation;

  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return vec3(
    metres(ix * qw + iw * -qx + iy * -qz - iz * -qy + transform.position.x),
    metres(iy * qw + iw * -qy + iz * -qx - ix * -qz + transform.position.y),
    metres(iz * qw + iw * -qz + ix * -qy - iy * -qx + transform.position.z),
  );
}
