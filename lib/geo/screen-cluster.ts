// Overlap-aware point clustering over any 2D projected plane (SVG/canvas
// pixels, or any other coordinate space). Unlike a fixed-pixel-radius
// clustering scheme, this merges two groups whenever the CIRCLES they'd
// actually be drawn as (given each group's real, size-dependent radius)
// touch or overlap — which is what a proportional-symbol map needs: a big
// bubble and a small bubble a modest distance apart can still visually
// collide even though two small bubbles at the same distance would not.

export interface ClusterGroup<T> {
  indices: number[];
  items: T[];
}

export interface ClusterByOverlapOptions<T> {
  /**
   * Projects an item onto the plane markers are actually drawn in (e.g. the
   * current on-screen pixel position). Returning null excludes the item from
   * clustering — it comes back as its own singleton group.
   */
  project: (item: T) => [number, number] | null;
  /**
   * The on-screen radius a bubble representing this group would be drawn
   * at, in the same units as `project`'s output. Called with the group's
   * current members, so a merged group's radius can grow (e.g. from a
   * bigger combined total) as members accumulate.
   */
  radius: (members: T[]) => number;
  /**
   * Extra buffer kept between two circles' edges even when they don't
   * strictly overlap, so adjacent bubbles/tap-targets never sit flush
   * against one another. Defaults to 0.
   */
  gap?: number;
}

/**
 * Agglomerative clustering that merges items whenever their groups' circles
 * (by the caller's own `radius` function) touch or overlap on screen. Runs
 * to a fixed point: after any merge in a pass, every group's radius is
 * recomputed and every pair is re-checked, so a cascade — group A doesn't
 * touch C directly, but merging A+B grows the radius enough to now reach C —
 * still collapses into one group instead of leaving overlapping circles on
 * screen. That fixed-point pass is what a single-pass, fixed-threshold
 * clustering (the previous approach here) cannot guarantee.
 */
export function clusterByOverlap<T>(items: T[], options: ClusterByOverlapOptions<T>): Array<ClusterGroup<T>> {
  const { project, radius, gap = 0 } = options;
  const points = items.map(project);
  const parent = items.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): boolean {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI === rootJ) return false;
    parent[rootI] = rootJ;
    return true;
  }

  function groupedIndices(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < items.length; i++) {
      if (!points[i]) continue;
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }
    return groups;
  }

  let mergedThisPass = true;
  while (mergedThisPass) {
    mergedThisPass = false;

    const meta = Array.from(groupedIndices().values()).map((indices) => {
      const pts = indices.map((i) => points[i] as [number, number]);
      const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
      const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
      return { indices, cx, cy, r: radius(indices.map((i) => items[i])) };
    });

    for (let a = 0; a < meta.length; a++) {
      for (let b = a + 1; b < meta.length; b++) {
        const dist = Math.hypot(meta[a].cx - meta[b].cx, meta[a].cy - meta[b].cy);
        if (dist <= meta[a].r + meta[b].r + gap) {
          if (union(meta[a].indices[0], meta[b].indices[0])) {
            mergedThisPass = true;
          }
        }
      }
    }
  }

  const result: Array<ClusterGroup<T>> = Array.from(groupedIndices().values()).map((indices) => ({
    indices,
    items: indices.map((i) => items[i]),
  }));

  // Un-projectable items were skipped above (never unioned with anything) —
  // surface each as its own singleton so callers don't silently lose data.
  for (let i = 0; i < items.length; i++) {
    if (!points[i]) {
      result.push({ indices: [i], items: [items[i]] });
    }
  }

  return result;
}
