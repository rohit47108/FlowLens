import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minimalProject } from "../../tests/fixtures/minimal-project";
import { InternalHistoryCommandSchema, ProjectCommandSchema } from "./commands";
import { parseProject, type Project } from "./project-schema";
import * as projectAggregate from "./project-aggregate";
import {
  dispatchProjectCommand,
  type DispatchContext,
  type IdempotencyRecord,
} from "./project-aggregate";
import { appendHistory, createHistoryState } from "./history";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function firstMutablePath(value: unknown, path = "$"): string | null {
  if (value === null || typeof value !== "object") return null;
  if (!Object.isFrozen(value)) return path;
  for (const [key, child] of Object.entries(value)) {
    const mutablePath = firstMutablePath(child, `${path}.${key}`);
    if (mutablePath !== null) return mutablePath;
  }
  return null;
}

function setAtPath(
  target: object,
  path: readonly (string | number)[],
  value: unknown,
): void {
  let cursor: unknown = target;
  for (const segment of path.slice(0, -1)) {
    cursor = (cursor as Record<string | number, unknown>)[segment];
  }
  (cursor as Record<string | number, unknown>)[path.at(-1)!] = value;
}

function projectFixture(): Project {
  const parsed = parseProject(structuredClone(minimalProject));
  if (!parsed.ok) {
    throw new Error("Expected the synthetic project fixture to parse");
  }
  return deepFreeze(parsed.value);
}

function context(
  idempotencyRecords: readonly IdempotencyRecord[] = [],
  authoritativeLeaseFence = 7,
): DispatchContext {
  return {
    authoritativeLeaseFence,
    idempotencyRecords,
    knownProjectRevisionIds: [],
    knownRoomRevisionIds: [],
    projectAvailability: "AVAILABLE",
  };
}

function envelope(
  project: Project,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    commandId: "command-test-001",
    idempotencyKey: "idempotency-test-001",
    projectId: project.projectId,
    occurredAtUtc: "2026-08-25T12:00:00.000Z",
    causalParentRevisionId: project.revisionId,
    expectedProjectRevisionId: project.revisionId,
    nextProjectRevision: "revision-project-next-001",
    leaseFence: 7,
    ...overrides,
  };
}

function roomEnvelope(
  project: Project,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const room = project.rooms[0]!;
  return {
    ...envelope(project),
    roomId: room.roomId,
    expectedRoomRevision: room.revisionId,
    nextRoomRevision: "revision-room-next-001",
    ...overrides,
  };
}

describe("project command schema", () => {
  it("accepts exactly the ten public foundation command types", () => {
    const project = projectFixture();
    const room = project.rooms[0]!;
    const entity = room.entities[0]!;
    const commands = [
      {
        type: "CREATE_ROOM",
        ...envelope(project),
        room: { ...room, roomId: "room-new-001" },
      },
      { type: "RENAME_PROJECT", ...envelope(project), name: "Renamed" },
      { type: "ADD_ENTITY", ...roomEnvelope(project), entity },
      {
        type: "MOVE_ENTITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
        position: { x: 2, y: 0, z: 2 },
      },
      {
        type: "RESIZE_ENTITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
        dimensions: { xMetres: 1, yMetres: 1, zMetres: 1 },
      },
      {
        type: "ROTATE_ENTITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      {
        type: "SET_ENTITY_VISIBILITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
        visibility: "HIDDEN",
      },
      {
        type: "SET_ENTITY_LOCK",
        ...roomEnvelope(project),
        entityId: entity.entityId,
        locked: true,
      },
      {
        type: "DUPLICATE_ENTITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
        newEntityId: "entity-copy-001",
        newLabel: "Deterministic copy",
        newTransform: entity.transform,
      },
      {
        type: "DELETE_ENTITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
      },
    ];

    expect(
      commands.map(
        (command) => ProjectCommandSchema.safeParse(command).success,
      ),
    ).toEqual(Array.from({ length: 10 }, () => true));
    expect(
      ProjectCommandSchema.safeParse({
        type: "DELETE_ROOM",
        ...roomEnvelope(project),
      }).success,
    ).toBe(false);
  });
});

