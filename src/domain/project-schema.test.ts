import { describe, expect, it } from "vitest";
import { WORLD_FRAME_VERSION } from "./spatial";
import { parseProject, parseProjectJson } from "./project-schema";
import { minimalProject } from "../../tests/fixtures/minimal-project";

function invalidResult(input: unknown) {
  const result = parseProject(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected invalid project input");
  }
  return result.error;
}

function invalidJsonResult(input: unknown) {
  const result = parseProjectJson(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected invalid JSON project input");
  }
  return result.error;
}

function setAtPath(
  input: object,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const finalSegment = path.at(-1);
  if (finalSegment === undefined) {
    throw new Error("A mutation path must not be empty.");
  }

  let current: unknown = input;
  for (const segment of path.slice(0, -1)) {
    if (current === null || typeof current !== "object") {
      throw new Error("A mutation path must resolve to an object.");
    }
    current = (current as Record<string, unknown>)[String(segment)];
  }
  if (current === null || typeof current !== "object") {
    throw new Error("A mutation path must resolve to an object.");
  }
  (current as Record<string, unknown>)[String(finalSegment)] = value;
}

function deleteAtPath(input: object, path: readonly (string | number)[]): void {
  const finalSegment = path.at(-1);
  if (finalSegment === undefined) {
    throw new Error("A mutation path must not be empty.");
  }

  let current: unknown = input;
  for (const segment of path.slice(0, -1)) {
    if (current === null || typeof current !== "object") {
      throw new Error("A mutation path must resolve to an object.");
    }
    current = (current as Record<string, unknown>)[String(segment)];
  }
  if (current === null || typeof current !== "object") {
    throw new Error("A mutation path must resolve to an object.");
  }
  delete (current as Record<string, unknown>)[String(finalSegment)];
}

function occupantEntity(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    type: "OCCUPANT",
    entityId: "entity-occupant-001",
    label: "Occupant marker",
    transform: {
      position: { x: 1, y: 0, z: 1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
    dimensions: { xMetres: 0.5, yMetres: 1.7, zMetres: 0.5 },
    geometryReference: null,
    visibility: "VISIBLE",
    locked: false,
    constraintLabels: [],
    location: { kind: "POSITION" },
    schedule: { startSecond: 0, endSecond: 3600 },
    scenarioRole: "SYNTHETIC_OCCUPANT",
    ...extra,
  };
}

function expectPreflightRejection(input: unknown, hostileText: string): void {
  const error = invalidResult(input);

  expect(error.code).toBe("INVALID_PROJECT");
  expect(error.path).toEqual([]);
  expect(JSON.stringify(error)).not.toContain(hostileText);
  expect(error.message).not.toContain(hostileText);
}

function defineHostileDataProperty(
  target: object,
  key: "__proto__" | "prototype" | "constructor",
  value: string,
): void {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    writable: true,
    value,
  });
}

function restoreDescriptor(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    delete (target as Record<PropertyKey, unknown>)[key];
    return;
  }
  Object.defineProperty(target, key, descriptor);
}

function expectPrototypeGuardRejection(
  result: ReturnType<typeof parseProject> | undefined,
  privateValue: string,
): void {
  expect(result?.ok).toBe(false);
  if (result?.ok === false) {
    expect(result.error.code).toBe("INVALID_PROJECT");
    expect(result.error.path).toEqual([]);
    expect(JSON.stringify(result.error)).not.toContain(privateValue);
  }
}

function expectOrdinaryProjectsToParseAfterRestoration(): void {
  expect(parseProject(structuredClone(minimalProject)).ok).toBe(true);
  expect(parseProjectJson(JSON.stringify(minimalProject)).ok).toBe(true);
}

