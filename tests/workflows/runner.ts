/**
 * Workflow runner.
 *
 * A Workflow is a DAG of Actions (produce output) and Checks (assert on
 * output). The runner topologically sorts nodes, executes them in dependency
 * order, accumulates outputs into a shared context, and reports results.
 *
 * If an Action fails, all downstream nodes (anything with it in their `after`
 * chain) are skipped rather than erroring out.
 */

export interface WorkflowNode {
  kind: "action" | "check";
  name: string;
  fn: (ctx: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
  after: string[];
}

export interface Workflow {
  name: string;
  nodes: WorkflowNode[];
}

export interface TestResult {
  name: string;
  kind: "action" | "check";
  status: "pass" | "fail" | "skip";
  error?: unknown;
  durationMs: number;
}

/**
 * Execute all nodes in the workflow, starting from `initialCtx`.
 * Action outputs are merged into the context for downstream nodes.
 */
export async function run(
  workflow: Workflow,
  initialCtx: Record<string, unknown>,
): Promise<TestResult[]> {
  const ctx: Record<string, unknown> = { ...initialCtx };
  const results: TestResult[] = [];
  const failed = new Set<string>();

  const sorted = topoSort(workflow.nodes);

  for (const node of sorted) {
    // Skip this node if any dependency failed or was skipped.
    const blocked = node.after.some((dep) => failed.has(dep));
    if (blocked) {
      results.push({ name: node.name, kind: node.kind, status: "skip", durationMs: 0 });
      failed.add(node.name);
      continue;
    }

    const start = Date.now();
    try {
      const output = await node.fn(ctx);
      // Merge action output into shared context.
      if (output !== null && output !== undefined && typeof output === "object") {
        Object.assign(ctx, output);
      }
      results.push({
        name: node.name,
        kind: node.kind,
        status: "pass",
        durationMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        name: node.name,
        kind: node.kind,
        status: "fail",
        error,
        durationMs: Date.now() - start,
      });
      failed.add(node.name);
    }
  }

  return results;
}

/**
 * Topological sort using Kahn's algorithm.
 * Nodes with no dependencies come first.
 * Throws if the graph contains a cycle.
 */
function topoSort(nodes: WorkflowNode[]): WorkflowNode[] {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const inDegree = new Map<string, number>(nodes.map((n) => [n.name, 0]));

  // Build adjacency: dep → [nodes that depend on dep]
  const adj = new Map<string, string[]>(nodes.map((n) => [n.name, []]));
  for (const node of nodes) {
    for (const dep of node.after) {
      if (!byName.has(dep)) {
        throw new Error(
          `Workflow node "${node.name}" depends on unknown node "${dep}"`,
        );
      }
      adj.get(dep)!.push(node.name);
      inDegree.set(node.name, (inDegree.get(node.name) ?? 0) + 1);
    }
  }

  const queue = nodes.filter((n) => inDegree.get(n.name) === 0).map((n) => n.name);
  const sorted: WorkflowNode[] = [];

  while (queue.length > 0) {
    const name = queue.shift()!;
    sorted.push(byName.get(name)!);
    for (const dependent of adj.get(name) ?? []) {
      const deg = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error("Cycle detected in workflow dependency graph");
  }

  return sorted;
}

/** Pretty-print results to console. Returns true if all checks passed. */
export function printResults(workflowName: string, results: TestResult[]): boolean {
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\n  ${workflowName}`);

  let allPassed = true;
  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "–";
    const label = r.kind === "check" ? "check" : "action";
    const time = `${r.durationMs}ms`;
    console.log(`    ${icon} [${pad(label, 6)}] ${pad(r.name, 40)} ${time}`);
    if (r.status === "fail" && r.error != null) {
      const msg = r.error instanceof Error ? r.error.message : String(r.error);
      // Indent each line of the error message.
      for (const line of msg.split("\n")) {
        console.log(`         ${line}`);
      }
      allPassed = false;
    }
  }

  const checks = results.filter((r) => r.kind === "check");
  const passed = checks.filter((r) => r.status === "pass").length;
  const failed = checks.filter((r) => r.status === "fail").length;
  const skipped = checks.filter((r) => r.status === "skip").length;
  console.log(`\n    ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

  return allPassed;
}
