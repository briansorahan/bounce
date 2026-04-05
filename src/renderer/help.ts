import { BounceResult } from "./results/base.js";
import type { NamespaceDescriptor, TypeDescriptor, MethodDescriptor, ParamDescriptor } from "../shared/repl-registry.js";
import { getType, getNamespace, getDevMode } from "../shared/repl-registration.js";

export interface OptsPropertyHelp {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
}

export interface CommandHelp {
  name: string;
  signature: string;
  summary: string;
  description?: string;
  params?: Array<{
    name: string;
    type: string;
    description: string;
    optional?: boolean;
    properties?: OptsPropertyHelp[];
  }>;
  returns?: string;
  examples?: string[];
}

export function renderNamespaceHelp(
  nsName: string,
  nsDescription: string,
  commands: CommandHelp[],
): BounceResult {
  const maxSig = commands.reduce(
    (max, cmd) => Math.max(max, cmd.signature.length),
    0,
  );

  const lines: string[] = [
    `\x1b[1;36m${nsName}\x1b[0m — ${nsDescription}`,
    "",
  ];

  for (const cmd of commands) {
    const pad = " ".repeat(Math.max(1, maxSig - cmd.signature.length + 2));
    lines.push(
      `  \x1b[33m${cmd.signature}\x1b[0m${pad}${cmd.summary}`,
    );
  }



  return new BounceResult(lines.join("\n"));
}

export function renderCommandHelp(cmd: CommandHelp): BounceResult {
  const descText = cmd.description ?? cmd.summary;
  const lines: string[] = [
    `\x1b[1;36m${cmd.signature}\x1b[0m`,
    "",
  ];
  for (const dLine of descText.split("\n")) {
    lines.push(dLine ? `  ${dLine}` : "");
  }

  if (cmd.params?.length) {
    lines.push("");
    const maxName = cmd.params.reduce(
      (max, p) => Math.max(max, p.name.length),
      0,
    );
    for (const p of cmd.params) {
      const pad = " ".repeat(Math.max(1, maxName - p.name.length + 2));
      const opt = p.optional ? " (optional)" : "";
      lines.push(`  \x1b[33m${p.name}\x1b[0m${pad}${p.description}${opt}`);
      if (p.properties?.length) {
        const maxProp = p.properties.reduce(
          (max, pp) => Math.max(max, pp.name.length),
          0,
        );
        for (const pp of p.properties) {
          const ppPad = " ".repeat(Math.max(1, maxProp - pp.name.length + 2));
          const ppOpt = pp.optional !== false ? "" : " (required)";
          lines.push(
            `    \x1b[32m${pp.name}\x1b[0m${ppPad}\x1b[90m${pp.type}\x1b[0m  ${pp.description}${ppOpt}`,
          );
        }
      }
    }
  }

  if (cmd.returns) {
    lines.push("");
    lines.push(`  \x1b[90mReturns:\x1b[0m \x1b[33m${cmd.returns}\x1b[0m`);
  }

  if (cmd.examples?.length) {
    lines.push("");
    lines.push("  \x1b[90mExamples:\x1b[0m");
    for (const ex of cmd.examples) {
      for (const eLine of ex.split("\n")) {
        lines.push(eLine ? `    ${eLine}` : "");
      }
    }
  }

  return new BounceResult(lines.join("\n"));
}

export interface TypePropertyHelp {
  name: string;
  type: string;
  description: string;
  readonly?: boolean;
}

export interface TypeMethodHelp {
  name?: string;
  signature: string;
  summary: string;
  params?: Array<{
    name: string;
    type: string;
    description: string;
    optional?: boolean;
    properties?: OptsPropertyHelp[];
  }>;
  returns?: string;
}

export interface TypeHelp {
  name: string;
  summary: string;
  description?: string;
  properties?: TypePropertyHelp[];
  methods?: TypeMethodHelp[];
}

