import assert from 'node:assert/strict';

export async function verifyRecoveryFailures(RendererRecovery) {
  let releases = 0;
  const failures = [];
  const broken = new RendererRecovery({ capture: () => ({}),
    release() { if (++releases > 1) throw new Error('cleanup fault'); },
    async restart() { throw new Error('shader fault'); },
    onFailure: error => failures.push(error) });
  await broken.recover('webgpu', 'webgpu');
  assert.equal(releases, 2, 'a failed cleanup must not be called again by an outer catch');
  assert.equal(failures.length, 1, 'cleanup failure must not swallow the user-facing recovery failure');
  const details = `${failures[0].message} ${(failures[0].errors ?? []).map(error => error.message).join(' ')}`;
  assert.match(details, /shader fault/); assert.match(details, /cleanup fault/);

  let nested, starts = 0, entered = false;
  const reentrant = new RendererRecovery({ capture() {
    if (!entered) { entered = true; nested = reentrant.recover('auto', 'webgpu'); }
    return {};
  }, release() {}, async restart() { starts++; }, onFailure: error => { throw error; } });
  const pending = reentrant.recover('auto', 'webgpu');
  await pending;
  assert.equal(nested, pending, 'reentrant loss must see the pending recovery before capture/release');
  assert.equal(starts, 1);
}
