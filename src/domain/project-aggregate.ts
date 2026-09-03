import { z } from "zod";
import type { EntityId, ProjectId, RevisionId, RoomId } from "./identity";
import {
  HistoryReplayEnvelopeSchema,
  InternalHistoryCommandSchema,
  InternalProjectCommandSchema,
  ProjectCommandSchema,
  type InternalHistoryCommand,
  type InternalProjectCommand,
  type ProjectCommand,
} from "./commands";
import {
  parseProject,
  type Project,
  type Room,
  type SpatialEntity,
} from "./project-schema";
import { makeQuaternion, normalizeQuaternion } from "./spatial";
import { makeTransform } from "./spatial";
import { metres } from "./units";
import type {
  HistoryError,
  HistoryReplayEnvelope,
  HistoryReplayReceipt,
  HistoryResult,
  HistoryState,
} from "./history";

const MAX_COLLECTION_LENGTH = 256;
const MAX_HISTORY_RECORDS = 4096;
const REJECTION_MESSAGE = "Command was rejected.";
const TrustedMap = Map;
const TrustedSet = Set;
const TrustedWeakSet = WeakSet;
const objectFreeze = Object.freeze;
const objectValues = Object.values;
const mapGet = Function.prototype.call.bind(TrustedMap.prototype.get) as <K, V>(
  map: Map<K, V>,
  key: K,
) => V | undefined;
const mapSet = Function.prototype.call.bind(TrustedMap.prototype.set) as <K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
) => Map<K, V>;
const setHas = Function.prototype.call.bind(TrustedSet.prototype.has) as <T>(
  set: Set<T>,
  value: T,
) => boolean;
const setAdd = Function.prototype.call.bind(TrustedSet.prototype.add) as <T>(
  set: Set<T>,
  value: T,
) => Set<T>;
const weakSetHas = Function.prototype.call.bind(
  TrustedWeakSet.prototype.has,
) as (set: WeakSet<object>, value: object) => boolean;
const weakSetAdd = Function.prototype.call.bind(
  TrustedWeakSet.prototype.add,
) as (set: WeakSet<object>, value: object) => WeakSet<object>;
const trustedIdempotencyRecords = new TrustedWeakSet<object>();

export type CommandErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_PROJECT"
  | "PROJECT_MISMATCH"
  | "PROJECT_UNAVAILABLE"
  | "LEASE_FENCED"
  | "IDEMPOTENCY_CONFLICT"
  | "REVISION_CONFLICT"
  | "ROOM_NOT_FOUND"
  | "ENTITY_NOT_FOUND"
  | "AMBIGUOUS_ROOM"
  | "AMBIGUOUS_ENTITY"
  | "DUPLICATE_ID"
  | "ENTITY_LOCKED"
  | "CAPACITY_EXCEEDED"
  | "NO_OP"
  | "LAST_ROOM_REQUIRED";

export type CommandError = Readonly<{
  code: CommandErrorCode;
  message: typeof REJECTION_MESSAGE;
}>;

export type ProjectAvailability = "AVAILABLE" | "TOMBSTONED" | "UNAVAILABLE";

export type DispatchContext = Readonly<{
  authoritativeLeaseFence: number;
  idempotencyRecords: readonly IdempotencyRecord[];
  knownProjectRevisionIds: readonly string[];
  knownRoomRevisionIds: readonly string[];
  projectAvailability: ProjectAvailability;
}>;

export type AuditRecord = Readonly<{
  commandId: string;
  type: InternalProjectCommand["type"];
  projectId: ProjectId;
  roomId?: RoomId;
  entityId?: EntityId;
  occurredAtUtc: string;
  priorProjectRevision: RevisionId;
  newProjectRevision: RevisionId;
  priorRoomRevision?: RevisionId;
  newRoomRevision?: RevisionId;
  outcome: "APPLIED";
}>;

export type HistoryInvalidationReason =
  | "REMOTE_EDIT"
  | "IMPORT"
  | "MIGRATION"
  | "TOMBSTONE"
  | "FENCE_CHANGE"
  | "LOCAL_BRANCH";

export type HistoryApplicability =
  | Readonly<{ status: "APPLICABLE" }>
  | Readonly<{
      status: "NON_APPLICABLE";
      reason: HistoryInvalidationReason;
    }>;

export type HistoryEntry = Readonly<{
  historyEntryId: string;
  forwardCommand: InternalProjectCommand;
  forward: InternalHistoryCommand;
  inverse: InternalHistoryCommand;
  affectedRoomId: RoomId | null;
  applicability: HistoryApplicability;
}>;

const portableHistoryIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const HistoryApplicabilitySchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("APPLICABLE") }).readonly(),
  z
    .strictObject({
      status: z.literal("NON_APPLICABLE"),
      reason: z.enum([
        "REMOTE_EDIT",
        "IMPORT",
        "MIGRATION",
        "TOMBSTONE",
        "FENCE_CHANGE",
        "LOCAL_BRANCH",
      ]),
    })
    .readonly(),
]);
const HistoryEntrySchema = z
  .strictObject({
    historyEntryId: portableHistoryIdentifier,
    forwardCommand: ProjectCommandSchema,
    forward: InternalHistoryCommandSchema,
    inverse: InternalHistoryCommandSchema,
    affectedRoomId: portableHistoryIdentifier.nullable(),
    applicability: HistoryApplicabilitySchema,
  })
  .readonly();
const HistoryReplayReceiptSchema = z
  .strictObject({
    direction: z.enum(["UNDO", "REDO"]),
    historyEntryId: portableHistoryIdentifier,
    envelope: HistoryReplayEnvelopeSchema,
  })
  .readonly();
const HistoryStateSchema = z
  .strictObject({
    projectId: portableHistoryIdentifier,
    headProjectRevisionId: portableHistoryIdentifier.nullable(),
    past: z.array(HistoryEntrySchema).max(MAX_HISTORY_RECORDS).readonly(),
    future: z.array(HistoryEntrySchema).max(MAX_HISTORY_RECORDS).readonly(),
    replayReceipts: z
      .array(HistoryReplayReceiptSchema)
      .max(MAX_HISTORY_RECORDS)
      .readonly(),
  })
  .superRefine((value, context) => {
    if (value.past.length + value.future.length > MAX_HISTORY_RECORDS) {
      context.addIssue({
        code: "custom",
        path: ["past"],
        message: "History entry capacity exceeded.",
      });
    }
  })
  .readonly();

type CanonicalPrimitive = null | boolean | number | string;
interface CanonicalCommandRecord {
  readonly [key: string]: CanonicalCommandValue;
}
export type CanonicalCommandValue =
  | CanonicalPrimitive
  | readonly CanonicalCommandValue[]
  | CanonicalCommandRecord;

type CommittedCommandArtifacts = Readonly<{
  project: Project;
  auditRecord: AuditRecord;
  historyEntry: HistoryEntry;
}>;

type HistoryExecutionOrigin = Readonly<{
  direction: "UNDO" | "REDO";
  historyEntryId: string;
}>;

export type IdempotencyRecord = Readonly<{
  projectId: ProjectId;
  idempotencyKey: string;
  commandFingerprint: string;
  canonicalCommand: CanonicalCommandValue;
  committedFingerprint: string;
  historyExecution: HistoryExecutionOrigin | null;
  committed: CommittedCommandArtifacts;
}>;

export type SuccessfulCommandResult = CommittedCommandArtifacts &
  Readonly<{
    ok: true;
    replayed: boolean;
    idempotencyRecord: IdempotencyRecord;
  }>;

export type CommandResult =
  SuccessfulCommandResult | Readonly<{ ok: false; error: CommandError }>;

