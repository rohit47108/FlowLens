import type { Project } from "./project-schema";
import type {
  CommandError,
  HistoryEntry,
  HistoryInvalidationReason,
  SuccessfulCommandResult,
} from "./project-aggregate";

export type HistoryState = Readonly<{
  projectId: string;
  headProjectRevisionId: string | null;
  past: readonly HistoryEntry[];
  future: readonly HistoryEntry[];
  replayReceipts: readonly HistoryReplayReceipt[];
}>;

export type HistoryReplayEnvelope = Readonly<{
  commandId: string;
  idempotencyKey: string;
  occurredAtUtc: string;
  causalParentRevisionId: string;
  expectedProjectRevisionId: string;
  nextProjectRevision: string;
  nextRoomRevision?: string | undefined;
  leaseFence: number;
}>;

export type HistoryReplayReceipt = Readonly<{
  direction: "UNDO" | "REDO";
  historyEntryId: string;
  envelope: HistoryReplayEnvelope;
}>;

export type HistoryError =
  | CommandError
  | Readonly<{
      code: "HISTORY_EMPTY" | "INVALID_HISTORY";
      message: "History action was rejected.";
    }>
  | Readonly<{
      code: "HISTORY_NOT_APPLICABLE";
      message: "History action was rejected.";
      reason: HistoryInvalidationReason;
    }>;

export type HistoryResult =
  | Readonly<{
      ok: true;
      project: Project;
      history: HistoryState;
      commandResult: SuccessfulCommandResult;
    }>
  | Readonly<{
      ok: false;
      error: HistoryError;
    }>;

export function createHistoryState(projectId: string): HistoryState {
  return Object.freeze({
    projectId,
    headProjectRevisionId: null,
    past: Object.freeze([]) as readonly HistoryEntry[],
    future: Object.freeze([]) as readonly HistoryEntry[],
    replayReceipts: Object.freeze([]) as readonly HistoryReplayReceipt[],
  });
}

function markNonApplicable(
  entry: HistoryEntry,
  reason: HistoryInvalidationReason,
): HistoryEntry {
  return Object.freeze({
    ...entry,
    applicability: Object.freeze({ status: "NON_APPLICABLE", reason }),
  });
}

export function appendHistory(
  state: HistoryState,
  result: SuccessfulCommandResult,
): HistoryState {
  if (result.idempotencyRecord.historyExecution !== null) {
    throw new Error("History execution result cannot be appended.");
  }
  if (result.replayed) return state;
  if (
    state.projectId !== result.project.projectId ||
    result.historyEntry.forwardCommand.projectId !== state.projectId ||
    (state.headProjectRevisionId !== null &&
      state.headProjectRevisionId !== result.auditRecord.priorProjectRevision)
  ) {
    throw new Error("History state project mismatch.");
  }
  if (state.past.length + state.future.length >= 4096) {
    throw new Error("History state capacity exceeded.");
  }
  const displacedFuture = state.future.map((entry) =>
    markNonApplicable(entry, "LOCAL_BRANCH"),
  );
  return Object.freeze({
    projectId: state.projectId,
    headProjectRevisionId: result.project.revisionId,
    past: Object.freeze([...state.past, result.historyEntry]),
    future: Object.freeze(displacedFuture),
    replayReceipts: state.replayReceipts,
  });
}

export function invalidateHistory(
  state: HistoryState,
  reason: Exclude<HistoryInvalidationReason, "LOCAL_BRANCH">,
): HistoryState {
  return Object.freeze({
    projectId: state.projectId,
    headProjectRevisionId: state.headProjectRevisionId,
    past: Object.freeze(
      state.past.map((entry) => markNonApplicable(entry, reason)),
    ),
    future: Object.freeze(
      state.future.map((entry) => markNonApplicable(entry, reason)),
    ),
    replayReceipts: state.replayReceipts,
  });
}

export { redo, undo } from "./project-aggregate";
