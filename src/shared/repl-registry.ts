import { registerNamespace, registerType } from "./repl-registration.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Visibility = "porcelain" | "plumbing";

/**
 * How the REPL Intelligence Layer should complete a parameter.
 * "plain" is the default — no special completion.
 */
export type ParamKind = "filePath" | "sampleHash" | "typed" | "options" | "plain";

export interface ParamDescriptor {
  name: string;
  summary: string;
  kind: ParamKind;
  /** For kind "typed" — the expected type name to match against session variables. */
  expectedType?: string;
}

export interface MethodDescriptor {
  summary: string;
  visibility: Visibility;
  returns?: string;
  params: ParamDescriptor[];
}

export interface NamespaceDescriptor {
  name: string;
  summary: string;
  visibility: Visibility;
  methods: Record<string, MethodDescriptor>;
}

export interface TypeDescriptor {
  name: string;
  summary: string;
  /** Optional {{propertyName}} template for terminal display. */
  terminalSummary?: string;
  /**
   * Optional conventional REPL variable name for this type (e.g. "sample" for SampleResult).
   * Used by the help renderer to prefix method signatures with the instance name.
   */
  instanceName?: string;
  methods: Record<string, MethodDescriptor>;
}

/**
 * Automatically implemented by every @namespace and @replType decorated class
 * via decorator injection. Do not implement manually.
 */
export interface Describable {
  /** Print help for this namespace or type to the REPL output. */
  help(): unknown;
}

// ── Pluggable help renderer ───────────────────────────────────────────────────

/**
 * Default renderer — used when running outside the renderer process or before
 * setHelpRenderer() is called. Returns a plain string.
 */
let _helpRenderer: (descriptor: NamespaceDescriptor | TypeDescriptor) => unknown = (d) =>
  `${d.name}: ${d.summary}`;

/**
 * Override the help renderer. Called from src/renderer/ to plug in BounceResult
 * rendering. Must be called before any namespace or type is constructed.
 */
export function setHelpRenderer(
  fn: (descriptor: NamespaceDescriptor | TypeDescriptor) => unknown,
): void {
  _helpRenderer = fn;
}

// ── Internal metadata storage (WeakMap keyed by class prototype) ──────────────

interface RawMethodMeta {
  summary: string;
  visibility: Visibility;
  returns?: string;
}

const methodMeta = new WeakMap<object, Map<string, RawMethodMeta>>();
const paramMeta = new WeakMap<object, Map<string, ParamDescriptor[]>>();

function getOrCreate<V>(wmap: WeakMap<object, Map<string, V>>, key: object): Map<string, V> {
  let m = wmap.get(key);
  if (!m) {
    m = new Map<string, V>();
    wmap.set(key, m);
  }
  return m;
}

// ── Decorators ────────────────────────────────────────────────────────────────

/**
 * Describes a method — required on every public method of @namespace and
 * @replType decorated classes. Build-time validation enforces this.
 */
export function describe(meta: {
  summary: string;
  visibility?: Visibility;
  returns?: string;
}): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const key = String(propertyKey);
    const map = getOrCreate(methodMeta, target);
    const existing = map.get(key) ?? { summary: "", visibility: "porcelain" as Visibility };
    map.set(key, {
      ...existing,
      summary: meta.summary,
      visibility: meta.visibility ?? "porcelain",
      returns: meta.returns,
    });
  };
}

/**
 * Describes a parameter — stackable, one per parameter.
 *
 * Decorators run bottom-up (closest to method runs first). This implementation
 * PREPENDs each entry so the final list matches declaration order.
 *
 * Example:
 *   @param("a", { ... })   // runs second → prepend → [a, b]
 *   @param("b", { ... })   // runs first  → prepend → [b]
 *   method(a, b) {}
 */
export function param(
  name: string,
  meta: {
    summary: string;
    kind?: ParamKind;
    expectedType?: string;
  },
): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const key = String(propertyKey);
    const map = getOrCreate(paramMeta, target);
    const existing = map.get(key) ?? [];
    map.set(key, [
      { name, summary: meta.summary, kind: meta.kind ?? "plain", expectedType: meta.expectedType },
      ...existing,
    ]);
  };
}

