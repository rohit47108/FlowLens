import { z } from "zod";
import {
  commandId,
  createProjectId,
  entityId,
  leaseFence,
  revisionId,
  roomId,
} from "./identity";
import { RoomSchema, SpatialEntitySchema } from "./project-schema";

const MAX_TEXT_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 128;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

const boundedText = z
  .string()
  .min(1)
  .max(MAX_TEXT_LENGTH)
  .refine((value) => !containsControlCharacter(value))
  .refine((value) => value.trim().length > 0)
  .refine((value) => value === value.normalize("NFC"));

const boundedIdentifier = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .refine((value) => value === value.normalize("NFC"));

const CommandIdSchema = boundedIdentifier.transform((value) =>
  commandId(() => value),
);
const ProjectIdSchema = boundedIdentifier.transform((value) =>
  createProjectId(() => value),
);
const RoomIdSchema = boundedIdentifier.transform((value) =>
  roomId(() => value),
);
const EntityIdSchema = boundedIdentifier.transform((value) =>
  entityId(() => value),
);
const RevisionIdSchema = boundedIdentifier.transform((value) =>
  revisionId(() => value),
);
const LeaseFenceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .transform(leaseFence);
const UtcTimestampSchema = z.iso.datetime({
  offset: false,
  local: false,
  precision: 3,
});

const finiteSafeNumber = z
  .number()
  .finite()
  .gte(-Number.MAX_SAFE_INTEGER)
  .lte(Number.MAX_SAFE_INTEGER)
  .transform((value) => (value === 0 ? 0 : value));
const positiveFiniteSafeNumber = finiteSafeNumber.pipe(z.number().gt(0));

const PositionSchema = z
  .strictObject({
    x: finiteSafeNumber,
    y: finiteSafeNumber,
    z: finiteSafeNumber,
  })
  .readonly();
const RotationSchema = z
  .strictObject({
    x: finiteSafeNumber,
    y: finiteSafeNumber,
    z: finiteSafeNumber,
    w: finiteSafeNumber,
  })
  .refine(
    (value) => value.x !== 0 || value.y !== 0 || value.z !== 0 || value.w !== 0,
  )
  .readonly();
const ScaleSchema = z
  .strictObject({
    x: positiveFiniteSafeNumber,
    y: positiveFiniteSafeNumber,
    z: positiveFiniteSafeNumber,
  })
  .readonly();
const TransformSchema = z
  .strictObject({
    position: PositionSchema,
    rotation: RotationSchema,
    scale: ScaleSchema,
  })
  .readonly();
const DimensionsSchema = z
  .strictObject({
    xMetres: positiveFiniteSafeNumber,
    yMetres: positiveFiniteSafeNumber,
    zMetres: positiveFiniteSafeNumber,
  })
  .readonly();

const CommandEnvelopeSchema = z.strictObject({
  commandId: CommandIdSchema,
  idempotencyKey: boundedIdentifier,
  projectId: ProjectIdSchema,
  occurredAtUtc: UtcTimestampSchema,
  causalParentRevisionId: RevisionIdSchema,
  expectedProjectRevisionId: RevisionIdSchema,
  nextProjectRevision: RevisionIdSchema,
  leaseFence: LeaseFenceSchema,
});

const ExistingRoomEnvelopeSchema = CommandEnvelopeSchema.extend({
  roomId: RoomIdSchema,
  expectedRoomRevision: RevisionIdSchema,
  nextRoomRevision: RevisionIdSchema,
});

export const HistoryReplayEnvelopeSchema = CommandEnvelopeSchema.omit({
  projectId: true,
})
  .extend({ nextRoomRevision: RevisionIdSchema.optional() })
  .superRefine((value, context) => {
    if (
      Object.prototype.hasOwnProperty.call(value, "nextRoomRevision") &&
      value.nextRoomRevision === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["nextRoomRevision"],
        message: "Explicit undefined is not permitted.",
      });
    }
  })
  .readonly();

const CreateRoomCommandSchema = CommandEnvelopeSchema.extend({
  type: z.literal("CREATE_ROOM"),
  room: RoomSchema,
}).readonly();
const RenameProjectCommandSchema = CommandEnvelopeSchema.extend({
  type: z.literal("RENAME_PROJECT"),
  name: boundedText,
}).readonly();
const AddEntityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("ADD_ENTITY"),
  entity: SpatialEntitySchema,
}).readonly();
const MoveEntityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("MOVE_ENTITY"),
  entityId: EntityIdSchema,
  position: PositionSchema,
}).readonly();
const ResizeEntityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("RESIZE_ENTITY"),
  entityId: EntityIdSchema,
  dimensions: DimensionsSchema,
}).readonly();
const RotateEntityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("ROTATE_ENTITY"),
  entityId: EntityIdSchema,
  rotation: RotationSchema,
}).readonly();
const SetEntityVisibilityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("SET_ENTITY_VISIBILITY"),
  entityId: EntityIdSchema,
  visibility: z.enum(["VISIBLE", "HIDDEN"]),
}).readonly();
const SetEntityLockCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("SET_ENTITY_LOCK"),
  entityId: EntityIdSchema,
  locked: z.boolean(),
}).readonly();
const DuplicateEntityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("DUPLICATE_ENTITY"),
  entityId: EntityIdSchema,
  newEntityId: EntityIdSchema,
  newLabel: boundedText,
  newTransform: TransformSchema,
}).readonly();
const DeleteEntityCommandSchema = ExistingRoomEnvelopeSchema.extend({
  type: z.literal("DELETE_ENTITY"),
  entityId: EntityIdSchema,
}).readonly();

