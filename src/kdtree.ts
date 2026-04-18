import type { KDTree as NativeKDTree } from "./native";

const addon = require("../build/Release/flucoma_native.node");

export interface KNNResult {
  /** The string ID supplied when the point was added */
  id: string;
  /** Euclidean distance from the query point */
  distance: number;
}

export class KDTree {
  #native: NativeKDTree;

  constructor() {
    this.#native = new addon.KDTree();
  }

  /**
   * Add a single point to the tree.
   * All points must have the same dimension.
   * @param id    String identifier for this point
   * @param point Feature vector
   */
  addPoint(id: string, point: number[]): void {
    this.#native.addPoint(id, point);
  }

  /**
   * Find the k nearest neighbors to a query point.
   * The tree is (re)built from all added points on the first query
   * after any insertions.
   * @param point  Query feature vector
   * @param k      Number of neighbors to return
   * @param radius Optional maximum search radius (0 = unlimited)
   * @returns Array of { id, distance } sorted by distance ascending
   */
  kNearest(point: number[], k: number, radius = 0): KNNResult[] {
    return this.#native.kNearest(point, k, radius);
  }

  /** Number of points currently in the tree. */
  size(): number {
    return this.#native.size();
  }

  /** Remove all points and reset the tree. */
  clear(): void {
    this.#native.clear();
  }
}
