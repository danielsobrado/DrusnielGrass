import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Requires the local Vite server at 127.0.0.1:5192. Each fixture checks both
// forced backends; run browsers sequentially so they do not contend for the GPU.
const fixtures = ['identity', 'palette', 'grass', 'impostor', 'foliage', 'trail',
  'bake', 'stone', 'water', 'terrain', 'scenery', 'volume', 'actor', 'cloudresponse'];
const directory = '.shots/renderer-matrix';
mkdirSync(directory, { recursive: true });
const retry = process.argv.includes('--retry-failed');
const results = retry ? JSON.parse(readFileSync(`${directory}/results.json`, 'utf8')) : [];
for (const profile of ['desktop', 'compact']) {
  for (const fixture of fixtures) {
    const previous = results.findIndex(entry => entry.profile === profile && entry.fixture === fixture);
    if (retry && previous >= 0 && results[previous].passed) continue;
    const result = spawnSync(process.execPath,
      ['scripts/check-renderer-harness.mjs', fixture, profile],
      { encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const passed = result.status === 0 && !result.error;
    const log = `${directory}/${fixture}-${profile}.log`;
    writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ?? ''}`);
    const record = { fixture, profile, passed, status: result.status, log };
    if (previous >= 0) results[previous] = record;
    else results.push(record);
    writeFileSync(`${directory}/results.json`, JSON.stringify(results, null, 2) + '\n');
    console.log(`${passed ? 'PASS' : 'FAIL'} ${fixture} ${profile}${passed ? '' : `: ${log}`}`);
  }
}
const failed = results.filter(result => !result.passed);
console.log(`${results.length - failed.length}/${results.length} fixture/profile pairs passed (two backends each).`);
if (failed.length) process.exitCode = 1;
