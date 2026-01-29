# Analysis - Broker rename + new broker profile

## Request (interpreted)
- Rename broker "mMrc" to "JMO" across the app.
- Create a new broker profile named "Marc" (no boats yet, but should be available).
- Use the APEX workflow and implementation agents from the local agents library.

## What I found in the codebase
- No occurrences of "mMrc", "Mrrc", or "JMO" in the repo.
- Broker names are sourced from Supabase `brokers` table via `/api/brokers` and UI dropdowns.
- Yatco webhook mapping includes a hardcoded entry: `marc -> jm@moanayachting.com` in `app/api/leads/yatco/route.ts`.
- Seed/import tooling:
  - `scripts/import-from-csv.ts` adds additional brokers including `Marc`.
  - `backup/brokers.csv` is minimal and does not include Marc/JMO.
- Logs/docs mention `Marc (marc@moana-yachting.com)` as an existing broker (historical).

## Implications
- If broker data lives in Supabase, renaming must be done in the database (or via script/migration) for the UI to reflect it.
- If we rename an existing broker to JMO, references by `broker_id` remain valid; only the display name/email change.
- A new broker profile for Marc likely means inserting a new row in `brokers` (with a new email) and ensuring it appears in `/api/brokers` responses.
- Yatco mapping may need updating to ensure leads route to the correct broker after renaming (currently `marc` maps to a `jm@...` address).

## Open questions / risks
- What is the **exact** current broker name to rename? ("mMrc" does not exist in repo; maybe "Marc" or another typo?)
- What email should JMO use? (e.g., `jmo@moana-yachting.com` or `jm@...`?)
- What email should the new Marc profile use? (e.g., `marc@moana-yachting.com`?)
- Should we also update historical docs/logs, or only runtime data and scripts?

## Proposed approach (subject to confirmation)
- Add/adjust a Supabase admin script to rename broker "mMrc" -> "JMO" and create broker "Marc" if missing.
- Update Yatco mapping to route recipient "marc" to the new Marc broker email (and add JMO mapping if needed).
- Update seed/import script to include JMO + Marc correctly.

