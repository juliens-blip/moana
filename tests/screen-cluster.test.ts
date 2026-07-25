import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterByOverlap } from '../lib/geo/screen-cluster';

interface P {
  id: string;
  x: number;
  y: number;
  size: number;
}

function project(p: P): [number, number] {
  return [p.x, p.y];
}

// Mimics a proportional-symbol bubble: radius grows with the group's total
// size, floored at a minimum tap target — same shape as the real
// bubbleRadius()/MIN_HIT_RADIUS combo used by MarketMovementsMap.
const MIN_RADIUS = 10;
function radiusOf(members: P[]): number {
  const total = members.reduce((sum, m) => sum + m.size, 0);
  return Math.max(MIN_RADIUS, total);
}

test('two small bubbles far apart (beyond their combined radii) stay separate', () => {
  const a: P = { id: 'a', x: 0, y: 0, size: 5 };
  const b: P = { id: 'b', x: 100, y: 0, size: 5 };

  const groups = clusterByOverlap([a, b], { project, radius: radiusOf });

  assert.equal(groups.length, 2);
});

test('two large-radius bubbles merge even though their centers are far apart, because their radii still overlap', () => {
  // This is the exact bug a fixed-pixel-distance threshold misses: two big
  // bubbles (radius 30 each) 50px apart look identical, distance-wise, to
  // two tiny bubbles 50px apart — but the big ones visually collide
  // (30 + 30 = 60 > 50) while the tiny ones do not.
  const a: P = { id: 'a', x: 0, y: 0, size: 30 };
  const b: P = { id: 'b', x: 50, y: 0, size: 30 };

  const groups = clusterByOverlap([a, b], { project, radius: radiusOf });

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].items.map((p) => p.id).sort(),
    ['a', 'b'],
  );
});

test('the same 50px gap does NOT merge two small bubbles (radius-aware, not a blanket distance rule)', () => {
  const a: P = { id: 'a', x: 0, y: 0, size: 5 };
  const b: P = { id: 'b', x: 50, y: 0, size: 5 };

  const groups = clusterByOverlap([a, b], { project, radius: radiusOf });

  assert.equal(groups.length, 2);
});

test('cascading merge: A+B growing pulls in C, even though A and C never directly overlap', () => {
  // Pass 1: A-B are 15px apart (radius 10+10=20 >= 15) -> merge. C (x=36) is
  // NOT within reach of either A (dist 36 > 10+10=20) or B (dist 21 > 20)
  // on its own -- neither direct pair overlaps.
  // Pass 2: the merged A+B group recenters at x=7.5 with a bigger radius
  // (radiusOf sums size -> 20), and 36 - 7.5 = 28.5 <= 20 + 10 = 30, so C
  // now gets pulled in. A single-pass, fixed-threshold clustering would
  // stop after pass 1 and leave C as a separate, overlapping bubble.
  const a: P = { id: 'a', x: 0, y: 0, size: 10 };
  const b: P = { id: 'b', x: 15, y: 0, size: 10 };
  const c: P = { id: 'c', x: 36, y: 0, size: 10 };

  const groups = clusterByOverlap([a, b, c], { project, radius: radiusOf });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
});

test('a `gap` buffer merges circles that are exactly edge-to-edge, not just strictly overlapping', () => {
  const a: P = { id: 'a', x: 0, y: 0, size: 10 };
  const b: P = { id: 'b', x: 25, y: 0, size: 10 };

  // radius sum = 20, distance = 25 -> apart without a gap ...
  assert.equal(clusterByOverlap([a, b], { project, radius: radiusOf }).length, 2);
  // ... but merges once a >=5px gap buffer is requested.
  assert.equal(clusterByOverlap([a, b], { project, radius: radiusOf, gap: 5 }).length, 1);
});

test('leaves a single point untouched', () => {
  const solo: P = { id: 'solo', x: 1, y: 1, size: 1 };

  const groups = clusterByOverlap([solo], { project, radius: radiusOf });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].id, 'solo');
});

test('items with a null projection are excluded from clustering (kept as their own group)', () => {
  const a: P = { id: 'a', x: 0, y: 0, size: 30 };
  const b: P = { id: 'b', x: 10, y: 0, size: 30 };

  const groups = clusterByOverlap([a, b], {
    project: (p) => (p.id === 'b' ? null : project(p)),
    radius: radiusOf,
  });

  assert.equal(groups.length, 2);
});
