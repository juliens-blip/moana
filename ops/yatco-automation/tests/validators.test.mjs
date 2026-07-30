import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateMarketPulse,
  validateMarketReview,
  validateStatsBridge,
  validateVesselStats,
} from '../lib/validators.mjs';

test('accepts complete vessel statistics', () => {
  const rows = [{
    vesselName: 'ATLANTIS',
    impressions: 149,
    detailViews: 9,
    phoneClicks: 5,
    galleryViews: 2,
    leads: 0,
  }];
  assert.equal(validateVesselStats(rows), rows);
});

test('rejects an empty vessel statistics response', () => {
  assert.throws(() => validateVesselStats([]), /non-empty array/);
});

test('rejects a bridge without a matched vessel', () => {
  assert.throws(() => validateStatsBridge([]), /non-empty array/);
});

test('accepts the three Market Review sections', () => {
  const snapshot = {
    soldVessels: { '120 and Above': { 2026: '59' } },
    totalSoldValue: { '120 and Above': { 2026: '$1' } },
    avgDaysOnMarket: { '120 and Above': { 2026: '31' } },
  };
  assert.equal(validateMarketReview(snapshot), snapshot);
});

test('rejects a partial Market Review snapshot', () => {
  assert.throws(
    () => validateMarketReview({ soldVessels: {}, totalSoldValue: {}, avgDaysOnMarket: {} }),
    /section soldVessels is empty/,
  );
});

test('requires all three Market Pulse feeds', () => {
  const complete = [
    { feedType: 'new', vid: '1' },
    { feedType: 'modified', vid: '2' },
    { feedType: 'sold', vid: '3' },
  ];
  assert.equal(validateMarketPulse(complete), complete);
  assert.throws(() => validateMarketPulse(complete.slice(0, 2)), /feed sold is missing/);
});
