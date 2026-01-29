# Plan - Broker rename + new broker profile

## Phase 1 - Confirm data contract
1. Confirm exact current broker name to rename and target emails for JMO and Marc.
2. Confirm whether Yatco mapping must change (recipient name -> broker email).

## Phase 2 - Implementation (after confirmation)
1. Add a script (Supabase admin) to:
   - Rename broker: update `broker_name` (and email if required) for the existing broker.
   - Create new broker `Marc` if missing (with default password hash or specified value).
2. Update `scripts/import-from-csv.ts` additional broker list to reflect JMO + Marc.
3. Update `app/api/leads/yatco/route.ts` mapping entries for Marc/JMO.

## Phase 3 - Verification
1. Run the new script in a staging/dev environment (if available).
2. Verify `/api/brokers` returns both `JMO` and `Marc`.
3. Trigger a test lead in Yatco flow to ensure routing hits the correct broker.

