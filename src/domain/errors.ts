export type BoundaryValidationCode =
  | "UNKNOWN_SCHEMA_VERSION"
  | "INVALID_ROOM_HEIGHT"
  | "INVALID_QUATERNION"
  | "INVALID_CLAIM_CONFIDENCE"
  | "MISSING_RECOMMENDATION_DERIVATION"
  | "INVALID_CLAIM_DERIVATION"
  | "INVALID_EVIDENCE_AVAILABILITY"
  | "FORBIDDEN_OCCUPANT_ATTRIBUTE"
  | "INVALID_TRANSFORM"
  | "UNKNOWN_FIELD"
  | "INVALID_PROJECT";

export class BoundaryValidationError extends Error {
  readonly code: BoundaryValidationCode;
  readonly path: readonly (string | number)[];

  constructor(
    code: BoundaryValidationCode,
    path: readonly (string | number)[],
  ) {
    super("Project data failed validation.");
    this.name = "BoundaryValidationError";
    this.code = code;
    this.path = Object.freeze([...path]);
  }
}