export const ProjectCommandSchema = z.discriminatedUnion("type", [
  CreateRoomCommandSchema,
  RenameProjectCommandSchema,
  AddEntityCommandSchema,
  MoveEntityCommandSchema,
  ResizeEntityCommandSchema,
  RotateEntityCommandSchema,
  SetEntityVisibilityCommandSchema,
  SetEntityLockCommandSchema,
  DuplicateEntityCommandSchema,
  DeleteEntityCommandSchema,
]);

const GeneratedDeleteRoomCommandSchema = CommandEnvelopeSchema.extend({
  type: z.literal("DELETE_ROOM"),
  roomId: RoomIdSchema,
  expectedRoomRevision: RevisionIdSchema,
}).readonly();
const GeneratedRemoveAddedEntityCommandSchema =
  ExistingRoomEnvelopeSchema.extend({
    type: z.literal("REMOVE_ADDED_ENTITY"),
    entityId: EntityIdSchema,
  }).readonly();
const GeneratedRestoreDeletedEntityCommandSchema =
  ExistingRoomEnvelopeSchema.extend({
    type: z.literal("RESTORE_DELETED_ENTITY"),
    entity: SpatialEntitySchema,
    insertionIndex: z.number().int().nonnegative().max(256),
  }).readonly();

export const InternalProjectCommandSchema = z.discriminatedUnion("type", [
  CreateRoomCommandSchema,
  RenameProjectCommandSchema,
  AddEntityCommandSchema,
  MoveEntityCommandSchema,
  ResizeEntityCommandSchema,
  RotateEntityCommandSchema,
  SetEntityVisibilityCommandSchema,
  SetEntityLockCommandSchema,
  DuplicateEntityCommandSchema,
  DeleteEntityCommandSchema,
  GeneratedDeleteRoomCommandSchema,
  GeneratedRemoveAddedEntityCommandSchema,
  GeneratedRestoreDeletedEntityCommandSchema,
]);

const CreateRoomHistoryCommandSchema = z
  .strictObject({ type: z.literal("CREATE_ROOM"), room: RoomSchema })
  .readonly();
const RenameProjectHistoryCommandSchema = z
  .strictObject({ type: z.literal("RENAME_PROJECT"), name: boundedText })
  .readonly();
const AddEntityHistoryCommandSchema = z
  .strictObject({
    type: z.literal("ADD_ENTITY"),
    roomId: RoomIdSchema,
    entity: SpatialEntitySchema,
  })
  .readonly();
const EntityTargetHistorySchema = z.strictObject({
  roomId: RoomIdSchema,
  entityId: EntityIdSchema,
});
const MoveEntityHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("MOVE_ENTITY"),
  position: PositionSchema,
}).readonly();
const ResizeEntityHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("RESIZE_ENTITY"),
  dimensions: DimensionsSchema,
}).readonly();
const RotateEntityHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("ROTATE_ENTITY"),
  rotation: RotationSchema,
}).readonly();
const SetEntityVisibilityHistoryCommandSchema =
  EntityTargetHistorySchema.extend({
    type: z.literal("SET_ENTITY_VISIBILITY"),
    visibility: z.enum(["VISIBLE", "HIDDEN"]),
  }).readonly();
const SetEntityLockHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("SET_ENTITY_LOCK"),
  locked: z.boolean(),
}).readonly();
const DuplicateEntityHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("DUPLICATE_ENTITY"),
  newEntityId: EntityIdSchema,
  newLabel: boundedText,
  newTransform: TransformSchema,
}).readonly();
const DeleteEntityHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("DELETE_ENTITY"),
}).readonly();
const DeleteRoomHistoryCommandSchema = z
  .strictObject({ type: z.literal("DELETE_ROOM"), roomId: RoomIdSchema })
  .readonly();
const RemoveAddedEntityHistoryCommandSchema = EntityTargetHistorySchema.extend({
  type: z.literal("REMOVE_ADDED_ENTITY"),
}).readonly();
const RestoreDeletedEntityHistoryCommandSchema = z
  .strictObject({
    type: z.literal("RESTORE_DELETED_ENTITY"),
    roomId: RoomIdSchema,
    entity: SpatialEntitySchema,
    insertionIndex: z.number().int().nonnegative().max(256),
  })
  .readonly();

export const InternalHistoryCommandSchema = z.discriminatedUnion("type", [
  CreateRoomHistoryCommandSchema,
  RenameProjectHistoryCommandSchema,
  AddEntityHistoryCommandSchema,
  MoveEntityHistoryCommandSchema,
  ResizeEntityHistoryCommandSchema,
  RotateEntityHistoryCommandSchema,
  SetEntityVisibilityHistoryCommandSchema,
  SetEntityLockHistoryCommandSchema,
  DuplicateEntityHistoryCommandSchema,
  DeleteEntityHistoryCommandSchema,
  DeleteRoomHistoryCommandSchema,
  RemoveAddedEntityHistoryCommandSchema,
  RestoreDeletedEntityHistoryCommandSchema,
]);

export type ProjectCommand = z.infer<typeof ProjectCommandSchema>;
export type InternalProjectCommand = z.infer<
  typeof InternalProjectCommandSchema
>;
export type InternalHistoryCommand = z.infer<
  typeof InternalHistoryCommandSchema
>;
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type ParsedHistoryReplayEnvelope = z.infer<
  typeof HistoryReplayEnvelopeSchema
>;
