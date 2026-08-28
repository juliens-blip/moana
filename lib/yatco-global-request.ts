export type CoordinatedOutcome<T> = { stale: true } | { stale: false; value: T };

/**
 * Coordinates concurrent async calls fired by rapid, superseding requests
 * (e.g. every filter/sort change firing its own fetch): each call to the
 * returned `run` supersedes whatever call came before it, so an older
 * call's resolved value comes back as `{ stale: true }` once a newer call
 * has been issued — even if it settles after the newer one — letting the
 * caller discard it before committing state. This module knows nothing
 * about HTTP, response decoding, or success/error shape; that is entirely
 * up to whoever supplies `request` and reads `value`. An empty/falsy `T` is
 * never treated as stale on its own — only a superseding call makes a
 * result stale.
 */
export function createRequestCoordinator<T>() {
  let requestId = 0;
  return async function run(request: () => Promise<T>): Promise<CoordinatedOutcome<T>> {
    const thisRequestId = ++requestId;
    const value = await request();
    if (thisRequestId !== requestId) return { stale: true };
    return { stale: false, value };
  };
}
