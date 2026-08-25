import { z, type ZodIssue } from "zod";
import {
  claimId,
  createProjectId,
  entityId,
  evidenceId,
  revisionId,
  roomId,
  runId,
} from "./identity";
import { makeTransform, WORLD_FRAME_VERSION } from "./spatial";
import {
  cadr,
  cubicMetresPerSecond,
  feetToMetres,
  metres,
  schedule,
  supportedUncertainty,
  timeSeconds,
} from "./units";
import { BoundaryValidationError } from "./errors";

const MAX_TEXT_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_COLLECTION_LENGTH = 256;
const FORBIDDEN_OCCUPANT_KEYS = new Set([
  "identity",
  "name",
  "healthStatus",
  "diagnosis",
  "medicalStatus",
  "patient",
]);

const rawFiniteSafeNumber = z
  .number()
  .finite()
  .gte(-Number.MAX_SAFE_INTEGER)
  .lte(Number.MAX_SAFE_INTEGER);
const normalizeNegativeZero = (value: number): number =>
  value === 0 ? 0 : value;
const finiteSafeNumber = rawFiniteSafeNumber.transform(normalizeNegativeZero);
const nonNegativeFiniteSafeNumber = rawFiniteSafeNumber
  .gte(0)
  .transform(normalizeNegativeZero);
const positiveFiniteSafeNumber = rawFiniteSafeNumber
  .gt(0)
  .transform(normalizeNegativeZero);

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
  .refine(
    (value) => !containsControlCharacter(value),
    "Text must not contain control characters.",
  )
  .refine(
    (value) => value.trim().length > 0,
    "Text must not be whitespace only.",
  )
  .refine(
    (value) => value === value.normalize("NFC"),
    "Text must use Unicode NFC.",
  );
const boundedIdentifier = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Identifier must use the portable ASCII syntax.",
  )
  .refine(
    (value) => value === value.normalize("NFC"),
    "Identifier must use Unicode NFC.",
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
const ClaimIdSchema = boundedIdentifier.transform((value) =>
  claimId(() => value),
);
const EvidenceIdSchema = boundedIdentifier.transform((value) =>
  evidenceId(() => value),
);
const RunIdSchema = boundedIdentifier.transform((value) => runId(() => value));

const Vec3Schema = z
  .strictObject({
    x: finiteSafeNumber,
    y: finiteSafeNumber,
    z: finiteSafeNumber,
  })
  .readonly();

const TransformSchema = z
  .strictObject({
    position: Vec3Schema,
    rotation: z
      .strictObject({
        x: finiteSafeNumber,
        y: finiteSafeNumber,
        z: finiteSafeNumber,
        w: finiteSafeNumber,
      })
      .readonly(),
    scale: z
      .strictObject({
        x: positiveFiniteSafeNumber,
        y: positiveFiniteSafeNumber,
        z: positiveFiniteSafeNumber,
      })
      .readonly(),
  })
  .superRefine((value, context) => {
    if (
      value.rotation.x === 0 &&
      value.rotation.y === 0 &&
      value.rotation.z === 0 &&
      value.rotation.w === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "INVALID_QUATERNION",
        path: ["rotation"],
      });
    }
  })
  .transform((value) => makeTransform(value))
  .readonly();

const DimensionsSchema = z
  .strictObject({
    xMetres: positiveFiniteSafeNumber.transform(metres),
    yMetres: positiveFiniteSafeNumber.transform(metres),
    zMetres: positiveFiniteSafeNumber.transform(metres),
  })
  .readonly();

const EntityBaseSchema = z.strictObject({
  entityId: EntityIdSchema,
  label: boundedText,
  transform: TransformSchema,
  dimensions: DimensionsSchema,
  geometryReference: boundedIdentifier.nullable(),
  visibility: z.enum(["VISIBLE", "HIDDEN"]),
  locked: z.boolean(),
  constraintLabels: z.array(boundedText).max(32).readonly(),
});

const OccupantLocationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("POSITION") }).readonly(),
  z
    .strictObject({
      kind: z.literal("ZONE"),
      zoneId: boundedIdentifier,
    })
    .readonly(),
]);

