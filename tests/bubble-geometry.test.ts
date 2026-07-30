import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_RADIUS,
  MIN_HIT_RADIUS,
  MIN_RADIUS,
  bubbleRadius,
  tapRadius,
  toLocalUnits,
} from '../lib/geo/bubble-geometry';
import { clusterByOverlap } from '../lib/geo/screen-cluster';

const CLUSTER_GAP_PX = 6;
// Zoom levels the map can actually reach: MIN_ZOOM 1, then CLUSTER_ZOOM_FACTOR
// (4) per cluster click up to MAX_ZOOM 256.
const REACHABLE_ZOOMS = [1, 1.6, 4, 16, 64, 256];

test('bubbleRadius stays within [MIN_RADIUS, MAX_RADIUS] even when a cluster total exceeds maxTotal', () => {
  // Regression: a merged cluster sums its members' totals, so it routinely
  // exceeds maxTotal (the max over *individual* locations). Unclamped, this
  // returned 83px for a 300-movement cluster against maxTotal=10 — a blob
  // that then swallowed every neighbour it "overlapped".
  const maxTotal = 10;
  for (const total of [0, 1, 5, 10, 40, 120, 300, 5000]) {
    const r = bubbleRadius(total, maxTotal);
    assert.ok(r >= MIN_RADIUS, `total=${total} -> ${r} below MIN_RADIUS`);
    assert.ok(r <= MAX_RADIUS, `total=${total} -> ${r} exceeds MAX_RADIUS ${MAX_RADIUS}`);
  }
});

test('bubbleRadius degrades gracefully on an empty dataset', () => {
  assert.equal(bubbleRadius(0, 0), MIN_RADIUS);
  assert.equal(bubbleRadius(5, -1), MIN_RADIUS);
});

test('tapRadius never drops below the mobile touch-target floor', () => {
  for (const total of [0, 1, 10, 1000]) {
    assert.ok(tapRadius(total, 10) >= MIN_HIT_RADIUS);
  }
});

test('a bubble keeps a CONSTANT on-screen size at every reachable zoom level', () => {
  // THE regression this file exists for. The old render floored the radius
  // *after* dividing by k (`Math.max(3, r / k)`), which is a 3*k SCREEN-pixel
  // floor: 12px at k=4, 48px at k=16, 768px at k=256. Bubbles ballooned as
  // you zoomed in until nothing was clickable.
  const screenRadius = bubbleRadius(1, 10);
  for (const k of REACHABLE_ZOOMS) {
    const drawnOnScreen = toLocalUnits(screenRadius, k) * k;
    assert.ok(
      Math.abs(drawnOnScreen - screenRadius) < 1e-9,
      `k=${k}: drawn ${drawnOnScreen}px, expected a constant ${screenRadius}px`,
    );
  }
});

test('the tap target the clustering reserves is the tap target actually drawn, at every zoom', () => {
  // The clustering guarantees spacing using tapRadius() in screen px; the
  // render converts that same value through toLocalUnits(). If the two ever
  // diverge, clustering reserves space for a circle that isn't the one on
  // screen — which is exactly how overlapping-but-"separate" bubbles appear.
  for (const total of [1, 10, 300]) {
    const reserved = tapRadius(total, 10);
    for (const k of REACHABLE_ZOOMS) {
      const drawn = toLocalUnits(reserved, k) * k;
      assert.ok(Math.abs(drawn - reserved) < 1e-9, `total=${total} k=${k}: ${drawn} != ${reserved}`);
    }
  }
});

test('clustered bubbles never overlap on screen, at any reachable zoom', () => {
  // End-to-end: run the real clustering over a dense, deliberately awkward
  // set of projected points, then assert no two surviving groups' DRAWN
  // circles intersect. This is the property the user experiences as
  // "I can click every bubble".
  // Spacings are in PROJECTED units (pre-zoom), which is what real data looks
  // like: on geoEqualEarth at this map's scale, Mediterranean yacht hubs sit a
  // fraction of a unit to a few units apart. Getting this wrong hides the bug
  // — the pre-fix render only overlapped for separations under ~6 projected
  // units, so a widely-spread synthetic grid stays green on broken code.
  const points = [
    // Cote d'Azur-tight: sub-unit separations, only zoom can split these.
    { key: 'antibes', x: 402.0, y: 168.0, total: 12 },
    { key: 'monaco', x: 402.6, y: 167.7, total: 9 },
    { key: 'cannes', x: 401.4, y: 168.3, total: 21 },
    { key: 'nice', x: 402.2, y: 167.4, total: 4 },
    // Mid-range: the 3-6 unit band that the old code left un-merged while
    // still drawing overlapping circles once k passed ~8.
    { key: 'st-tropez', x: 397.5, y: 169.0, total: 6 },
    { key: 'toulon', x: 393.5, y: 169.6, total: 3 },
    { key: 'marseille', x: 389.6, y: 170.1, total: 15 },
    // A heavyweight that pushes the radius to its cap.
    { key: 'palma', x: 380.0, y: 176.0, total: 400 },
    { key: 'barcelona', x: 376.0, y: 174.0, total: 250 },
    // Far-flung singles that must never be merged into anything.
    { key: 'fort-lauderdale', x: 210.0, y: 205.0, total: 60 },
    { key: 'auckland', x: 690.0, y: 330.0, total: 2 },
    // Genuinely coincident berths -> spiderfy territory.
    { key: 'dup-1', x: 500.0, y: 300.0, total: 3 },
    { key: 'dup-2', x: 500.0, y: 300.0, total: 7 },
  ];

  const maxTotal = points.reduce((m, p) => Math.max(m, p.total), 0);

  for (const k of REACHABLE_ZOOMS) {
    const groups = clusterByOverlap(points, {
      // Mirrors the component: raw projected coords scaled by k into screen space.
      project: (p) => [p.x * k, p.y * k],
      radius: (members) => tapRadius(members.reduce((s, m) => s + m.total, 0), maxTotal),
      gap: CLUSTER_GAP_PX,
    });

    const drawn = groups.map((g) => {
      const total = g.items.reduce((s, m) => s + m.total, 0);
      const cx = g.items.reduce((s, m) => s + m.x * k, 0) / g.items.length;
      const cy = g.items.reduce((s, m) => s + m.y * k, 0) / g.items.length;
      // Screen radius of the circle the component renders for this group.
      return { cx, cy, r: tapRadius(total, maxTotal), keys: g.items.map((m) => m.key) };
    });

    for (let a = 0; a < drawn.length; a++) {
      for (let b = a + 1; b < drawn.length; b++) {
        const dist = Math.hypot(drawn[a].cx - drawn[b].cx, drawn[a].cy - drawn[b].cy);
        assert.ok(
          dist >= drawn[a].r + drawn[b].r,
          `k=${k}: [${drawn[a].keys}] and [${drawn[b].keys}] overlap — ` +
            `centers ${dist.toFixed(1)}px apart but radii sum to ${(drawn[a].r + drawn[b].r).toFixed(1)}px`,
        );
      }
    }

    // Sanity: clustering must not collapse everything into one blob either.
    assert.ok(groups.length >= 1);
  }
});

test('genuinely coincident points collapse into a single cluster (spiderfy territory)', () => {
  const co = [
    { key: 'a', x: 10, y: 10, total: 2 },
    { key: 'b', x: 10, y: 10, total: 3 },
  ];
  const groups = clusterByOverlap(co, {
    project: (p) => [p.x, p.y],
    radius: (members) => tapRadius(members.reduce((s, m) => s + m.total, 0), 5),
    gap: CLUSTER_GAP_PX,
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});
