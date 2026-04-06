/**
 * An RPC contract maps method names to { params, result } shapes.
 * Every service defines its public API as a concrete type extending this.
 */
export type RpcContract = {
  [method: string]: {
    params: unknown;
    result: unknown;
  };
};

/**
 * Type-safe client for any service implementing an RPC contract.
 * The transport (ipcMain, MessagePort, or direct in-process call) is
 * hidden behind this interface so callers never depend on it.
 */
export interface ServiceClient<T extends RpcContract> {
  invoke<K extends keyof T & string>(
    method: K,
    params: T[K]["params"],
  ): Promise<T[K]["result"]>;
}

/**
 * One handler function per method in the contract.
 * Service implementations satisfy this type to provide their business logic.
 */
export type ServiceHandlers<T extends RpcContract> = {
  [K in keyof T]: (params: T[K]["params"]) => Promise<T[K]["result"]>;
};

/**
 * Wrap a ServiceHandlers object in a ServiceClient that calls handlers
 * directly in the same process — no IPC bus, no serialisation overhead.
 * Used for tests and for services co-located in the same process.
 */
export function createInProcessClient<T extends RpcContract>(
  handlers: ServiceHandlers<T>,
): ServiceClient<T> {
  return {
    invoke(method, params) {
      const handler = handlers[method as keyof T];
      return handler.call(handlers, params) as Promise<T[typeof method]["result"]>;
    },
  };
}