const OccupantScheduleSchema = z
  .strictObject({
    startSecond: nonNegativeFiniteSafeNumber,
    endSecond: positiveFiniteSafeNumber,
  })
  .superRefine((value, context) => {
    if (value.endSecond <= value.startSecond) {
      context.addIssue({
        code: "custom",
        message: "Invalid occupant schedule.",
        path: ["endSecond"],
      });
    }
  })
  .transform((value) => ({
    startSecond: schedule(value.startSecond),
    endSecond: timeSeconds(value.endSecond),
  }))
  .readonly();

export const SpatialEntitySchema = z.discriminatedUnion("type", [
  EntityBaseSchema.extend({
    type: z.literal("GENERIC"),
    genericKind: boundedText,
  }).readonly(),
  EntityBaseSchema.extend({
    type: z.literal("OPENING"),
    openingKind: z.enum(["DOOR", "WINDOW", "VENT"]),
    state: z.enum(["OPEN", "CLOSED", "UNKNOWN"]),
  }).readonly(),
  EntityBaseSchema.extend({
    type: z.literal("DEVICE"),
    deviceKind: z.enum([
      "FAN",
      "PURIFIER",
      "HVAC_SUPPLY",
      "HVAC_RETURN",
      "SENSOR",
    ]),
    operatingState: z.enum(["OFF", "ON", "UNKNOWN"]),
  }).readonly(),
  EntityBaseSchema.extend({
    type: z.literal("OCCUPANT"),
    location: OccupantLocationSchema,
    schedule: OccupantScheduleSchema,
    scenarioRole: boundedText,
  }).readonly(),
  EntityBaseSchema.extend({
    type: z.literal("CONTAMINANT_SOURCE"),
    sourceKind: z.enum(["COOKING", "WILDFIRE_SMOKE", "ALLERGEN", "GENERIC"]),
    scenarioRole: boundedText,
  }).readonly(),
]);

const RoomBoundarySchema = z
  .strictObject({
    kind: z.literal("RECTANGULAR"),
    widthMetres: positiveFiniteSafeNumber.transform(metres),
    depthMetres: positiveFiniteSafeNumber.transform(metres),
  })
  .readonly();

const ActiveModelReferenceSchema = z
  .strictObject({
    modelId: boundedIdentifier,
    revisionId: RevisionIdSchema,
  })
  .readonly();

export const RoomSchema = z
  .strictObject({
    roomId: RoomIdSchema,
    revisionId: RevisionIdSchema,
    label: boundedText,
    frameVersion: z.literal(WORLD_FRAME_VERSION),
    unitSystem: z.literal("SI"),
    heightMetres: positiveFiniteSafeNumber.transform(metres),
    boundary: RoomBoundarySchema,
    entities: z
      .array(SpatialEntitySchema)
      .max(MAX_COLLECTION_LENGTH)
      .readonly(),
    activeModelReference: ActiveModelReferenceSchema.nullable(),
  })
  .readonly();

export const EvidenceCategorySchema = z.enum([
  "OBSERVED",
  "MEASURED",
  "USER_ENTERED",
  "INFERRED",
  "SIMULATED",
  "ASSUMED",
  "PREDICTED",
  "RECOMMENDED",
]);

const CalibrationEvidenceIdSchema = EvidenceIdSchema.nullable();
const SourcePrecisionSchema = nonNegativeFiniteSafeNumber;

const LengthSourceSchema = z
  .strictObject({
    value: nonNegativeFiniteSafeNumber,
    unit: z.enum(["m", "ft"]),
    precision: SourcePrecisionSchema,
    calibrationEvidenceId: CalibrationEvidenceIdSchema,
  })
  .readonly();
const ScalarSourceSchema = <Unit extends "s" | "m3/s">(
  unit: Unit,
  value: z.ZodType<number>,
) =>
  z
    .strictObject({
      value,
      unit: z.literal(unit),
      precision: SourcePrecisionSchema,
      calibrationEvidenceId: CalibrationEvidenceIdSchema,
    })
    .readonly();

