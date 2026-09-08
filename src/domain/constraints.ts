import type { ClaimId, EntityId, EvidenceId } from "./identity";
import type { Room, SpatialEntity } from "./project-schema";
import { applyTransform, vec3, type Vec3 } from "./spatial";
import { metres, type Metres } from "./units";
import { boundsForEntity, type AxisAlignedBounds } from "./geometry";

const GEOMETRIC_TOLERANCE_METRES = 1e-6;
const ROTATION_TOLERANCE = 1e-7;

export const CONSTRAINT_CODES = Object.freeze({
  INVALID_DIMENSIONS: "INVALID_DIMENSIONS",
  NON_FINITE_VALUE: "NON_FINITE_VALUE",
  INVALID_ROTATION: "INVALID_ROTATION",
  INVALID_CONTEXT: "INVALID_CONTEXT",
  INVALID_ROOM_GEOMETRY: "INVALID_ROOM_GEOMETRY",
  LOCKED_MUTATION: "LOCKED_MUTATION",
  ROOM_BOUNDS: "ROOM_BOUNDS",
  COLLISION: "COLLISION",
  WALL_ATTACHMENT: "WALL_ATTACHMENT",
  DEVICE_CLEARANCE: "DEVICE_CLEARANCE",
  OUTLET_REACH: "OUTLET_REACH",
} as const);

export type ConstraintCode =
  (typeof CONSTRAINT_CODES)[keyof typeof CONSTRAINT_CODES];

export type ConstraintWarningCode =
  | "COLLISION_OVERRIDDEN"
  | "CONSERVATIVE_COLLISION"
  | "DEVICE_REQUIREMENTS_UNASSESSED"
  | "OUTLET_REQUIREMENT_UNKNOWN"
  | "STRAIGHT_LINE_CABLE";

export interface ConstraintViolation {
  readonly code: ConstraintCode;
  readonly entityIds: readonly string[];
  readonly evidenceIds: readonly EvidenceId[];
  readonly claimIds: readonly ClaimId[];
}

export interface ConstraintWarning {
  readonly code: ConstraintWarningCode;
  readonly entityIds: readonly string[];
  readonly evidenceIds: readonly EvidenceId[];
  readonly claimIds: readonly ClaimId[];
  readonly reason?: string;
  readonly violation?: ConstraintViolation;
  readonly outletIds?: readonly string[];
}

export interface ConstraintReport {
  readonly isFeasible: boolean;
  readonly violations: readonly ConstraintViolation[];
  readonly warnings: readonly ConstraintWarning[];
}

export type RoomWall = "MIN_X" | "MAX_X" | "MIN_Z" | "MAX_Z";

export interface WallAttachment {
  readonly entityId: EntityId;
  readonly wall: RoomWall;
}

export interface SixAxisClearance {
  readonly minXMetres: Metres;
  readonly maxXMetres: Metres;
  readonly minYMetres: Metres;
  readonly maxYMetres: Metres;
  readonly minZMetres: Metres;
  readonly maxZMetres: Metres;
}

export type OutletRequirement =
  | Readonly<{ state: "UNKNOWN" }>
  | Readonly<{ state: "NOT_REQUIRED" }>
  | Readonly<{
      state: "REQUIRED";
      connectorLocalPosition: Vec3<Metres>;
      cableLengthMetres: Metres;
      eligibleOutletIds: readonly string[];
    }>;

export interface DeviceRequirement {
  readonly entityId: EntityId;
  readonly clearance: SixAxisClearance;
  readonly evidenceIds: readonly EvidenceId[];
  readonly claimIds: readonly ClaimId[];
  readonly outlet: OutletRequirement;
}

export interface OutletLocation {
  readonly outletId: string;
  readonly position: Vec3<Metres>;
  readonly evidenceIds: readonly EvidenceId[];
  readonly claimIds: readonly ClaimId[];
}

export interface CollisionOverridePermission {
  readonly code: "COLLISION";
  readonly entityIds: readonly [EntityId, EntityId];
}

export interface CollisionOverrideRequest extends CollisionOverridePermission {
  readonly reason: string;
}

