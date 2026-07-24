// Generic point clustering over any 2D projected plane (SVG/canvas pixels, or
// any other coordinate space) — same union-find shape as clusterNearbyLocations
// in lib/supabase/market-pulse-map.ts, but expressed in projected-plane units
// instead of real-world kilometers so callers can re-cluster live as a map's
// zoom scale changes (threshold shrinks as zoom grows, so points that were one
// cluster at a world view split apart once there's enough screen room).

export interface ClusterGroup<T> {
  indices: number[];
  items: T[];
}

/**
 * Groups items whose projected position is within `thresholdDistance` of one
 * another (union-find, so a chain of nearby points transitively merges into
 * one group). `project` returning null excludes that item from clustering —
 * it comes back as its own singleton group.
 */
export function clusterByProjectedDistance<T>(
  items: T[],
  project: (item: T) => [number, number] | null,
  thresholdDistance: number,
): Array<ClusterGroup<T>> {
  const points = items.map(project);
  const parent = items.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): void {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }

  for (let i = 0; i < points.length; i++) {
    const pi = points[i];
    if (!pi) continue;
    for (let j = i + 1; j < points.length; j++) {
      const pj = points[j];
      if (!pj) continue;
      if (Math.hypot(pi[0] - pj[0], pi[1] - pj[1]) <= thresholdDistance) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  return Array.from(groups.values()).map((indices) => ({
    indices,
    items: indices.map((i) => items[i]),
  }));
}