describe("canonical project schema", () => {
  it("parses a serialized synthetic project through the hostile JSON ingress", () => {
    const result = parseProjectJson(JSON.stringify(minimalProject));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(minimalProject);
    }
  });

  it.each([
    '{"name":"DO_NOT_LEAK_MALFORMED"',
    `DO_NOT_LEAK_CODE_UNITS${"a".repeat(1_000_000)}`,
    `DO_NOT_LEAK_UTF8${"€".repeat(400_000)}`,
  ])("rejects hostile JSON text without source or parser leaks", (input) => {
    const error = invalidJsonResult(input);

    expect(error.code).toBe("INVALID_PROJECT");
    expect(error.path).toEqual([]);
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK");
    expect(error.message).not.toContain("DO_NOT_LEAK");
  });

  it("rejects non-string JSON ingress without inspecting a proxy", () => {
    const counters = {
      get: 0,
      getPrototypeOf: 0,
      ownKeys: 0,
      getOwnPropertyDescriptor: 0,
    };
    const input = new Proxy(
      { value: "DO_NOT_LEAK_PROXY_JSON" },
      {
        get(target, property, receiver) {
          counters.get += 1;
          return Reflect.get(target, property, receiver);
        },
        getPrototypeOf(target) {
          counters.getPrototypeOf += 1;
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          counters.ownKeys += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, property) {
          counters.getOwnPropertyDescriptor += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      },
    );

    const error = invalidJsonResult(input);

    expect(error.code).toBe("INVALID_PROJECT");
    expect(error.path).toEqual([]);
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_PROXY_JSON");
    expect(counters).toEqual({
      get: 0,
      getPrototypeOf: 0,
      ownKeys: 0,
      getOwnPropertyDescriptor: 0,
    });
  });

  it("fails JSON ingress closed under ambient descriptor pollution", () => {
    const json = JSON.stringify(minimalProject);
    const originalGet = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "get",
    );
    let accessorReads = 0;
    let result;

    try {
      Object.defineProperty(
        Object.prototype,
        "get",
        Object.assign(Object.create(null), {
          configurable: true,
          get() {
            accessorReads += 1;
            return undefined;
          },
        }),
      );
      accessorReads = 0;
      result = parseProjectJson(json);
    } finally {
      restoreDescriptor(Object.prototype, "get", originalGet);
    }

    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.error.code).toBe("INVALID_PROJECT");
      expect(result.error.path).toEqual([]);
    }
    expect(accessorReads).toBe(0);
  });

  it("rejects a project-field setter on Object.prototype before either parser invokes it", () => {
    const trustedInput = structuredClone(minimalProject);
    const jsonInput = JSON.stringify(minimalProject);
    const privateValue = minimalProject.name;
    const original = Object.getOwnPropertyDescriptor(Object.prototype, "name");
    let setterWrites = 0;
    let trustedResult: ReturnType<typeof parseProject> | undefined;
    let jsonResult: ReturnType<typeof parseProjectJson> | undefined;

    try {
      const descriptor = Object.create(null) as PropertyDescriptor;
      descriptor.configurable = true;
      descriptor.set = function setter() {
        setterWrites += 1;
      };
      Object.defineProperty(Object.prototype, "name", descriptor);

      setterWrites = 0;
      trustedResult = parseProject(trustedInput);
      jsonResult = parseProjectJson(jsonInput);
    } finally {
      restoreDescriptor(Object.prototype, "name", original);
    }

    expectPrototypeGuardRejection(trustedResult, privateValue);
    expectPrototypeGuardRejection(jsonResult, privateValue);
    expect(setterWrites).toBe(0);
    expectOrdinaryProjectsToParseAfterRestoration();
  });

  it("rejects an Array.prototype numeric setter beyond index zero before either parser invokes it", () => {
    const trustedInput = structuredClone(minimalProject);
    const jsonInput = JSON.stringify(minimalProject);
    const privateValue = minimalProject.name;
    const original = Object.getOwnPropertyDescriptor(Array.prototype, "1");
    const originalLength = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "length",
    );
    let setterWrites = 0;
    let trustedResult: ReturnType<typeof parseProject> | undefined;
    let jsonResult: ReturnType<typeof parseProjectJson> | undefined;

    try {
      const descriptor = Object.create(null) as PropertyDescriptor;
      descriptor.configurable = true;
      descriptor.set = function setter(value: unknown) {
        setterWrites += 1;
        const ownDescriptor = Object.create(null) as PropertyDescriptor;
        ownDescriptor.configurable = true;
        ownDescriptor.enumerable = true;
        ownDescriptor.writable = true;
        ownDescriptor.value = value;
        Object.defineProperty(this, "1", ownDescriptor);
      };
      Object.defineProperty(Array.prototype, "1", descriptor);

      setterWrites = 0;
      trustedResult = parseProject(trustedInput);
      jsonResult = parseProjectJson(jsonInput);
    } finally {
      restoreDescriptor(Array.prototype, "1", original);
      restoreDescriptor(Array.prototype, "length", originalLength);
    }

    expectPrototypeGuardRejection(trustedResult, privateValue);
    expectPrototypeGuardRejection(jsonResult, privateValue);
    expect(setterWrites).toBe(0);
    expectOrdinaryProjectsToParseAfterRestoration();
  });

  it("rejects replacement of a symbol-keyed Array prototype traversal function", () => {
    const trustedInput = structuredClone(minimalProject);
    const jsonInput = JSON.stringify(minimalProject);
    const privateValue = minimalProject.name;
    const original = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    );
    if (original === undefined || typeof original.value !== "function") {
      throw new Error("Expected the supported realm to have an array iterator");
    }
    const originalIterator = original.value as (
      this: unknown,
    ) => IterableIterator<unknown>;
    let replacementCalls = 0;
    let trustedResult: ReturnType<typeof parseProject> | undefined;
    let jsonResult: ReturnType<typeof parseProjectJson> | undefined;

    try {
      const descriptor = Object.create(null) as PropertyDescriptor;
      descriptor.configurable = original.configurable === true;
      descriptor.enumerable = original.enumerable === true;
      descriptor.writable = original.writable === true;
      descriptor.value = function replacementIterator(this: unknown) {
        replacementCalls += 1;
        return Reflect.apply(originalIterator, this, []);
      };
      Object.defineProperty(Array.prototype, Symbol.iterator, descriptor);

      replacementCalls = 0;
      trustedResult = parseProject(trustedInput);
      jsonResult = parseProjectJson(jsonInput);
    } finally {
      restoreDescriptor(Array.prototype, Symbol.iterator, original);
    }

    expectPrototypeGuardRejection(trustedResult, privateValue);
    expectPrototypeGuardRejection(jsonResult, privateValue);
    expect(replacementCalls).toBe(0);
    expectOrdinaryProjectsToParseAfterRestoration();
  });

  it("rejects a canonical numeric property added to Object.prototype", () => {
    const trustedInput = structuredClone(minimalProject);
    const jsonInput = JSON.stringify(minimalProject);
    const privateValue = minimalProject.name;
    const original = Object.getOwnPropertyDescriptor(Object.prototype, "4096");
    let trustedResult: ReturnType<typeof parseProject> | undefined;
    let jsonResult: ReturnType<typeof parseProjectJson> | undefined;

    try {
      const descriptor = Object.create(null) as PropertyDescriptor;
      descriptor.configurable = true;
      descriptor.enumerable = false;
      descriptor.writable = true;
      descriptor.value = "DO_NOT_LEAK_NUMERIC_PROTOTYPE";
      Object.defineProperty(Object.prototype, "4096", descriptor);

      trustedResult = parseProject(trustedInput);
      jsonResult = parseProjectJson(jsonInput);
    } finally {
      restoreDescriptor(Object.prototype, "4096", original);
    }

    expectPrototypeGuardRejection(trustedResult, privateValue);
    expectPrototypeGuardRejection(jsonResult, privateValue);
    expectOrdinaryProjectsToParseAfterRestoration();
  });

  it("rejects a prototype descriptor attribute change even when its value is unchanged", () => {
    const trustedInput = structuredClone(minimalProject);
    const jsonInput = JSON.stringify(minimalProject);
    const privateValue = minimalProject.name;
    const original = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "toString",
    );
    if (original === undefined || original.writable !== true) {
      throw new Error("Expected the supported realm to have writable toString");
    }
    let trustedResult: ReturnType<typeof parseProject> | undefined;
    let jsonResult: ReturnType<typeof parseProjectJson> | undefined;

    try {
      const descriptor = Object.create(null) as PropertyDescriptor;
      descriptor.configurable = original.configurable === true;
      descriptor.enumerable = original.enumerable === true;
      descriptor.writable = false;
      descriptor.value = original.value;
      Object.defineProperty(Object.prototype, "toString", descriptor);

      trustedResult = parseProject(trustedInput);
      jsonResult = parseProjectJson(jsonInput);
    } finally {
      restoreDescriptor(Object.prototype, "toString", original);
    }

    expectPrototypeGuardRejection(trustedResult, privateValue);
    expectPrototypeGuardRejection(jsonResult, privateValue);
    expectOrdinaryProjectsToParseAfterRestoration();
  });

  it("rejects serialized reserved keys and escaped text controls safely", () => {
    const reservedJson = `{"__proto__":"DO_NOT_LEAK_JSON_RESERVED",${JSON.stringify(
      minimalProject,
    ).slice(1)}`;
    const reservedError = invalidJsonResult(reservedJson);
    expect(reservedError.code).toBe("INVALID_PROJECT");
    expect(reservedError.path).toEqual([]);
    expect(JSON.stringify(reservedError)).not.toContain(
      "DO_NOT_LEAK_JSON_RESERVED",
    );

    const controlProject = structuredClone(minimalProject);
    setAtPath(controlProject, ["name"], "DO_NOT_LEAK_ESCAPED_CONTROL\u0001");
    const controlJson = JSON.stringify(controlProject);
    expect(controlJson).toContain("\\u0001");
    const controlError = invalidJsonResult(controlJson);
    expect(controlError.code).toBe("INVALID_PROJECT");
    expect(JSON.stringify(controlError)).not.toContain(
      "DO_NOT_LEAK_ESCAPED_CONTROL",
    );
  });

  it("maps serialized occupant privacy failures without source disclosure", () => {
    const input = structuredClone(minimalProject);
    setAtPath(
      input,
      ["rooms", 0, "entities"],
      [occupantEntity({ identity: "DO_NOT_LEAK_JSON_PRIVATE" })],
    );

    const error = invalidJsonResult(JSON.stringify(input));

    expect(error.code).toBe("FORBIDDEN_OCCUPANT_ATTRIBUTE");
    expect(error.path).toEqual(["rooms", 0, "entities", 0]);
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_JSON_PRIVATE");
    expect(JSON.stringify(error)).not.toContain("identity");
  });

  it.each([
    (input: object) => {
      let nested: object = { leaf: "DO_NOT_LEAK_DEPTH" };
      for (let depth = 0; depth < 33; depth += 1) {
        nested = { nested };
      }
      setAtPath(input, ["deep"], nested);
      return "DO_NOT_LEAK_DEPTH";
    },
    (input: object) => {
      const record: Record<string, string> = {};
      for (let index = 0; index < 65; index += 1) {
        record[`key-${index}`] = "DO_NOT_LEAK_RECORD_BUDGET";
      }
      setAtPath(input, ["record"], record);
      return "DO_NOT_LEAK_RECORD_BUDGET";
    },
    (input: object) => {
      const key = "k".repeat(129);
      setAtPath(input, [key], "DO_NOT_LEAK_KEY_BUDGET");
      return "DO_NOT_LEAK_KEY_BUDGET";
    },
    (input: object) => {
      const matrix = Array.from({ length: 256 }, () =>
        Array.from({ length: 256 }, () => 0),
      );
      setAtPath(input, ["matrix"], matrix);
      return "matrix";
    },
  ])("rejects over-budget preflight graphs without leaking data", (mutate) => {
    const input = structuredClone(minimalProject);

    expectPreflightRejection(input, mutate(input));
  });

  it("does not consult polluted descriptor or array-setter prototypes", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["name"], "SENTINEL_OWN_DATA");
    const originalGet = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "get",
    );
    const originalSet = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "set",
    );
    const originalIndex = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    const originalArrayLength = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "length",
    );
    let descriptorAccessorReads = 0;
    let arraySetterWrites = 0;
    let result;

    try {
      Object.defineProperty(
        Object.prototype,
        "get",
        Object.assign(Object.create(null), {
          configurable: true,
          get() {
            descriptorAccessorReads += 1;
            return undefined;
          },
        }),
      );
      Object.defineProperty(
        Object.prototype,
        "set",
        Object.assign(Object.create(null), {
          configurable: true,
          get() {
            descriptorAccessorReads += 1;
            return undefined;
          },
        }),
      );
      Object.defineProperty(
        Array.prototype,
        "0",
        Object.assign(Object.create(null), {
          configurable: true,
          set(value: unknown) {
            arraySetterWrites += 1;
            Object.defineProperty(
              this,
              "0",
              Object.assign(Object.create(null), {
                configurable: true,
                enumerable: true,
                writable: true,
                value,
              }),
            );
          },
        }),
      );

      descriptorAccessorReads = 0;
      arraySetterWrites = 0;
      result = parseProject(input);
    } finally {
      restoreDescriptor(Object.prototype, "get", originalGet);
      restoreDescriptor(Object.prototype, "set", originalSet);
      restoreDescriptor(Array.prototype, "0", originalIndex);
      restoreDescriptor(Array.prototype, "length", originalArrayLength);
    }

    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.error.code).toBe("INVALID_PROJECT");
      expect(result.error.path).toEqual([]);
      expect(JSON.stringify(result.error)).not.toContain("SENTINEL_OWN_DATA");
    }
    expect(descriptorAccessorReads).toBe(0);
    expect(arraySetterWrites).toBe(0);
  });

  it("rejects transparent root proxies through the trusted-value entrypoint", () => {
    const target = structuredClone(minimalProject);
    let propertyGets = 0;
    const input = new Proxy(target, {
      get(targetValue, property, receiver) {
        propertyGets += 1;
        return Reflect.get(targetValue, property, receiver);
      },
    });

    expectPreflightRejection(input, "project-synthetic-001");
    expect(propertyGets).toBe(0);
  });

  it.each(["__proto__", "prototype", "constructor"] as const)(
    "rejects reserved root meta key %s without copying or leaking it",
    (key) => {
      const input = structuredClone(minimalProject);
      const hostileValue = "DO_NOT_LEAK_RESERVED_KEY";
      defineHostileDataProperty(input, key, hostileValue);

      expectPreflightRejection(input, hostileValue);
      expect(Object.getOwnPropertyDescriptor(input, key)).toMatchObject({
        enumerable: true,
        value: hostileValue,
      });
    },
  );

  it("rejects an own nested __proto__ data property that parsed before the fix", () => {
    const input = structuredClone(minimalProject);
    const preferences = input.preferences as object;
    const hostileValue = "DO_NOT_LEAK_NESTED_RESERVED_KEY";
    defineHostileDataProperty(preferences, "__proto__", hostileValue);

    expectPreflightRejection(input, hostileValue);
    expect(
      Object.getOwnPropertyDescriptor(preferences, "__proto__"),
    ).toMatchObject({
      enumerable: true,
      value: hostileValue,
    });
  });

  it("rejects cyclic records without mutating the hostile graph", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["preferences", "cycle"], input);

    expectPreflightRejection(input, "cycle");
    expect((input.preferences as Record<string, unknown>).cycle).toBe(input);
  });

  it("rejects inherited root fields before schema validation", () => {
    const input = Object.create(minimalProject);

    expectPreflightRejection(input, "project-synthetic-001");
  });

  it("rejects inherited spatial entity fields before schema validation", () => {
    const input = structuredClone(minimalProject);
    setAtPath(
      input,
      ["rooms", 0, "entities", 0],
      Object.create(input.rooms[0].entities[0]),
    );

    expectPreflightRejection(input, "entity-synthetic-001");
  });

  it("rejects enumerable getters without reading them", () => {
    const input = structuredClone(minimalProject);
    let reads = 0;
    Object.defineProperty(input, "projectId", {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return "project-synthetic-001";
      },
    });

    expectPreflightRejection(input, "project-synthetic-001");
    expect(reads).toBe(0);
    expect(
      Object.getOwnPropertyDescriptor(input, "projectId")?.get,
    ).toBeDefined();
  });

  it.each([
    (input: object) => {
      Object.defineProperty(input, "hostile-key", {
        enumerable: false,
        value: "DO_NOT_LEAK_NON_ENUMERABLE",
      });
      return "DO_NOT_LEAK_NON_ENUMERABLE";
    },
    (input: object) => {
      (input as Record<PropertyKey, unknown>)[Symbol("hostile-key")] =
        "DO_NOT_LEAK_SYMBOL";
      return "DO_NOT_LEAK_SYMBOL";
    },
  ])(
    "rejects symbol and non-enumerable properties without leaking data",
    (mutate) => {
      const input = structuredClone(minimalProject);

      expectPreflightRejection(input, mutate(input));
    },
  );

  it.each([
    (input: object) => {
      setAtPath(input, ["preferences"], new Date("2026-08-25T00:00:00Z"));
      return "2026-08-25";
    },
    (input: object) => {
      const custom = Object.assign(Object.create({ inherited: true }), {
        defaultUnitSystem: "SI",
        localOnly: true,
        redactExportsByDefault: true,
      });
      setAtPath(input, ["preferences"], custom);
      return "inherited";
    },
  ])("rejects nested custom-prototype values", (mutate) => {
    const input = structuredClone(minimalProject);

    expectPreflightRejection(input, mutate(input));
  });

  it.each([
    (input: object) => {
      const sparseRooms = new Array(2);
      sparseRooms[0] = structuredClone(minimalProject.rooms[0]);
      setAtPath(input, ["rooms"], sparseRooms);
      return "sparse";
    },
    (input: object) => {
      const rooms = structuredClone(minimalProject.rooms);
      Object.defineProperty(rooms, "hostile-key", {
        enumerable: true,
        value: "DO_NOT_LEAK_ARRAY_PROPERTY",
      });
      setAtPath(input, ["rooms"], rooms);
      return "DO_NOT_LEAK_ARRAY_PROPERTY";
    },
  ])("rejects sparse and extra-property arrays", (mutate) => {
    const input = structuredClone(minimalProject);

    expectPreflightRejection(input, mutate(input));
  });

  it("accepts a null-prototype root with ordinary nested project data", () => {
    const input = Object.assign(
      Object.create(null),
      structuredClone(minimalProject),
    );
    const original = structuredClone(input);

    const result = parseProject(input);

    expect(result.ok).toBe(true);
    expect(input).toEqual(original);
  });

  it("parses the deterministic synthetic fixture without mutating it", () => {
    const input = structuredClone(minimalProject);
    const original = structuredClone(input);

    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(input).toEqual(original);
    expect(result.value.schemaVersion).toBe("flowlens-project-v1");
    expect(result.value.rooms[0]?.frameVersion).toBe(WORLD_FRAME_VERSION);
    expect(result.value.rooms[0]?.heightMetres).toBe(2.4);
    expect(result.value.rooms[0]?.entities[0]?.transform.rotation).toEqual({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
    });
  });

  it("keeps every evidence category distinct at the canonical boundary", () => {
    const result = parseProject(structuredClone(minimalProject));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(result.value.claims.map((claim) => claim.category)).toEqual([
      "OBSERVED",
      "MEASURED",
      "USER_ENTERED",
      "INFERRED",
      "SIMULATED",
      "ASSUMED",
      "PREDICTED",
      "RECOMMENDED",
    ]);
  });

  it("normalizes output IDs, SI units, and transforms through Task 3 constructors", () => {
    const input = structuredClone(minimalProject);
    setAtPath(
      input,
      ["rooms", 0, "entities", 0, "transform", "position", "x"],
      -0,
    );
    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(result.value.projectId).toBe("project-synthetic-001");
    expect(
      Object.is(result.value.rooms[0]?.entities[0]?.transform.position.x, -0),
    ).toBe(false);
    expect(result.value.claims[0]?.quantity.unit).toBe("m");
  });

  it.each(["\u0000", "\u0085"])(
    "rejects C0/C1 bounded text controls without leaking them",
    (control) => {
      const input = structuredClone(minimalProject);
      const privateText = `  ${control}DO_NOT_LEAK_TEXT`;
      setAtPath(input, ["name"], privateText);

      const error = invalidResult(input);

      expect(JSON.stringify(error)).not.toContain(privateText);
      expect(error.message).not.toContain(privateText);
    },
  );

  it("rejects whitespace-only bounded text and non-portable identifiers", () => {
    const whitespace = structuredClone(minimalProject);
    setAtPath(whitespace, ["rooms", 0, "label"], "\t \n");
    expect(invalidResult(whitespace).code).toBe("INVALID_PROJECT");

    const identifier = structuredClone(minimalProject);
    setAtPath(identifier, ["projectId"], "not portable\u0000");
    expect(invalidResult(identifier).code).toBe("INVALID_PROJECT");
  });

  it("preserves source-unit precision and calibration provenance", () => {
    const input = structuredClone(minimalProject);
    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected synthetic fixture to parse");
    }
    expect(result.value.claims[0]?.quantity.source).toEqual({
      value: 2.4,
      unit: "m",
      precision: 0.01,
      calibrationEvidenceId: null,
    });
  });

  it("uses Task 3 foot conversion provenance and verifies the canonical value", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 0, "quantity", "value"], 3.048);
    setAtPath(input, ["claims", 0, "quantity", "source"], {
      value: 10,
      unit: "ft",
      precision: 0.125,
      calibrationEvidenceId: "evidence-synthetic-001",
    });

    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected converted claim to parse");
    }
    expect(result.value.claims[0]?.quantity).toMatchObject({
      kind: "LENGTH",
      value: 3.048,
      unit: "m",
      source: {
        value: 10,
        unit: "ft",
        precision: 0.125,
        calibrationEvidenceId: "evidence-synthetic-001",
      },
    });
  });

  it("rejects a negative physical length with provenance failure", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 0, "quantity", "value"], -1);

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_QUANTITY_PROVENANCE");
    expect(error.path).toEqual(["claims", 0, "quantity"]);
  });

  it("canonicalizes accepted negative zero values across scalar boundaries", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 0, "confidence"], -0);
    setAtPath(input, ["claims", 0, "quantity", "value"], -0);
    setAtPath(input, ["claims", 0, "quantity", "source"], {
      value: -0,
      unit: "m",
      precision: -0,
      calibrationEvidenceId: null,
    });
    setAtPath(input, ["claims", 1, "uncertainty", "lower"], -0);
    setAtPath(input, ["claims", 3, "uncertainty", "value"], -0);
    setAtPath(
      input,
      ["rooms", 0, "entities", 0],
      occupantEntity({ schedule: { startSecond: -0, endSecond: 3600 } }),
    );

    const result = parseProject(input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected negative zero values to canonicalize");
    }
    expect(Object.is(result.value.claims[0]?.confidence, -0)).toBe(false);
    const quantity = result.value.claims[0]?.quantity;
    expect(quantity).toMatchObject({
      value: 0,
      source: { value: 0, precision: 0 },
    });
    if (quantity !== undefined) {
      expect(Object.is(quantity.value, -0)).toBe(false);
      expect(Object.is(quantity.source.value, -0)).toBe(false);
      expect(Object.is(quantity.source.precision, -0)).toBe(false);
    }
    const uncertainty = result.value.claims[1]?.uncertainty;
    expect(uncertainty).toMatchObject({ kind: "interval", lower: 0 });
    if (uncertainty?.kind === "interval") {
      expect(Object.is(uncertainty.lower, -0)).toBe(false);
    }
    const standardDeviation = result.value.claims[3]?.uncertainty;
    expect(standardDeviation).toMatchObject({
      kind: "standard-deviation",
      value: 0,
    });
    if (standardDeviation?.kind === "standard-deviation") {
      expect(Object.is(standardDeviation.value, -0)).toBe(false);
    }
    const entity = result.value.rooms[0]?.entities[0];
    if (entity?.type === "OCCUPANT") {
      expect(Object.is(entity.schedule.startSecond, -0)).toBe(false);
    } else {
      throw new Error("Expected occupant entity to parse");
    }
  });

  it("rejects an unknown schema version with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["schemaVersion"], "future-project-v2");

    const error = invalidResult(input);

    expect(error.code).toBe("UNKNOWN_SCHEMA_VERSION");
    expect(error.path).toEqual(["schemaVersion"]);
  });

  it("rejects a non-positive room height with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["rooms", 0, "heightMetres"], 0);

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_ROOM_HEIGHT");
    expect(error.path).toEqual(["rooms", 0, "heightMetres"]);
  });

  it("rejects a zero quaternion with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["rooms", 0, "entities", 0, "transform", "rotation"], {
      x: 0,
      y: 0,
      z: 0,
      w: 0,
    });

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_QUATERNION");
    expect(error.path).toEqual([
      "rooms",
      0,
      "entities",
      0,
      "transform",
      "rotation",
    ]);
  });

  it.each([-0.01, 1.01])(
    "rejects out-of-range claim confidence %s with a stable code",
    (confidence) => {
      const input = structuredClone(minimalProject);
      setAtPath(input, ["claims", 0, "confidence"], confidence);

      const error = invalidResult(input);

      expect(error.code).toBe("INVALID_CLAIM_CONFIDENCE");
      expect(error.path).toEqual(["claims", 0, "confidence"]);
    },
  );

  it("rejects a recommendation without its recommendation derivation", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 7, "derivation"], null);

    const error = invalidResult(input);

    expect(error.code).toBe("MISSING_RECOMMENDATION_DERIVATION");
    expect(error.path).toEqual(["claims", 7, "derivation"]);
  });

  it("maps an omitted recommendation derivation to the required stable code", () => {
    const input = structuredClone(minimalProject);
    deleteAtPath(input, ["claims", 7, "derivation"]);

    const error = invalidResult(input);

    expect(error.code).toBe("MISSING_RECOMMENDATION_DERIVATION");
    expect(error.path).toEqual(["claims", 7, "derivation"]);
  });

  it("rejects a recommendation derivation on another evidence category", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["claims", 0, "derivation"], {
      kind: "RECOMMENDATION",
      runId: "run-synthetic-001",
      modelVersion: "synthetic-zone-model-v1",
      method: "deterministic-synthetic-search",
    });

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_CLAIM_DERIVATION");
    expect(error.path).toEqual(["claims", 0, "derivation"]);
  });

  it("rejects an on-device evidence record without checksum and byte length", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["evidence", 0, "availability"], { state: "ON_DEVICE" });

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_EVIDENCE_AVAILABILITY");
    expect(error.path).toEqual(["evidence", 0, "availability"]);
  });

  it.each(["MISSING", "CORRUPT"] as const)(
    "rejects %s evidence without a revisioned availability reason",
    (state) => {
      const input = structuredClone(minimalProject);
      setAtPath(input, ["evidence", 0, "availability"], { state });

      const error = invalidResult(input);

      expect(error.code).toBe("INVALID_EVIDENCE_AVAILABILITY");
      expect(error.path).toEqual(["evidence", 0, "availability"]);
    },
  );

  it.each(["identity", "healthStatus", "diagnosis"] as const)(
    "rejects an occupant %s attribute without exposing its value",
    (forbiddenKey) => {
      const input = structuredClone(minimalProject);
      setAtPath(
        input,
        ["rooms", 0, "entities", 0],
        occupantEntity({ [forbiddenKey]: "DO_NOT_LEAK_SENTINEL" }),
      );

      const error = invalidResult(input);

      expect(error.code).toBe("FORBIDDEN_OCCUPANT_ATTRIBUTE");
      expect(error.path).toEqual(["rooms", 0, "entities", 0]);
      expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_SENTINEL");
      expect(JSON.stringify(error)).not.toContain(forbiddenKey);
    },
  );

  it.each(["GENERIC", "DEVICE"] as const)(
    "keeps %s entity identity keys in the generic unknown-field boundary",
    (type) => {
      const input = structuredClone(minimalProject);
      if (type === "DEVICE") {
        setAtPath(input, ["rooms", 0, "entities", 0], {
          ...structuredClone(minimalProject.rooms[0].entities[0]),
          type,
          deviceKind: "FAN",
          operatingState: "OFF",
          identity: "DO_NOT_LEAK_SENTINEL",
        });
      } else {
        setAtPath(
          input,
          ["rooms", 0, "entities", 0, "identity"],
          "DO_NOT_LEAK_SENTINEL",
        );
      }

      const error = invalidResult(input);

      expect(error.code).toBe("UNKNOWN_FIELD");
      expect(error.path).toEqual(["rooms", 0, "entities", 0, "$unknown"]);
      expect(JSON.stringify(error)).not.toContain("identity");
      expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_SENTINEL");
    },
  );

  it("rejects non-finite transform coordinates with a stable code and path", () => {
    const input = structuredClone(minimalProject);
    setAtPath(
      input,
      ["rooms", 0, "entities", 0, "transform", "position", "x"],
      Number.POSITIVE_INFINITY,
    );

    const error = invalidResult(input);

    expect(error.code).toBe("INVALID_TRANSFORM");
    expect(error.path).toEqual([
      "rooms",
      0,
      "entities",
      0,
      "transform",
      "position",
      "x",
    ]);
  });

  it.each([
    {
      mutate: (input: object) => {
        setAtPath(input, ["private-looking-key"], "DO_NOT_LEAK_SENTINEL");
      },
      path: ["$unknown"],
    },
    {
      mutate: (input: object) => {
        setAtPath(
          input,
          ["rooms", 0, "boundary", "private-looking-key"],
          "DO_NOT_LEAK_SENTINEL",
        );
      },
      path: ["rooms", 0, "boundary", "$unknown"],
    },
  ])("rejects unknown fields at $path", ({ mutate, path }) => {
    const input = structuredClone(minimalProject);
    mutate(input);

    const error = invalidResult(input);

    expect(error.code).toBe("UNKNOWN_FIELD");
    expect(error.path).toEqual(path);
    expect(JSON.stringify(error)).not.toContain("private-looking-key");
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_SENTINEL");
  });

  it("rejects raw evidence content and does not leak serialized input", () => {
    const input = structuredClone(minimalProject);
    setAtPath(input, ["evidence", 0, "content"], "DO_NOT_LEAK_SENTINEL");

    const error = invalidResult(input);

    expect(error.code).toBe("UNKNOWN_FIELD");
    expect(error.path).toEqual(["evidence", 0, "$unknown"]);
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK_SENTINEL");
    expect(JSON.stringify(error)).not.toContain(
      '"content":"DO_NOT_LEAK_SENTINEL"',
    );
  });
});