export interface ConstraintContext {
  readonly wallAttachments: readonly WallAttachment[];
  readonly deviceRequirements: readonly DeviceRequirement[];
  readonly outlets: readonly OutletLocation[];
  readonly nonSolidEntityIds: readonly EntityId[];
  readonly overridePermissions: readonly CollisionOverridePermission[];
  readonly overrideRequests: readonly CollisionOverrideRequest[];
}

type ValidContext = Readonly<{
  wallAttachments: readonly WallAttachment[];
  deviceRequirements: readonly DeviceRequirement[];
  outlets: readonly OutletLocation[];
  nonSolidEntityIds: ReadonlySet<string>;
  overridePermissions: ReadonlyMap<string, CollisionOverridePermission>;
  overrideRequests: ReadonlyMap<
    string,
    Readonly<{ request: CollisionOverrideRequest; reason: string }>
  >;
}>;

type ContextValidation =
  Readonly<{ ok: true; value: ValidContext }> | Readonly<{ ok: false }>;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedIds(ids: readonly string[]): readonly string[] {
  return [...ids].sort(compareCodeUnits);
}

function violation(
  code: ConstraintCode,
  entityIds: readonly string[],
  evidenceIds: readonly EvidenceId[] = [],
  claimIds: readonly ClaimId[] = [],
): ConstraintViolation {
  return {
    code,
    entityIds: sortedIds(entityIds),
    evidenceIds: [...evidenceIds].sort(compareCodeUnits),
    claimIds: [...claimIds].sort(compareCodeUnits),
  };
}

function warning(
  code: ConstraintWarningCode,
  entityIds: readonly string[],
  evidenceIds: readonly EvidenceId[] = [],
  claimIds: readonly ClaimId[] = [],
): ConstraintWarning {
  return {
    code,
    entityIds: sortedIds(entityIds),
    evidenceIds: [...evidenceIds].sort(compareCodeUnits),
    claimIds: [...claimIds].sort(compareCodeUnits),
  };
}

