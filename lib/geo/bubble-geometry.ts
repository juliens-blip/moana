// Pure bubble geometry for the Market Trends map, extracted from
// components/listings/MarketMovementsMap.tsx so the invariant that actually
// matters — "the circle the clustering reserves space for is the circle that
// gets drawn" — is unit-testable instead of only reviewable by eye.
//
// UNIT CONVENTION: every value here is in SCREEN pixels. The map draws
// markers inside react-simple-maps' ZoomableGroup, which wraps them in
// `<g transform="translate(x y) scale(k)">`, so a value rendered there is in
// LOCAL units and appears k times bigger on screen. Convert with
// toLocalUnits() exactly once, at the point of use.

/** Smallest visible bubble, screen px. */
export const MIN_RADIUS = 6;
/** Largest visible bubble, screen px. A busy zone must never dominate the map. */
export const MAX_RADIUS = 20;
/**
 * Invisible tap-target floor, screen px (~44px diameter, the standard mobile
 * touch target) so small/packed bubbles stay tappable without growing.
 */
export const MIN_HIT_RADIUS = 22;

/**
 * Visible radius of a bubble representing `total` movements, screen px.
 *
 * The ratio is clamped to 1 because a merged cluster's combined total can
 * exceed `maxTotal` (which is the max over *individual* locations). Without
 * the clamp the radius grows past MAX_RADIUS without bound — and because
 * this same radius feeds the clustering decision, an oversized cluster keeps
 * "overlapping" and swallowing its neighbours: a runaway blob at world zoom.
 */
export function bubbleRadius(total: number, maxTotal: number): number {
  if (maxTotal <= 0) return MIN_RADIUS;
  const ratio = Math.min(1, Math.sqrt(total / maxTotal));
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

/**
 * The screen radius that actually governs a bubble: its visible circle, or
 * its invisible tap target when that's bigger.
 *
 * Single source of truth shared by BOTH the clustering decision and the
 * render, so the space the clustering reserves can never drift from the
 * circle drawn on screen.
 */
export function tapRadius(total: number, maxTotal: number): number {
  return Math.max(bubbleRadius(total, maxTotal), MIN_HIT_RADIUS);
}

/**
 * Screen pixels -> ZoomableGroup local units.
 *
 * Rendered attributes must be wrapped in this so a bubble keeps a constant
 * on-screen size at every zoom level. Never floor a value *after* dividing
 * (`Math.max(3, r / k)` is a 3*k screen-pixel floor, i.e. it grows without
 * bound as you zoom in — that was the original overlap bug); floor the
 * screen-pixel value first, then convert.
 */
export function toLocalUnits(screenPx: number, zoomScale: number): number {
  return screenPx / zoomScale;
}
