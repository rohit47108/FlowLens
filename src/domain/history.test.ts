import { describe, expect, it } from "vitest";
import { minimalProject } from "../../tests/fixtures/minimal-project";
import { parseProject, type Project } from "./project-schema";
import {
  dispatchProjectCommand,
  type DispatchContext,
  type SuccessfulCommandResult,
} from "./project-aggregate";
import {
  appendHistory,
  createHistoryState,
  invalidateHistory,
  redo,
  undo,
  type HistoryState,
  type HistoryReplayEnvelope,
} from "./history";

function projectFixture(): Project {
  const parsed = parseProject(structuredClone(minimalProject));
  if (!parsed.ok) throw new Error("Expected fixture to parse");
  Object.freeze(parsed.value);
  return parsed.value;
}

const dispatchContext: DispatchContext = {
  authoritativeLeaseFence: 7,
  idempotencyRecords: [],
  knownProjectRevisionIds: [],
  knownRoomRevisionIds: [],
  projectAvailability: "AVAILABLE",
};

function contextWith(
  ...results: readonly SuccessfulCommandResult[]
): DispatchContext {
  return {
    ...dispatchContext,
    idempotencyRecords: results.map((result) => result.idempotencyRecord),
  };
}

function forwardMove(project: Project): SuccessfulCommandResult {
  const result = dispatchProjectCommand(
    project,
    {
      type: "MOVE_ENTITY",
      commandId: "command-forward-001",
      idempotencyKey: "idempotency-forward-001",
      projectId: project.projectId,
      occurredAtUtc: "2026-08-25T13:00:00.000Z",
      causalParentRevisionId: project.revisionId,
      expectedProjectRevisionId: project.revisionId,
      nextProjectRevision: "revision-project-forward-001",
      leaseFence: 7,
      roomId: project.rooms[0]!.roomId,
      expectedRoomRevision: project.rooms[0]!.revisionId,
      nextRoomRevision: "revision-room-forward-001",
      entityId: project.rooms[0]!.entities[0]!.entityId,
      position: { x: 4, y: 0, z: 4 },
    },
    dispatchContext,
  );
  if (!result.ok) throw new Error("Expected forward move to succeed");
  return result;
}

function historyRequest(
  project: Project,
  suffix: string,
  nextRoomRevision: string,
) {
  return {
    commandId: `command-${suffix}`,
    idempotencyKey: `idempotency-${suffix}`,
    occurredAtUtc: "2026-08-25T13:01:00.000Z",
    causalParentRevisionId: project.revisionId,
    expectedProjectRevisionId: project.revisionId,
    nextProjectRevision: `revision-project-${suffix}`,
    leaseFence: 7,
    nextRoomRevision,
  };
}

function projectHistoryRequest(project: Project, suffix: string) {
  return {
    commandId: `command-${suffix}`,
    idempotencyKey: `idempotency-${suffix}`,
    occurredAtUtc: "2026-08-25T13:01:00.000Z",
    causalParentRevisionId: project.revisionId,
    expectedProjectRevisionId: project.revisionId,
    nextProjectRevision: `revision-project-${suffix}`,
    leaseFence: 7,
  };
}

