import fs from 'node:fs';
import autocannon from 'autocannon';
import dotenv from 'dotenv';
import pg from 'pg';

const labsDir = 'C:/Projects/ventora-ecosystem/labs';
const allEnv = dotenv.parse(fs.readFileSync(labsDir + '/.env.local'));
const BYPASS = allEnv['VERCEL_BYPASS_SECRET'];
const superUrl = allEnv['DATABASE_URL_SUPERUSER'];
const BASE = 'https://ventora-lab-e4-biancapetrascu5-techs-projects.vercel.app';

const headers = { 'x-vercel-protection-bypass': BYPASS };

const pgClient = new pg.Client({ connectionString: superUrl });
await pgClient.connect();

function runAC(url) {
  return new Promise((resolve) => {
    const inst = autocannon({ url, connections: 200, duration: 10, headers }, (err, r) => resolve(r));
    autocannon.track(inst, { renderProgressBar: true });
  });
}

console.log('\n=== E5 BENCH: with org context (RLS + set_config) ===');
const rlsResult = await runAC(BASE + '/api/e5/bench?v=rls');
console.log(`req/s: ${Math.round(rlsResult.requests.mean)}`);
console.log(`p50/p97.5/p99: ${rlsResult.latency.p50}ms / ${rlsResult.latency.p97_5}ms / ${rlsResult.latency.p99}ms`);
console.log(`max: ${rlsResult.latency.max}ms | erori: ${rlsResult.non2xx} | cereri: ${rlsResult.requests.total}`);

await new Promise(r => setTimeout(r, 5000));

console.log('\n=== E5 BENCH: without org context (no set_config, 0 rows via RLS) ===');
const norlsResult = await runAC(BASE + '/api/e5/bench?v=norls');
console.log(`req/s: ${Math.round(norlsResult.requests.mean)}`);
console.log(`p50/p97.5/p99: ${norlsResult.latency.p50}ms / ${norlsResult.latency.p97_5}ms / ${norlsResult.latency.p99}ms`);
console.log(`max: ${norlsResult.latency.max}ms | erori: ${norlsResult.non2xx} | cereri: ${norlsResult.requests.total}`);

console.log(`\nTotal cereri: ${rlsResult.requests.total + norlsResult.requests.total}`);
await pgClient.end();
