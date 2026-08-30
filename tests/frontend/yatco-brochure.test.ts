import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const pageSource = read('app/dashboard/yatco-global/page.tsx');
const routeSource = read('app/api/yatco-global/brochure/route.ts');
const liveSource = read('lib/yatco-boss/live.ts');
const scriptSource = read('scripts/yatco-boss-brochure.mjs');
const workerDockerfile = read('workers/docker/Dockerfile.yatco-worker');

assert.match(pageSource, /brochureParams\.set\('externalId', externalId\)/);
assert.match(pageSource, /brochureParams\.set\('vid', String\(bossVid\)\)/);
assert.match(pageSource, /\/api\/yatco-global\/brochure\?\$\{brochureParams\.toString\(\)\}/);

assert.match(routeSource, /searchParams\.get\('externalId'\)/);
assert.match(routeSource, /getLiveYatcoBossBrochure\(vid, externalId\)/);
assert.match(routeSource, /status: 303/);
assert.match(routeSource, /Location: brochure\.url/);
assert.doesNotMatch(routeSource, /Buffer\.from\(brochure\.base64/);
assert.doesNotMatch(routeSource, /vesseldetails\/viewlisting/);

const brochureFunction = liveSource.slice(liveSource.indexOf('export async function getLiveYatcoBossBrochure'));
assert.match(brochureFunction, /createSshRunner\(keyPath, host\)/);
assert.match(brochureFunction, /process\.env\.YATCO_SSH_KEY \|\| process\.env\.MOANA_SSH_KEY/);
assert.match(brochureFunction, /process\.env\.YATCO_SSH_HOST/);
assert.doesNotMatch(brochureFunction, /runRemoteScript\(/);
assert.doesNotMatch(brochureFunction, /base64/);

assert.match(scriptSource, /VID ou MLS_ID requis/);
assert.match(scriptSource, /MLSID: mlsId/);
assert.match(scriptSource, /queueQuickPdfFromSearchResult\(resolvedVid\)/);
assert.match(scriptSource, /getByText\('Quick PDF', \{ exact: true \}\)/);
assert.doesNotMatch(scriptSource, /queued = await queueQuickPdf\(resolvedVid\);/);
assert.match(scriptSource, /url: downloadUrl\.href/);
assert.doesNotMatch(scriptSource, /body\.toString\('base64'\)/);
assert.doesNotMatch(scriptSource, /pageNumber <= 120/);

assert.match(brochureFunction, /remote\.stderr\.trim\(\)\.slice\(-4000\)/);

assert.match(workerDockerfile, /glob\.glob\('\/data\/page_\*\.json'\)/);
assert.doesNotMatch(workerDockerfile, /glob\.glob\('\/data\/\*\.json'\)/);

console.log('26/26 YATCO brochure and ingestion regression checks passed');
