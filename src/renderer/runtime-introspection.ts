export interface RuntimeScopeEntry {
  name: string;
  value: unknown;
}

function stripAnsi(input: string): string {
  const escape = String.fromCharCode(27);
  return input.replace(new RegExp(`${escape}\\[[0-9;]*m`, "g"), "");
}

function truncate(input: string, maxLength: number): string {
  return input.length > maxLength ? `${input.slice(0, maxLength - 1)}…` : input;
}

export function getCallablePropertyNames(obj: object): string[] {
  const names = new Set<string>();
  let current: object | null = obj;

  while (current !== null && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor && typeof descriptor.value === "function") {
        names.add(name);
      }
    }
    current = Object.getPrototypeOf(current);
  }

  return [...names];
}

export function getRuntimeTypeLabel(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "Array";

  const valueType = typeof value;
  if (valueType !== "object" && valueType !== "function") {
    return valueType;
  }

  const constructorName =
    "constructor" in Object(value) &&
    typeof (value as { constructor?: { name?: unknown } }).constructor?.name === "string"
      ? (value as { constructor: { name: string } }).constructor.name
      : "";

  if (constructorName && constructorName !== "Object" && constructorName !== "Function") {
    return constructorName;
  }

  if (valueType === "function") {
    return "function";
  }

  if ("then" in (value as object) && typeof (value as { then?: unknown }).then === "function") {
    return "PromiseLike";
  }

  return "object";
}

export function getRuntimePreview(value: unknown, maxLength = 72): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const valueType = typeof value;
  if (valueType === "string") {
    return truncate(JSON.stringify(value), maxLength);
  }
  if (
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "bigint" ||
    valueType === "symbol"
  ) {
    return truncate(String(value), maxLength);
  }
  if (valueType === "function") {
    const name = (value as { name?: string }).name;
    return name ? `[Function ${name}]` : "[Function]";
  }
  if (Array.isArray(value)) {
    return truncate(`Array(${value.length})`, maxLength);
  }

  const rendered = stripAnsi(String(value)).trim();
  if (rendered && rendered !== "[object Object]") {
    return truncate(rendered.split("\n")[0], maxLength);
  }

  const typeLabel = getRuntimeTypeLabel(value);
  return truncate(typeLabel === "object" ? "{…}" : typeLabel, maxLength);
}
