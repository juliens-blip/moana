import fs from 'node:fs/promises';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export async function readJson(jsonPath) {
  const raw = await fs.readFile(jsonPath, 'utf8');
  return JSON.parse(raw);
}

export function validateVesselStats(value) {
  const rows = requireNonEmptyArray(value, 'Vessel statistics');
  rows.forEach((row, index) => {
    if (!isRecord(row) || typeof row.vesselName !== 'string' || !row.vesselName.trim()) {
      throw new Error(`Vessel statistics row ${index} has no vesselName`);
    }
    for (const field of ['impressions', 'detailViews', 'phoneClicks', 'galleryViews', 'leads']) {
      requireNonNegativeInteger(row[field], `Vessel statistics row ${index}.${field}`);
    }
  });
  return rows;
}

export function validateStatsBridge(value) {
  const rows = requireNonEmptyArray(value, 'YATCO statistics bridge');
  rows.forEach((row, index) => {
    if (!isRecord(row) || typeof row.vesselId !== 'string' || !row.vesselId.trim()) {
      throw new Error(`YATCO statistics bridge row ${index} has no vesselId`);
    }
  });
  return rows;
}

export function validateMarketReview(value) {
  if (!isRecord(value)) {
    throw new Error('Market Review must be an object');
  }
  for (const section of ['soldVessels', 'totalSoldValue', 'avgDaysOnMarket']) {
    if (!isRecord(value[section]) || Object.keys(value[section]).length === 0) {
      throw new Error(`Market Review section ${section} is empty`);
    }
  }
  return value;
}

export function validateMarketPulse(value) {
  const rows = requireNonEmptyArray(value, 'Market Pulse');
  const feedTypes = new Set();
  rows.forEach((row, index) => {
    if (!isRecord(row) || typeof row.vid !== 'string' || !row.vid.trim()) {
      throw new Error(`Market Pulse row ${index} has no vid`);
    }
    if (!['new', 'modified', 'sold'].includes(row.feedType)) {
      throw new Error(`Market Pulse row ${index} has an invalid feedType`);
    }
    feedTypes.add(row.feedType);
  });
  for (const feedType of ['new', 'modified', 'sold']) {
    if (!feedTypes.has(feedType)) {
      throw new Error(`Market Pulse feed ${feedType} is missing`);
    }
  }
  return rows;
}
