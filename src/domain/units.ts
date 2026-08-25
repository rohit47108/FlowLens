declare const unitBrand: unique symbol;
const costBrand: unique symbol = Symbol("cost");

type BrandedNumber<Name extends string> = number & {
  readonly [unitBrand]: Name;
};

export type Metres = BrandedNumber<"metres">;
export type SquareMetres = BrandedNumber<"square-metres">;
export type CubicMetres = BrandedNumber<"cubic-metres">;
export type Seconds = BrandedNumber<"seconds">;
export type Degrees = BrandedNumber<"degrees">;
export type CubicMetresPerSecond = BrandedNumber<"cubic-metres-per-second">;
export type Cadr = BrandedNumber<"clean-air-delivery-rate">;
export type SourceRate = BrandedNumber<"source-rate">;
export type ConcentrationBasis = BrandedNumber<"concentration-basis">;
export type Threshold = BrandedNumber<"threshold">;
export type ExposureProxy = BrandedNumber<"exposure-proxy">;
export type Schedule = BrandedNumber<"schedule">;
export type Energy = BrandedNumber<"joules">;
export type Noise = BrandedNumber<"decibels">;
export type CurrencyCode = string & {
  readonly [unitBrand]: "currency-code";
};

export type Cost = Readonly<{
  amount: number;
  currency: CurrencyCode;
  readonly [costBrand]: "cost";
}>;

export type NoUncertainty = Readonly<{ kind: "none" }>;
export type StandardDeviationUncertainty = Readonly<{
  kind: "standard-deviation";
  value: number;
}>;
export type IntervalUncertainty = Readonly<{
  kind: "interval";
  lower: number;
  upper: number;
}>;
export type SupportedUncertainty =
  NoUncertainty | StandardDeviationUncertainty | IntervalUncertainty;

export type BoundaryConversion<T> = Readonly<{
  canonical: T;
  source: Readonly<{
    value: number;
    unit: "ft";
    precision: number;
  }>;
}>;

function finite<Name extends string>(
  value: number,
  label: string,
): BrandedNumber<Name> {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }

  return (value === 0 ? 0 : value) as BrandedNumber<Name>;
}

function nonNegative<Name extends string>(
  value: number,
  label: string,
): BrandedNumber<Name> {
  const normalized = finite<Name>(value, label);
  if (normalized < 0) {
    throw new Error(`${label} must be non-negative`);
  }

  return normalized;
}

function positive<Name extends string>(
  value: number,
  label: string,
): BrandedNumber<Name> {
  const normalized = finite<Name>(value, label);
  if (normalized <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }

  return normalized;
}

export function metres(value: number): Metres {
  return finite<"metres">(value, "metres");
}

export function squareMetres(value: number): SquareMetres {
  return nonNegative<"square-metres">(value, "area");
}

export function cubicMetres(value: number): CubicMetres {
  return positive<"cubic-metres">(value, "volume");
}

export function timeSeconds(value: number): Seconds {
  return positive<"seconds">(value, "time");
}

export function degrees(value: number): Degrees {
  return finite<"degrees">(value, "angle");
}

export function cubicMetresPerSecond(value: number): CubicMetresPerSecond {
  return nonNegative<"cubic-metres-per-second">(value, "volumetric flow");
}

export function cadr(value: number): Cadr {
  return nonNegative<"clean-air-delivery-rate">(value, "CADR");
}

export function sourceRate(value: number): SourceRate {
  return nonNegative<"source-rate">(value, "source rate");
}

export function concentrationBasis(value: number): ConcentrationBasis {
  return nonNegative<"concentration-basis">(value, "concentration basis");
}

export function threshold(value: number): Threshold {
  return nonNegative<"threshold">(value, "threshold");
}

export function exposureProxy(value: number): ExposureProxy {
  return nonNegative<"exposure-proxy">(value, "exposure proxy");
}

export function schedule(value: number): Schedule {
  return nonNegative<"schedule">(value, "schedule");
}

export function energy(value: number): Energy {
  return nonNegative<"joules">(value, "energy");
}

export function noise(value: number): Noise {
  return nonNegative<"decibels">(value, "noise");
}

export function currencyCode(value: string): CurrencyCode {
  if (value.length === 0) {
    throw new Error("currency must be a non-empty string");
  }

  return value as CurrencyCode;
}

export function cost(amount: number, currency: string): Cost {
  return {
    amount: nonNegative<"cost-amount">(amount, "cost"),
    currency: currencyCode(currency),
    [costBrand]: "cost",
  };
}

export function supportedUncertainty(value: unknown): SupportedUncertainty {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    throw new Error("uncertainty must be a supported variant");
  }

  if (value.kind === "none") {
    return { kind: "none" };
  }
  if (value.kind === "standard-deviation" && "value" in value) {
    return {
      kind: "standard-deviation",
      value: nonNegative(
        typeof value.value === "number" ? value.value : Number.NaN,
        "uncertainty standard deviation",
      ),
    };
  }
  if (value.kind === "interval" && "lower" in value && "upper" in value) {
    const lower = finite(
      typeof value.lower === "number" ? value.lower : Number.NaN,
      "uncertainty interval lower bound",
    );
    const upper = finite(
      typeof value.upper === "number" ? value.upper : Number.NaN,
      "uncertainty interval upper bound",
    );
    if (lower > upper) {
      throw new Error(
        "uncertainty interval lower bound must not exceed upper bound",
      );
    }

    return { kind: "interval", lower, upper };
  }

  throw new Error("uncertainty must be a supported variant");
}

function feetToMetresValue(feet: number): Metres {
  return metres(finite(feet, "feet") * 0.3048);
}

function feetToMetresWithProvenance(
  feet: number,
  precision: number,
): BoundaryConversion<Metres> {
  return {
    canonical: feetToMetresValue(feet),
    source: {
      value: finite(feet, "feet"),
      unit: "ft",
      precision: nonNegative(precision, "source precision"),
    },
  };
}

export const feetToMetres = Object.assign(feetToMetresValue, {
  withProvenance: feetToMetresWithProvenance,
});

export function metresToFeet(value: Metres): number {
  return value / 0.3048;
}
