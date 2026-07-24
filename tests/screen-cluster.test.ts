import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterByProjectedDistance } from '../lib/geo/screen-cluster';

interface P {
  id: string;
  x: number;
  y: number;
}

function project(p: P): [number, number] {
  return [p.x, p.y];
}

test('merges two points within the threshold into one group', () => {
  const a: P = { id: 'a', x: 0, y: 0 };
  const b: P = { id: 'b', x: 5, y: 0 };

  const groups = clusterByProjectedDistance([a, b], project, 10);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].items.map((p) => p.id).sort(),
    ['a', 'b'],
  );
});

test('keeps points beyond the threshold in separate groups', () => {
  const a: P = { id: 'a', x: 0, y: 0 };
  const b: P = { id: 'b', x: 100, y: 0 };

  const groups = clusterByProjectedDistance([a, b], project, 10);

  assert.equal(groups.length, 2);
});

test('transitively bridges a chain of nearby points', () => {
  // a-b = 8, b-c = 8, a-c = 16 (over threshold on its own) but b bridges them.
  const a: P = { id: 'a', x: 0, y: 0 };
  const b: P = { id: 'b', x: 8, y: 0 };
  const c: P = { id: 'c', x: 16, y: 0 };

  const groups = clusterByProjectedDistance([a, b, c], project, 10);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
});

test('a smaller threshold (as if zoomed in) splits a previously merged pair apart', () => {
  const a: P = { id: 'a', x: 0, y: 0 };
  const b: P = { id: 'b', x: 5, y: 0 };

  assert.equal(clusterByProjectedDistance([a, b], project, 10).length, 1);
  assert.equal(clusterByProjectedDistance([a, b], project, 2).length, 2);
});

test('leaves a single point untouched', () => {
  const solo: P = { id: 'solo', x: 1, y: 1 };

  const groups = clusterByProjectedDistance([solo], project, 10);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].id, 'solo');
});

test('items with a null projection are excluded from clustering (kept as their own group)', () => {
  const a: P = { id: 'a', x: 0, y: 0 };
  const b: P = { id: 'b', x: 5, y: 0 };

  const groups = clusterByProjectedDistance([a, b], (p) => (p.id === 'b' ? null : project(p)), 10);

  assert.equal(groups.length, 2);
});
