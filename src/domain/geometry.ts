import type { SpatialEntity } from "./project-schema";
import { applyTransform, vec3, type Transform, type Vec3 } from "./spatial";
import { metres, type Metres } from "./units";

export interface AxisAlignedBounds {
  readonly min: Vec3<Metres>;
  readonly max: Vec3<Metres>;
}

export function inverseTransformPoint(
  transform: Transform,
  point: Vec3<Metres>,
): Vec3<Metres> {
  const x = point.x - transform.position.x;
  const y = point.y - transform.position.y;
  const z = point.z - transform.position.z;
  const { x: qx, y: qy, z: qz, w: qw } = transform.rotation;

  const ix = qw * x - qy * z + qz * y;
  const iy = qw * y - qz * x + qx * z;
  const iz = qw * z - qx * y + qy * x;
  const iw = qx * x + qy * y + qz * z;

  return vec3(
    metres((ix * qw + iw * qx + iy * qz - iz * qy) / transform.scale.x),
    metres((iy * qw + iw * qy + iz * qx - ix * qz) / transform.scale.y),
    metres((iz * qw + iw * qz + ix * qy - iy * qx) / transform.scale.z),
  );
}

export function boundsForEntity(entity: SpatialEntity): AxisAlignedBounds {
  const halfWidth = entity.dimensions.xMetres / 2;
  const height = entity.dimensions.yMetres;
  const halfDepth = entity.dimensions.zMetres / 2;
  const xs = [-halfWidth, halfWidth] as const;
  const ys = [0, height] as const;
  const zs = [-halfDepth, halfDepth] as const;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const corner = applyTransform(
          entity.transform,
          vec3(metres(x), metres(y), metres(z)),
        );
        minimumX = Math.min(minimumX, corner.x);
        minimumY = Math.min(minimumY, corner.y);
        minimumZ = Math.min(minimumZ, corner.z);
        maximumX = Math.max(maximumX, corner.x);
        maximumY = Math.max(maximumY, corner.y);
        maximumZ = Math.max(maximumZ, corner.z);
      }
    }
  }

  return {
    min: vec3(metres(minimumX), metres(minimumY), metres(minimumZ)),
    max: vec3(metres(maximumX), metres(maximumY), metres(maximumZ)),
  };
}
