/**
 * Retained as a guard so old operational documentation cannot accidentally
 * disable RLS on the brokers table.
 */
console.error('Refusing to disable RLS on public.brokers. Use scripts/fix-rls-policies.sql instead.');
process.exitCode = 1;