export function renderTypeHelp(typeHelp: TypeHelp): BounceResult {
  const lines: string[] = [
    `\x1b[1;36m${typeHelp.name}\x1b[0m — ${typeHelp.summary}`,
  ];

  if (typeHelp.description) {
    lines.push("");
    for (const dLine of typeHelp.description.split("\n")) {
      lines.push(dLine ? `  ${dLine}` : "");
    }
  }

  if (typeHelp.properties?.length) {
    lines.push("");
    lines.push("  \x1b[90mProperties:\x1b[0m");
    const maxName = typeHelp.properties.reduce(
      (max, p) => Math.max(max, p.name.length),
      0,
    );
    for (const p of typeHelp.properties) {
      const pad = " ".repeat(Math.max(1, maxName - p.name.length + 2));
      const ro = p.readonly ? " \x1b[90m(readonly)\x1b[0m" : "";
      lines.push(
        `    \x1b[32m${p.name}\x1b[0m${pad}\x1b[90m${p.type}\x1b[0m  ${p.description}${ro}`,
      );
    }
  }

  if (typeHelp.methods?.length) {
    lines.push("");
    lines.push("  \x1b[90mMethods:\x1b[0m");
    const maxSig = typeHelp.methods.reduce(
      (max, m) => Math.max(max, m.signature.length),
      0,
    );
    for (const m of typeHelp.methods) {
      const pad = " ".repeat(Math.max(1, maxSig - m.signature.length + 2));
      lines.push(`    \x1b[33m${m.signature}\x1b[0m${pad}${m.summary}`);
    }
  }

  lines.push("");
  return new BounceResult(lines.join("\n"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withHelp<F extends (...args: any[]) => any>(
  fn: F,
  meta: CommandHelp,
): F & { help: () => BounceResult } {
  return Object.assign(fn, { help: () => renderCommandHelp(meta) });
}

export function renderMethodHelp(
  typeName: string,
  method: TypeMethodHelp,
): BounceResult {
  const lines: string[] = [
    `\x1b[1;36m${typeName}.${method.signature}\x1b[0m`,
    "",
    `  ${method.summary}`,
  ];

  if (method.params?.length) {
    lines.push("");
    const maxName = method.params.reduce(
      (max, p) => Math.max(max, p.name.length),
      0,
    );
    for (const p of method.params) {
      const pad = " ".repeat(Math.max(1, maxName - p.name.length + 2));
      const opt = p.optional !== false ? " (optional)" : "";
      lines.push(`  \x1b[33m${p.name}\x1b[0m${pad}${p.description}${opt}`);
      if (p.properties?.length) {
        const maxProp = p.properties.reduce(
          (max, pp) => Math.max(max, pp.name.length),
          0,
        );
        for (const pp of p.properties) {
          const ppPad = " ".repeat(Math.max(1, maxProp - pp.name.length + 2));
          const ppOpt = pp.optional !== false ? "" : " (required)";
          lines.push(
            `    \x1b[32m${pp.name}\x1b[0m${ppPad}\x1b[90m${pp.type}\x1b[0m  ${pp.description}${ppOpt}`,
          );
        }
      }
    }
  }

  if (method.returns) {
    lines.push("");
    lines.push(`  \x1b[90mReturns:\x1b[0m \x1b[33m${method.returns}\x1b[0m`);
  }

  return new BounceResult(lines.join("\n"));
}

/**
 * Attach .help() to each documented method on an instance.
 * Skips methods that already have .help() (e.g. manually wrapped ones).
 */
export function attachMethodHelp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  typeName: string,
  methods: TypeMethodHelp[],
): void {
  for (const m of methods) {
    const methodName = m.signature.split("(")[0];
    const original = instance[methodName];
    if (typeof original !== "function") continue;
    if (typeof original.help === "function") continue;
    const bound = original.bind(instance);
    instance[methodName] = Object.assign(bound, {
      help: () => renderMethodHelp(typeName, m),
    });
  }
}

// ── Registry-based rendering ──────────────────────────────────────────────────

function buildMethodSignature(methodName: string, params: ParamDescriptor[]): string {
  if (params.length === 0) return `${methodName}()`;
  return `${methodName}(${params.map((p) => p.name).join(", ")})`;
}

export function renderMethodHelpFromDescriptor(
  typeName: string,
  methodName: string,
  method: MethodDescriptor,
): BounceResult {
  const sig = buildMethodSignature(methodName, method.params);
  const lines: string[] = [
    `\x1b[1;36m${typeName}.${sig}\x1b[0m`,
    "",
    `  ${method.summary}`,
  ];
  if (method.params.length > 0) {
    lines.push("");
    const maxName = method.params.reduce((max, p) => Math.max(max, p.name.length), 0);
    for (const p of method.params) {
      const pad = " ".repeat(Math.max(1, maxName - p.name.length + 2));
      lines.push(`  \x1b[33m${p.name}\x1b[0m${pad}${p.summary}`);
    }
  }
  if (method.returns) {
    lines.push("");
    lines.push(`  \x1b[90mReturns:\x1b[0m \x1b[33m${method.returns}\x1b[0m`);
  }
  return new BounceResult(lines.join("\n"));
}

export function renderDescriptorHelp(
  descriptor: NamespaceDescriptor | TypeDescriptor,
): BounceResult {
  const devMode = getDevMode();
  const isNamespace = "visibility" in descriptor;
  const instanceName = !isNamespace ? (descriptor as TypeDescriptor).instanceName : undefined;
  const visibleEntries = Object.entries(descriptor.methods).filter(
    ([, m]) => devMode || m.visibility !== "plumbing",
  );

  const lines: string[] = [
    `\x1b[1;36m${descriptor.name}\x1b[0m — ${descriptor.summary}`,
  ];

  if (visibleEntries.length > 0) {
    const rawSigs = visibleEntries.map(([name, m]) => buildMethodSignature(name, m.params));
    const sigs = isNamespace
      ? rawSigs.map((s) => `${descriptor.name}.${s}`)
      : instanceName
        ? rawSigs.map((s) => `${instanceName}.${s}`)
        : rawSigs;
    const maxSig = sigs.reduce((max, s) => Math.max(max, s.length), 0);
    lines.push("");
    if (!isNamespace) lines.push("  \x1b[90mMethods:\x1b[0m");
    for (let i = 0; i < visibleEntries.length; i++) {
      const [, m] = visibleEntries[i];
      const sig = sigs[i];
      const pad = " ".repeat(Math.max(1, maxSig - sig.length + 2));
      const indent = isNamespace ? "  " : "    ";
      lines.push(`${indent}\x1b[33m${sig}\x1b[0m${pad}${m.summary}`);
    }

    // For types with an instanceName, add a hint for methods that have options.
    if (!isNamespace && instanceName) {
      const methodsWithParams = visibleEntries.filter(([, m]) => m.params.length > 0);
      if (methodsWithParams.length > 0) {
        const hints = methodsWithParams.map(([name]) => `${instanceName}.${name}.help()`).join(", ");
        lines.push("");
        lines.push(`  \x1b[90mFor option details: ${hints}\x1b[0m`);
      }
    }
  }

  lines.push("");
  return new BounceResult(lines.join("\n"));
}

/**
 * Attach .help() to each porcelain method on an instance using the registry.
 * Skips plumbing methods and methods that already have .help().
 */
export function attachMethodHelpFromRegistry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  typeName: string,
): void {
  const td = getType(typeName);
  if (!td) return;
  for (const [methodName, methodDesc] of Object.entries(td.methods)) {
    if (methodDesc.visibility === "plumbing") continue;
    const original = instance[methodName];
    if (typeof original !== "function") continue;
    if (typeof original.help === "function") continue;
    const bound = original.bind(instance);
    instance[methodName] = Object.assign(bound, {
      help: () => renderMethodHelpFromDescriptor(typeName, methodName, methodDesc),
    });
  }
}

/**
 * Attach .help() to each porcelain method on a namespace instance using the registry.
 * Skips plumbing methods and methods that already have .help().
 */
export function attachNamespaceMethodHelp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  namespaceName: string,
): void {
  const nd = getNamespace(namespaceName);
  if (!nd) return;
  for (const [methodName, methodDesc] of Object.entries(nd.methods)) {
    if (methodDesc.visibility === "plumbing") continue;
    const original = instance[methodName];
    if (typeof original !== "function") continue;
    if (typeof original.help === "function") continue;
    const bound = original.bind(instance);
    instance[methodName] = Object.assign(bound, {
      help: () => renderMethodHelpFromDescriptor(namespaceName, methodName, methodDesc),
    });
  }
}