const LengthQuantitySchema = z
  .strictObject({
    kind: z.literal("LENGTH"),
    value: nonNegativeFiniteSafeNumber,
    unit: z.literal("m"),
    source: LengthSourceSchema,
  })
  .superRefine((value, context) => {
    const canonical =
      value.source.unit === "ft"
        ? feetToMetres.withProvenance(
            value.source.value,
            value.source.precision,
          ).canonical
        : metres(value.source.value);
    if (value.value !== canonical) {
      context.addIssue({
        code: "custom",
        message: "INVALID_QUANTITY_PROVENANCE",
      });
    }
  })
  .transform((value) => {
    const converted =
      value.source.unit === "ft"
        ? feetToMetres.withProvenance(
            value.source.value,
            value.source.precision,
          )
        : {
            canonical: metres(value.source.value),
            source: {
              value: value.source.value,
              unit: "m" as const,
              precision: value.source.precision,
            },
          };
    return {
      kind: value.kind,
      value: converted.canonical,
      unit: value.unit,
      source: {
        ...converted.source,
        calibrationEvidenceId: value.source.calibrationEvidenceId,
      },
    };
  })
  .readonly();

const TimeQuantitySchema = z
  .strictObject({
    kind: z.literal("TIME"),
    value: positiveFiniteSafeNumber,
    unit: z.literal("s"),
    source: ScalarSourceSchema("s", positiveFiniteSafeNumber),
  })
  .superRefine((value, context) => {
    if (value.value !== value.source.value) {
      context.addIssue({
        code: "custom",
        message: "INVALID_QUANTITY_PROVENANCE",
      });
    }
  })
  .transform((value) => ({
    kind: value.kind,
    value: timeSeconds(value.source.value),
    unit: value.unit,
    source: value.source,
  }))
  .readonly();

const VolumetricFlowQuantitySchema = z
  .strictObject({
    kind: z.literal("VOLUMETRIC_FLOW"),
    value: nonNegativeFiniteSafeNumber,
    unit: z.literal("m3/s"),
    source: ScalarSourceSchema("m3/s", nonNegativeFiniteSafeNumber),
  })
  .superRefine((value, context) => {
    if (value.value !== value.source.value) {
      context.addIssue({
        code: "custom",
        message: "INVALID_QUANTITY_PROVENANCE",
      });
    }
  })
  .transform((value) => ({
    kind: value.kind,
    value: cubicMetresPerSecond(value.source.value),
    unit: value.unit,
    source: value.source,
  }))
  .readonly();

const CadrQuantitySchema = z
  .strictObject({
    kind: z.literal("CADR"),
    value: nonNegativeFiniteSafeNumber,
    unit: z.literal("m3/s"),
    source: ScalarSourceSchema("m3/s", nonNegativeFiniteSafeNumber),
  })
  .superRefine((value, context) => {
    if (value.value !== value.source.value) {
      context.addIssue({
        code: "custom",
        message: "INVALID_QUANTITY_PROVENANCE",
      });
    }
  })
  .transform((value) => ({
    kind: value.kind,
    value: cadr(value.source.value),
    unit: value.unit,
    source: value.source,
  }))
  .readonly();

const QuantitySchema = z.discriminatedUnion("kind", [
  LengthQuantitySchema,
  TimeQuantitySchema,
  VolumetricFlowQuantitySchema,
  CadrQuantitySchema,
]);

const UncertaintySchema = z
  .discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("none") }).readonly(),
    z
      .strictObject({
        kind: z.literal("standard-deviation"),
        value: nonNegativeFiniteSafeNumber,
      })
      .readonly(),
    z
      .strictObject({
        kind: z.literal("interval"),
        lower: finiteSafeNumber,
        upper: finiteSafeNumber,
      })
      .superRefine((value, context) => {
        if (value.lower > value.upper) {
          context.addIssue({
            code: "custom",
            message: "Invalid uncertainty interval.",
            path: ["upper"],
          });
        }
      })
      .readonly(),
  ])
  .transform(supportedUncertainty)
  .readonly();

const ClaimSubjectSchema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("ROOM"),
      roomId: RoomIdSchema,
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal("ENTITY"),
      entityId: EntityIdSchema,
    })
    .readonly(),
]);