/**
 * Directly registers method metadata on a class prototype without using decorators.
 * Use this when the method cannot be decorated (e.g. it's an instance field rather than
 * a prototype method). Must be called before the @replType class decorator runs so that
 * collectMethods() can pick it up.
 */
export function registerMethod(
  proto: object,
  methodName: string,
  meta: { summary: string; visibility?: Visibility; returns?: string },
  params?: Array<{ name: string; summary: string; kind?: ParamKind; expectedType?: string }>,
): void {
  const mMap = getOrCreate(methodMeta, proto);
  const existing = mMap.get(methodName) ?? { summary: "", visibility: "porcelain" as Visibility };
  mMap.set(methodName, {
    ...existing,
    summary: meta.summary,
    visibility: meta.visibility ?? "porcelain",
    returns: meta.returns,
  });
  if (params?.length) {
    const pMap = getOrCreate(paramMeta, proto);
    pMap.set(methodName, params.map((p) => ({
      name: p.name,
      summary: p.summary,
      kind: p.kind ?? "plain",
      expectedType: p.expectedType,
    })));
  }
}

/**
 * Registers a REPL namespace (e.g. sn, fs, vis).
 * Automatically injects a help() method onto the class prototype.
 */
export function namespace(
  name: string,
  meta: { summary: string; visibility?: Visibility },
): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return (target: Function) => {
    const proto = target.prototype as object;
    const descriptor = buildNamespaceDescriptor(name, meta, proto);
    injectHelp(proto, descriptor);
    registerNamespace(descriptor);
  };
}

/**
 * Registers a porcelain result type (e.g. Sample, SliceFeature).
 * Automatically injects a help() method onto the class prototype.
 */
export function replType(
  name: string,
  meta: { summary: string; terminalSummary?: string; instanceName?: string },
): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return (target: Function) => {
    const proto = target.prototype as object;
    const descriptor = buildTypeDescriptor(name, meta, proto);
    injectHelp(proto, descriptor);
    registerType(descriptor);
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function injectHelp(proto: object, descriptor: NamespaceDescriptor | TypeDescriptor): void {
  const isNamespace = "visibility" in descriptor;
  if (!isNamespace) {
    // For @replType: preserve a real custom help() already defined in the class body.
    if (Object.prototype.hasOwnProperty.call(proto, "help")) return;
    // Skip types with no registered methods — let HelpableResult.prototype.help
    // use the helpFactory passed at construction time (e.g. InstrumentResult).
    if (Object.keys(descriptor.methods).length === 0) return;
  }
  (proto as Record<string, unknown>).help = function () {
    return _helpRenderer(descriptor);
  };
}

function collectMethods(proto: object): Record<string, MethodDescriptor> {
  const methods: Record<string, MethodDescriptor> = {};
  const mMap = methodMeta.get(proto);
  const pMap = paramMeta.get(proto);
  if (mMap) {
    for (const [methodName, raw] of mMap) {
      methods[methodName] = {
        summary: raw.summary,
        visibility: raw.visibility,
        returns: raw.returns,
        params: pMap?.get(methodName) ?? [],
      };
    }
  }
  return methods;
}

function buildNamespaceDescriptor(
  name: string,
  meta: { summary: string; visibility?: Visibility },
  proto: object,
): NamespaceDescriptor {
  return {
    name,
    summary: meta.summary,
    visibility: meta.visibility ?? "porcelain",
    methods: collectMethods(proto),
  };
}

function buildTypeDescriptor(
  name: string,
  meta: { summary: string; terminalSummary?: string; instanceName?: string },
  proto: object,
): TypeDescriptor {
  return {
    name,
    summary: meta.summary,
    terminalSummary: meta.terminalSummary,
    instanceName: meta.instanceName,
    methods: collectMethods(proto),
  };
}
