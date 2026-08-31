import type { Project } from "./project-schema";
import type {
  CommandError,
  HistoryEntry,
  HistoryInvalidationReason,
  SuccessfulCommandResult,
} from "./project-aggregate";

const TrustedWeakSet = WeakSet;
const objectFreeze = Object.freeze;
const objectValues = Object.values;
const weakSetHas = Function.prototype.call.bind(
  TrustedWeakSet.prototype.has,
) as (set: WeakSet<object>, value: object) => boolean;
const weakSetAdd = Function.prototype.call.bind(
  TrustedWeakSet.prototype.add,
) as (set: WeakSet<object>, value: object) => WeakSet<object>;

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

function detachHistoryState(state: HistoryState): HistoryState {
  try {
    return deepFreeze(structuredClone(state));
  } catch {
    throw new Error("History state is invalid.");
  }
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
  const currentState = detachHistoryState(state);
  if (result.idempotencyRecord.historyExecution !== null) {
    throw new Error("History execution result cannot be appended.");
  }
  if (result.replayed) return currentState;
  if (
    currentState.projectId !== result.project.projectId ||
    result.historyEntry.forwardCommand.projectId !== currentState.projectId ||
    (currentState.headProjectRevisionId !== null &&
      currentState.headProjectRevisionId !==
        result.auditRecord.priorProjectRevision)
  ) {
    throw new Error("History state project mismatch.");
  }
  if (currentState.past.length + currentState.future.length >= 4096) {
    throw new Error("History state capacity exceeded.");
  }
  const displacedFuture = currentState.future.map((entry) =>
    markNonApplicable(entry, "LOCAL_BRANCH"),
  );
  return detachHistoryState({
    projectId: currentState.projectId,
    headProjectRevisionId: result.project.revisionId,
    past: [...currentState.past, result.historyEntry],
    future: displacedFuture,
    replayReceipts: currentState.replayReceipts,
  });
}

export function invalidateHistory(
  state: HistoryState,
  reason: Exclude<HistoryInvalidationReason, "LOCAL_BRANCH">,
): HistoryState {
  const currentState = detachHistoryState(state);
  return detachHistoryState({
    projectId: currentState.projectId,
    headProjectRevisionId: currentState.headProjectRevisionId,
    past: currentState.past.map((entry) => markNonApplicable(entry, reason)),
    future: currentState.future.map((entry) =>
      markNonApplicable(entry, reason),
    ),
    replayReceipts: currentState.replayReceipts,
  });
}

export { redo, undo } from "./project-aggregate";