const DirectDerivationSchema = z
  .strictObject({
    kind: z.literal("DIRECT"),
    method: boundedText,
  })
  .readonly();
const RecommendationDerivationSchema = z
  .strictObject({
    kind: z.literal("RECOMMENDATION"),
    runId: RunIdSchema,
    modelVersion: boundedText,
    method: boundedText,
  })
  .readonly();
const DerivationSchema = z
  .discriminatedUnion("kind", [
    DirectDerivationSchema,
    RecommendationDerivationSchema,
  ])
  .nullable();

export const ClaimSchema = z
  .strictObject({
    claimId: ClaimIdSchema,
    subject: ClaimSubjectSchema,
    quantity: QuantitySchema,
    category: EvidenceCategorySchema,
    confidence: rawFiniteSafeNumber
      .gte(0)
      .lte(1)
      .transform(normalizeNegativeZero),
    uncertainty: UncertaintySchema,
    evidenceIds: z
      .array(EvidenceIdSchema)
      .max(MAX_COLLECTION_LENGTH)
      .readonly(),
    inputClaimIds: z.array(ClaimIdSchema).max(MAX_COLLECTION_LENGTH).readonly(),
    status: z.enum(["ACTIVE", "SUPERSEDED", "RETRACTED"]),
    supersedesClaimId: ClaimIdSchema.nullable(),
    derivation: DerivationSchema,
  })
  .superRefine((value, context) => {
    const recommended = value.category === "RECOMMENDED";
    const recommendationDerivation =
      value.derivation?.kind === "RECOMMENDATION";
    if (recommended && !recommendationDerivation) {
      context.addIssue({
        code: "custom",
        message: "MISSING_RECOMMENDATION_DERIVATION",
        path: ["derivation"],
      });
    }
    if (!recommended && recommendationDerivation) {
      context.addIssue({
        code: "custom",
        message: "INVALID_CLAIM_DERIVATION",
        path: ["derivation"],
      });
    }
  })
  .readonly();

const EvidenceAvailabilityReasonSchema = z
  .strictObject({
    code: boundedIdentifier,
    detail: boundedText,
  })
  .readonly();
const EvidenceAvailabilitySchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("SELECTED") }).readonly(),
  z.strictObject({ state: z.literal("VALIDATING") }).readonly(),
  z
    .strictObject({
      state: z.literal("ON_DEVICE"),
      checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
      byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .readonly(),
  z
    .strictObject({
      state: z.literal("MISSING"),
      availabilityRevisionId: RevisionIdSchema,
      reason: EvidenceAvailabilityReasonSchema,
    })
    .readonly(),
  z
    .strictObject({
      state: z.literal("CORRUPT"),
      availabilityRevisionId: RevisionIdSchema,
      reason: EvidenceAvailabilityReasonSchema,
    })
    .readonly(),
  z.strictObject({ state: z.literal("DELETION_PENDING") }).readonly(),
  z.strictObject({ state: z.literal("DELETED") }).readonly(),
  z.strictObject({ state: z.literal("EXPORT_ONLY") }).readonly(),
]);

export const EvidenceAssetSchema = z
  .strictObject({
    evidenceId: EvidenceIdSchema,
    kind: z.enum(["PHOTO", "VIDEO", "DOCUMENT", "NOTE", "SENSOR_SERIES"]),
    consent: z
      .strictObject({
        scope: z.enum(["LOCAL_PROCESSING", "EXPORT_ONLY"]),
        granted: z.boolean(),
      })
      .readonly(),
    retention: z
      .strictObject({
        policy: z.enum(["RETAIN_UNTIL_DELETED", "TRANSIENT"]),
      })
      .readonly(),
    redaction: z
      .strictObject({
        state: z.enum(["NOT_REDACTED", "REDACTED"]),
      })
      .readonly(),
    availability: EvidenceAvailabilitySchema,
  })
  .readonly();

