declare const identityBrand: unique symbol;

type BrandedId<Name extends string> = string & {
  readonly [identityBrand]: Name;
};

export type ProjectId = BrandedId<"ProjectId">;
export type RoomId = BrandedId<"RoomId">;
export type EntityId = BrandedId<"EntityId">;
export type RevisionId = BrandedId<"RevisionId">;
export type CommandId = BrandedId<"CommandId">;
export type ClaimId = BrandedId<"ClaimId">;
export type EvidenceId = BrandedId<"EvidenceId">;
export type RunId = BrandedId<"RunId">;
export type JobId = BrandedId<"JobId">;

declare const leaseFenceBrand: unique symbol;

export type LeaseFence = number & {
  readonly [leaseFenceBrand]: "LeaseFence";
};

export type RawIdFactory = () => string;

function idFromFactory<Name extends string>(
  factory: RawIdFactory,
  label: string,
): BrandedId<Name> {
  const rawId = factory();
  if (rawId.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }

  return rawId as BrandedId<Name>;
}

export function createProjectId(factory: RawIdFactory): ProjectId {
  return idFromFactory<"ProjectId">(factory, "project ID");
}

export function roomId(factory: RawIdFactory): RoomId {
  return idFromFactory<"RoomId">(factory, "room ID");
}

export function entityId(factory: RawIdFactory): EntityId {
  return idFromFactory<"EntityId">(factory, "entity ID");
}

export function revisionId(factory: RawIdFactory): RevisionId {
  return idFromFactory<"RevisionId">(factory, "revision ID");
}

export function commandId(factory: RawIdFactory): CommandId {
  return idFromFactory<"CommandId">(factory, "command ID");
}

export function claimId(factory: RawIdFactory): ClaimId {
  return idFromFactory<"ClaimId">(factory, "claim ID");
}

export function evidenceId(factory: RawIdFactory): EvidenceId {
  return idFromFactory<"EvidenceId">(factory, "evidence ID");
}

export function runId(factory: RawIdFactory): RunId {
  return idFromFactory<"RunId">(factory, "run ID");
}

export function jobId(factory: RawIdFactory): JobId {
  return idFromFactory<"JobId">(factory, "job ID");
}

export function leaseFence(value: number): LeaseFence {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("lease fence must be a non-negative safe integer");
  }

  return (value === 0 ? 0 : value) as LeaseFence;
}