describe("dispatchProjectCommand", () => {
  it("moves an entity immutably and advances explicit revisions", () => {
    const project = projectFixture();
    const originalPosition = structuredClone(
      project.rooms[0]!.entities[0]!.transform.position,
    );
    const result = dispatchProjectCommand(
      project,
      {
        type: "MOVE_ENTITY",
        ...roomEnvelope(project),
        entityId: project.rooms[0]!.entities[0]!.entityId,
        position: { x: 2, y: 0, z: 3 },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected movement to succeed");
    expect(result.project.revisionId).toBe("revision-project-next-001");
    expect(result.project.rooms[0]!.revisionId).toBe("revision-room-next-001");
    expect(result.project.rooms[0]!.entities[0]!.transform.position).toEqual({
      x: 2,
      y: 0,
      z: 3,
    });
    expect(project.rooms[0]!.entities[0]!.transform.position).toEqual(
      originalPosition,
    );
    expect(
      InternalHistoryCommandSchema.safeParse(result.historyEntry.inverse)
        .success,
    ).toBe(true);
  });

  it.each([
    "MOVE_ENTITY",
    "RESIZE_ENTITY",
    "ROTATE_ENTITY",
    "DELETE_ENTITY",
    "DUPLICATE_ENTITY",
  ] as const)("rejects %s for a locked entity without mutation", (type) => {
    const base = projectFixture();
    const lockedInput = structuredClone(base);
    setAtPath(lockedInput, ["rooms", 0, "entities", 0, "locked"], true);
    const parsed = parseProject(lockedInput);
    if (!parsed.ok) throw new Error("Expected locked fixture to parse");
    const project = deepFreeze(parsed.value);
    const entity = project.rooms[0]!.entities[0]!;
    const payload =
      type === "MOVE_ENTITY"
        ? { position: { x: 2, y: 0, z: 2 } }
        : type === "RESIZE_ENTITY"
          ? { dimensions: { xMetres: 1, yMetres: 1, zMetres: 1 } }
          : type === "ROTATE_ENTITY"
            ? { rotation: { x: 0, y: 0, z: 0, w: 1 } }
            : type === "DUPLICATE_ENTITY"
              ? {
                  newEntityId: "entity-copy-locked",
                  newLabel: "Locked copy",
                  newTransform: entity.transform,
                }
              : {};

    const result = dispatchProjectCommand(
      project,
      { type, ...roomEnvelope(project), entityId: entity.entityId, ...payload },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ENTITY_LOCKED" },
    });
    expect(project).toEqual(parsed.value);
  });

  it("allows visibility changes and unlocking on a locked entity", () => {
    const lockedInput = structuredClone(projectFixture());
    setAtPath(lockedInput, ["rooms", 0, "entities", 0, "locked"], true);
    const parsed = parseProject(lockedInput);
    if (!parsed.ok) throw new Error("Expected locked fixture to parse");
    const project = deepFreeze(parsed.value);

    const hidden = dispatchProjectCommand(
      project,
      {
        type: "SET_ENTITY_VISIBILITY",
        ...roomEnvelope(project),
        entityId: project.rooms[0]!.entities[0]!.entityId,
        visibility: "HIDDEN",
      },
      context(),
    );
    expect(hidden.ok && hidden.project.rooms[0]!.entities[0]!.visibility).toBe(
      "HIDDEN",
    );

    const unlocked = dispatchProjectCommand(
      project,
      {
        type: "SET_ENTITY_LOCK",
        ...roomEnvelope(project, {
          commandId: "command-unlock-001",
          idempotencyKey: "idempotency-unlock-001",
          nextProjectRevision: "revision-project-unlocked",
          nextRoomRevision: "revision-room-unlocked",
        }),
        entityId: project.rooms[0]!.entities[0]!.entityId,
        locked: false,
      },
      context(),
    );
    expect(unlocked.ok && unlocked.project.rooms[0]!.entities[0]!.locked).toBe(
      false,
    );
  });

  it("rejects stale project or room revisions and fence mismatches exactly", () => {
    const project = projectFixture();
    const entityId = project.rooms[0]!.entities[0]!.entityId;
    const command = {
      type: "MOVE_ENTITY" as const,
      ...roomEnvelope(project),
      entityId,
      position: { x: 2, y: 0, z: 2 },
    };

    for (const [changed, code, dispatchContext] of [
      [
        { ...command, causalParentRevisionId: "revision-stale" },
        "REVISION_CONFLICT",
        context(),
      ],
      [
        { ...command, expectedRoomRevision: "revision-room-stale" },
        "REVISION_CONFLICT",
        context(),
      ],
      [{ ...command, leaseFence: 6 }, "LEASE_FENCED", context()],
      [{ ...command, leaseFence: 8 }, "LEASE_FENCED", context()],
    ] as const) {
      const before = structuredClone(project);
      const result = dispatchProjectCommand(project, changed, dispatchContext);
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(project).toEqual(before);
    }
  });

  it("replays the exact prior result before revision checks", () => {
    const project = projectFixture();
    const command = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project),
      name: "Deterministic rename",
    };
    const first = dispatchProjectCommand(project, command, context());
    if (!first.ok) throw new Error("Expected rename to succeed");

    const later = dispatchProjectCommand(
      first.project,
      {
        type: "RENAME_PROJECT",
        ...envelope(first.project, {
          commandId: "command-later-001",
          idempotencyKey: "idempotency-later-001",
          nextProjectRevision: "revision-project-later-001",
        }),
        name: "Later rename",
      },
      context([first.idempotencyRecord]),
    );
    if (!later.ok) throw new Error("Expected later rename to succeed");

    const replay = dispatchProjectCommand(
      later.project,
      command,
      context([first.idempotencyRecord, later.idempotencyRecord]),
    );

    expect(replay).toEqual({ ...first, replayed: true });
    if (!replay.ok) throw new Error("Expected replay to succeed");
    expect(replay.auditRecord).toBe(first.auditRecord);
    expect(replay.historyEntry).toBe(first.historyEntry);
  });

  it("rejects copied replay records and returns only deeply frozen genuine artifacts", () => {
    const project = projectFixture();
    const command = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project, {
        commandId: "command-authoritative-replay",
        idempotencyKey: "idempotency-authoritative-replay",
      }),
      name: "Authoritative replay",
    };
    const first = dispatchProjectCommand(project, command, context());
    if (!first.ok) throw new Error("Expected replay setup to succeed");
    const copiedRecord = structuredClone(first.idempotencyRecord);

    expect(
      dispatchProjectCommand(first.project, command, context([copiedRecord])),
    ).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });

    const replay = dispatchProjectCommand(
      first.project,
      command,
      context([first.idempotencyRecord]),
    );
    if (!replay.ok) throw new Error("Expected genuine replay to succeed");
    expect(replay.replayed).toBe(true);
    expect(firstMutablePath(replay)).toBeNull();
    expect(firstMutablePath(replay.idempotencyRecord)).toBeNull();
  });

  it("derives revision uniqueness from committed records when hint arrays are empty", () => {
    const project = projectFixture();
    const first = dispatchProjectCommand(
      project,
      {
        type: "RENAME_PROJECT",
        ...envelope(project, {
          commandId: "command-revision-authority-first",
          idempotencyKey: "idempotency-revision-authority-first",
          nextProjectRevision: "revision-project-authority-first",
        }),
        name: "First revision authority",
      },
      context(),
    );
    if (!first.ok) throw new Error("Expected first revision to commit");

    expect(
      dispatchProjectCommand(
        first.project,
        {
          type: "RENAME_PROJECT",
          ...envelope(first.project, {
            commandId: "command-revision-authority-second",
            idempotencyKey: "idempotency-revision-authority-second",
            nextProjectRevision: project.revisionId,
          }),
          name: "Reused historical revision",
        },
        context([first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
  });

  it("derives room revision uniqueness from committed records", () => {
    const project = projectFixture();
    const entityId = project.rooms[0]!.entities[0]!.entityId;
    const first = dispatchProjectCommand(
      project,
      {
        type: "MOVE_ENTITY",
        ...roomEnvelope(project, {
          commandId: "command-room-revision-authority-first",
          idempotencyKey: "idempotency-room-revision-authority-first",
          nextProjectRevision: "revision-project-room-authority-first",
          nextRoomRevision: "revision-room-authority-first",
        }),
        entityId,
        position: { x: 2, y: 0, z: 2 },
      },
      context(),
    );
    if (!first.ok) throw new Error("Expected first room revision to commit");

    expect(
      dispatchProjectCommand(
        first.project,
        {
          type: "MOVE_ENTITY",
          ...roomEnvelope(first.project, {
            commandId: "command-room-revision-authority-second",
            idempotencyKey: "idempotency-room-revision-authority-second",
            nextProjectRevision: "revision-project-room-authority-second",
            nextRoomRevision: project.rooms[0]!.revisionId,
          }),
          entityId,
          position: { x: 3, y: 0, z: 3 },
        },
        context([first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
  });

  it("rejects a replay record whose committed artifacts were substituted", () => {
    const project = projectFixture();
    const command = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project, {
        commandId: "command-tampered-replay",
        idempotencyKey: "idempotency-tampered-replay",
      }),
      name: "Trusted committed name",
    };
    const first = dispatchProjectCommand(project, command, context());
    if (!first.ok) throw new Error("Expected replay setup to succeed");
    const tamperedRecord = {
      ...first.idempotencyRecord,
      committed: {
        ...first.idempotencyRecord.committed,
        project: {
          ...first.project,
          projectId: "project-unrelated-private",
          name: "PRIVATE_REPLAY_SENTINEL",
        },
      },
    } as unknown as IdempotencyRecord;

    const replay = dispatchProjectCommand(
      first.project,
      command,
      context([tamperedRecord]),
    );
    expect(replay).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(JSON.stringify(replay)).not.toContain("PRIVATE_REPLAY_SENTINEL");
  });

  it("checks project identity and exact fence authorization before replay", () => {
    const project = projectFixture();
    const command = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project),
      name: "Replay protected",
    };
    const first = dispatchProjectCommand(project, command, context());
    if (!first.ok) throw new Error("Expected initial command to succeed");
    expect(
      dispatchProjectCommand(
        project,
        { ...command, projectId: "project-other" },
        context([first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "PROJECT_MISMATCH" } });
    expect(
      dispatchProjectCommand(
        project,
        command,
        context([first.idempotencyRecord], 8),
      ),
    ).toMatchObject({ ok: false, error: { code: "LEASE_FENCED" } });
  });

  it("scopes idempotency records to project and rejects ambiguous scoped records", () => {
    const project = projectFixture();
    const command = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project),
      name: "Scoped replay",
    };
    const first = dispatchProjectCommand(project, command, context());
    if (!first.ok) throw new Error("Expected initial command to succeed");
    expect(
      dispatchProjectCommand(
        project,
        command,
        context([first.idempotencyRecord, first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });

    const otherProjectInput = {
      ...structuredClone(project),
      projectId: "project-other",
      revisionId: "revision-project-other-start",
    };
    const otherProject = parseProject(otherProjectInput);
    if (!otherProject.ok) throw new Error("Expected other project to parse");
    const otherProjectResult = dispatchProjectCommand(
      otherProject.value,
      {
        type: "RENAME_PROJECT",
        ...envelope(otherProject.value, {
          commandId: "command-other-project-record",
          nextProjectRevision: "revision-project-other-next",
        }),
        name: "Other project record",
      },
      context(),
    );
    if (!otherProjectResult.ok) {
      throw new Error("Expected other project record to commit");
    }
    expect(
      dispatchProjectCommand(
        project,
        {
          ...command,
          commandId: "command-other-project-key-scope",
          name: "Not the other project record",
        },
        context([otherProjectResult.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: true, replayed: false });
  });

  it("rejects reuse of an idempotency key for different command content", () => {
    const project = projectFixture();
    const first = dispatchProjectCommand(
      project,
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "First rename",
      },
      context(),
    );
    if (!first.ok) throw new Error("Expected first rename to succeed");

    const collision = dispatchProjectCommand(
      project,
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "Different rename",
      },
      context([first.idempotencyRecord]),
    );

    expect(collision).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT", message: "Command was rejected." },
    });
    expect(JSON.stringify(collision)).not.toContain("Different rename");
  });

  it("rejects reuse of a committed command ID under a new key", () => {
    const project = projectFixture();
    const first = dispatchProjectCommand(
      project,
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "First command identity",
      },
      context(),
    );
    if (!first.ok) throw new Error("Expected first command to succeed");
    expect(
      dispatchProjectCommand(
        first.project,
        {
          type: "RENAME_PROJECT",
          ...envelope(first.project, {
            idempotencyKey: "idempotency-new-key",
            nextProjectRevision: "revision-project-command-id-reuse",
          }),
          name: "Reused command identity",
        },
        context([first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
  });

  it("duplicates with only the caller-supplied ID, label, and transform", () => {
    const project = projectFixture();
    const source = project.rooms[0]!.entities[0]!;
    const result = dispatchProjectCommand(
      project,
      {
        type: "DUPLICATE_ENTITY",
        ...roomEnvelope(project),
        entityId: source.entityId,
        newEntityId: "entity-copy-001",
        newLabel: "Caller copy",
        newTransform: {
          ...source.transform,
          position: { x: 3, y: 0, z: 4 },
        },
      },
      context(),
    );

    if (!result.ok) throw new Error("Expected duplication to succeed");
    const copy = result.project.rooms[0]!.entities[1]!;
    expect(copy).toEqual({
      ...source,
      entityId: "entity-copy-001",
      label: "Caller copy",
      transform: { ...source.transform, position: { x: 3, y: 0, z: 4 } },
    });
  });

  it.each(["ADD_ENTITY", "DUPLICATE_ENTITY"] as const)(
    "rejects duplicate IDs for %s",
    (type) => {
      const project = projectFixture();
      const entity = project.rooms[0]!.entities[0]!;
      const command =
        type === "ADD_ENTITY"
          ? { type, ...roomEnvelope(project), entity }
          : {
              type,
              ...roomEnvelope(project),
              entityId: entity.entityId,
              newEntityId: entity.entityId,
              newLabel: "Collision",
              newTransform: entity.transform,
            };

      expect(dispatchProjectCommand(project, command, context())).toMatchObject(
        {
          ok: false,
          error: { code: "DUPLICATE_ID" },
        },
      );
    },
  );

  it("keeps delete audit privacy-minimal while retaining the inverse entity", () => {
    const project = projectFixture();
    const entity = project.rooms[0]!.entities[0]!;
    const result = dispatchProjectCommand(
      project,
      {
        type: "DELETE_ENTITY",
        ...roomEnvelope(project),
        entityId: entity.entityId,
      },
      context(),
    );

    if (!result.ok) throw new Error("Expected deletion to succeed");
    expect(result.project.rooms[0]!.entities).toHaveLength(0);
    expect(result.auditRecord).toMatchObject({
      type: "DELETE_ENTITY",
      entityId: entity.entityId,
      outcome: "APPLIED",
    });
    expect(JSON.stringify(result.auditRecord)).not.toContain(entity.label);
    expect(JSON.stringify(result.auditRecord)).not.toContain("transform");
    expect(result.historyEntry.inverse).toMatchObject({
      type: "RESTORE_DELETED_ENTITY",
      entity,
      insertionIndex: 0,
    });
  });

  it("creates a room with a validated internal delete inverse and rejects duplicate room IDs", () => {
    const project = projectFixture();
    const room = {
      ...structuredClone(project.rooms[0]!),
      roomId: "room-created-001",
      revisionId: "revision-room-created-001",
      label: "Created room",
      entities: [],
    };
    const command = {
      type: "CREATE_ROOM" as const,
      ...envelope(project),
      room,
    };
    const result = dispatchProjectCommand(project, command, context());
    if (!result.ok) throw new Error("Expected room creation to succeed");
    expect(result.project.rooms).toHaveLength(2);
    expect(result.historyEntry.inverse).toEqual({
      type: "DELETE_ROOM",
      roomId: "room-created-001",
    });
    expect(
      InternalHistoryCommandSchema.safeParse(result.historyEntry.inverse)
        .success,
    ).toBe(true);

    expect(
      dispatchProjectCommand(
        project,
        {
          ...command,
          room: { ...room, roomId: project.rooms[0]!.roomId },
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
  });

  it("rejects a forged public DELETE_ROOM at runtime", () => {
    const project = projectFixture();
    expect(
      dispatchProjectCommand(
        project,
        { type: "DELETE_ROOM", ...roomEnvelope(project) },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("does not expose an executable internal history dispatcher", () => {
    expect("dispatchInternalHistoryCommand" in projectAggregate).toBe(false);
  });

  it("fails closed on duplicate current room IDs and globally duplicated entity IDs", () => {
    const project = projectFixture();
    const duplicatedRoomInput = structuredClone(project);
    setAtPath(
      duplicatedRoomInput,
      ["rooms"],
      [
        ...duplicatedRoomInput.rooms,
        {
          ...structuredClone(duplicatedRoomInput.rooms[0]!),
          revisionId: "revision-room-duplicate",
        },
      ],
    );
    const duplicatedRoom = parseProject(duplicatedRoomInput);
    if (!duplicatedRoom.ok)
      throw new Error("Expected duplicate room IDs to parse structurally");
    const replayCommand = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project, {
        commandId: "command-ambiguous-replay",
        idempotencyKey: "idempotency-ambiguous-replay",
      }),
      name: "Committed before ambiguity",
    };
    const committed = dispatchProjectCommand(project, replayCommand, context());
    if (!committed.ok) throw new Error("Expected replay setup to commit");
    expect(
      dispatchProjectCommand(
        duplicatedRoom.value,
        {
          type: "RENAME_PROJECT",
          ...envelope(duplicatedRoom.value),
          name: "Blocked",
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_ROOM" } });
    expect(
      dispatchProjectCommand(
        duplicatedRoom.value,
        replayCommand,
        context([committed.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_ROOM" } });

    const duplicatedEntityInput = structuredClone(project);
    setAtPath(
      duplicatedEntityInput,
      ["rooms"],
      [
        ...duplicatedEntityInput.rooms,
        {
          ...structuredClone(duplicatedEntityInput.rooms[0]!),
          roomId: "room-second",
          revisionId: "revision-room-second",
        },
      ],
    );
    const duplicatedEntity = parseProject(duplicatedEntityInput);
    if (!duplicatedEntity.ok)
      throw new Error("Expected duplicate entity IDs to parse structurally");
    expect(
      dispatchProjectCommand(
        duplicatedEntity.value,
        {
          type: "RENAME_PROJECT",
          ...envelope(duplicatedEntity.value),
          name: "Blocked",
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_ENTITY" } });
  });

  it("enforces existing room and entity collection capacities", () => {
    const project = projectFixture();
    const roomCapacityInput = structuredClone(project);
    setAtPath(
      roomCapacityInput,
      ["rooms"],
      Array.from({ length: 256 }, (_, index) => ({
        ...structuredClone(project.rooms[0]!),
        roomId: `room-capacity-${index}`,
        revisionId: `revision-room-capacity-${index}`,
        entities: [],
      })),
    );
    const roomCapacity = parseProject(roomCapacityInput);
    if (!roomCapacity.ok)
      throw new Error("Expected room-capacity fixture to parse");
    expect(
      dispatchProjectCommand(
        roomCapacity.value,
        {
          type: "CREATE_ROOM",
          ...envelope(roomCapacity.value),
          room: {
            ...structuredClone(project.rooms[0]!),
            roomId: "room-over-capacity",
            revisionId: "revision-room-over-capacity",
            entities: [],
          },
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "CAPACITY_EXCEEDED" } });

    const entityCapacityInput = structuredClone(project);
    setAtPath(
      entityCapacityInput,
      ["rooms", 0, "entities"],
      Array.from({ length: 256 }, (_, index) => ({
        ...structuredClone(project.rooms[0]!.entities[0]!),
        entityId: `entity-capacity-${index}`,
      })),
    );
    const entityCapacity = parseProject(entityCapacityInput);
    if (!entityCapacity.ok)
      throw new Error("Expected entity-capacity fixture to parse");
    expect(
      dispatchProjectCommand(
        entityCapacity.value,
        {
          type: "ADD_ENTITY",
          ...roomEnvelope(entityCapacity.value),
          entity: {
            ...structuredClone(project.rooms[0]!.entities[0]!),
            entityId: "entity-over-capacity",
          },
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "CAPACITY_EXCEEDED" } });
  });

  it("keeps all subtype-specific entity fields in delete inverses", () => {
    const base = projectFixture();
    const variants = [
      {
        ...structuredClone(base.rooms[0]!.entities[0]!),
        type: "DEVICE" as const,
        deviceKind: "PURIFIER" as const,
        operatingState: "ON" as const,
      },
      {
        ...structuredClone(base.rooms[0]!.entities[0]!),
        type: "CONTAMINANT_SOURCE" as const,
        sourceKind: "COOKING" as const,
        scenarioRole: "Synthetic source",
      },
    ];
    for (const [index, entity] of variants.entries()) {
      delete (entity as Record<string, unknown>).genericKind;
      const input = structuredClone(base);
      setAtPath(input, ["rooms", 0, "entities", 0], entity);
      const parsed = parseProject(input);
      if (!parsed.ok) throw new Error("Expected subtype fixture to parse");
      const result = dispatchProjectCommand(
        parsed.value,
        {
          type: "DELETE_ENTITY",
          ...roomEnvelope(parsed.value, {
            commandId: `command-delete-subtype-${index}`,
            idempotencyKey: `idempotency-delete-subtype-${index}`,
          }),
          entityId: parsed.value.rooms[0]!.entities[0]!.entityId,
        },
        context(),
      );
      if (!result.ok) throw new Error("Expected subtype deletion to succeed");
      expect(result.historyEntry.inverse).toMatchObject({
        type: "RESTORE_DELETED_ENTITY",
        entity,
        insertionIndex: 0,
      });
    }
  });

  it("rejects invalid aggregate output through the guarded project parser", () => {
    const project = projectFixture();
    const result = dispatchProjectCommand(
      project,
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "Valid rename",
        nextProjectRevision: project.revisionId,
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });
  });

  it("requires causal and expected project revisions and rejects reused next revisions", () => {
    const project = projectFixture();
    const base = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project),
      name: "Revision guarded",
    };

    expect(
      dispatchProjectCommand(
        project,
        { ...base, causalParentRevisionId: "revision-other" },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
    expect(
      dispatchProjectCommand(
        project,
        { ...base, expectedProjectRevisionId: "revision-other" },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
    expect(
      dispatchProjectCommand(project, base, {
        ...context(),
        knownProjectRevisionIds: [base.nextProjectRevision],
      }),
    ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
    expect(
      dispatchProjectCommand(
        project,
        {
          type: "MOVE_ENTITY",
          ...roomEnvelope(project),
          entityId: project.rooms[0]!.entities[0]!.entityId,
          position: { x: 2, y: 0, z: 2 },
        },
        {
          ...context(),
          knownRoomRevisionIds: ["revision-room-next-001"],
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
  });

  it("returns stable missing-target errors without mutation", () => {
    const project = projectFixture();
    const before = structuredClone(project);
    expect(
      dispatchProjectCommand(
        project,
        {
          type: "MOVE_ENTITY",
          ...roomEnvelope(project),
          roomId: "room-missing",
          entityId: project.rooms[0]!.entities[0]!.entityId,
          position: { x: 2, y: 0, z: 2 },
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
    expect(
      dispatchProjectCommand(
        project,
        {
          type: "MOVE_ENTITY",
          ...roomEnvelope(project),
          entityId: "entity-missing",
          position: { x: 2, y: 0, z: 2 },
        },
        context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "ENTITY_NOT_FOUND" } });
    expect(project).toEqual(before);
  });

  it("canonicalizes insertion order for replay and conflicts on nested changes", () => {
    const project = projectFixture();
    const source = project.rooms[0]!.entities[0]!;
    const firstCommand = {
      type: "DUPLICATE_ENTITY" as const,
      ...roomEnvelope(project),
      entityId: source.entityId,
      newEntityId: "entity-canonical-copy",
      newLabel: "Canonical copy",
      newTransform: {
        position: { x: 3, y: 0, z: 2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
    const first = dispatchProjectCommand(project, firstCommand, context());
    if (!first.ok) throw new Error("Expected canonical command to succeed");
    const reordered = {
      newTransform: {
        scale: { z: 1, x: 1, y: 1 },
        rotation: { w: 1, z: 0, y: 0, x: 0 },
        position: { z: 2, x: 3, y: 0 },
      },
      newLabel: firstCommand.newLabel,
      newEntityId: firstCommand.newEntityId,
      entityId: firstCommand.entityId,
      nextRoomRevision: firstCommand.nextRoomRevision,
      expectedRoomRevision: firstCommand.expectedRoomRevision,
      roomId: firstCommand.roomId,
      leaseFence: firstCommand.leaseFence,
      nextProjectRevision: firstCommand.nextProjectRevision,
      expectedProjectRevisionId: firstCommand.expectedProjectRevisionId,
      causalParentRevisionId: firstCommand.causalParentRevisionId,
      occurredAtUtc: firstCommand.occurredAtUtc,
      projectId: firstCommand.projectId,
      idempotencyKey: firstCommand.idempotencyKey,
      commandId: firstCommand.commandId,
      type: firstCommand.type,
    };
    expect(
      dispatchProjectCommand(
        first.project,
        reordered,
        context([first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: true, replayed: true });
    expect(
      dispatchProjectCommand(
        project,
        {
          ...firstCommand,
          newTransform: {
            ...firstCommand.newTransform,
            position: { ...firstCommand.newTransform.position, z: 3 },
          },
        },
        context([first.idempotencyRecord]),
      ),
    ).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("rejects unavailable projects before replay and leaves failed keys reusable", () => {
    const project = projectFixture();
    const command = {
      type: "RENAME_PROJECT" as const,
      ...envelope(project),
      name: "Authorized rename",
    };
    const first = dispatchProjectCommand(project, command, context());
    if (!first.ok) throw new Error("Expected initial command to succeed");
    expect(
      dispatchProjectCommand(project, command, {
        ...context([first.idempotencyRecord]),
        projectAvailability: "TOMBSTONED",
      }),
    ).toMatchObject({ ok: false, error: { code: "PROJECT_UNAVAILABLE" } });

    const stale = dispatchProjectCommand(
      project,
      {
        ...command,
        idempotencyKey: "idempotency-reusable",
        expectedProjectRevisionId: "stale",
      },
      context(),
    );
    expect(stale.ok).toBe(false);
    expect(
      dispatchProjectCommand(
        project,
        { ...command, idempotencyKey: "idempotency-reusable" },
        context(),
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    { patch: { name: "Synthetic ventilation study" }, type: "RENAME_PROJECT" },
    { patch: { position: { x: 1, y: 0, z: 1 } }, type: "MOVE_ENTITY" },
  ] as const)("rejects equal-value $type as a no-op", ({ patch, type }) => {
    const project = projectFixture();
    const command =
      type === "RENAME_PROJECT"
        ? { type, ...envelope(project), ...patch }
        : {
            type,
            ...roomEnvelope(project),
            entityId: project.rooms[0]!.entities[0]!.entityId,
            ...patch,
          };
    expect(dispatchProjectCommand(project, command, context())).toMatchObject({
      ok: false,
      error: { code: "NO_OP" },
    });
  });

  it("rejects invalid command values and never exposes a private sentinel", () => {
    const project = projectFixture();
    for (const command of [
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "PRIVATE_SENTINEL",
        extra: true,
      },
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "PRIVATE_SENTINEL",
        occurredAtUtc: "2026-08-25 12:00:00",
      },
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "PRIVATE_SENTINEL",
        occurredAtUtc: "2026-08-25T12:00:00.000-04:00",
      },
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "PRIVATE_SENTINEL",
        occurredAtUtc: "2026-02-30T12:00:00.000Z",
      },
      {
        type: "RESIZE_ENTITY",
        ...roomEnvelope(project),
        entityId: project.rooms[0]!.entities[0]!.entityId,
        dimensions: { xMetres: 0, yMetres: 1, zMetres: 1 },
      },
      {
        type: "MOVE_ENTITY",
        ...roomEnvelope(project),
        entityId: project.rooms[0]!.entities[0]!.entityId,
        position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
      },
      {
        type: "ROTATE_ENTITY",
        ...roomEnvelope(project),
        entityId: project.rooms[0]!.entities[0]!.entityId,
        rotation: { x: 0, y: 0, z: 0, w: 0 },
      },
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        idempotencyKey: "unsafe key",
        name: "PRIVATE_SENTINEL",
      },
    ]) {
      const result = dispatchProjectCommand(project, command, context());
      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_COMMAND" },
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_SENTINEL");
    }
  });

  it("keeps non-target rooms and their revisions semantically unchanged", () => {
    const base = projectFixture();
    const input = structuredClone(base);
    setAtPath(
      input,
      ["rooms"],
      [
        input.rooms[0],
        {
          ...structuredClone(input.rooms[0]!),
          roomId: "room-untouched",
          revisionId: "revision-room-untouched",
          entities: [],
        },
      ],
    );
    const parsed = parseProject(input);
    if (!parsed.ok) throw new Error("Expected two-room project to parse");
    const untouched = structuredClone(parsed.value.rooms[1]!);
    const result = dispatchProjectCommand(
      parsed.value,
      {
        type: "MOVE_ENTITY",
        ...roomEnvelope(parsed.value),
        entityId: parsed.value.rooms[0]!.entities[0]!.entityId,
        position: { x: 2, y: 0, z: 2 },
      },
      context(),
    );
    if (!result.ok) throw new Error("Expected targeted movement to succeed");
    expect(result.project.rooms[1]).toEqual(untouched);
  });

  it("keeps private command payloads out of audit records", () => {
    const project = projectFixture();
    const result = dispatchProjectCommand(
      project,
      {
        type: "RENAME_PROJECT",
        ...envelope(project),
        name: "PRIVATE_SENTINEL_PROJECT_NAME",
      },
      context(),
    );
    if (!result.ok) throw new Error("Expected private-label rename to succeed");
    expect(JSON.stringify(result.auditRecord)).not.toContain(
      "PRIVATE_SENTINEL",
    );
    expect(JSON.stringify(result.auditRecord)).not.toContain("name");
  });

  it("is deterministic for pinned valid fast-check sequences of up to 50 commands", () => {
    const deltas = fc.array(
      fc.record({
        x: fc.integer({ min: 1, max: 2 }),
        z: fc.integer({ min: 1, max: 2 }),
      }),
      { minLength: 1, maxLength: 50 },
    );

    fc.assert(
      fc.property(deltas, (sequence) => {
        const run = () => {
          let project = projectFixture();
          const records: IdempotencyRecord[] = [];
          const knownProjectRevisionIds: string[] = [];
          const knownRoomRevisionIds: string[] = [];
          let history = createHistoryState(project.projectId);
          for (const [index, delta] of sequence.entries()) {
            const currentPosition =
              project.rooms[0]!.entities[0]!.transform.position;
            const position = {
              x: currentPosition.x + delta.x,
              y: currentPosition.y,
              z: currentPosition.z + delta.z,
            };
            const result = dispatchProjectCommand(
              project,
              {
                type: "MOVE_ENTITY",
                ...roomEnvelope(project, {
                  commandId: `command-property-${index}`,
                  idempotencyKey: `idempotency-property-${index}`,
                  occurredAtUtc: `2026-08-25T12:00:${String(index).padStart(2, "0")}.000Z`,
                  nextProjectRevision: `revision-project-property-${index}`,
                  nextRoomRevision: `revision-room-property-${index}`,
                }),
                entityId: project.rooms[0]!.entities[0]!.entityId,
                position,
              },
              {
                ...context(records),
                knownProjectRevisionIds,
                knownRoomRevisionIds,
              },
            );
            if (!result.ok) throw new Error(`Property command ${index} failed`);
            project = result.project;
            records.push(result.idempotencyRecord);
            knownProjectRevisionIds.push(
              result.auditRecord.priorProjectRevision,
            );
            if (result.auditRecord.priorRoomRevision !== undefined) {
              knownRoomRevisionIds.push(result.auditRecord.priorRoomRevision);
            }
            history = appendHistory(history, result);
          }
          return { project, history };
        };

        expect(run()).toEqual(run());
      }),
      { seed: 20_260_825, numRuns: 24, endOnFailure: true },
    );
  });
});