export const ProjectSchema = z
  .strictObject({
    schemaVersion: z.literal("flowlens-project-v1"),
    projectId: ProjectIdSchema,
    revisionId: RevisionIdSchema,
    name: boundedText,
    ownership: z
      .strictObject({
        mode: z.literal("LOCAL_ONLY"),
        storage: z.literal("BROWSER_PROFILE"),
      })
      .readonly(),
    preferences: z
      .strictObject({
        defaultUnitSystem: z.literal("SI"),
        localOnly: z.literal(true),
        redactExportsByDefault: z.boolean(),
      })
      .readonly(),
    rooms: z.array(RoomSchema).min(1).max(MAX_COLLECTION_LENGTH).readonly(),
    claims: z.array(ClaimSchema).max(MAX_COLLECTION_LENGTH).readonly(),
    evidence: z
      .array(EvidenceAssetSchema)
      .max(MAX_COLLECTION_LENGTH)
      .readonly(),
  })
  .readonly();

export type Project = z.infer<typeof ProjectSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type SpatialEntity = z.infer<typeof SpatialEntitySchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type EvidenceAsset = z.infer<typeof EvidenceAssetSchema>;
export type EvidenceCategory = z.infer<typeof EvidenceCategorySchema>;

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BoundaryValidationError };

type SanitizedPrimitive = null | boolean | number | string;
type SanitizedValue = SanitizedPrimitive | SanitizedValue[] | SanitizedRecord;
type SanitizedArray = SanitizedValue[];
interface SanitizedRecord {
  [key: string]: SanitizedValue;
}
type SanitizationResult =
  | { readonly ok: true; readonly value: SanitizedValue }
  | { readonly ok: false };

function sanitized(value: SanitizedValue): SanitizationResult {
  return { ok: true, value };
}

const rejectedSanitization: SanitizationResult = { ok: false };

function isDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return (
    descriptor !== undefined &&
    descriptor.get === undefined &&
    descriptor.set === undefined &&
    Object.hasOwn(descriptor, "value")
  );
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return (
    Number.isSafeInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function sanitizeArray(
  input: unknown[],
  ancestors: ReadonlySet<object>,
): SanitizationResult {
  if (Object.getPrototypeOf(input) !== Array.prototype) {
    return rejectedSanitization;
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  if (
    !isDataDescriptor(lengthDescriptor) ||
    lengthDescriptor.enumerable ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > MAX_COLLECTION_LENGTH
  ) {
    return rejectedSanitization;
  }

  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(input);
  if (keys.length !== length + 1) {
    return rejectedSanitization;
  }

  const output: SanitizedArray = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (
      !isDataDescriptor(descriptor) ||
      !descriptor.enumerable ||
      !isCanonicalArrayIndex(key, length)
    ) {
      return rejectedSanitization;
    }
    const child = sanitizeInput(descriptor.value, ancestors);
    if (!child.ok) {
      return rejectedSanitization;
    }
    output.push(child.value);
  }
  return sanitized(output);
}

function sanitizeRecord(
  input: object,
  ancestors: ReadonlySet<object>,
): SanitizationResult {
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return rejectedSanitization;
  }

  const output: SanitizedRecord = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string") {
      return rejectedSanitization;
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!isDataDescriptor(descriptor) || !descriptor.enumerable) {
      return rejectedSanitization;
    }
    const child = sanitizeInput(descriptor.value, ancestors);
    if (!child.ok) {
      return rejectedSanitization;
    }
    Object.defineProperty(output, key, {
      value: child.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return sanitized(output);
}

function sanitizeInput(
  input: unknown,
  ancestors: ReadonlySet<object> = new Set(),
): SanitizationResult {
  if (
    input === null ||
    typeof input === "boolean" ||
    typeof input === "number" ||
    typeof input === "string"
  ) {
    return sanitized(input);
  }
  if (typeof input !== "object" || ancestors.has(input)) {
    return rejectedSanitization;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(input);
  return Array.isArray(input)
    ? sanitizeArray(input, nextAncestors)
    : sanitizeRecord(input, nextAncestors);
}

function normalizedPath(issue: ZodIssue): readonly (string | number)[] {
  return issue.path.filter(
    (segment): segment is string | number =>
      typeof segment === "string" || typeof segment === "number",
  );
}

function pathContains(
  path: readonly (string | number)[],
  segment: string,
): boolean {
  return path.some((value) => value === segment);
}

function recordAtPath(
  input: unknown,
  path: readonly (string | number)[],
): Readonly<Record<string, unknown>> | undefined {
  let current: unknown = input;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[String(segment)];
  }
  return current !== null && typeof current === "object"
    ? (current as Readonly<Record<string, unknown>>)
    : undefined;
}

function hasTrustedLiteralAtPath(
  input: unknown,
  path: readonly (string | number)[],
  field: string,
  literal: string,
): boolean {
  return recordAtPath(input, path)?.[field] === literal;
}

function boundaryError(
  input: unknown,
  issue: ZodIssue,
): BoundaryValidationError {
  const path = normalizedPath(issue);
  if (issue.code === "unrecognized_keys") {
    const forbiddenKey = issue.keys.find((key) =>
      FORBIDDEN_OCCUPANT_KEYS.has(key),
    );
    if (
      forbiddenKey !== undefined &&
      hasTrustedLiteralAtPath(input, path, "type", "OCCUPANT")
    ) {
      return new BoundaryValidationError("FORBIDDEN_OCCUPANT_ATTRIBUTE", path);
    }
    return new BoundaryValidationError("UNKNOWN_FIELD", [...path, "$unknown"]);
  }
  if (path.length === 1 && path[0] === "schemaVersion") {
    return new BoundaryValidationError("UNKNOWN_SCHEMA_VERSION", path);
  }
  if (path.at(-1) === "heightMetres") {
    return new BoundaryValidationError("INVALID_ROOM_HEIGHT", path);
  }
  if (issue.message === "INVALID_QUATERNION") {
    return new BoundaryValidationError("INVALID_QUATERNION", path);
  }
  if (pathContains(path, "transform")) {
    return new BoundaryValidationError("INVALID_TRANSFORM", path);
  }
  if (path.at(-1) === "confidence") {
    return new BoundaryValidationError("INVALID_CLAIM_CONFIDENCE", path);
  }
  if (
    issue.message === "MISSING_RECOMMENDATION_DERIVATION" ||
    (path.at(-1) === "derivation" &&
      hasTrustedLiteralAtPath(
        input,
        path.slice(0, -1),
        "category",
        "RECOMMENDED",
      ))
  ) {
    return new BoundaryValidationError(
      "MISSING_RECOMMENDATION_DERIVATION",
      path,
    );
  }
  if (issue.message === "INVALID_CLAIM_DERIVATION") {
    return new BoundaryValidationError("INVALID_CLAIM_DERIVATION", path);
  }
  if (
    issue.message === "INVALID_QUANTITY_PROVENANCE" ||
    pathContains(path, "quantity")
  ) {
    const quantityIndex = path.indexOf("quantity");
    return new BoundaryValidationError(
      "INVALID_QUANTITY_PROVENANCE",
      path.slice(0, quantityIndex + 1),
    );
  }
  if (pathContains(path, "availability")) {
    const availabilityIndex = path.indexOf("availability");
    return new BoundaryValidationError(
      "INVALID_EVIDENCE_AVAILABILITY",
      path.slice(0, availabilityIndex + 1),
    );
  }
  return new BoundaryValidationError("INVALID_PROJECT", path);
}

/**
 * Hostile trust-boundary entrypoint. Public schemas remain composable, while
 * this function accepts only sanitized own-data JSON-shaped project graphs.
 */
export function parseProject(input: unknown): ParseResult<Project> {
  try {
    const sanitizedInput = sanitizeInput(input);
    if (!sanitizedInput.ok) {
      return {
        ok: false,
        error: new BoundaryValidationError("INVALID_PROJECT", []),
      };
    }
    const result = ProjectSchema.safeParse(sanitizedInput.value);
    if (result.success) {
      return { ok: true, value: result.data };
    }
    return {
      ok: false,
      error: boundaryError(sanitizedInput.value, result.error.issues[0]!),
    };
  } catch {
    return {
      ok: false,
      error: new BoundaryValidationError("INVALID_PROJECT", []),
    };
  }
}
