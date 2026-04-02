import { BounceResult } from "./results/base.js";

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
