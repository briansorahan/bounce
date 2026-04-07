/**
 * ProcessManagerService — owns the service dependency graph and controls
 * startup / teardown ordering.
 *
 * Services register themselves with a descriptor that declares their name,
 * their dependencies (by name), and start/stop/isReady callbacks.
 * ProcessManagerService topologically sorts the graph so that:
 *   - On startup  : dependencies start before dependents.
 *   - On teardown : dependents stop before dependencies.
 *
 * Future direction: a compile-time code-generation script
 * (scripts/generate-service-graph.ts) will parse each service's TypeScript
 * constructor parameters using the TS compiler API, extract
 * ServiceClient<SomeRpc> dependencies, and emit the registration calls
 * automatically — removing the need for a hand-maintained list.
 */

export interface ServiceDescriptor {
  /** Unique name. Matches the names used in `dependencies`. */
  readonly name: string;
  /**
   * Names of services that must be started before this one.
   * This is the hand-maintained list until compile-time generation is ready.
   */
  readonly dependencies: readonly string[];
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
}

export class ProcessManagerService {
  private descriptors = new Map<string, ServiceDescriptor>();

  register(descriptor: ServiceDescriptor): void {
    this.descriptors.set(descriptor.name, descriptor);
  }

  /**
   * Compute start order via topological sort (Kahn's algorithm).
   * Throws if a cycle is detected in the dependency graph.
   */
  computeStartOrder(): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>(); // name → dependents

    for (const [name] of this.descriptors) {
      inDegree.set(name, 0);
      adj.set(name, []);
    }

    for (const [name, desc] of this.descriptors) {
      for (const dep of desc.dependencies) {
        if (!this.descriptors.has(dep)) {
          throw new Error(`Service "${name}" depends on unknown service "${dep}"`);
        }
        adj.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }

    const queue = [...inDegree.entries()]
      .filter(([, d]) => d === 0)
      .map(([name]) => name);

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const dependent of adj.get(current) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (order.length !== this.descriptors.size) {
      throw new Error("Cycle detected in service dependency graph");
    }

    return order;
  }

  async startAll(): Promise<void> {
    const order = this.computeStartOrder();
    for (const name of order) {
      await this.descriptors.get(name)!.start();
    }
  }

  async stopAll(): Promise<void> {
    const order = this.computeStartOrder();
    // Tear down in reverse dependency order.
    for (const name of [...order].reverse()) {
      await this.descriptors.get(name)!.stop();
    }
  }

  get serviceNames(): string[] {
    return [...this.descriptors.keys()];
  }
}
