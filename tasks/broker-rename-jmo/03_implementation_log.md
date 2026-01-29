# Implementation Log - Broker rename + new broker profile

## Changes made
- Updated CSV import script to include `JMO` in additional brokers list.
- Updated Yatco mapping for `marc` and added `jmo` mapping.
- Added a Supabase admin script to create brokers `JMO` and `Marc` (no rename).

## Files touched
- scripts/import-from-csv.ts
- app/api/leads/yatco/route.ts
- scripts/rename-broker-jmo.ts (new)

## Notes
- Emails are still required by schema; script sets `jmo@moana-yachting.com` and `marc@moana-yachting.com` to satisfy uniqueness.
- Script is idempotent: it skips if `JMO` or `Marc` already exist.
- Attempted to run `scripts/rename-broker-jmo.ts` via `npx dotenv`; it failed to create `JMO` and `Marc` with `TypeError: fetch failed` (likely connectivity or Supabase error).