function semanticProject(project: Project) {
  return {
    ...project,
    revisionId: "semantic-revision",
    rooms: project.rooms.map((room) => ({
      ...room,
      revisionId: "semantic-room-revision",
    })),
  };
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate !== null && typeof candidate === "object") {
      return Object.fromEntries(
        Object.keys(candidate)
          .sort()
          .map((key) => [
            key,
            normalize((candidate as Record<string, unknown>)[key]),
          ]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

function isDeeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => isDeeplyFrozen(child));
}

describe("command history", () => {
  it("undoes and redoes semantic state with fresh revision identity", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );

    const undone = undo(
      forward.project,
      history,
      historyRequest(forward.project, "undo-001", "revision-room-undo-001"),
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected undo to succeed");
    expect(semanticProject(undone.project)).toEqual(semanticProject(initial));
    expect(undone.project.revisionId).toBe("revision-project-undo-001");
    expect(undone.project.rooms[0]!.revisionId).toBe("revision-room-undo-001");

    const redone = redo(
      undone.project,
      undone.history,
      historyRequest(undone.project, "redo-001", "revision-room-redo-001"),
      contextWith(forward, undone.commandResult),
    );
    if (!redone.ok) throw new Error("Expected redo to succeed");
    expect(semanticProject(redone.project)).toEqual(
      semanticProject(forward.project),
    );
    expect(redone.project.revisionId).toBe("revision-project-redo-001");
    expect(redone.project.rooms[0]!.revisionId).toBe("revision-room-redo-001");
  });

  it("uses the strict internal DELETE_ROOM only for generated room undo", () => {
    const initial = projectFixture();
    const room = {
      ...structuredClone(initial.rooms[0]!),
      roomId: "room-history-created",
      revisionId: "revision-room-history-created",
      entities: [],
    };
    const created = dispatchProjectCommand(
      initial,
      {
        type: "CREATE_ROOM",
        commandId: "command-create-room",
        idempotencyKey: "idempotency-create-room",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T14:00:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-room-created",
        leaseFence: 7,
        room,
      },
      dispatchContext,
    );
    if (!created.ok) throw new Error("Expected room creation to succeed");

    const invalidUndoRequest = historyRequest(
      created.project,
      "undo-room-extra-room-revision",
      "revision-room-unused",
    );
    const history = appendHistory(
      createHistoryState(initial.projectId),
      created,
    );
    expect(
      undo(created.project, history, invalidUndoRequest, contextWith(created)),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });

    const undoRequest = projectHistoryRequest(created.project, "undo-room");
    const undone = undo(
      created.project,
      history,
      undoRequest,
      contextWith(created),
    );
    if (!undone.ok) throw new Error("Expected room creation undo to succeed");
    expect(semanticProject(undone.project)).toEqual(semanticProject(initial));

    const retried = undo(
      undone.project,
      undone.history,
      undoRequest,
      contextWith(created, undone.commandResult),
    );
    if (!retried.ok) throw new Error("Expected room undo retry to replay");
    expect(retried.commandResult.replayed).toBe(true);
    expect(retried.project).toEqual(undone.project);
    expect(retried.history).toEqual(undone.history);

    const redone = redo(
      undone.project,
      undone.history,
      historyRequest(undone.project, "redo-room", "revision-room-redo-created"),
      contextWith(created, undone.commandResult),
    );
    if (!redone.ok) throw new Error("Expected room creation redo to succeed");
    expect(semanticProject(redone.project)).toEqual(
      semanticProject(created.project),
    );
  });

  it.each([
    "RENAME_PROJECT",
    "ADD_ENTITY",
    "RESIZE_ENTITY",
    "ROTATE_ENTITY",
    "SET_ENTITY_VISIBILITY",
    "SET_ENTITY_LOCK",
    "DUPLICATE_ENTITY",
  ] as const)(
    "round-trips %s through its generated inverse and redo",
    (type) => {
      const initial = projectFixture();
      const room = initial.rooms[0]!;
      const entity = room.entities[0]!;
      const suffix = type.toLowerCase().replaceAll("_", "-");
      const common = {
        commandId: `command-round-trip-${suffix}`,
        idempotencyKey: `idempotency-round-trip-${suffix}`,
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T14:15:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: `revision-project-round-trip-${suffix}`,
        leaseFence: 7,
      };
      const roomCommon = {
        ...common,
        roomId: room.roomId,
        expectedRoomRevision: room.revisionId,
        nextRoomRevision: `revision-room-round-trip-${suffix}`,
      };
      const command =
        type === "RENAME_PROJECT"
          ? { type, ...common, name: "Round-trip project" }
          : type === "ADD_ENTITY"
            ? {
                type,
                ...roomCommon,
                entity: {
                  ...entity,
                  entityId: "entity-round-trip-added",
                  label: "Round-trip added",
                },
              }
            : type === "RESIZE_ENTITY"
              ? {
                  type,
                  ...roomCommon,
                  entityId: entity.entityId,
                  dimensions: { xMetres: 1, yMetres: 1.5, zMetres: 2 },
                }
              : type === "ROTATE_ENTITY"
                ? {
                    type,
                    ...roomCommon,
                    entityId: entity.entityId,
                    rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
                  }
                : type === "SET_ENTITY_VISIBILITY"
                  ? {
                      type,
                      ...roomCommon,
                      entityId: entity.entityId,
                      visibility: "HIDDEN" as const,
                    }
                  : type === "SET_ENTITY_LOCK"
                    ? {
                        type,
                        ...roomCommon,
                        entityId: entity.entityId,
                        locked: true,
                      }
                    : {
                        type,
                        ...roomCommon,
                        entityId: entity.entityId,
                        newEntityId: "entity-round-trip-copy",
                        newLabel: "Round-trip copy",
                        newTransform: {
                          ...entity.transform,
                          position: { x: 2, y: 0, z: 2 },
                        },
                      };
      const forward = dispatchProjectCommand(initial, command, dispatchContext);
      if (!forward.ok) throw new Error(`Expected ${type} to succeed`);

      const undoEnvelope = historyRequest(
        forward.project,
        `undo-${suffix}`,
        `revision-room-undo-${suffix}`,
      );
      const undone = undo(
        forward.project,
        appendHistory(createHistoryState(initial.projectId), forward),
        type === "RENAME_PROJECT"
          ? {
              commandId: undoEnvelope.commandId,
              idempotencyKey: undoEnvelope.idempotencyKey,
              occurredAtUtc: undoEnvelope.occurredAtUtc,
              causalParentRevisionId: undoEnvelope.causalParentRevisionId,
              expectedProjectRevisionId: undoEnvelope.expectedProjectRevisionId,
              nextProjectRevision: undoEnvelope.nextProjectRevision,
              leaseFence: undoEnvelope.leaseFence,
            }
          : undoEnvelope,
        contextWith(forward),
      );
      if (!undone.ok) throw new Error(`Expected ${type} undo to succeed`);
      expect(semanticProject(undone.project)).toEqual(semanticProject(initial));

      const redoEnvelope = historyRequest(
        undone.project,
        `redo-${suffix}`,
        `revision-room-redo-${suffix}`,
      );
      const redone = redo(
        undone.project,
        undone.history,
        type === "RENAME_PROJECT"
          ? {
              commandId: redoEnvelope.commandId,
              idempotencyKey: redoEnvelope.idempotencyKey,
              occurredAtUtc: redoEnvelope.occurredAtUtc,
              causalParentRevisionId: redoEnvelope.causalParentRevisionId,
              expectedProjectRevisionId: redoEnvelope.expectedProjectRevisionId,
              nextProjectRevision: redoEnvelope.nextProjectRevision,
              leaseFence: redoEnvelope.leaseFence,
            }
          : redoEnvelope,
        contextWith(forward, undone.commandResult),
      );
      if (!redone.ok) throw new Error(`Expected ${type} redo to succeed`);
      expect(semanticProject(redone.project)).toEqual(
        semanticProject(forward.project),
      );
    },
  );

  it("replays and undoes a duplicate whose valid quaternion required normalization", () => {
    const initial = projectFixture();
    const source = initial.rooms[0]!.entities[0]!;
    const command = {
      type: "DUPLICATE_ENTITY" as const,
      commandId: "command-duplicate-normalized",
      idempotencyKey: "idempotency-duplicate-normalized",
      projectId: initial.projectId,
      occurredAtUtc: "2026-08-25T14:20:00.000Z",
      causalParentRevisionId: initial.revisionId,
      expectedProjectRevisionId: initial.revisionId,
      nextProjectRevision: "revision-project-duplicate-normalized",
      leaseFence: 7,
      roomId: initial.rooms[0]!.roomId,
      expectedRoomRevision: initial.rooms[0]!.revisionId,
      nextRoomRevision: "revision-room-duplicate-normalized",
      entityId: source.entityId,
      newEntityId: "entity-duplicate-normalized",
      newLabel: "Normalized duplicate",
      newTransform: {
        position: { x: 2, y: 0, z: 2 },
        rotation: { x: 0, y: 0, z: 0, w: 2 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
    const forward = dispatchProjectCommand(initial, command, dispatchContext);
    if (!forward.ok) throw new Error("Expected duplicate to succeed");

    expect(
      dispatchProjectCommand(forward.project, command, contextWith(forward)),
    ).toMatchObject({ ok: true, replayed: true });

    const undone = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      historyRequest(
        forward.project,
        "undo-duplicate-normalized",
        "revision-room-undo-duplicate-normalized",
      ),
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected normalized duplicate undo");
    expect(semanticProject(undone.project)).toEqual(semanticProject(initial));
  });

  it("undoes and redoes a subtype-preserving entity deletion", () => {
    const base = projectFixture();
    const appended = dispatchProjectCommand(
      base,
      {
        type: "ADD_ENTITY",
        commandId: "command-delete-history-setup",
        idempotencyKey: "idempotency-delete-history-setup",
        projectId: base.projectId,
        occurredAtUtc: "2026-08-25T14:29:00.000Z",
        causalParentRevisionId: base.revisionId,
        expectedProjectRevisionId: base.revisionId,
        nextProjectRevision: "revision-project-delete-history-setup",
        leaseFence: 7,
        roomId: base.rooms[0]!.roomId,
        expectedRoomRevision: base.rooms[0]!.revisionId,
        nextRoomRevision: "revision-room-delete-history-setup",
        entity: {
          ...base.rooms[0]!.entities[0]!,
          entityId: "entity-delete-history-second",
          label: "Second entity",
        },
      },
      dispatchContext,
    );
    if (!appended.ok) throw new Error("Expected deletion setup to succeed");
    const initial = appended.project;
    const deleted = dispatchProjectCommand(
      initial,
      {
        type: "DELETE_ENTITY",
        commandId: "command-delete-history",
        idempotencyKey: "idempotency-delete-history",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T14:30:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-delete-history",
        leaseFence: 7,
        roomId: initial.rooms[0]!.roomId,
        expectedRoomRevision: initial.rooms[0]!.revisionId,
        nextRoomRevision: "revision-room-delete-history",
        entityId: initial.rooms[0]!.entities[0]!.entityId,
      },
      dispatchContext,
    );
    if (!deleted.ok) throw new Error("Expected deletion to succeed");
    const undone = undo(
      deleted.project,
      appendHistory(createHistoryState(initial.projectId), deleted),
      historyRequest(
        deleted.project,
        "undo-delete-history",
        "revision-room-undo-delete-history",
      ),
      contextWith(deleted),
    );
    if (!undone.ok) throw new Error("Expected delete undo to succeed");
    expect(semanticProject(undone.project)).toEqual(semanticProject(initial));

    const redone = redo(
      undone.project,
      undone.history,
      historyRequest(
        undone.project,
        "redo-delete-history",
        "revision-room-redo-delete-history",
      ),
      contextWith(deleted, undone.commandResult),
    );
    if (!redone.ok) throw new Error("Expected delete redo to succeed");
    expect(semanticProject(redone.project)).toEqual(
      semanticProject(deleted.project),
    );
  });

  it("undoes an added locked entity without weakening public delete locks", () => {
    const initial = projectFixture();
    const source = initial.rooms[0]!.entities[0]!;
    const added = dispatchProjectCommand(
      initial,
      {
        type: "ADD_ENTITY",
        commandId: "command-add-locked-history",
        idempotencyKey: "idempotency-add-locked-history",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T14:45:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-add-locked-history",
        leaseFence: 7,
        roomId: initial.rooms[0]!.roomId,
        expectedRoomRevision: initial.rooms[0]!.revisionId,
        nextRoomRevision: "revision-room-add-locked-history",
        entity: {
          ...source,
          entityId: "entity-added-locked-history",
          label: "Added locked history entity",
          locked: true,
        },
      },
      dispatchContext,
    );
    if (!added.ok) throw new Error("Expected locked entity add to succeed");
    const undone = undo(
      added.project,
      appendHistory(createHistoryState(initial.projectId), added),
      historyRequest(
        added.project,
        "undo-add-locked-history",
        "revision-room-undo-add-locked-history",
      ),
      contextWith(added),
    );
    if (!undone.ok)
      throw new Error("Expected locked entity add undo to succeed");
    expect(semanticProject(undone.project)).toEqual(semanticProject(initial));
  });

  it.each([
    "REMOTE_EDIT",
    "IMPORT",
    "MIGRATION",
    "TOMBSTONE",
    "FENCE_CHANGE",
  ] as const)(
    "preserves invalidated entries with strict %s reason",
    (reason) => {
      const initial = projectFixture();
      const forward = forwardMove(initial);
      const invalidated = invalidateHistory(
        appendHistory(createHistoryState(initial.projectId), forward),
        reason,
      );

      expect(invalidated.past).toHaveLength(1);
      expect(invalidated.past[0]!.applicability).toEqual({
        status: "NON_APPLICABLE",
        reason,
      });
      const result = undo(
        forward.project,
        invalidated,
        historyRequest(
          forward.project,
          "invalidated",
          "revision-room-invalidated",
        ),
        contextWith(forward),
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "HISTORY_NOT_APPLICABLE", reason },
      });
    },
  );

  it("retains displaced redo history as a visible local branch", () => {
    const initial = projectFixture();
    const first = forwardMove(initial);
    const undone = undo(
      first.project,
      appendHistory(createHistoryState(initial.projectId), first),
      historyRequest(first.project, "undo-clear", "revision-room-undo-clear"),
      contextWith(first),
    );
    if (!undone.ok) throw new Error("Expected undo to succeed");
    expect(undone.history.future).toHaveLength(1);

    const renamed = dispatchProjectCommand(
      undone.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-new-branch",
        idempotencyKey: "idempotency-new-branch",
        projectId: undone.project.projectId,
        occurredAtUtc: "2026-08-25T15:00:00.000Z",
        causalParentRevisionId: undone.project.revisionId,
        expectedProjectRevisionId: undone.project.revisionId,
        nextProjectRevision: "revision-project-new-branch",
        leaseFence: 7,
        name: "New branch",
      },
      dispatchContext,
    );
    if (!renamed.ok) throw new Error("Expected rename to succeed");
    expect(appendHistory(undone.history, renamed).future).toMatchObject([
      { applicability: { status: "NON_APPLICABLE", reason: "LOCAL_BRANCH" } },
    ]);
  });

  it("does not mutate project or history when an undo request is stale", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const beforeProject = structuredClone(forward.project);
    const beforeHistory = structuredClone(history);

    const result = undo(
      forward.project,
      history,
      {
        ...historyRequest(forward.project, "stale", "revision-room-stale"),
        causalParentRevisionId: "revision-stale",
      },
      contextWith(forward),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });
    expect(forward.project).toEqual(beforeProject);
    expect(history).toEqual(beforeHistory);
  });

  it.each([
    ["commandId", "command-forward-001", "DUPLICATE_ID"],
    ["idempotencyKey", "idempotency-forward-001", "IDEMPOTENCY_CONFLICT"],
    ["nextProjectRevision", "revision-synthetic-001", "REVISION_CONFLICT"],
    ["nextRoomRevision", "revision-room-001", "REVISION_CONFLICT"],
  ] as const)(
    "rejects a history envelope that reuses prior %s",
    (field, reusedValue, code) => {
      const initial = projectFixture();
      const forward = forwardMove(initial);
      const history = appendHistory(
        createHistoryState(initial.projectId),
        forward,
      );
      const request = {
        ...historyRequest(
          forward.project,
          `reused-${field}`,
          "revision-room-reused-envelope",
        ),
        [field]: reusedValue,
      };
      expect(
        undo(forward.project, history, request, contextWith(forward)),
      ).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("tracks replay identities across repeated undo and redo cycles", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const undoRequest = historyRequest(
      forward.project,
      "tracked-undo",
      "revision-room-tracked-undo",
    );
    const undone = undo(
      forward.project,
      history,
      undoRequest,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected tracked undo to succeed");
    expect(
      redo(
        undone.project,
        undone.history,
        {
          ...historyRequest(
            undone.project,
            "tracked-redo",
            "revision-room-tracked-redo",
          ),
          commandId: undoRequest.commandId,
        },
        contextWith(forward, undone.commandResult),
      ),
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
  });

  it("returns an exact successful undo retry as replayed without changing state", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const request = historyRequest(
      forward.project,
      "exact-undo-retry",
      "revision-room-exact-undo-retry",
    );
    const undone = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      request,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected initial undo to succeed");
    const retried = undo(undone.project, undone.history, request, {
      ...dispatchContext,
      idempotencyRecords: [undone.commandResult.idempotencyRecord],
    });
    if (!retried.ok) throw new Error("Expected exact undo retry to replay");
    expect(retried.commandResult.replayed).toBe(true);
    expect(retried.project).toEqual(undone.project);
    expect(retried.history).toEqual(undone.history);
    expect(retried.project).not.toBe(undone.project);
    expect(retried.history).not.toBe(undone.history);
    expect(isDeeplyFrozen(retried.project)).toBe(true);
    expect(isDeeplyFrozen(retried.history)).toBe(true);
  });

  it("rejects an exact history retry against an ambiguous current aggregate", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const request = historyRequest(
      forward.project,
      "ambiguous-exact-undo-retry",
      "revision-room-ambiguous-exact-undo-retry",
    );
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const undone = undo(
      forward.project,
      history,
      request,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected initial undo to succeed");
    const duplicatedRoomInput = {
      ...structuredClone(undone.project),
      rooms: [
        structuredClone(undone.project.rooms[0]!),
        structuredClone(undone.project.rooms[0]!),
      ],
    };
    const ambiguousProject = parseProject(duplicatedRoomInput);
    if (!ambiguousProject.ok) {
      throw new Error("Expected duplicate room IDs to parse structurally");
    }

    expect(
      undo(ambiguousProject.value, undone.history, request, {
        ...dispatchContext,
        idempotencyRecords: [undone.commandResult.idempotencyRecord],
      }),
    ).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_ROOM" } });
  });

  it("keeps generated history executions immutable and out of forward history", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const undone = undo(
      forward.project,
      history,
      historyRequest(
        forward.project,
        "generated-history-result",
        "revision-room-generated-history-result",
      ),
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected undo to succeed");
    const origin = undone.commandResult.idempotencyRecord.historyExecution;
    if (origin === null) throw new Error("Expected a generated history origin");

    expect(Object.isFrozen(origin)).toBe(true);
    expect(() => appendHistory(history, undone.commandResult)).toThrow(
      "History execution result cannot be appended.",
    );
  });

  it("detaches and deeply freezes public history helper outputs", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const later = dispatchProjectCommand(
      forward.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-history-detach-later",
        idempotencyKey: "idempotency-history-detach-later",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T13:04:00.000Z",
        causalParentRevisionId: forward.project.revisionId,
        expectedProjectRevisionId: forward.project.revisionId,
        nextProjectRevision: "revision-project-history-detach-later",
        leaseFence: 7,
        name: "Detached history",
      },
      contextWith(forward),
    );
    if (!later.ok) throw new Error("Expected detach setup to succeed");
    const mutableAppendInput = structuredClone(history);
    const mutableInvalidationInput = structuredClone(history);
    const appended = appendHistory(mutableAppendInput, later);
    const invalidated = invalidateHistory(mutableInvalidationInput, "IMPORT");
    const originalCommandId = history.past[0]!.forwardCommand.commandId;

    (mutableAppendInput.replayReceipts as unknown as unknown[]).push({
      forged: true,
    });
    (
      mutableAppendInput.past[0]!.forwardCommand as unknown as {
        commandId: string;
      }
    ).commandId = "command-mutated-through-alias";
    (mutableInvalidationInput.replayReceipts as unknown as unknown[]).push({
      forged: true,
    });
    (
      mutableInvalidationInput.past[0]!.forwardCommand as unknown as {
        commandId: string;
      }
    ).commandId = "command-mutated-invalidation-alias";

    expect(appended.replayReceipts).toHaveLength(0);
    expect(appended.past[0]!.forwardCommand.commandId).toBe(originalCommandId);
    expect(invalidated.replayReceipts).toHaveLength(0);
    expect(invalidated.past[0]!.forwardCommand.commandId).toBe(
      originalCommandId,
    );
    expect(isDeeplyFrozen(appended)).toBe(true);
    expect(isDeeplyFrozen(invalidated)).toBe(true);
  });

  it("keeps restored history unchanged when its exact undo record already committed", () => {
    const initial = projectFixture();
    const renamed = dispatchProjectCommand(
      initial,
      {
        type: "RENAME_PROJECT",
        commandId: "command-restored-forward",
        idempotencyKey: "idempotency-restored-forward",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T13:05:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-restored-forward",
        leaseFence: 7,
        name: "Restored forward name",
      },
      dispatchContext,
    );
    if (!renamed.ok) throw new Error("Expected rename to succeed");
    const restoredHistory = appendHistory(
      createHistoryState(initial.projectId),
      renamed,
    );
    const request = {
      commandId: "command-restored-undo",
      idempotencyKey: "idempotency-restored-undo",
      occurredAtUtc: "2026-08-25T13:05:30.000Z",
      causalParentRevisionId: renamed.project.revisionId,
      expectedProjectRevisionId: renamed.project.revisionId,
      nextProjectRevision: "revision-project-restored-undo",
      leaseFence: 7,
    };
    const undone = undo(
      renamed.project,
      restoredHistory,
      request,
      contextWith(renamed),
    );
    if (!undone.ok) throw new Error("Expected initial undo to succeed");

    const later = dispatchProjectCommand(
      undone.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-restored-later",
        idempotencyKey: "idempotency-restored-later",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T13:06:00.000Z",
        causalParentRevisionId: undone.project.revisionId,
        expectedProjectRevisionId: undone.project.revisionId,
        nextProjectRevision: "revision-project-restored-later",
        leaseFence: 7,
        name: "Later committed name",
      },
      contextWith(renamed, undone.commandResult),
    );
    if (!later.ok) throw new Error("Expected later rename to succeed");

    const retried = undo(later.project, restoredHistory, request, {
      ...dispatchContext,
      idempotencyRecords: [
        renamed.idempotencyRecord,
        undone.commandResult.idempotencyRecord,
        later.idempotencyRecord,
      ],
    });
    if (!retried.ok) throw new Error("Expected restored retry to replay");
    expect(retried.commandResult.replayed).toBe(true);
    expect(retried.project).toEqual(later.project);
    expect(retried.history).toEqual(restoredHistory);
    expect(retried.project.name).toBe("Later committed name");
  });

  it("returns an exact successful redo retry as replayed without changing state", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const undoRequest = historyRequest(
      forward.project,
      "redo-retry-prerequisite",
      "revision-room-redo-retry-prerequisite",
    );
    const undone = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      undoRequest,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected prerequisite undo to succeed");
    const redoRequest = historyRequest(
      undone.project,
      "exact-redo-retry",
      "revision-room-exact-redo-retry",
    );
    const redone = redo(undone.project, undone.history, redoRequest, {
      ...dispatchContext,
      idempotencyRecords: [
        forward.idempotencyRecord,
        undone.commandResult.idempotencyRecord,
      ],
    });
    if (!redone.ok) throw new Error("Expected initial redo to succeed");
    const retried = redo(redone.project, redone.history, redoRequest, {
      ...dispatchContext,
      idempotencyRecords: [
        undone.commandResult.idempotencyRecord,
        redone.commandResult.idempotencyRecord,
      ],
    });
    if (!retried.ok) throw new Error("Expected exact redo retry to replay");
    expect(retried.commandResult.replayed).toBe(true);
    expect(retried.project).toEqual(redone.project);
    expect(retried.history).toEqual(redone.history);
  });

  it("supports repeated fresh undo and redo cycles", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const firstUndo = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      historyRequest(
        forward.project,
        "cycle-undo-1",
        "revision-room-cycle-undo-1",
      ),
      contextWith(forward),
    );
    if (!firstUndo.ok) throw new Error("Expected first undo to succeed");
    const firstRedo = redo(
      firstUndo.project,
      firstUndo.history,
      historyRequest(
        firstUndo.project,
        "cycle-redo-1",
        "revision-room-cycle-redo-1",
      ),
      {
        ...dispatchContext,
        idempotencyRecords: [
          forward.idempotencyRecord,
          firstUndo.commandResult.idempotencyRecord,
        ],
      },
    );
    if (!firstRedo.ok) throw new Error("Expected first redo to succeed");
    const secondUndo = undo(
      firstRedo.project,
      firstRedo.history,
      historyRequest(
        firstRedo.project,
        "cycle-undo-2",
        "revision-room-cycle-undo-2",
      ),
      {
        ...dispatchContext,
        idempotencyRecords: [
          forward.idempotencyRecord,
          firstUndo.commandResult.idempotencyRecord,
          firstRedo.commandResult.idempotencyRecord,
        ],
      },
    );
    if (!secondUndo.ok) throw new Error("Expected second undo to succeed");
    const secondRedo = redo(
      secondUndo.project,
      secondUndo.history,
      historyRequest(
        secondUndo.project,
        "cycle-redo-2",
        "revision-room-cycle-redo-2",
      ),
      {
        ...dispatchContext,
        idempotencyRecords: [
          forward.idempotencyRecord,
          firstUndo.commandResult.idempotencyRecord,
          firstRedo.commandResult.idempotencyRecord,
          secondUndo.commandResult.idempotencyRecord,
        ],
      },
    );
    if (!secondRedo.ok) throw new Error("Expected second redo to succeed");
    expect(semanticProject(secondRedo.project)).toEqual(
      semanticProject(forward.project),
    );
    expect(secondRedo.history.replayReceipts).toHaveLength(4);
  });

  it("replays an exact committed history action after invalidation or a local branch", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const request = historyRequest(
      forward.project,
      "retry-after-history-change",
      "revision-room-retry-after-history-change",
    );
    const undone = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      request,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected undo to succeed");
    const replayContext = {
      ...dispatchContext,
      idempotencyRecords: [undone.commandResult.idempotencyRecord],
    };
    const invalidated = invalidateHistory(undone.history, "REMOTE_EDIT");
    const invalidatedRetry = undo(
      undone.project,
      invalidated,
      request,
      replayContext,
    );
    if (!invalidatedRetry.ok)
      throw new Error("Expected retry after invalidation to replay");
    expect(invalidatedRetry.commandResult.replayed).toBe(true);
    expect(invalidatedRetry.history).toEqual(invalidated);

    const branch = dispatchProjectCommand(
      undone.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-retry-local-branch",
        idempotencyKey: "idempotency-retry-local-branch",
        projectId: undone.project.projectId,
        occurredAtUtc: "2026-08-25T15:45:00.000Z",
        causalParentRevisionId: undone.project.revisionId,
        expectedProjectRevisionId: undone.project.revisionId,
        nextProjectRevision: "revision-project-retry-local-branch",
        leaseFence: 7,
        name: "Local branch",
      },
      replayContext,
    );
    if (!branch.ok) throw new Error("Expected local branch to succeed");
    const branchedHistory = appendHistory(undone.history, branch);
    const branchRetry = undo(branch.project, branchedHistory, request, {
      ...replayContext,
      idempotencyRecords: [
        undone.commandResult.idempotencyRecord,
        branch.idempotencyRecord,
      ],
    });
    if (!branchRetry.ok)
      throw new Error("Expected retry after local branch to replay");
    expect(branchRetry.commandResult.replayed).toBe(true);
    expect(branchRetry.project).toEqual(branch.project);
    expect(branchRetry.history).toEqual(branchedHistory);
  });

  it("checks availability and fence before history or replay details", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const request = historyRequest(
      forward.project,
      "authorization-order",
      "revision-room-authorization-order",
    );
    const undone = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      request,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected undo to succeed");
    const exactContext = {
      ...dispatchContext,
      idempotencyRecords: [undone.commandResult.idempotencyRecord],
    };
    const fencedRequest = { ...request, leaseFence: 8 };
    const malformedHistory = {
      ...undone.history,
      past: "PRIVATE_AUTHORIZATION_SENTINEL",
    } as unknown as HistoryState;
    expect(
      undo(undone.project, undone.history, fencedRequest, exactContext),
    ).toEqual({
      ok: false,
      error: { code: "LEASE_FENCED", message: "Command was rejected." },
    });
    expect(
      undo(undone.project, malformedHistory, fencedRequest, exactContext),
    ).toMatchObject({ ok: false, error: { code: "LEASE_FENCED" } });
    const unavailable = undo(undone.project, malformedHistory, request, {
      ...exactContext,
      projectAvailability: "TOMBSTONED",
    });
    expect(unavailable).toMatchObject({
      ok: false,
      error: { code: "PROJECT_UNAVAILABLE" },
    });
    expect(JSON.stringify(unavailable)).not.toContain(initial.name);
    expect(JSON.stringify(unavailable)).not.toContain(
      "PRIVATE_AUTHORIZATION_SENTINEL",
    );
  });

  it("conflicts changed or opposite-direction retries under a used history key", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const request = historyRequest(
      forward.project,
      "history-retry-conflict",
      "revision-room-history-retry-conflict",
    );
    const undone = undo(
      forward.project,
      appendHistory(createHistoryState(initial.projectId), forward),
      request,
      contextWith(forward),
    );
    if (!undone.ok) throw new Error("Expected initial undo to succeed");
    expect(
      undo(
        undone.project,
        undone.history,
        { ...request, commandId: "command-history-retry-changed" },
        dispatchContext,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(
      redo(undone.project, undone.history, request, dispatchContext),
    ).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("requires a next room revision only for applicable room history", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const complete = historyRequest(
      forward.project,
      "missing-room-revision",
      "revision-room-unused",
    );
    const missingRoomRevision = {
      commandId: complete.commandId,
      idempotencyKey: complete.idempotencyKey,
      occurredAtUtc: complete.occurredAtUtc,
      causalParentRevisionId: complete.causalParentRevisionId,
      expectedProjectRevisionId: complete.expectedProjectRevisionId,
      nextProjectRevision: complete.nextProjectRevision,
      leaseFence: complete.leaseFence,
    };
    expect(
      undo(forward.project, history, missingRoomRevision, contextWith(forward)),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("forbids a room revision on project-only history", () => {
    const initial = projectFixture();
    const renamed = dispatchProjectCommand(
      initial,
      {
        type: "RENAME_PROJECT",
        commandId: "command-project-only-history",
        idempotencyKey: "idempotency-project-only-history",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T16:20:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-only-history",
        leaseFence: 7,
        name: "Project-only history",
      },
      dispatchContext,
    );
    if (!renamed.ok) throw new Error("Expected rename to succeed");

    expect(
      undo(
        renamed.project,
        appendHistory(createHistoryState(initial.projectId), renamed),
        historyRequest(
          renamed.project,
          "project-only-extra-room",
          "revision-room-project-only-extra",
        ),
        contextWith(renamed),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("requires exactly one matching committed record for a fresh top entry", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const request = historyRequest(
      forward.project,
      "provenance",
      "revision-room-provenance",
    );
    expect(
      undo(forward.project, history, request, dispatchContext),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });

    const mismatchedRecord = {
      ...forward.idempotencyRecord,
      committed: {
        ...forward.idempotencyRecord.committed,
        historyEntry: {
          ...forward.historyEntry,
          inverse: {
            ...forward.historyEntry.inverse,
            position: { x: 99, y: 0, z: 99 },
          },
        },
      },
    };
    expect(
      undo(forward.project, history, request, {
        ...dispatchContext,
        idempotencyRecords: [mismatchedRecord],
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });
  });

  it("rejects a forged inverse even when its caller recomputes the checksum", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const forgedInverse = {
      ...forward.historyEntry.inverse,
      position: { x: 99, y: 0, z: 99 },
    };
    const forgedEntry = {
      ...forward.historyEntry,
      inverse: forgedInverse,
    };
    const forgedCommitted = {
      ...forward.idempotencyRecord.committed,
      historyEntry: forgedEntry,
    };
    const forgedRecord = {
      ...forward.idempotencyRecord,
      committedFingerprint: canonicalJson(forgedCommitted),
      committed: forgedCommitted,
    };
    const forgedHistory = {
      ...structuredClone(history),
      past: [{ ...structuredClone(history.past[0]!), inverse: forgedInverse }],
    } as HistoryState;

    expect(
      undo(
        forward.project,
        forgedHistory,
        historyRequest(
          forward.project,
          "recomputed-forgery",
          "revision-room-recomputed-forgery",
        ),
        {
          ...dispatchContext,
          idempotencyRecords: [forgedRecord],
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });
  });

  it("rejects explicit undefined in a non-room exact-retry envelope", () => {
    const initial = projectFixture();
    const renamed = dispatchProjectCommand(
      initial,
      {
        type: "RENAME_PROJECT",
        commandId: "command-rename-undefined-retry",
        idempotencyKey: "idempotency-rename-undefined-retry",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T16:30:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-rename-undefined-retry",
        leaseFence: 7,
        name: "Renamed before retry",
      },
      dispatchContext,
    );
    if (!renamed.ok) throw new Error("Expected rename to succeed");
    const request = {
      commandId: "command-undo-rename-undefined-retry",
      idempotencyKey: "idempotency-undo-rename-undefined-retry",
      occurredAtUtc: "2026-08-25T16:31:00.000Z",
      causalParentRevisionId: renamed.project.revisionId,
      expectedProjectRevisionId: renamed.project.revisionId,
      nextProjectRevision: "revision-project-undo-rename-undefined-retry",
      leaseFence: 7,
    };
    const undone = undo(
      renamed.project,
      appendHistory(createHistoryState(initial.projectId), renamed),
      request,
      contextWith(renamed),
    );
    if (!undone.ok) throw new Error("Expected rename undo to succeed");
    expect(
      undo(
        undone.project,
        undone.history,
        { ...request, nextRoomRevision: undefined },
        contextWith(renamed, undone.commandResult),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("does not append an exact replay to history", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const firstHistory = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const later = dispatchProjectCommand(
      forward.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-after-forward",
        idempotencyKey: "idempotency-after-forward",
        projectId: forward.project.projectId,
        occurredAtUtc: "2026-08-25T15:30:00.000Z",
        causalParentRevisionId: forward.project.revisionId,
        expectedProjectRevisionId: forward.project.revisionId,
        nextProjectRevision: "revision-project-after-forward",
        leaseFence: 7,
        name: "After forward",
      },
      {
        ...dispatchContext,
        idempotencyRecords: [forward.idempotencyRecord],
      },
    );
    if (!later.ok) throw new Error("Expected later command to succeed");
    const history = appendHistory(firstHistory, later);
    const replay = dispatchProjectCommand(
      later.project,
      forward.historyEntry.forwardCommand,
      {
        ...dispatchContext,
        idempotencyRecords: [
          forward.idempotencyRecord,
          later.idempotencyRecord,
        ],
      },
    );
    if (!replay.ok) throw new Error("Expected replay to succeed");
    expect(replay.replayed).toBe(true);
    const replayHistory = appendHistory(history, replay);
    expect(replayHistory).toEqual(history);
    expect(replayHistory).not.toBe(history);
  });

  it("rejects a forged internal inverse without exposing its payload", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const forged = {
      ...history,
      past: [
        {
          ...history.past[0]!,
          inverse: {
            ...history.past[0]!.inverse,
            privateSentinel: "PRIVATE_HISTORY_SENTINEL",
          },
        },
      ],
    } as unknown as HistoryState;
    const result = undo(
      forward.project,
      forged,
      historyRequest(forward.project, "forged", "revision-room-forged"),
      dispatchContext,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_HISTORY" },
    });
    if (result.ok) throw new Error("Expected forged history to be rejected");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_HISTORY_SENTINEL");
  });

  it("rejects forged replay receipts and duplicated committed entries", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const command = forward.historyEntry.forwardCommand;
    if (command.type !== "MOVE_ENTITY") {
      throw new Error("Expected a move history entry");
    }
    const forgedEnvelope = {
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      occurredAtUtc: command.occurredAtUtc,
      causalParentRevisionId: command.causalParentRevisionId,
      expectedProjectRevisionId: command.expectedProjectRevisionId,
      nextProjectRevision: command.nextProjectRevision,
      nextRoomRevision: command.nextRoomRevision,
      leaseFence: command.leaseFence,
    };
    const forgedReceipt = {
      ...history,
      replayReceipts: [
        {
          direction: "UNDO",
          historyEntryId: history.past[0]!.historyEntryId,
          envelope: forgedEnvelope,
        },
      ],
    } as HistoryState;
    expect(
      undo(
        forward.project,
        forgedReceipt,
        forgedEnvelope,
        contextWith(forward),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_HISTORY" },
    });

    const duplicatedEntry = {
      ...history,
      past: [history.past[0]!, history.past[0]!],
    } as HistoryState;
    expect(
      undo(
        forward.project,
        duplicatedEntry,
        historyRequest(
          forward.project,
          "duplicated-entry",
          "revision-room-duplicated-entry",
        ),
        contextWith(forward),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });
  });

  it("rejects an authentic applicable history head paired with a later project", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const later = dispatchProjectCommand(
      forward.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-history-head-later",
        idempotencyKey: "idempotency-history-head-later",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T17:10:00.000Z",
        causalParentRevisionId: forward.project.revisionId,
        expectedProjectRevisionId: forward.project.revisionId,
        nextProjectRevision: "revision-project-history-head-later",
        leaseFence: 7,
        name: "Later project head",
      },
      contextWith(forward),
    );
    if (!later.ok) throw new Error("Expected later project command to succeed");

    const result = undo(
      later.project,
      history,
      historyRequest(
        later.project,
        "stale-history-head",
        "revision-room-stale-history-head",
      ),
      contextWith(forward, later),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_HISTORY" },
    });
    expect(later.project.name).toBe("Later project head");
  });

  it("rejects a schema-valid inverse that targets a different entity", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const mismatched = {
      ...history,
      past: [
        {
          ...history.past[0]!,
          inverse: {
            ...history.past[0]!.inverse,
            entityId: "entity-different-valid-id",
          },
        },
      ],
    } as unknown as HistoryState;
    expect(
      undo(
        forward.project,
        mismatched,
        historyRequest(
          forward.project,
          "mismatched-valid-inverse",
          "revision-room-mismatched-valid-inverse",
        ),
        dispatchContext,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });
  });

  it("rejects malformed inert history state and replay envelopes", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    expect(
      undo(
        forward.project,
        { ...history, replayReceipts: "malformed" } as unknown as HistoryState,
        historyRequest(
          forward.project,
          "malformed-state",
          "revision-room-malformed-state",
        ),
        dispatchContext,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });
    expect(
      undo(
        forward.project,
        history,
        {
          ...historyRequest(
            forward.project,
            "malformed-envelope",
            "revision-room-malformed-envelope",
          ),
          unknownField: true,
        } as unknown as HistoryReplayEnvelope,
        dispatchContext,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("rejects history bound to another project with colliding target IDs", () => {
    const projectA = projectFixture();
    const forwardA = forwardMove(projectA);
    const historyA = appendHistory(
      createHistoryState(projectA.projectId),
      forwardA,
    );
    const projectBInput = {
      ...structuredClone(forwardA.project),
      projectId: "project-synthetic-other",
    };
    const projectB = parseProject(projectBInput);
    if (!projectB.ok) throw new Error("Expected second project to parse");
    expect(
      undo(
        projectB.value,
        historyA,
        historyRequest(
          projectB.value,
          "cross-project-history",
          "revision-room-cross-project-history",
        ),
        dispatchContext,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HISTORY" } });

    const forwardB = dispatchProjectCommand(
      projectB.value,
      {
        type: "RENAME_PROJECT",
        commandId: "command-project-b",
        idempotencyKey: "idempotency-project-b",
        projectId: projectB.value.projectId,
        occurredAtUtc: "2026-08-25T17:00:00.000Z",
        causalParentRevisionId: projectB.value.revisionId,
        expectedProjectRevisionId: projectB.value.revisionId,
        nextProjectRevision: "revision-project-b-next",
        leaseFence: 7,
        name: "Project B",
      },
      dispatchContext,
    );
    if (!forwardB.ok) throw new Error("Expected project B command to succeed");
    expect(() => appendHistory(historyA, forwardB)).toThrow(
      "History state project mismatch.",
    );
  });

  it("refuses to emit history beyond its validated entry capacity", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const later = dispatchProjectCommand(
      forward.project,
      {
        type: "RENAME_PROJECT",
        commandId: "command-history-capacity-later",
        idempotencyKey: "idempotency-history-capacity-later",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T17:20:00.000Z",
        causalParentRevisionId: forward.project.revisionId,
        expectedProjectRevisionId: forward.project.revisionId,
        nextProjectRevision: "revision-project-history-capacity-later",
        leaseFence: 7,
        name: "Capacity boundary",
      },
      contextWith(forward),
    );
    if (!later.ok) throw new Error("Expected capacity setup to succeed");
    const fullHistory = {
      ...history,
      past: Array.from({ length: 4096 }, () => history.past[0]!),
    } as HistoryState;
    expect(() => appendHistory(fullHistory, later)).toThrow(
      "History state capacity exceeded.",
    );
  });

  it("guards the current project before parsing a history payload", () => {
    const initial = projectFixture();
    const forward = forwardMove(initial);
    const history = appendHistory(
      createHistoryState(initial.projectId),
      forward,
    );
    const guardedHistory = {
      ...history,
      past: [
        {
          ...history.past[0]!,
          inverse: new Proxy(
            {},
            {
              get() {
                throw new Error("History payload was touched");
              },
            },
          ),
        },
      ],
    } as unknown as HistoryState;
    Object.defineProperty(Object.prototype, "flowlensHistoryPollution", {
      configurable: true,
      value: true,
    });
    try {
      expect(
        undo(
          forward.project,
          guardedHistory,
          historyRequest(
            forward.project,
            "guard-first",
            "revision-room-guard-first",
          ),
          dispatchContext,
        ),
      ).toMatchObject({ ok: false, error: { code: "INVALID_PROJECT" } });
    } finally {
      delete (Object.prototype as Record<string, unknown>)
        .flowlensHistoryPollution;
    }
  });

  it("refuses a generated room inverse that would delete the last room", () => {
    const initial = projectFixture();
    const room = {
      ...structuredClone(initial.rooms[0]!),
      roomId: "room-only-generated",
      revisionId: "revision-room-only-generated",
      entities: [],
    };
    const created = dispatchProjectCommand(
      initial,
      {
        type: "CREATE_ROOM",
        commandId: "command-create-only",
        idempotencyKey: "idempotency-create-only",
        projectId: initial.projectId,
        occurredAtUtc: "2026-08-25T16:00:00.000Z",
        causalParentRevisionId: initial.revisionId,
        expectedProjectRevisionId: initial.revisionId,
        nextProjectRevision: "revision-project-created-only",
        leaseFence: 7,
        room,
      },
      dispatchContext,
    );
    if (!created.ok) throw new Error("Expected create to succeed");
    const onlyRoomProjectInput = {
      ...structuredClone(created.project),
      rooms: [structuredClone(room)],
    };
    const onlyRoomProject = parseProject(onlyRoomProjectInput);
    if (!onlyRoomProject.ok)
      throw new Error("Expected one-room project to parse");
    const result = undo(
      onlyRoomProject.value,
      appendHistory(createHistoryState(initial.projectId), created),
      projectHistoryRequest(onlyRoomProject.value, "last-room"),
      contextWith(created),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "LAST_ROOM_REQUIRED" },
    });
  });
});
