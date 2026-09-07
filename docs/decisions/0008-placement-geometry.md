# ADR-0008: Use bottom-centred boxes for initial placement checks

## Status

Accepted

## Date

2026-09-04

## Context

The canonical transform has a coordinate frame but has not yet defined an entity's local anchor. The editor and optimization must agree on room containment, contact, collisions, and device requirements before rendering can be authoritative as a projection.

## Decision

The initial editable entity is a box whose local anchor is the bottom centre: local X is `[-width/2, width/2]`, Y is `[0, height]`, and Z is `[-depth/2, depth/2]`. Apply the canonical scale, quaternion rotation, and translation to all eight corners. `boundsForEntity` returns their world-axis-aligned enclosing box. Imported meshes must later be aligned to this local box; their renderer origin does not change canonical placement.

The pure domain evaluator checks only the proposed placement against the supplied rectangular room and configured requirements. It does not mutate entities, infer physical airflow, or certify installation safety. It uses `1e-6 m` as geometric contact tolerance, not as claimed measurement accuracy. Touching faces are not collisions. Axis-aligned bounds are conservative for rotated boxes and concave meshes: they may flag empty-space overlap. The report identifies that approximation. Only a specific collision can be explicitly overridden by a non-empty user reason and a matching caller-authorized override permission. Invalid numbers/dimensions/rotations, locked spatial mutations, room containment, surface attachment, device clearance, and outlet reach remain non-overridable in this version.

Openings occupy a thin box entirely inside the room with one vertical face flush to a declared wall (`MIN_X`, `MAX_X`, `MIN_Z`, or `MAX_Z`). Their local Z axis is the face normal. Either sign is accepted: the transformed local Z direction must match either unit normal of the wall within `1e-7` per component. All four corners of the outward-facing local Z face must lie on the wall within `1e-6 m`; merely touching with a rotated corner is insufficient. This does not assign an airflow direction. Wall references are explicit evaluator context until the canonical opening schema grows attachment properties. Missing attachment returns an actionable violation.

Existing and proposed devices use explicit, evidence-linked requirement records. Clearance is a six-sided world-axis-aligned envelope around their bounds; a zero floor clearance can be explicitly supplied for floor-mounted equipment. Moving furniture must also respect existing devices' envelopes. No manufacturer clearance, cable length, or outlet location is invented. Missing device requirements produce an unassessed warning, never an installation recommendation. Outlet checks compare a transformed local connector point with explicitly supplied outlet positions and the supplied cable length. This is a straight-line reach check only: passing it does not establish a usable cable route, trip safety, electrical compatibility, or outlet capacity.

The clearance envelope must also fit inside floor/ceiling/walls, using the same contact tolerance. A room-surface shortfall is a `DEVICE_CLEARANCE` violation tied to the device and room. Outlet requirements distinguish `REQUIRED`, `NOT_REQUIRED` (with provenance), and `UNKNOWN`. Any one eligible supplied outlet may satisfy a required straight-line reach check; no eligible outlets is `OUTLET_REACH`, and an unresolved outlet reference is invalid context. Candidate outlets are compared by distance then identifier for stable ties.

Locked spatial equality is exact for canonical position, dimensions, and scale. Quaternions compare exactly allowing either `q` or `-q`, which represent the same rotation. Geometric contact/round-trip tolerances do not authorize tiny repeated edits to a locked object. Display-only changes remain outside this placement check.

Collision pair identity is unordered: sort both entity IDs by code-unit order. Override permission and request must match that pair and `COLLISION`. Duplicate pair records or requests without a matching permission are invalid context. Unused permissions are permitted, but a request with no actual matching collision is invalid context. Reasons must be NFC text of 1–256 characters after trimming, contain no control characters, and are retained on the warning. Neither an unknown code nor malformed override can demote a non-overridable violation.

`isFeasible` means no unoverridden violations within these configured geometric checks. Later recommendation admissibility must additionally reject unknown required device/scenario facts. Visibility affects rendering only; hidden solid objects remain collision obstacles. Generic annotations may be explicitly excluded as non-solid in context; labels alone cannot disable constraints. Results use stable code/entity ordering and preserve identifiers, provenance references, and override reasons without changing input data.

## Alternatives considered

- Centre-origin boxes: common in rendering, but a floor position of zero would put half the object below the room. Rejected for canonical user-entered placement; the scene adapter can offset its mesh.
- Oriented-box or mesh collision now: more precise, but unnecessary for the initial coarse-room contract. Keep the conservative result explicit and retain an extension seam for a future narrow-phase check.
- Hard-coded device clearance and outlet defaults: rejected because absent equipment facts cannot become evidence.

## Consequences

- Scene meshes need a half-height local offset before applying the canonical transform.
- Constraint results do not imply physically validated placement or guaranteed safety.
- Rotated-box overlaps can require a user review/override until a narrow-phase adapter is introduced.
- The domain remains independent of Three.js and uses the existing spatial primitives.

## Sources

- [Three.js Box3](https://threejs.org/docs/pages/Box3.html): world-axis-aligned enclosing boxes can be larger than the underlying transformed geometry.
- [Three.js Matrix4](https://threejs.org/docs/pages/Matrix4.html): the renderer can compose position, quaternion, and scale; this does not determine FlowLens's anchor policy.

The anchor, contact tolerance, override scope, and device-check limits above are FlowLens design decisions, not capabilities supplied or validated by Three.js.