function finiteNumbers(values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

function entityNumberGroups(entity: SpatialEntity): Readonly<{
  dimensionsAndScale: readonly number[];
  position: readonly number[];
  rotation: readonly number[];
}> {
  return {
    dimensionsAndScale: [
      entity.dimensions.xMetres,
      entity.dimensions.yMetres,
      entity.dimensions.zMetres,
      entity.transform.scale.x,
      entity.transform.scale.y,
      entity.transform.scale.z,
    ],
    position: [
      entity.transform.position.x,
      entity.transform.position.y,
      entity.transform.position.z,
    ],
    rotation: [
      entity.transform.rotation.x,
      entity.transform.rotation.y,
      entity.transform.rotation.z,
      entity.transform.rotation.w,
    ],
  };
}

function entityValidity(entity: SpatialEntity): readonly ConstraintCode[] {
  const groups = entityNumberGroups(entity);
  const allValues = [
    ...groups.dimensionsAndScale,
    ...groups.position,
    ...groups.rotation,
  ];
  const codes: ConstraintCode[] = [];
  if (!finiteNumbers(allValues)) {
    codes.push(CONSTRAINT_CODES.NON_FINITE_VALUE);
  }
  if (
    finiteNumbers(groups.dimensionsAndScale) &&
    groups.dimensionsAndScale.some((value) => value <= 0)
  ) {
    codes.push(CONSTRAINT_CODES.INVALID_DIMENSIONS);
  }
  if (finiteNumbers(groups.rotation)) {
    const magnitude = Math.hypot(...groups.rotation);
    if (magnitude === 0 || Math.abs(magnitude - 1) > ROTATION_TOLERANCE) {
      codes.push(CONSTRAINT_CODES.INVALID_ROTATION);
    }
  }
  return codes;
}

function roomIsValid(room: Room): boolean {
  return (
    finiteNumbers([
      room.boundary.widthMetres,
      room.heightMetres,
      room.boundary.depthMetres,
    ]) &&
    room.boundary.widthMetres > 0 &&
    room.heightMetres > 0 &&
    room.boundary.depthMetres > 0
  );
}

function spatiallyEqual(left: SpatialEntity, right: SpatialEntity): boolean {
  const leftTransform = left.transform;
  const rightTransform = right.transform;
  const directRotation =
    leftTransform.rotation.x === rightTransform.rotation.x &&
    leftTransform.rotation.y === rightTransform.rotation.y &&
    leftTransform.rotation.z === rightTransform.rotation.z &&
    leftTransform.rotation.w === rightTransform.rotation.w;
  const negatedRotation =
    leftTransform.rotation.x === -rightTransform.rotation.x &&
    leftTransform.rotation.y === -rightTransform.rotation.y &&
    leftTransform.rotation.z === -rightTransform.rotation.z &&
    leftTransform.rotation.w === -rightTransform.rotation.w;

  return (
    left.dimensions.xMetres === right.dimensions.xMetres &&
    left.dimensions.yMetres === right.dimensions.yMetres &&
    left.dimensions.zMetres === right.dimensions.zMetres &&
    leftTransform.position.x === rightTransform.position.x &&
    leftTransform.position.y === rightTransform.position.y &&
    leftTransform.position.z === rightTransform.position.z &&
    leftTransform.scale.x === rightTransform.scale.x &&
    leftTransform.scale.y === rightTransform.scale.y &&
    leftTransform.scale.z === rightTransform.scale.z &&
    (directRotation || negatedRotation)
  );
}

function boundsOverlap(
  left: AxisAlignedBounds,
  right: AxisAlignedBounds,
): boolean {
  return (
    left.min.x < right.max.x - GEOMETRIC_TOLERANCE_METRES &&
    left.max.x > right.min.x + GEOMETRIC_TOLERANCE_METRES &&
    left.min.y < right.max.y - GEOMETRIC_TOLERANCE_METRES &&
    left.max.y > right.min.y + GEOMETRIC_TOLERANCE_METRES &&
    left.min.z < right.max.z - GEOMETRIC_TOLERANCE_METRES &&
    left.max.z > right.min.z + GEOMETRIC_TOLERANCE_METRES
  );
}

function boundsFitRoom(bounds: AxisAlignedBounds, room: Room): boolean {
  return (
    bounds.min.x >= -GEOMETRIC_TOLERANCE_METRES &&
    bounds.min.y >= -GEOMETRIC_TOLERANCE_METRES &&
    bounds.min.z >= -GEOMETRIC_TOLERANCE_METRES &&
    bounds.max.x <= room.boundary.widthMetres + GEOMETRIC_TOLERANCE_METRES &&
    bounds.max.y <= room.heightMetres + GEOMETRIC_TOLERANCE_METRES &&
    bounds.max.z <= room.boundary.depthMetres + GEOMETRIC_TOLERANCE_METRES
  );
}

function expandedBounds(
  bounds: AxisAlignedBounds,
  clearance: SixAxisClearance,
): AxisAlignedBounds {
  return {
    min: vec3(
      metres(bounds.min.x - clearance.minXMetres),
      metres(bounds.min.y - clearance.minYMetres),
      metres(bounds.min.z - clearance.minZMetres),
    ),
    max: vec3(
      metres(bounds.max.x + clearance.maxXMetres),
      metres(bounds.max.y + clearance.maxYMetres),
      metres(bounds.max.z + clearance.maxZMetres),
    ),
  };
}

function pairKey(code: string, entityIds: readonly string[]): string {
  return `${code}\u0000${sortedIds(entityIds).join("\u0000")}`;
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
    value === value.normalize("NFC")
  );
}

function validReferences(value: {
  readonly evidenceIds: readonly EvidenceId[];
  readonly claimIds: readonly ClaimId[];
}): boolean {
  return (
    Array.isArray(value.evidenceIds) &&
    Array.isArray(value.claimIds) &&
    [...value.evidenceIds, ...value.claimIds].every(validIdentifier)
  );
}

function validReason(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 256 ||
    trimmed !== trimmed.normalize("NFC")
  ) {
    return false;
  }
  for (const character of trimmed) {
    const point = character.codePointAt(0);
    if (
      point !== undefined &&
      (point <= 0x1f || (point >= 0x7f && point <= 0x9f))
    ) {
      return false;
    }
  }
  return true;
}