function reject(code: CommandErrorCode): CommandResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: REJECTION_MESSAGE }),
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command variant: ${String(value)}`);
}

function deepFreeze<T>(value: T, seen = new TrustedWeakSet<object>()): T {
  if (value === null || typeof value !== "object" || weakSetHas(seen, value)) {
    return value;
  }
  weakSetAdd(seen, value);
  const children = objectValues(value);
  for (let index = 0; index < children.length; index += 1) {
    deepFreeze(children[index], seen);
  }
  return objectFreeze(value);
}

function canonicalize(value: unknown): CanonicalCommandValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => canonicalize(entry)));
  }
  const source = value as Record<string, unknown>;
  const target: Record<string, CanonicalCommandValue> = Object.create(
    null,
  ) as Record<string, CanonicalCommandValue>;
  for (const key of Object.keys(source).sort()) {
    target[key] = canonicalize(source[key]);
  }
  return Object.freeze(target);
}

function canonicalEqual(
  left: CanonicalCommandValue,
  right: CanonicalCommandValue,
): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || left === null) return false;
  if (typeof right !== "object" || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((entry, index) => canonicalEqual(entry, right[index]!));
  }
  const leftRecord = left as CanonicalCommandRecord;
  const rightRecord = right as CanonicalCommandRecord;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] &&
      canonicalEqual(leftRecord[key]!, rightRecord[key]!),
  );
}

function commandFingerprint(value: CanonicalCommandValue): string {
  return JSON.stringify(value);
}

function duplicateStateError(project: Project): CommandErrorCode | null {
  const roomIds = new TrustedSet<string>();
  const entityIds = new TrustedSet<string>();
  for (const room of project.rooms) {
    if (setHas(roomIds, room.roomId)) return "AMBIGUOUS_ROOM";
    setAdd(roomIds, room.roomId);
    for (const entity of room.entities) {
      if (setHas(entityIds, entity.entityId)) return "AMBIGUOUS_ENTITY";
      setAdd(entityIds, entity.entityId);
    }
  }
  return null;
}

function findRoom(project: Project, targetRoomId: string): Room | null {
  return project.rooms.find((room) => room.roomId === targetRoomId) ?? null;
}

function findEntity(room: Room, targetEntityId: string): SpatialEntity | null {
  return (
    room.entities.find((entity) => entity.entityId === targetEntityId) ?? null
  );
}

function commandRoomId(command: InternalProjectCommand): RoomId | null {
  switch (command.type) {
    case "CREATE_ROOM":
      return command.room.roomId;
    case "RENAME_PROJECT":
      return null;
    case "ADD_ENTITY":
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK":
    case "DUPLICATE_ENTITY":
    case "DELETE_ENTITY":
    case "DELETE_ROOM":
    case "REMOVE_ADDED_ENTITY":
    case "RESTORE_DELETED_ENTITY":
      return command.roomId;
    default:
      return assertNever(command);
  }
}

function commandEntityId(command: InternalProjectCommand): EntityId | null {
  switch (command.type) {
    case "ADD_ENTITY":
      return command.entity.entityId;
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK":
    case "DUPLICATE_ENTITY":
    case "DELETE_ENTITY":
    case "REMOVE_ADDED_ENTITY":
      return command.entityId;
    case "RESTORE_DELETED_ENTITY":
      return command.entity.entityId;
    case "CREATE_ROOM":
    case "RENAME_PROJECT":
    case "DELETE_ROOM":
      return null;
    default:
      return assertNever(command);
  }
}

function usesExistingRoom(
  command: InternalProjectCommand,
): command is Exclude<
  InternalProjectCommand,
  Extract<InternalProjectCommand, { type: "CREATE_ROOM" | "RENAME_PROJECT" }>
> {
  return command.type !== "CREATE_ROOM" && command.type !== "RENAME_PROJECT";
}

function hasNextRoomRevision(
  command: InternalProjectCommand,
): command is Exclude<
  InternalProjectCommand,
  Extract<
    InternalProjectCommand,
    { type: "CREATE_ROOM" | "RENAME_PROJECT" | "DELETE_ROOM" }
  >
> {
  return (
    command.type !== "CREATE_ROOM" &&
    command.type !== "RENAME_PROJECT" &&
    command.type !== "DELETE_ROOM"
  );
}

function revisionIsKnown(
  project: Project,
  context: DispatchContext,
  candidate: string,
): boolean {
  return (
    candidate === project.revisionId ||
    project.rooms.some((room) => room.revisionId === candidate) ||
    context.knownProjectRevisionIds.includes(candidate) ||
    context.knownRoomRevisionIds.includes(candidate) ||
    context.idempotencyRecords.some((record) => {
      const audit = record.committed.auditRecord;
      return (
        audit.priorProjectRevision === candidate ||
        audit.newProjectRevision === candidate ||
        audit.priorRoomRevision === candidate ||
        audit.newRoomRevision === candidate
      );
    })
  );
}

function preconditionError(
  project: Project,
  command: InternalProjectCommand,
  context: DispatchContext,
): CommandErrorCode | null {
  if (command.projectId !== project.projectId) return "PROJECT_MISMATCH";
  if (context.projectAvailability !== "AVAILABLE") return "PROJECT_UNAVAILABLE";
  if (command.leaseFence !== context.authoritativeLeaseFence)
    return "LEASE_FENCED";
  if (
    command.causalParentRevisionId !== project.revisionId ||
    command.expectedProjectRevisionId !== project.revisionId
  ) {
    return "REVISION_CONFLICT";
  }
  if (
    revisionIsKnown(project, context, command.nextProjectRevision) ||
    command.nextProjectRevision === command.causalParentRevisionId
  ) {
    return "REVISION_CONFLICT";
  }
  if (command.type === "CREATE_ROOM") {
    if (
      revisionIsKnown(project, context, command.room.revisionId) ||
      command.room.revisionId === command.nextProjectRevision
    ) {
      return "REVISION_CONFLICT";
    }
    return null;
  }
  if (!usesExistingRoom(command)) return null;
  const room = findRoom(project, command.roomId);
  if (room === null) return "ROOM_NOT_FOUND";
  if (command.expectedRoomRevision !== room.revisionId) {
    return "REVISION_CONFLICT";
  }
  if (
    hasNextRoomRevision(command) &&
    (revisionIsKnown(project, context, command.nextRoomRevision) ||
      command.nextRoomRevision === command.nextProjectRevision)
  ) {
    return "REVISION_CONFLICT";
  }
  return null;
}

function entityIds(project: Project): Set<string> {
  const ids = new TrustedSet<string>();
  for (const room of project.rooms) {
    for (const entity of room.entities) {
      setAdd(ids, entity.entityId);
    }
  }
  return ids;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return canonicalEqual(canonicalize(left), canonicalize(right));
}

function operationError(
  project: Project,
  command: InternalProjectCommand,
): CommandErrorCode | null {
  const allEntityIds = entityIds(project);
  switch (command.type) {
    case "CREATE_ROOM": {
      if (project.rooms.length >= MAX_COLLECTION_LENGTH) {
        return "CAPACITY_EXCEEDED";
      }
      if (project.rooms.some((room) => room.roomId === command.room.roomId)) {
        return "DUPLICATE_ID";
      }
      const newIds = new TrustedSet<string>();
      for (const entity of command.room.entities) {
        if (
          setHas(allEntityIds, entity.entityId) ||
          setHas(newIds, entity.entityId)
        ) {
          return "DUPLICATE_ID";
        }
        setAdd(newIds, entity.entityId);
      }
      return null;
    }
    case "RENAME_PROJECT":
      return command.name === project.name ? "NO_OP" : null;
    case "ADD_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      if (room.entities.length >= MAX_COLLECTION_LENGTH) {
        return "CAPACITY_EXCEEDED";
      }
      return setHas(allEntityIds, command.entity.entityId)
        ? "DUPLICATE_ID"
        : null;
    }
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK":
    case "DUPLICATE_ENTITY":
    case "DELETE_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      const entity = findEntity(room, command.entityId);
      if (entity === null) return "ENTITY_NOT_FOUND";
      if (
        entity.locked &&
        (command.type === "MOVE_ENTITY" ||
          command.type === "RESIZE_ENTITY" ||
          command.type === "ROTATE_ENTITY" ||
          command.type === "DUPLICATE_ENTITY" ||
          command.type === "DELETE_ENTITY")
      ) {
        return "ENTITY_LOCKED";
      }
      switch (command.type) {
        case "MOVE_ENTITY":
          return valuesEqual(entity.transform.position, command.position)
            ? "NO_OP"
            : null;
        case "RESIZE_ENTITY":
          return valuesEqual(entity.dimensions, command.dimensions)
            ? "NO_OP"
            : null;
        case "ROTATE_ENTITY": {
          const normalized = normalizeQuaternion(
            makeQuaternion(
              command.rotation.x,
              command.rotation.y,
              command.rotation.z,
              command.rotation.w,
            ),
          );
          return valuesEqual(entity.transform.rotation, normalized)
            ? "NO_OP"
            : null;
        }
        case "SET_ENTITY_VISIBILITY":
          return entity.visibility === command.visibility ? "NO_OP" : null;
        case "SET_ENTITY_LOCK":
          return entity.locked === command.locked ? "NO_OP" : null;
        case "DUPLICATE_ENTITY":
          if (room.entities.length >= MAX_COLLECTION_LENGTH) {
            return "CAPACITY_EXCEEDED";
          }
          return setHas(allEntityIds, command.newEntityId)
            ? "DUPLICATE_ID"
            : null;
        case "DELETE_ENTITY":
          return null;
        default:
          return assertNever(command);
      }
    }
    case "REMOVE_ADDED_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      return findEntity(room, command.entityId) === null
        ? "ENTITY_NOT_FOUND"
        : null;
    }
    case "RESTORE_DELETED_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      if (room.entities.length >= MAX_COLLECTION_LENGTH) {
        return "CAPACITY_EXCEEDED";
      }
      if (command.insertionIndex > room.entities.length) {
        return "INVALID_COMMAND";
      }
      return setHas(allEntityIds, command.entity.entityId)
        ? "DUPLICATE_ID"
        : null;
    }
    case "DELETE_ROOM":
      return project.rooms.length === 1 ? "LAST_ROOM_REQUIRED" : null;
    default:
      return assertNever(command);
  }
}

function replaceRoom(project: Project, replacement: Room): Project {
  return {
    ...project,
    rooms: project.rooms.map((room) =>
      room.roomId === replacement.roomId ? replacement : room,
    ),
  };
}

function replaceEntity(
  room: Room,
  targetEntityId: EntityId,
  replacement: SpatialEntity,
): Room {
  return {
    ...room,
    entities: room.entities.map((entity) =>
      entity.entityId === targetEntityId ? replacement : entity,
    ),
  };
}

function applyCommand(
  project: Project,
  command: InternalProjectCommand,
): Project {
  switch (command.type) {
    case "CREATE_ROOM":
      return {
        ...project,
        revisionId: command.nextProjectRevision,
        rooms: [...project.rooms, command.room],
      };
    case "RENAME_PROJECT":
      return {
        ...project,
        revisionId: command.nextProjectRevision,
        name: command.name,
      };
    case "ADD_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      return {
        ...replaceRoom(project, {
          ...room,
          revisionId: command.nextRoomRevision,
          entities: [...room.entities, command.entity],
        }),
        revisionId: command.nextProjectRevision,
      };
    }
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK": {
      const room = findRoom(project, command.roomId)!;
      const entity = findEntity(room, command.entityId)!;
      let replacement: SpatialEntity;
      switch (command.type) {
        case "MOVE_ENTITY":
          replacement = {
            ...entity,
            transform: makeTransform({
              ...entity.transform,
              position: command.position,
            }),
          };
          break;
        case "RESIZE_ENTITY":
          replacement = {
            ...entity,
            dimensions: {
              xMetres: metres(command.dimensions.xMetres),
              yMetres: metres(command.dimensions.yMetres),
              zMetres: metres(command.dimensions.zMetres),
            },
          };
          break;
        case "ROTATE_ENTITY":
          replacement = {
            ...entity,
            transform: {
              ...entity.transform,
              rotation: normalizeQuaternion(
                makeQuaternion(
                  command.rotation.x,
                  command.rotation.y,
                  command.rotation.z,
                  command.rotation.w,
                ),
              ),
            },
          };
          break;
        case "SET_ENTITY_VISIBILITY":
          replacement = { ...entity, visibility: command.visibility };
          break;
        case "SET_ENTITY_LOCK":
          replacement = { ...entity, locked: command.locked };
          break;
        default:
          return assertNever(command);
      }
      return {
        ...replaceRoom(
          project,
          replaceEntity(
            { ...room, revisionId: command.nextRoomRevision },
            entity.entityId,
            replacement,
          ),
        ),
        revisionId: command.nextProjectRevision,
      };
    }
    case "DUPLICATE_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      const source = findEntity(room, command.entityId)!;
      const copy: SpatialEntity = {
        ...source,
        entityId: command.newEntityId,
        label: command.newLabel,
        transform: makeTransform(command.newTransform),
      };
      return {
        ...replaceRoom(project, {
          ...room,
          revisionId: command.nextRoomRevision,
          entities: [...room.entities, copy],
        }),
        revisionId: command.nextProjectRevision,
      };
    }
    case "DELETE_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      return {
        ...replaceRoom(project, {
          ...room,
          revisionId: command.nextRoomRevision,
          entities: room.entities.filter(
            (entity) => entity.entityId !== command.entityId,
          ),
        }),
        revisionId: command.nextProjectRevision,
      };
    }
    case "REMOVE_ADDED_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      return {
        ...replaceRoom(project, {
          ...room,
          revisionId: command.nextRoomRevision,
          entities: room.entities.filter(
            (entity) => entity.entityId !== command.entityId,
          ),
        }),
        revisionId: command.nextProjectRevision,
      };
    }
    case "RESTORE_DELETED_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      return {
        ...replaceRoom(project, {
          ...room,
          revisionId: command.nextRoomRevision,
          entities: [
            ...room.entities.slice(0, command.insertionIndex),
            command.entity,
            ...room.entities.slice(command.insertionIndex),
          ],
        }),
        revisionId: command.nextProjectRevision,
      };
    }
    case "DELETE_ROOM":
      return {
        ...project,
        revisionId: command.nextProjectRevision,
        rooms: project.rooms.filter((room) => room.roomId !== command.roomId),
      };
    default:
      return assertNever(command);
  }
}

function forwardHistoryCommand(
  command: InternalProjectCommand,
): InternalHistoryCommand {
  switch (command.type) {
    case "CREATE_ROOM":
      return { type: command.type, room: command.room };
    case "RENAME_PROJECT":
      return { type: command.type, name: command.name };
    case "ADD_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entity: command.entity,
      };
    case "MOVE_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
        position: command.position,
      };
    case "RESIZE_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
        dimensions: command.dimensions,
      };
    case "ROTATE_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
        rotation: command.rotation,
      };
    case "SET_ENTITY_VISIBILITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
        visibility: command.visibility,
      };
    case "SET_ENTITY_LOCK":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
        locked: command.locked,
      };
    case "DUPLICATE_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
        newEntityId: command.newEntityId,
        newLabel: command.newLabel,
        newTransform: command.newTransform,
      };
    case "DELETE_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
      };
    case "DELETE_ROOM":
      return { type: command.type, roomId: command.roomId };
    case "REMOVE_ADDED_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entityId: command.entityId,
      };
    case "RESTORE_DELETED_ENTITY":
      return {
        type: command.type,
        roomId: command.roomId,
        entity: command.entity,
        insertionIndex: command.insertionIndex,
      };
    default:
      return assertNever(command);
  }
}

function inverseHistoryCommand(
  project: Project,
  command: InternalProjectCommand,
): InternalHistoryCommand {
  switch (command.type) {
    case "CREATE_ROOM":
      return { type: "DELETE_ROOM", roomId: command.room.roomId };
    case "RENAME_PROJECT":
      return { type: "RENAME_PROJECT", name: project.name };
    case "ADD_ENTITY":
      return {
        type: "REMOVE_ADDED_ENTITY",
        roomId: command.roomId,
        entityId: command.entity.entityId,
      };
    case "MOVE_ENTITY": {
      const entity = findEntity(
        findRoom(project, command.roomId)!,
        command.entityId,
      )!;
      return {
        type: "MOVE_ENTITY",
        roomId: command.roomId,
        entityId: command.entityId,
        position: entity.transform.position,
      };
    }
    case "RESIZE_ENTITY": {
      const entity = findEntity(
        findRoom(project, command.roomId)!,
        command.entityId,
      )!;
      return {
        type: "RESIZE_ENTITY",
        roomId: command.roomId,
        entityId: command.entityId,
        dimensions: entity.dimensions,
      };
    }
    case "ROTATE_ENTITY": {
      const entity = findEntity(
        findRoom(project, command.roomId)!,
        command.entityId,
      )!;
      return {
        type: "ROTATE_ENTITY",
        roomId: command.roomId,
        entityId: command.entityId,
        rotation: entity.transform.rotation,
      };
    }
    case "SET_ENTITY_VISIBILITY": {
      const entity = findEntity(
        findRoom(project, command.roomId)!,
        command.entityId,
      )!;
      return {
        type: "SET_ENTITY_VISIBILITY",
        roomId: command.roomId,
        entityId: command.entityId,
        visibility: entity.visibility,
      };
    }
    case "SET_ENTITY_LOCK": {
      const entity = findEntity(
        findRoom(project, command.roomId)!,
        command.entityId,
      )!;
      return {
        type: "SET_ENTITY_LOCK",
        roomId: command.roomId,
        entityId: command.entityId,
        locked: entity.locked,
      };
    }
    case "DUPLICATE_ENTITY":
      return {
        type: "DELETE_ENTITY",
        roomId: command.roomId,
        entityId: command.newEntityId,
      };
    case "DELETE_ENTITY": {
      const room = findRoom(project, command.roomId)!;
      const insertionIndex = room.entities.findIndex(
        (entity) => entity.entityId === command.entityId,
      );
      return {
        type: "RESTORE_DELETED_ENTITY",
        roomId: command.roomId,
        entity: room.entities[insertionIndex]!,
        insertionIndex,
      };
    }
    case "DELETE_ROOM": {
      const room = findRoom(project, command.roomId)!;
      return { type: "CREATE_ROOM", room };
    }
    case "REMOVE_ADDED_ENTITY": {
      const entity = findEntity(
        findRoom(project, command.roomId)!,
        command.entityId,
      )!;
      return { type: "ADD_ENTITY", roomId: command.roomId, entity };
    }
    case "RESTORE_DELETED_ENTITY":
      return {
        type: "REMOVE_ADDED_ENTITY",
        roomId: command.roomId,
        entityId: command.entity.entityId,
      };
    default:
      return assertNever(command);
  }
}

function buildAuditRecord(
  project: Project,
  command: InternalProjectCommand,
): AuditRecord {
  const roomId = commandRoomId(command);
  const entityId = commandEntityId(command);
  const priorRoom =
    command.type === "CREATE_ROOM" || roomId === null
      ? null
      : findRoom(project, roomId);
  const record: {
    commandId: string;
    type: InternalProjectCommand["type"];
    projectId: ProjectId;
    roomId?: RoomId;
    entityId?: EntityId;
    occurredAtUtc: string;
    priorProjectRevision: RevisionId;
    newProjectRevision: RevisionId;
    priorRoomRevision?: RevisionId;
    newRoomRevision?: RevisionId;
    outcome: "APPLIED";
  } = {
    commandId: command.commandId,
    type: command.type,
    projectId: command.projectId,
    occurredAtUtc: command.occurredAtUtc,
    priorProjectRevision: project.revisionId,
    newProjectRevision: command.nextProjectRevision,
    outcome: "APPLIED",
  };
  if (roomId !== null) record.roomId = roomId;
  if (entityId !== null) record.entityId = entityId;
  if (priorRoom !== null) record.priorRoomRevision = priorRoom.revisionId;
  if (hasNextRoomRevision(command)) {
    record.newRoomRevision = command.nextRoomRevision;
  } else if (command.type === "CREATE_ROOM") {
    record.newRoomRevision = command.room.revisionId;
  }
  return Object.freeze(record);
}

function auditMatchesCommand(
  audit: AuditRecord,
  command: InternalProjectCommand,
): boolean {
  if (
    audit.commandId !== command.commandId ||
    audit.type !== command.type ||
    audit.projectId !== command.projectId ||
    audit.occurredAtUtc !== command.occurredAtUtc ||
    audit.priorProjectRevision !== command.expectedProjectRevisionId ||
    audit.newProjectRevision !== command.nextProjectRevision ||
    audit.outcome !== "APPLIED" ||
    audit.roomId !== (commandRoomId(command) ?? undefined) ||
    audit.entityId !== (commandEntityId(command) ?? undefined)
  ) {
    return false;
  }
  if (command.type === "CREATE_ROOM") {
    return (
      audit.priorRoomRevision === undefined &&
      audit.newRoomRevision === command.room.revisionId
    );
  }
  if (command.type === "RENAME_PROJECT") {
    return (
      audit.priorRoomRevision === undefined &&
      audit.newRoomRevision === undefined
    );
  }
  if (command.type === "DELETE_ROOM") {
    return (
      audit.priorRoomRevision === command.expectedRoomRevision &&
      audit.newRoomRevision === undefined
    );
  }
  return (
    audit.priorRoomRevision === command.expectedRoomRevision &&
    audit.newRoomRevision === command.nextRoomRevision
  );
}

function committedProjectMatchesCommand(
  project: Project,
  command: InternalProjectCommand,
): boolean {
  if (
    project.projectId !== command.projectId ||
    project.revisionId !== command.nextProjectRevision ||
    duplicateStateError(project) !== null
  ) {
    return false;
  }
  switch (command.type) {
    case "CREATE_ROOM": {
      const room = findRoom(project, command.room.roomId);
      return room !== null && valuesEqual(room, command.room);
    }
    case "RENAME_PROJECT":
      return project.name === command.name;
    case "ADD_ENTITY": {
      const room = findRoom(project, command.roomId);
      return (
        room !== null &&
        room.revisionId === command.nextRoomRevision &&
        valuesEqual(room.entities.at(-1), command.entity)
      );
    }
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK": {
      const room = findRoom(project, command.roomId);
      const entity = room === null ? null : findEntity(room, command.entityId);
      if (
        room === null ||
        room.revisionId !== command.nextRoomRevision ||
        entity === null
      ) {
        return false;
      }
      switch (command.type) {
        case "MOVE_ENTITY":
          return valuesEqual(entity.transform.position, command.position);
        case "RESIZE_ENTITY":
          return valuesEqual(entity.dimensions, command.dimensions);
        case "ROTATE_ENTITY":
          return valuesEqual(
            entity.transform.rotation,
            normalizeQuaternion(
              makeQuaternion(
                command.rotation.x,
                command.rotation.y,
                command.rotation.z,
                command.rotation.w,
              ),
            ),
          );
        case "SET_ENTITY_VISIBILITY":
          return entity.visibility === command.visibility;
        case "SET_ENTITY_LOCK":
          return entity.locked === command.locked;
        default:
          return assertNever(command);
      }
    }
    case "DUPLICATE_ENTITY": {
      const room = findRoom(project, command.roomId);
      const entity =
        room === null ? null : findEntity(room, command.newEntityId);
      return (
        room !== null &&
        room.revisionId === command.nextRoomRevision &&
        entity !== null &&
        entity.label === command.newLabel &&
        valuesEqual(entity.transform, makeTransform(command.newTransform)) &&
        room.entities.at(-1)?.entityId === command.newEntityId
      );
    }
    case "DELETE_ENTITY":
    case "REMOVE_ADDED_ENTITY": {
      const room = findRoom(project, command.roomId);
      return (
        room !== null &&
        room.revisionId === command.nextRoomRevision &&
        findEntity(room, command.entityId) === null
      );
    }
    case "RESTORE_DELETED_ENTITY": {
      const room = findRoom(project, command.roomId);
      return (
        room !== null &&
        room.revisionId === command.nextRoomRevision &&
        valuesEqual(room.entities[command.insertionIndex], command.entity)
      );
    }
    case "DELETE_ROOM":
      return findRoom(project, command.roomId) === null;
    default:
      return assertNever(command);
  }
}

function idempotencyRecordMatchesCommand(
  record: IdempotencyRecord,
  command: InternalProjectCommand,
  canonicalCommand: CanonicalCommandValue,
  fingerprint: string,
  historyExecution: HistoryExecutionOrigin | null,
): boolean {
  try {
    if (
      !weakSetHas(trustedIdempotencyRecords, record) ||
      record.projectId !== command.projectId ||
      record.idempotencyKey !== command.idempotencyKey ||
      record.commandFingerprint !== fingerprint ||
      !canonicalEqual(record.canonicalCommand, canonicalCommand) ||
      !historyExecutionMatches(record.historyExecution, historyExecution) ||
      record.committedFingerprint !==
        commandFingerprint(canonicalize(record.committed)) ||
      !auditMatchesCommand(record.committed.auditRecord, command)
    ) {
      return false;
    }
    const parsedProject = parseProject(record.committed.project);
    if (
      !parsedProject.ok ||
      !committedProjectMatchesCommand(parsedProject.value, command)
    ) {
      return false;
    }
    const entry = record.committed.historyEntry;
    const parsedForward = InternalHistoryCommandSchema.safeParse(entry.forward);
    const parsedInverse = InternalHistoryCommandSchema.safeParse(entry.inverse);
    return (
      entry.historyEntryId === command.commandId &&
      canonicalEqual(canonicalize(entry.forwardCommand), canonicalCommand) &&
      parsedForward.success &&
      parsedInverse.success &&
      canonicalEqual(
        canonicalize(parsedForward.data),
        canonicalize(forwardHistoryCommand(command)),
      ) &&
      entry.affectedRoomId === commandRoomId(command) &&
      entry.applicability.status === "APPLICABLE"
    );
  } catch {
    return false;
  }
}

function replayResult(record: IdempotencyRecord): SuccessfulCommandResult {
  return Object.freeze({
    ok: true,
    replayed: true,
    ...record.committed,
    idempotencyRecord: record,
  });
}

function historyExecutionMatches(
  left: unknown,
  right: HistoryExecutionOrigin | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (typeof left !== "object") return false;
  const candidate = left as Partial<HistoryExecutionOrigin>;
  return (
    candidate.direction === right.direction &&
    candidate.historyEntryId === right.historyEntryId
  );
}

function contextRecordsAreTrusted(context: DispatchContext): boolean {
  for (let index = 0; index < context.idempotencyRecords.length; index += 1) {
    const record = context.idempotencyRecords[index];
    if (
      record === undefined ||
      !weakSetHas(trustedIdempotencyRecords, record)
    ) {
      return false;
    }
  }
  return true;
}

function dispatchValidated(
  project: Project,
  command: InternalProjectCommand,
  context: DispatchContext,
  historyExecution: HistoryExecutionOrigin | null,
): CommandResult {
  if (command.projectId !== project.projectId)
    return reject("PROJECT_MISMATCH");
  if (context.projectAvailability !== "AVAILABLE") {
    return reject("PROJECT_UNAVAILABLE");
  }
  if (command.leaseFence !== context.authoritativeLeaseFence) {
    return reject("LEASE_FENCED");
  }
  const duplicateError = duplicateStateError(project);
  if (duplicateError !== null) return reject(duplicateError);
  if (!contextRecordsAreTrusted(context)) {
    return reject("IDEMPOTENCY_CONFLICT");
  }

  const canonicalCommand = canonicalize(command);
  const fingerprint = commandFingerprint(canonicalCommand);
  const existingRecords = context.idempotencyRecords.filter(
    (record) =>
      record.projectId === command.projectId &&
      record.idempotencyKey === command.idempotencyKey,
  );
  if (existingRecords.length > 1) {
    return reject("IDEMPOTENCY_CONFLICT");
  }
  const existingRecord = existingRecords[0];
  if (existingRecord !== undefined) {
    if (
      !idempotencyRecordMatchesCommand(
        existingRecord,
        command,
        canonicalCommand,
        fingerprint,
        historyExecution,
      )
    ) {
      return reject("IDEMPOTENCY_CONFLICT");
    }
    return replayResult(existingRecord);
  }
  if (
    context.idempotencyRecords.some(
      (record) => record.committed.auditRecord.commandId === command.commandId,
    )
  ) {
    return reject("DUPLICATE_ID");
  }
  const conditionError = preconditionError(project, command, context);
  if (conditionError !== null) return reject(conditionError);
  const mutationError = operationError(project, command);
  if (mutationError !== null) return reject(mutationError);

  const inverseResult = InternalHistoryCommandSchema.safeParse(
    inverseHistoryCommand(project, command),
  );
  const forwardResult = InternalHistoryCommandSchema.safeParse(
    forwardHistoryCommand(command),
  );
  if (!inverseResult.success || !forwardResult.success) {
    return reject("INVALID_COMMAND");
  }
  const parsedOutput = parseProject(applyCommand(project, command));
  if (!parsedOutput.ok) return reject("INVALID_PROJECT");

  const auditRecord = buildAuditRecord(project, command);
  const historyEntry: HistoryEntry = deepFreeze({
    historyEntryId: command.commandId,
    forwardCommand: command,
    forward: forwardResult.data,
    inverse: inverseResult.data,
    affectedRoomId: commandRoomId(command),
    applicability: Object.freeze({ status: "APPLICABLE" }),
  });
  const committed: CommittedCommandArtifacts = deepFreeze({
    project: parsedOutput.value,
    auditRecord,
    historyEntry,
  });
  const idempotencyRecord: IdempotencyRecord = deepFreeze({
    projectId: command.projectId,
    idempotencyKey: command.idempotencyKey,
    commandFingerprint: fingerprint,
    canonicalCommand,
    committedFingerprint: commandFingerprint(canonicalize(committed)),
    historyExecution:
      historyExecution === null ? null : Object.freeze({ ...historyExecution }),
    committed,
  });
  weakSetAdd(trustedIdempotencyRecords, idempotencyRecord);
  return deepFreeze({
    ok: true,
    replayed: false,
    ...committed,
    idempotencyRecord,
  });
}

/**
 * Accepts caller-trusted inert command values. Proxies, accessors, exotics, and
 * imported command text are unsupported; a later serialized ingress must bound
 * those inputs before this composable schema is used.
 */
export function dispatchProjectCommand(
  project: unknown,
  command: unknown,
  context: DispatchContext,
): CommandResult {
  const parsedProject = parseProject(project);
  if (!parsedProject.ok) return reject("INVALID_PROJECT");
  try {
    const parsedCommand = ProjectCommandSchema.safeParse(command);
    if (!parsedCommand.success) return reject("INVALID_COMMAND");
    return dispatchValidated(
      parsedProject.value,
      parsedCommand.data,
      context,
      null,
    );
  } catch {
    return reject("INVALID_COMMAND");
  }
}

function dispatchInternalHistoryCommand(
  project: unknown,
  command: unknown,
  context: DispatchContext,
  historyExecution: HistoryExecutionOrigin,
): CommandResult {
  const parsedProject = parseProject(project);
  if (!parsedProject.ok) return reject("INVALID_PROJECT");
  try {
    const parsedCommand = InternalProjectCommandSchema.safeParse(command);
    if (!parsedCommand.success) return reject("INVALID_COMMAND");
    return dispatchValidated(
      parsedProject.value,
      parsedCommand.data,
      context,
      historyExecution,
    );
  } catch {
    return reject("INVALID_COMMAND");
  }
}

const HISTORY_REJECTION_MESSAGE = "History action was rejected.";

function historyFailure(error: HistoryError): HistoryResult {
  return Object.freeze({ ok: false, error });
}

function simpleHistoryError(
  code: "HISTORY_EMPTY" | "INVALID_HISTORY",
): HistoryError {
  return Object.freeze({ code, message: HISTORY_REJECTION_MESSAGE });
}

function notApplicableError(reason: HistoryInvalidationReason): HistoryError {
  return Object.freeze({
    code: "HISTORY_NOT_APPLICABLE",
    message: HISTORY_REJECTION_MESSAGE,
    reason,
  });
}

function roomRevisionEnvelope(
  project: Project,
  targetRoomId: string,
  request: HistoryReplayEnvelope,
  expectedRoomRevisionOverride: string | null,
): Readonly<Record<string, unknown>> | null {
  const room = findRoom(project, targetRoomId);
  if (room === null && expectedRoomRevisionOverride === null) return null;
  return {
    roomId: targetRoomId,
    expectedRoomRevision: expectedRoomRevisionOverride ?? room?.revisionId,
    nextRoomRevision: request.nextRoomRevision,
  };
}

function hydrateHistoryCommand(
  project: Project,
  semantic: InternalHistoryCommand,
  request: HistoryReplayEnvelope,
  expectedRoomRevisionOverride: string | null,
): unknown | null {
  const envelope = {
    commandId: request.commandId,
    idempotencyKey: request.idempotencyKey,
    projectId: project.projectId,
    occurredAtUtc: request.occurredAtUtc,
    causalParentRevisionId: request.causalParentRevisionId,
    expectedProjectRevisionId: request.expectedProjectRevisionId,
    nextProjectRevision: request.nextProjectRevision,
    leaseFence: request.leaseFence,
  };
  switch (semantic.type) {
    case "CREATE_ROOM":
      return {
        ...envelope,
        type: semantic.type,
        room: { ...semantic.room, revisionId: request.nextRoomRevision },
      };
    case "RENAME_PROJECT":
      return { ...envelope, type: semantic.type, name: semantic.name };
    case "ADD_ENTITY":
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK":
    case "DUPLICATE_ENTITY":
    case "DELETE_ENTITY": {
      const roomEnvelope = roomRevisionEnvelope(
        project,
        semantic.roomId,
        request,
        expectedRoomRevisionOverride,
      );
      return roomEnvelope === null
        ? null
        : { ...envelope, ...roomEnvelope, ...semantic };
    }
    case "REMOVE_ADDED_ENTITY": {
      const roomEnvelope = roomRevisionEnvelope(
        project,
        semantic.roomId,
        request,
        expectedRoomRevisionOverride,
      );
      return roomEnvelope === null
        ? null
        : { ...envelope, ...roomEnvelope, ...semantic };
    }
    case "RESTORE_DELETED_ENTITY": {
      const roomEnvelope = roomRevisionEnvelope(
        project,
        semantic.roomId,
        request,
        expectedRoomRevisionOverride,
      );
      return roomEnvelope === null
        ? null
        : { ...envelope, ...roomEnvelope, ...semantic };
    }
    case "DELETE_ROOM": {
      const room = findRoom(project, semantic.roomId);
      return room === null && expectedRoomRevisionOverride === null
        ? null
        : {
            ...envelope,
            type: semantic.type,
            roomId: semantic.roomId,
            expectedRoomRevision:
              expectedRoomRevisionOverride ?? room?.revisionId,
          };
    }
    default:
      return assertNever(semantic);
  }
}

function inverseMatchesForward(entry: HistoryEntry): boolean {
  const forward = entry.forward;
  const inverse = entry.inverse;
  switch (forward.type) {
    case "CREATE_ROOM":
      return (
        inverse.type === "DELETE_ROOM" && inverse.roomId === forward.room.roomId
      );
    case "RENAME_PROJECT":
      return inverse.type === "RENAME_PROJECT";
    case "ADD_ENTITY":
      return (
        inverse.type === "REMOVE_ADDED_ENTITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.entity.entityId
      );
    case "MOVE_ENTITY":
      return (
        inverse.type === "MOVE_ENTITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.entityId
      );
    case "RESIZE_ENTITY":
      return (
        inverse.type === "RESIZE_ENTITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.entityId
      );
    case "ROTATE_ENTITY":
      return (
        inverse.type === "ROTATE_ENTITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.entityId
      );
    case "SET_ENTITY_VISIBILITY":
      return (
        inverse.type === "SET_ENTITY_VISIBILITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.entityId
      );
    case "SET_ENTITY_LOCK":
      return (
        inverse.type === "SET_ENTITY_LOCK" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.entityId
      );
    case "DUPLICATE_ENTITY":
      return (
        inverse.type === "DELETE_ENTITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entityId === forward.newEntityId
      );
    case "DELETE_ENTITY":
      return (
        inverse.type === "RESTORE_DELETED_ENTITY" &&
        inverse.roomId === forward.roomId &&
        inverse.entity.entityId === forward.entityId
      );
    case "DELETE_ROOM":
    case "REMOVE_ADDED_ENTITY":
    case "RESTORE_DELETED_ENTITY":
      return false;
    default:
      return assertNever(forward);
  }
}

function historyEntryIsConsistent(entry: HistoryEntry): boolean {
  const expectedForward = forwardHistoryCommand(entry.forwardCommand);
  return (
    canonicalEqual(
      canonicalize(expectedForward),
      canonicalize(entry.forward),
    ) &&
    commandRoomId(entry.forwardCommand) === entry.affectedRoomId &&
    inverseMatchesForward(entry)
  );
}

function historyStateIsBound(
  history: HistoryState,
  projectId: string,
): boolean {
  if (history.projectId !== projectId) return false;
  const entries = [...history.past, ...history.future];
  if (
    (entries.length === 0 && history.headProjectRevisionId !== null) ||
    (entries.length > 0 && history.headProjectRevisionId === null)
  ) {
    return false;
  }
  const entryIds = new TrustedSet<string>();
  const commandIds = new TrustedSet<string>();
  const commandKeys = new TrustedSet<string>();
  for (const entry of entries) {
    if (
      entry.forwardCommand.projectId !== projectId ||
      !historyEntryIsConsistent(entry) ||
      setHas(entryIds, entry.historyEntryId) ||
      setHas(commandIds, entry.forwardCommand.commandId) ||
      setHas(commandKeys, entry.forwardCommand.idempotencyKey)
    ) {
      return false;
    }
    setAdd(entryIds, entry.historyEntryId);
    setAdd(commandIds, entry.forwardCommand.commandId);
    setAdd(commandKeys, entry.forwardCommand.idempotencyKey);
  }
  const receiptKeys = new TrustedSet<string>();
  for (const receipt of history.replayReceipts) {
    if (
      !setHas(entryIds, receipt.historyEntryId) ||
      setHas(receiptKeys, receipt.envelope.idempotencyKey)
    ) {
      return false;
    }
    setAdd(receiptKeys, receipt.envelope.idempotencyKey);
  }
  return true;
}

function recordMatchesHistoryReceipt(
  record: IdempotencyRecord,
  projectId: string,
  receipt: HistoryReplayReceipt,
): boolean {
  try {
    const parsedCommand = InternalProjectCommandSchema.safeParse(
      record.committed.historyEntry.forwardCommand,
    );
    if (!parsedCommand.success) return false;
    const canonicalCommand = canonicalize(parsedCommand.data);
    const expectedHistoryExecution = {
      direction: receipt.direction,
      historyEntryId: receipt.historyEntryId,
    } as const;
    if (
      !idempotencyRecordMatchesCommand(
        record,
        parsedCommand.data,
        canonicalCommand,
        commandFingerprint(canonicalCommand),
        expectedHistoryExecution,
      ) ||
      typeof canonicalCommand !== "object" ||
      canonicalCommand === null ||
      Array.isArray(canonicalCommand)
    ) {
      return false;
    }
    const commandRecord = canonicalCommand as CanonicalCommandRecord;
    const envelope = receipt.envelope;
    return (
      record.projectId === projectId &&
      record.idempotencyKey === envelope.idempotencyKey &&
      commandRecord["commandId"] === envelope.commandId &&
      commandRecord["idempotencyKey"] === envelope.idempotencyKey &&
      commandRecord["projectId"] === projectId &&
      commandRecord["occurredAtUtc"] === envelope.occurredAtUtc &&
      commandRecord["causalParentRevisionId"] ===
        envelope.causalParentRevisionId &&
      commandRecord["expectedProjectRevisionId"] ===
        envelope.expectedProjectRevisionId &&
      commandRecord["nextProjectRevision"] === envelope.nextProjectRevision &&
      commandRecord["leaseFence"] === envelope.leaseFence &&
      (!Object.prototype.hasOwnProperty.call(
        commandRecord,
        "nextRoomRevision",
      ) ||
        commandRecord["nextRoomRevision"] === envelope.nextRoomRevision)
    );
  } catch {
    return false;
  }
}

function historyReceiptsHaveCommittedProvenance(
  history: HistoryState,
  context: DispatchContext,
): boolean {
  try {
    const recordsByKey = new TrustedMap<string, IdempotencyRecord | null>();
    for (const record of context.idempotencyRecords) {
      if (record.projectId !== history.projectId) continue;
      const existing = mapGet(recordsByKey, record.idempotencyKey);
      mapSet(
        recordsByKey,
        record.idempotencyKey,
        existing === undefined ? record : null,
      );
    }
    return history.replayReceipts.every((receipt) => {
      const record = mapGet(recordsByKey, receipt.envelope.idempotencyKey);
      return (
        record !== undefined &&
        record !== null &&
        recordMatchesHistoryReceipt(record, history.projectId, receipt)
      );
    });
  } catch {
    return false;
  }
}

function historyEntryHasCommittedProvenance(
  entry: HistoryEntry,
  context: DispatchContext,
): boolean {
  try {
    const records = context.idempotencyRecords.filter(
      (record) =>
        record.projectId === entry.forwardCommand.projectId &&
        record.idempotencyKey === entry.forwardCommand.idempotencyKey,
    );
    if (records.length !== 1) return false;
    const record = records[0]!;
    const committedEntry = record.committed.historyEntry;
    const expectedHistoryExecution: HistoryExecutionOrigin | null =
      committedEntry.historyEntryId === entry.historyEntryId
        ? null
        : { direction: "REDO", historyEntryId: entry.historyEntryId };
    const canonicalCommand = canonicalize(entry.forwardCommand);
    return (
      idempotencyRecordMatchesCommand(
        record,
        entry.forwardCommand,
        canonicalCommand,
        commandFingerprint(canonicalCommand),
        expectedHistoryExecution,
      ) &&
      canonicalEqual(record.canonicalCommand, canonicalCommand) &&
      canonicalEqual(
        canonicalize(committedEntry.forward),
        canonicalize(entry.forward),
      ) &&
      canonicalEqual(
        canonicalize(committedEntry.inverse),
        canonicalize(entry.inverse),
      ) &&
      committedEntry.affectedRoomId === entry.affectedRoomId
    );
  } catch {
    return false;
  }
}

function historyStackHasCausalOrder(
  history: HistoryState,
  context: DispatchContext,
): boolean {
  const entryIds = new TrustedSet<string>();
  for (const entry of [...history.past, ...history.future]) {
    setAdd(entryIds, entry.historyEntryId);
  }

  const receiptsByKey = new TrustedMap<string, HistoryReplayReceipt | null>();
  for (const receipt of history.replayReceipts) {
    const existing = mapGet(receiptsByKey, receipt.envelope.idempotencyKey);
    mapSet(
      receiptsByKey,
      receipt.envelope.idempotencyKey,
      existing === undefined ? receipt : null,
    );
  }

  const originalRecordsByEntryId = new TrustedMap<
    string,
    IdempotencyRecord | null
  >();
  const successors = new TrustedMap<string, string | null>();
  for (const record of context.idempotencyRecords) {
    if (record.projectId !== history.projectId) continue;
    const historyExecution = record.historyExecution;
    const originalEntryId = record.committed.historyEntry.historyEntryId;
    const represented =
      historyExecution === null
        ? setHas(entryIds, originalEntryId)
        : (() => {
            const receipt = mapGet(receiptsByKey, record.idempotencyKey);
            return (
              receipt !== undefined &&
              receipt !== null &&
              receipt.direction === historyExecution.direction &&
              receipt.historyEntryId === historyExecution.historyEntryId
            );
          })();
    if (!represented) continue;

    if (historyExecution === null) {
      const existing = mapGet(originalRecordsByEntryId, originalEntryId);
      mapSet(
        originalRecordsByEntryId,
        originalEntryId,
        existing === undefined ? record : null,
      );
    }

    const audit = record.committed.auditRecord;
    const existingSuccessor = mapGet(successors, audit.priorProjectRevision);
    mapSet(
      successors,
      audit.priorProjectRevision,
      existingSuccessor === undefined
        ? audit.newProjectRevision
        : existingSuccessor === audit.newProjectRevision
          ? existingSuccessor
          : null,
    );
  }

  const orderedApplicableEntries = [
    ...history.past,
    ...history.future.slice().reverse(),
  ].filter((entry) => entry.applicability.status === "APPLICABLE");
  const visitedRevisions = new TrustedSet<string>();
  let cursorRevision: string | null = null;
  for (const entry of orderedApplicableEntries) {
    const record = mapGet(originalRecordsByEntryId, entry.historyEntryId);
    if (record === undefined || record === null) return false;
    const audit = record.committed.auditRecord;
    if (
      mapGet(successors, audit.priorProjectRevision) !==
      audit.newProjectRevision
    ) {
      return false;
    }
    if (cursorRevision !== null) {
      while (cursorRevision !== audit.priorProjectRevision) {
        if (setHas(visitedRevisions, cursorRevision)) return false;
        setAdd(visitedRevisions, cursorRevision);
        const successor: string | null | undefined = mapGet(
          successors,
          cursorRevision,
        );
        if (successor === undefined || successor === null) return false;
        cursorRevision = successor;
      }
    }
    cursorRevision = audit.newProjectRevision;
  }
  return true;
}

function historyReplayFreshnessError(
  history: HistoryState,
  request: HistoryReplayEnvelope,
): CommandErrorCode | null {
  const commandIds = new TrustedSet<string>();
  const idempotencyKeys = new TrustedSet<string>();
  const revisionIds = new TrustedSet<string>();
  for (const entry of [...history.past, ...history.future]) {
    const command = entry.forwardCommand;
    setAdd(commandIds, command.commandId);
    setAdd(idempotencyKeys, command.idempotencyKey);
    setAdd(revisionIds, command.causalParentRevisionId);
    setAdd(revisionIds, command.expectedProjectRevisionId);
    setAdd(revisionIds, command.nextProjectRevision);
    switch (command.type) {
      case "CREATE_ROOM":
        setAdd(revisionIds, command.room.revisionId);
        break;
      case "RENAME_PROJECT":
        break;
      case "ADD_ENTITY":
      case "MOVE_ENTITY":
      case "RESIZE_ENTITY":
      case "ROTATE_ENTITY":
      case "SET_ENTITY_VISIBILITY":
      case "SET_ENTITY_LOCK":
      case "DUPLICATE_ENTITY":
      case "DELETE_ENTITY":
      case "REMOVE_ADDED_ENTITY":
      case "RESTORE_DELETED_ENTITY":
        setAdd(revisionIds, command.expectedRoomRevision);
        setAdd(revisionIds, command.nextRoomRevision);
        break;
      case "DELETE_ROOM":
        setAdd(revisionIds, command.expectedRoomRevision);
        break;
      default:
        assertNever(command);
    }
  }
  for (const receipt of history.replayReceipts) {
    const envelope = receipt.envelope;
    setAdd(commandIds, envelope.commandId);
    setAdd(idempotencyKeys, envelope.idempotencyKey);
    setAdd(revisionIds, envelope.causalParentRevisionId);
    setAdd(revisionIds, envelope.expectedProjectRevisionId);
    setAdd(revisionIds, envelope.nextProjectRevision);
    if (envelope.nextRoomRevision !== undefined) {
      setAdd(revisionIds, envelope.nextRoomRevision);
    }
  }
  if (setHas(commandIds, request.commandId)) return "DUPLICATE_ID";
  if (setHas(idempotencyKeys, request.idempotencyKey)) {
    return "IDEMPOTENCY_CONFLICT";
  }
  if (
    setHas(revisionIds, request.nextProjectRevision) ||
    (request.nextRoomRevision !== undefined &&
      (setHas(revisionIds, request.nextRoomRevision) ||
        request.nextRoomRevision === request.nextProjectRevision))
  ) {
    return "REVISION_CONFLICT";
  }
  return null;
}

function expectedRoomRevisionForHistory(
  project: Project,
  semantic: InternalHistoryCommand,
): string | null {
  switch (semantic.type) {
    case "CREATE_ROOM":
    case "RENAME_PROJECT":
      return null;
    case "ADD_ENTITY":
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK":
    case "DUPLICATE_ENTITY":
    case "DELETE_ENTITY":
    case "DELETE_ROOM":
    case "REMOVE_ADDED_ENTITY":
    case "RESTORE_DELETED_ENTITY":
      return findRoom(project, semantic.roomId)?.revisionId ?? null;
    default:
      return assertNever(semantic);
  }
}

function historyCommandRequiresNextRoomRevision(
  semantic: InternalHistoryCommand,
): boolean {
  switch (semantic.type) {
    case "CREATE_ROOM":
    case "ADD_ENTITY":
    case "MOVE_ENTITY":
    case "RESIZE_ENTITY":
    case "ROTATE_ENTITY":
    case "SET_ENTITY_VISIBILITY":
    case "SET_ENTITY_LOCK":
    case "DUPLICATE_ENTITY":
    case "DELETE_ENTITY":
    case "REMOVE_ADDED_ENTITY":
    case "RESTORE_DELETED_ENTITY":
      return true;
    case "DELETE_ROOM":
    case "RENAME_PROJECT":
      return false;
    default:
      return assertNever(semantic);
  }
}

function historyEnvelopeMatchesSemantic(
  semantic: InternalHistoryCommand,
  request: HistoryReplayEnvelope,
): boolean {
  return (
    (request.nextRoomRevision !== undefined) ===
    historyCommandRequiresNextRoomRevision(semantic)
  );
}

function executeHistory(
  direction: "UNDO" | "REDO",
  project: Project,
  history: HistoryState,
  request: HistoryReplayEnvelope,
  context: DispatchContext,
): HistoryResult {
  const guardedProject = parseProject(project);
  if (!guardedProject.ok) {
    return historyFailure({
      code: "INVALID_PROJECT",
      message: REJECTION_MESSAGE,
    });
  }
  deepFreeze(guardedProject.value);
  if (context.projectAvailability !== "AVAILABLE") {
    return historyFailure({
      code: "PROJECT_UNAVAILABLE",
      message: REJECTION_MESSAGE,
    });
  }
  let parsedRequest: HistoryReplayEnvelope;
  try {
    const requestResult = HistoryReplayEnvelopeSchema.safeParse(request);
    if (!requestResult.success) {
      return historyFailure({
        code: "INVALID_COMMAND",
        message: REJECTION_MESSAGE,
      });
    }
    parsedRequest = requestResult.data;
  } catch {
    return historyFailure({
      code: "INVALID_COMMAND",
      message: REJECTION_MESSAGE,
    });
  }
  if (parsedRequest.leaseFence !== context.authoritativeLeaseFence) {
    return historyFailure({
      code: "LEASE_FENCED",
      message: REJECTION_MESSAGE,
    });
  }
  const duplicateError = duplicateStateError(guardedProject.value);
  if (duplicateError !== null) {
    return historyFailure({
      code: duplicateError,
      message: REJECTION_MESSAGE,
    });
  }
  if (!contextRecordsAreTrusted(context)) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  let currentHistory: HistoryState;
  try {
    const historyResult = HistoryStateSchema.safeParse(history);
    if (!historyResult.success) {
      return historyFailure(simpleHistoryError("INVALID_HISTORY"));
    }
    currentHistory = deepFreeze(historyResult.data as HistoryState);
  } catch {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  if (!historyStateIsBound(currentHistory, guardedProject.value.projectId)) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  const historyHeadMatches =
    currentHistory.headProjectRevisionId === guardedProject.value.revisionId;

  const matchingReceipts = currentHistory.replayReceipts.filter(
    (receipt) =>
      receipt.envelope.idempotencyKey === parsedRequest.idempotencyKey,
  );
  if (matchingReceipts.length > 1) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  const matchingReceipt = matchingReceipts[0];
  if (matchingReceipt !== undefined) {
    const receiptEntry = [
      ...currentHistory.past,
      ...currentHistory.future,
    ].find(
      (candidate) =>
        candidate.historyEntryId === matchingReceipt.historyEntryId,
    );
    if (receiptEntry === undefined) {
      return historyFailure(simpleHistoryError("INVALID_HISTORY"));
    }
    const receiptSemantic =
      direction === "UNDO" ? receiptEntry.inverse : receiptEntry.forward;
    if (!historyEnvelopeMatchesSemantic(receiptSemantic, parsedRequest)) {
      return historyFailure({
        code: "INVALID_COMMAND",
        message: REJECTION_MESSAGE,
      });
    }
    if (
      matchingReceipt.direction !== direction ||
      !canonicalEqual(
        canonicalize(matchingReceipt.envelope),
        canonicalize(parsedRequest),
      )
    ) {
      return historyFailure({
        code: "IDEMPOTENCY_CONFLICT",
        message: REJECTION_MESSAGE,
      });
    }
    if (!historyReceiptsHaveCommittedProvenance(currentHistory, context)) {
      return historyFailure(simpleHistoryError("INVALID_HISTORY"));
    }
    const matchingRecords = context.idempotencyRecords.filter(
      (record) =>
        record.projectId === currentHistory.projectId &&
        record.idempotencyKey === parsedRequest.idempotencyKey,
    );
    if (
      matchingRecords.length !== 1 ||
      !recordMatchesHistoryReceipt(
        matchingRecords[0]!,
        currentHistory.projectId,
        matchingReceipt,
      )
    ) {
      return historyFailure({
        code: "IDEMPOTENCY_CONFLICT",
        message: REJECTION_MESSAGE,
      });
    }
    return Object.freeze({
      ok: true,
      project: guardedProject.value,
      history: currentHistory,
      commandResult: replayResult(matchingRecords[0]!),
    });
  }
  if (!historyReceiptsHaveCommittedProvenance(currentHistory, context)) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  if (!historyStackHasCausalOrder(currentHistory, context)) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }

  const stack =
    direction === "UNDO" ? currentHistory.past : currentHistory.future;
  const entry = stack.at(-1);
  if (entry === undefined) {
    return historyFailure(simpleHistoryError("HISTORY_EMPTY"));
  }
  if (!historyEntryHasCommittedProvenance(entry, context)) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  if (entry.applicability.status === "NON_APPLICABLE") {
    return historyFailure(notApplicableError(entry.applicability.reason));
  }
  const semantic = direction === "UNDO" ? entry.inverse : entry.forward;
  if (!historyEnvelopeMatchesSemantic(semantic, parsedRequest)) {
    return historyFailure({
      code: "INVALID_COMMAND",
      message: REJECTION_MESSAGE,
    });
  }
  const freshnessError = historyReplayFreshnessError(
    currentHistory,
    parsedRequest,
  );
  if (freshnessError !== null) {
    return historyFailure({
      code: freshnessError,
      message: REJECTION_MESSAGE,
    });
  }
  const expectedRoomRevision = expectedRoomRevisionForHistory(
    guardedProject.value,
    semantic,
  );
  const command = hydrateHistoryCommand(
    guardedProject.value,
    semantic,
    parsedRequest,
    expectedRoomRevision,
  );
  if (command === null) {
    return historyFailure({
      code: "ROOM_NOT_FOUND",
      message: REJECTION_MESSAGE,
    });
  }
  const commandResult = dispatchInternalHistoryCommand(
    guardedProject.value,
    command,
    context,
    { direction, historyEntryId: entry.historyEntryId },
  );
  if (commandResult.ok && commandResult.replayed) {
    return Object.freeze({
      ok: true,
      project: guardedProject.value,
      history: currentHistory,
      commandResult,
    });
  }
  if (!historyHeadMatches) {
    return historyFailure(simpleHistoryError("INVALID_HISTORY"));
  }
  if (!commandResult.ok) {
    return historyFailure(commandResult.error);
  }
  if (currentHistory.replayReceipts.length >= MAX_HISTORY_RECORDS) {
    return historyFailure({
      code: "CAPACITY_EXCEEDED",
      message: REJECTION_MESSAGE,
    });
  }
  const receipt: HistoryReplayReceipt = Object.freeze({
    direction,
    historyEntryId: entry.historyEntryId,
    envelope: Object.freeze({ ...parsedRequest }),
  });
  if (direction === "UNDO") {
    return Object.freeze({
      ok: true,
      project: commandResult.project,
      history: Object.freeze({
        projectId: currentHistory.projectId,
        headProjectRevisionId: commandResult.project.revisionId,
        past: Object.freeze(currentHistory.past.slice(0, -1)),
        future: Object.freeze([...currentHistory.future, entry]),
        replayReceipts: Object.freeze([
          ...currentHistory.replayReceipts,
          receipt,
        ]),
      }),
      commandResult,
    });
  }
  return Object.freeze({
    ok: true,
    project: commandResult.project,
    history: Object.freeze({
      projectId: currentHistory.projectId,
      headProjectRevisionId: commandResult.project.revisionId,
      past: Object.freeze([
        ...currentHistory.past,
        Object.freeze({
          ...commandResult.historyEntry,
          historyEntryId: entry.historyEntryId,
        }),
      ]),
      future: Object.freeze(currentHistory.future.slice(0, -1)),
      replayReceipts: Object.freeze([
        ...currentHistory.replayReceipts,
        receipt,
      ]),
    }),
    commandResult,
  });
}

export function undo(
  project: Project,
  history: HistoryState,
  request: HistoryReplayEnvelope,
  context: DispatchContext,
): HistoryResult {
  return executeHistory("UNDO", project, history, request, context);
}

export function redo(
  project: Project,
  history: HistoryState,
  request: HistoryReplayEnvelope,
  context: DispatchContext,
): HistoryResult {
  return executeHistory("REDO", project, history, request, context);
}

export type { ProjectCommand };
