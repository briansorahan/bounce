import type { WorkflowNode, Workflow } from "./runner";

interface NodeOptions {
  /** Names of nodes whose output must be available before this node runs. */
  after?: string[];
}

/**
 * Fluent builder returned by createWorkflow().
 * Accumulates Action and Check nodes, then builds a Workflow.
 */
export interface WorkflowBuilder {
  /**
   * Register an Action — a step that produces output merged into the shared
   * context. Returns the node name (use as an `after` dependency reference).
   */
  action(
    name: string,
    fn: (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>,
    opts?: NodeOptions,
  ): string;

  /**
   * Register a Check — an assertion on the current context.
   * Checks must not have side effects. Returns the node name.
   */
  check(
    name: string,
    fn: (ctx: Record<string, unknown>) => void | Promise<void>,
    opts?: NodeOptions,
  ): string;

  build(): Workflow;
}

/**
 * Create a typed workflow builder.
 *
 * Usage:
 *   const wf = createWorkflow("my-workflow");
 *   const setup = wf.action("setup", async () => ({ foo: "bar" }));
 *   wf.check("foo-is-bar", (ctx) => assert.equal(ctx.foo, "bar"), { after: [setup] });
 *   export default wf.build();
 */
export function createWorkflow(name: string): WorkflowBuilder {
  const nodes: WorkflowNode[] = [];

  return {
    action(nodeName, fn, opts) {
      nodes.push({
        kind: "action",
        name: nodeName,
        fn,
        after: opts?.after ?? [],
      });
      return nodeName;
    },

    check(nodeName, fn, opts) {
      nodes.push({
        kind: "check",
        name: nodeName,
        fn: async (ctx) => { await fn(ctx); },
        after: opts?.after ?? [],
      });
      return nodeName;
    },

    build() {
      return { name, nodes };
    },
  };
}