function validateContext(
  context: ConstraintContext,
  room: Room,
  proposedEntity: SpatialEntity,
): ContextValidation {
  if (
    context === null ||
    typeof context !== "object" ||
    !Array.isArray(context.wallAttachments) ||
    !Array.isArray(context.deviceRequirements) ||
    !Array.isArray(context.outlets) ||
    !Array.isArray(context.nonSolidEntityIds) ||
    !Array.isArray(context.overridePermissions) ||
    !Array.isArray(context.overrideRequests)
  ) {
    return { ok: false };
  }

  const entities = new Map<string, SpatialEntity>();
  for (const entity of room.entities) {
    entities.set(entity.entityId, entity);
  }
  entities.set(proposedEntity.entityId, proposedEntity);

  const attachments = new Set<string>();
  for (const attachment of context.wallAttachments) {
    const target = entities.get(attachment.entityId);
    if (
      !validIdentifier(attachment.entityId) ||
      !["MIN_X", "MAX_X", "MIN_Z", "MAX_Z"].includes(attachment.wall) ||
      target?.type !== "OPENING" ||
      attachments.has(attachment.entityId)
    ) {
      return { ok: false };
    }
    attachments.add(attachment.entityId);
  }

  const outletIds = new Set<string>();
  for (const outlet of context.outlets) {
    if (
      !validIdentifier(outlet.outletId) ||
      outletIds.has(outlet.outletId) ||
      !finiteNumbers([
        outlet.position.x,
        outlet.position.y,
        outlet.position.z,
      ]) ||
      !validReferences(outlet) ||
      outlet.evidenceIds.length + outlet.claimIds.length === 0
    ) {
      return { ok: false };
    }
    outletIds.add(outlet.outletId);
  }

  const requirementIds = new Set<string>();
  for (const requirement of context.deviceRequirements) {
    const target = entities.get(requirement.entityId);
    const clearances = [
      requirement.clearance.minXMetres,
      requirement.clearance.maxXMetres,
      requirement.clearance.minYMetres,
      requirement.clearance.maxYMetres,
      requirement.clearance.minZMetres,
      requirement.clearance.maxZMetres,
    ];
    if (
      target?.type !== "DEVICE" ||
      requirementIds.has(requirement.entityId) ||
      !finiteNumbers(clearances) ||
      clearances.some((value) => value < 0) ||
      !validReferences(requirement) ||
      requirement.evidenceIds.length + requirement.claimIds.length === 0 ||
      !["REQUIRED", "NOT_REQUIRED", "UNKNOWN"].includes(
        requirement.outlet.state,
      )
    ) {
      return { ok: false };
    }
    requirementIds.add(requirement.entityId);
    if (requirement.outlet.state === "REQUIRED") {
      const outlet = requirement.outlet;
      if (
        !finiteNumbers([
          outlet.connectorLocalPosition.x,
          outlet.connectorLocalPosition.y,
          outlet.connectorLocalPosition.z,
          outlet.cableLengthMetres,
        ]) ||
        outlet.cableLengthMetres < 0 ||
        !Array.isArray(outlet.eligibleOutletIds) ||
        outlet.eligibleOutletIds.some(
          (id: string) => !validIdentifier(id) || !outletIds.has(id),
        ) ||
        new Set(outlet.eligibleOutletIds).size !==
          outlet.eligibleOutletIds.length
      ) {
        return { ok: false };
      }
    }
  }

  const nonSolidIds = new Set<string>();
  for (const id of context.nonSolidEntityIds) {
    if (
      !validIdentifier(id) ||
      entities.get(id)?.type !== "GENERIC" ||
      nonSolidIds.has(id)
    ) {
      return { ok: false };
    }
    nonSolidIds.add(id);
  }

  const permissions = new Map<string, CollisionOverridePermission>();
  for (const permission of context.overridePermissions) {
    if (
      permission.code !== CONSTRAINT_CODES.COLLISION ||
      !Array.isArray(permission.entityIds) ||
      permission.entityIds.length !== 2 ||
      !permission.entityIds.every(validIdentifier) ||
      permission.entityIds[0] === permission.entityIds[1] ||
      permission.entityIds.some((id: string) => !entities.has(id))
    ) {
      return { ok: false };
    }
    const key = pairKey(permission.code, permission.entityIds);
    if (permissions.has(key)) {
      return { ok: false };
    }
    permissions.set(key, permission);
  }

  const requests = new Map<
    string,
    Readonly<{ request: CollisionOverrideRequest; reason: string }>
  >();
  for (const request of context.overrideRequests) {
    if (
      request.code !== CONSTRAINT_CODES.COLLISION ||
      !Array.isArray(request.entityIds) ||
      request.entityIds.length !== 2 ||
      !request.entityIds.every(validIdentifier) ||
      request.entityIds[0] === request.entityIds[1] ||
      !validReason(request.reason)
    ) {
      return { ok: false };
    }
    const key = pairKey(request.code, request.entityIds);
    if (!permissions.has(key) || requests.has(key)) {
      return { ok: false };
    }
    requests.set(key, { request, reason: request.reason.trim() });
  }

  return {
    ok: true,
    value: {
      wallAttachments: context.wallAttachments,
      deviceRequirements: context.deviceRequirements,
      outlets: context.outlets,
      nonSolidEntityIds: nonSolidIds,
      overridePermissions: permissions,
      overrideRequests: requests,
    },
  };
}

