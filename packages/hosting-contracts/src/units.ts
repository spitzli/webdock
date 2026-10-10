/** Decimal display units; exact integer storage, including unchanged legacy values. */
const factors: Record<string, bigint> = {
  "": 1n,
  cores: 1000n,
  MB: 1000000n,
  GB: 1000000000n,
  TB: 1000000000000n,
};
export function parseResourceInput(key: string, text: string): number {
  const match = /^(\d+)(?:[.,](\d+))?\s*(cores|MB|GB|TB)?$/.exec(text.trim());
  if (!match || text.length > 80) throw Error("Enter a valid resource amount.");
  const unit = match[3] ?? "";
  if (
    unit &&
    (key === "cpuMillicores"
      ? unit !== "cores"
      : key.endsWith("Bytes")
        ? unit === "cores"
        : true)
  )
    throw Error("Invalid resource unit.");
  const denominator = 10n ** BigInt((match[2] ?? "").length);
  const numerator = BigInt(match[1] + (match[2] ?? "")) * factors[unit];
  if (
    numerator % denominator ||
    numerator / denominator > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw Error("Resource amount has unsupported precision or is too large.");
  return Number(numerator / denominator);
}
function decimal(value: number, factor: bigint): string {
  const n = BigInt(value),
    whole = n / factor,
    fraction = n % factor;
  return (
    String(whole) +
    (fraction
      ? "." +
        String(fraction)
          .padStart(String(factor).length - 1, "0")
          .replace(/0+$/, "")
      : "")
  );
}
export function resourceInput(key: string, value: number): string {
  if (!Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid resource amount.");
  if (key === "cpuMillicores") return decimal(value, 1000n) + " cores";
  if (key.endsWith("Bytes")) {
    const unit = value >= 1e12 ? "TB" : value >= 1e9 ? "GB" : "MB";
    return decimal(value, factors[unit]) + " " + unit;
  }
  return String(value);
}
export function formatResource(
  key: string,
  value: number,
  locale = "en",
): string {
  const input = resourceInput(key, value),
    [number, unit] = input.split(" ");
  return (
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: key.endsWith("Bytes") ? 1 : 3,
    }).format(Number(number)) + (unit && unit !== "cores" ? " " + unit : "")
  );
}
export function resourceInUnit(
  key: string,
  value: number,
  unit: string,
): string {
  parseResourceInput(key, "1 " + unit);
  return decimal(value, factors[unit]);
}
