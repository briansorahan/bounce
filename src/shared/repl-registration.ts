import type { NamespaceDescriptor, TypeDescriptor } from "./repl-registry.js";

const namespaces = new Map<string, NamespaceDescriptor>();
const types = new Map<string, TypeDescriptor>();

export function registerNamespace(descriptor: NamespaceDescriptor): void {
  namespaces.set(descriptor.name, descriptor);
}

export function registerType(descriptor: TypeDescriptor): void {
  types.set(descriptor.name, descriptor);
}

export function getNamespace(name: string): NamespaceDescriptor | undefined {
  return namespaces.get(name);
}

export function getType(name: string): TypeDescriptor | undefined {
  return types.get(name);
}

/**
 * Returns all registered namespace descriptors, optionally filtered to a
 * specific visibility level. If visibility is omitted, returns all.
 */
export function listNamespaces(visibility?: "porcelain" | "plumbing"): NamespaceDescriptor[] {
  const all = [...namespaces.values()];
  if (!visibility) return all;
  return all.filter((d) => d.visibility === visibility);
}

/**
 * Returns all registered type descriptors.
 */
export function listTypes(): TypeDescriptor[] {
  return [...types.values()];
}

/**
 * Returns the names of all registered namespaces, filtered by visibility.
 * Pass true to include plumbing namespaces.
 */
export function getNamespaceNames(includePlumbing = false): string[] {
  return [...namespaces.values()]
    .filter((d) => includePlumbing || d.visibility === "porcelain")
    .map((d) => d.name);
}