function rotateLocalZ(entity: SpatialEntity): Vec3<number> {
  const { x, y, z, w } = entity.transform.rotation;
  return vec3(
    2 * (x * z + w * y),
    2 * (y * z - w * x),
    1 - 2 * (x * x + y * y),
  );
}

function approximatelyEqual(
  left: number,
  right: number,
  tolerance: number,
): boolean {
  return Math.abs(left - right) <= tolerance;
}

function openingFitsAttachment(
  entity: SpatialEntity,
  room: Room,
  attachment: WallAttachment,
): boolean {
  const wall = attachment.wall;
  const normal =
    wall === "MIN_X"
      ? vec3(-1, 0, 0)
      : wall === "MAX_X"
        ? vec3(1, 0, 0)
        : wall === "MIN_Z"
          ? vec3(0, 0, -1)
          : vec3(0, 0, 1);
  const localZ = rotateLocalZ(entity);
  const same =
    approximatelyEqual(localZ.x, normal.x, ROTATION_TOLERANCE) &&
    approximatelyEqual(localZ.y, normal.y, ROTATION_TOLERANCE) &&
    approximatelyEqual(localZ.z, normal.z, ROTATION_TOLERANCE);
  const opposite =
    approximatelyEqual(-localZ.x, normal.x, ROTATION_TOLERANCE) &&
    approximatelyEqual(-localZ.y, normal.y, ROTATION_TOLERANCE) &&
    approximatelyEqual(-localZ.z, normal.z, ROTATION_TOLERANCE);
  if (!same && !opposite) {
    return false;
  }

  const faceSign = same ? 1 : -1;
  const coordinate =
    wall === "MIN_X" || wall === "MIN_Z"
      ? 0
      : wall === "MAX_X"
        ? room.boundary.widthMetres
        : room.boundary.depthMetres;
  const usesX = wall === "MIN_X" || wall === "MAX_X";
  for (const x of [
    -entity.dimensions.xMetres / 2,
    entity.dimensions.xMetres / 2,
  ]) {
    for (const y of [0, entity.dimensions.yMetres]) {
      const corner = applyTransform(
        entity.transform,
        vec3(
          metres(x),
          metres(y),
          metres((faceSign * entity.dimensions.zMetres) / 2),
        ),
      );
      if (
        !approximatelyEqual(
          usesX ? corner.x : corner.z,
          coordinate,
          GEOMETRIC_TOLERANCE_METRES,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function compareReports(
  left: { readonly code: string; readonly entityIds: readonly string[] },
  right: { readonly code: string; readonly entityIds: readonly string[] },
): number {
  const codeOrder = compareCodeUnits(left.code, right.code);
  if (codeOrder !== 0) {
    return codeOrder;
  }
  return compareCodeUnits(
    left.entityIds.join("\u0000"),
    right.entityIds.join("\u0000"),
  );
}

function deduplicateViolations(
  violations: readonly ConstraintViolation[],
): ConstraintViolation[] {
  const unique = new Map<string, ConstraintViolation>();
  for (const item of violations) {
    const key = pairKey(item.code, item.entityIds);
    const existing = unique.get(key);
    if (existing === undefined) {
      unique.set(key, item);
    } else {
      unique.set(
        key,
        violation(
          item.code,
          item.entityIds,
          [...new Set([...existing.evidenceIds, ...item.evidenceIds])],
          [...new Set([...existing.claimIds, ...item.claimIds])],
        ),
      );
    }
  }
  return [...unique.values()];
}

function evaluate(
  room: Room,
  proposedEntity: SpatialEntity,
  context: ConstraintContext,
): ConstraintReport {
  const violations: ConstraintViolation[] = [];
  const warnings: ConstraintWarning[] = [];
  const proposedCodes = entityValidity(proposedEntity);
  for (const code of proposedCodes) {
    violations.push(violation(code, [proposedEntity.entityId]));
  }
  const validRoom = roomIsValid(room);
  if (!validRoom) {
    violations.push(
      violation(CONSTRAINT_CODES.INVALID_ROOM_GEOMETRY, [room.roomId]),
    );
  }

  const existing = room.entities.find(
    (entity) => entity.entityId === proposedEntity.entityId,
  );
  if (existing?.locked === true && !spatiallyEqual(existing, proposedEntity)) {
    violations.push(
      violation(CONSTRAINT_CODES.LOCKED_MUTATION, [proposedEntity.entityId]),
    );
  }

  const contextValidation = validateContext(context, room, proposedEntity);
  if (!contextValidation.ok) {
    violations.push(
      violation(CONSTRAINT_CODES.INVALID_CONTEXT, [proposedEntity.entityId]),
    );
  }

  if (proposedCodes.length > 0 || !validRoom) {
    const sorted = deduplicateViolations(violations).sort(compareReports);
    return { isFeasible: false, violations: sorted, warnings };
  }

  const proposedBounds = boundsForEntity(proposedEntity);
  if (!boundsFitRoom(proposedBounds, room)) {
    violations.push(
      violation(CONSTRAINT_CODES.ROOM_BOUNDS, [
        proposedEntity.entityId,
        room.roomId,
      ]),
    );
  }

  if (proposedEntity.type === "OPENING") {
    const attachment = contextValidation.ok
      ? contextValidation.value.wallAttachments.find(
          (item) => item.entityId === proposedEntity.entityId,
        )
      : undefined;
    if (
      attachment === undefined ||
      !openingFitsAttachment(proposedEntity, room, attachment)
    ) {
      violations.push(
        violation(CONSTRAINT_CODES.WALL_ATTACHMENT, [proposedEntity.entityId]),
      );
    }
  }

  const collisionViolations: ConstraintViolation[] = [];
  if (contextValidation.ok) {
    for (const other of room.entities) {
      if (
        other.entityId === proposedEntity.entityId ||
        contextValidation.value.nonSolidEntityIds.has(other.entityId) ||
        contextValidation.value.nonSolidEntityIds.has(
          proposedEntity.entityId,
        ) ||
        entityValidity(other).length > 0
      ) {
        continue;
      }
      if (boundsOverlap(proposedBounds, boundsForEntity(other))) {
        collisionViolations.push(
          violation(CONSTRAINT_CODES.COLLISION, [
            proposedEntity.entityId,
            other.entityId,
          ]),
        );
      }
    }
  }

  if (contextValidation.ok) {
    const collisionKeys = new Set(
      collisionViolations.map((item) => pairKey(item.code, item.entityIds)),
    );
    const unmatchedRequest = [
      ...contextValidation.value.overrideRequests.keys(),
    ].some((key) => !collisionKeys.has(key));
    if (unmatchedRequest) {
      violations.push(
        violation(CONSTRAINT_CODES.INVALID_CONTEXT, [proposedEntity.entityId]),
      );
    }
    for (const collision of collisionViolations) {
      warnings.push(warning("CONSERVATIVE_COLLISION", collision.entityIds));
      const key = pairKey(collision.code, collision.entityIds);
      const override = unmatchedRequest
        ? undefined
        : contextValidation.value.overrideRequests.get(key);
      if (override === undefined) {
        violations.push(collision);
      } else {
        warnings.push({
          ...warning("COLLISION_OVERRIDDEN", collision.entityIds),
          reason: override.reason,
          violation: collision,
        });
      }
    }

    const currentEntities = room.entities.filter(
      (entity) => entity.entityId !== proposedEntity.entityId,
    );
    currentEntities.push(proposedEntity);
    const requirementById = new Map(
      contextValidation.value.deviceRequirements.map((item) => [
        item.entityId,
        item,
      ]),
    );
    const outletById = new Map(
      contextValidation.value.outlets.map((item) => [item.outletId, item]),
    );
    for (const candidate of currentEntities) {
      if (candidate.type !== "DEVICE") {
        continue;
      }
      const requirement = requirementById.get(candidate.entityId);
      if (requirement === undefined) {
        warnings.push(
          warning("DEVICE_REQUIREMENTS_UNASSESSED", [candidate.entityId]),
        );
        continue;
      }
      if (entityValidity(candidate).length > 0) {
        continue;
      }
      const envelope = expandedBounds(
        boundsForEntity(candidate),
        requirement.clearance,
      );
      if (!boundsFitRoom(envelope, room)) {
        violations.push(
          violation(
            CONSTRAINT_CODES.DEVICE_CLEARANCE,
            [candidate.entityId, room.roomId],
            requirement.evidenceIds,
            requirement.claimIds,
          ),
        );
      }
      for (const obstacle of currentEntities) {
        if (
          obstacle.entityId === candidate.entityId ||
          contextValidation.value.nonSolidEntityIds.has(obstacle.entityId) ||
          entityValidity(obstacle).length > 0
        ) {
          continue;
        }
        if (boundsOverlap(envelope, boundsForEntity(obstacle))) {
          violations.push(
            violation(
              CONSTRAINT_CODES.DEVICE_CLEARANCE,
              [candidate.entityId, obstacle.entityId],
              requirement.evidenceIds,
              requirement.claimIds,
            ),
          );
        }
      }

      if (requirement.outlet.state === "UNKNOWN") {
        warnings.push(
          warning(
            "OUTLET_REQUIREMENT_UNKNOWN",
            [candidate.entityId],
            requirement.evidenceIds,
            requirement.claimIds,
          ),
        );
      } else if (requirement.outlet.state === "REQUIRED") {
        const outletRequirement = requirement.outlet;
        const connector = applyTransform(
          candidate.transform,
          outletRequirement.connectorLocalPosition,
        );
        const candidates = outletRequirement.eligibleOutletIds
          .map((id) => outletById.get(id))
          .filter((outlet): outlet is OutletLocation => outlet !== undefined)
          .map((outlet) => ({
            outlet,
            distance: Math.hypot(
              outlet.position.x - connector.x,
              outlet.position.y - connector.y,
              outlet.position.z - connector.z,
            ),
          }))
          .sort(
            (left, right) =>
              left.distance - right.distance ||
              compareCodeUnits(left.outlet.outletId, right.outlet.outletId),
          );
        warnings.push({
          ...warning(
            "STRAIGHT_LINE_CABLE",
            [candidate.entityId],
            requirement.evidenceIds,
            requirement.claimIds,
          ),
          outletIds: candidates.map(({ outlet }) => outlet.outletId),
        });
        if (
          candidates.length === 0 ||
          candidates[0]!.distance >
            outletRequirement.cableLengthMetres + GEOMETRIC_TOLERANCE_METRES
        ) {
          violations.push(
            violation(
              CONSTRAINT_CODES.OUTLET_REACH,
              [candidate.entityId],
              requirement.evidenceIds,
              requirement.claimIds,
            ),
          );
        }
      }
    }
  }

  const sortedViolations =
    deduplicateViolations(violations).sort(compareReports);
  warnings.sort(compareReports);
  return {
    isFeasible: sortedViolations.length === 0,
    violations: sortedViolations,
    warnings,
  };
}

export const ConstraintEvaluator = Object.freeze({ evaluate });
