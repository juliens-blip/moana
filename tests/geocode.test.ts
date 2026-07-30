import assert from 'node:assert/strict';
import test from 'node:test';
import { geocodeLocation, haversineKm } from '../lib/geo/geocode';

test('resolves a seeded city to its exact coordinates', () => {
  const result = geocodeLocation('Genoa, Liguria, Italy');
  assert.equal(result.resolved, 'city');
  assert.equal(result.city, 'Genoa');
  assert.equal(result.country, 'Italy');
});

test('falls back to the country centroid when the city is not seeded', () => {
  const result = geocodeLocation('Nowhereville, X, Italy');
  assert.equal(result.resolved, 'country');
  assert.equal(result.country, 'Italy');
});

test('strips the "Cruising " prefix before resolving the city', () => {
  const result = geocodeLocation('Cruising Budva, Budva Municipality, Montenegro');
  assert.equal(result.resolved, 'city');
  assert.equal(result.city, 'Budva');
});

test('resolves aliased country spellings (The Bahamas)', () => {
  const result = geocodeLocation('Somewhere, X, The Bahamas');
  assert.equal(result.resolved, 'country');
  assert.equal(result.country, 'The Bahamas');
});

test('resolves a country with no city seeded (United Arab Emirates)', () => {
  const result = geocodeLocation('X, Y, United Arab Emirates');
  assert.equal(result.resolved, 'country');
});

test('returns unresolved for null input', () => {
  const result = geocodeLocation(null);
  assert.equal(result.resolved, 'none');
  assert.equal(result.lat, null);
});

test('returns unresolved for an unknown city and country', () => {
  const result = geocodeLocation('Atlantis, Deep, Neverland');
  assert.equal(result.resolved, 'none');
});

test('handles a single-token location (no comma) without throwing', () => {
  const result = geocodeLocation('Monaco');
  assert.equal(result.resolved, 'country');
  assert.equal(result.country, 'Monaco');
});

test('haversineKm returns 0 for the same point', () => {
  const point = { lat: 43.5528, lon: 7.0174 };
  assert.equal(haversineKm(point, point), 0);
});

test('haversineKm matches the known Paris-London great-circle distance', () => {
  const paris = { lat: 48.8566, lon: 2.3522 };
  const london = { lat: 51.5074, lon: -0.1278 };
  const km = haversineKm(paris, london);
  assert.ok(km > 340 && km < 350, `expected ~344km, got ${km}`);
});
