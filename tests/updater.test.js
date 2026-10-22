import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGithubUpdater, changedEntries, instructionDiff } from '../github-updater.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const SOURCE = 'https://github.com/acme/skills';
const COMMIT = 'b'.repeat(40), OLD = 'a'.repeat(40);
const projectRoot = '/example/project';
const args = extra => ({ scope: 'project', projectRoot, name: 'demo', kind: 'dir', ...extra });
function tree(body = 'old instructions\n', resources = []) {
  const manifest = [{ path: 'SKILL.md', type: 'file', sha256: hash(body), size: Buffer.byteLength(body), executable: false }, ...resources];
  return { body, manifest, treeHash: hash(JSON.stringify(manifest)), revision: hash(body) };
}
function fixture(t, options = {}) {
  let time = 1000, serial = 0;
  let state = { ...tree(), root: '/example/project/.dsh/skills', scope: 'project', name: 'demo', kind: 'dir', origin: null, originRevision: null };
  if (options.tracked !== false) { state.origin = { source: SOURCE, commit: OLD, baselineHash: state.treeHash }; state.originRevision = hash('origin'); }
  if (options.dirty) { state = { ...state, ...tree('local edits\n') }; }
  let proposed = options.proposed ?? tree('new instructions\n');
  const calls = { prepare: [], discard: [], apply: [], withPrepared: [] }, pending = new Map();
  const remote = {
    async prepare(payload, signal) {
      calls.prepare.push(payload);
      if (options.prepare) await options.prepare(payload, signal);
      const token = 'remote-' + (++serial);
      pending.set(token, { source: SOURCE, commit: COMMIT, skills: new Map([['demo', { srcDir: '/private/stage/demo' }]]), expiresAt: time + 600000 });
      return { token, expiresAt: time + 600000 };
    },
    async withPrepared(payload, signal, work, config = {}) {
      calls.withPrepared.push({ payload, consume: !!config.consume });
      const value = pending.get(payload.token);
      if (!value) throw Object.assign(new Error('remote token expired'), { status: 410 });
      try { return await work(value, signal); }
      finally { if (config.consume) pending.delete(payload.token); }
    },
    async discard(payload) { calls.discard.push(payload); return { discarded: pending.delete(payload.token) }; },
  };
  const updater = createGithubUpdater({ remote, now: () => time,
    getState: async () => structuredClone(state),
    snapshotCandidate: async () => structuredClone(proposed),
    applyUpdate: async (payload, candidate) => {
      calls.apply.push({ payload, candidate });
      if (options.applyUpdate) return options.applyUpdate(payload, candidate);
      if (payload.expectedTreeHash !== state.treeHash || payload.expectedOriginRevision !== state.originRevision) throw Object.assign(new Error('skill changed after preview'), { status: 409 });
      const trackingOnly = state.treeHash === proposed.treeHash;
      state = { ...state, ...proposed, origin: { source: candidate.source, commit: candidate.commit, baselineHash: proposed.treeHash }, originRevision: hash('new origin') };
      return { updated: true, ...state, trackingOnly, backup: trackingOnly ? null : { id: 'backup-id', path: '/private/backups/backup-id' } };
    },
  });
  t.after(() => updater.dispose());
  return { updater, calls, pending, get state() { return state; }, set state(value) { state = value; }, get proposed() { return proposed; }, set proposed(value) { proposed = value; }, advance(ms) { time += ms; } };
}
const applyArgs = (preview, extra = {}) => args({ token: preview.token, allowLocalChanges: false, ...extra });

test('tracked updates preview immutable commits, actual full-tree changes and escaped instruction data', async t => {
  const f = fixture(t, { proposed: tree('<script>not executed</script>\n') });
  const preview = await f.updater.prepare(args({ expectedRevision: f.state.revision }));
  assert.equal(preview.source, SOURCE); assert.equal(preview.currentCommit, OLD); assert.equal(preview.latestCommit, COMMIT);
  assert.equal(preview.status, 'available'); assert.equal(preview.localDirty, false); assert.equal(preview.requiresOverwrite, false);
  assert.equal(preview.summary.modified, 1); assert(preview.diff.text.includes('+<script>not executed</script>'));
  assert.deepEqual(f.calls.prepare[0], { scope: 'project', projectRoot, input: `npx skills add ${SOURCE} --skill demo` });
  assert(!JSON.stringify(preview).includes('/private/stage')); assert(preview.token);
  const result = await f.updater.apply(applyArgs(preview));
  assert.equal(result.updated, true); assert.equal(result.backup.id, 'backup-id');
  assert.deepEqual(f.calls.apply[0].payload, args({ expectedTreeHash: preview.treeHash, expectedOriginRevision: hash('origin'), allowLocalChanges: false }));
  assert.deepEqual(f.calls.apply[0].candidate, { srcDir: '/private/stage/demo', treeHash: f.proposed.treeHash, source: SOURCE, commit: COMMIT });
  await assert.rejects(f.updater.apply(applyArgs(preview)), error => error.status === 410);
});

test('up-to-date source leaves locally edited files untouched and frees remote staging', async t => {
  const f = fixture(t, { dirty: true, proposed: tree() });
  const preview = await f.updater.prepare(args());
  assert.equal(preview.status, 'upToDate'); assert.equal(preview.localDirty, true);
  assert.equal(preview.canApply, false); assert.equal(preview.token, null);
  assert.equal(f.pending.size, 0); assert.equal(f.calls.apply.length, 0);
});

test('resource-only upstream changes produce update even with identical SKILL.md', async t => {
  const f = fixture(t, { proposed: tree('old instructions\n', [{ path: 'references', type: 'dir' }, { path: 'references/a.md', type: 'file', sha256: hash('resource'), size: 8, executable: false }]) });
  const p = await f.updater.prepare(args());
  assert.equal(p.upstreamChanged, true); assert.equal(p.status, 'available');
  assert.equal(p.diff.text, ''); assert.equal(p.summary.added, 2);
});

test('legacy source must be explicit and does not silently guess from the skill name', async t => {
  const f = fixture(t, { tracked: false });
  await assert.rejects(f.updater.prepare(args()), /no recorded GitHub source/);
  assert.equal(f.calls.prepare.length, 0);
  const p = await f.updater.prepare(args({ source: 'acme/skills' }));
  assert.equal(p.untracked, true); assert.equal(p.requiresOverwrite, true); assert.equal(p.currentCommit, null);
  await assert.rejects(f.updater.apply(applyArgs(p)), /explicit backup-and-replace/);
  assert.equal(f.calls.apply.length, 0);
  await f.updater.apply(applyArgs(p, { allowLocalChanges: true }));
  assert.equal(f.calls.apply[0].payload.allowLocalChanges, true);
});

test('identical legacy snapshot registers source without replacing files or requiring force', async t => {
  const f = fixture(t, { tracked: false, proposed: tree() });
  const p = await f.updater.prepare(args({ source: SOURCE }));
  assert.equal(p.status, 'link'); assert.equal(p.hasChanges, false); assert.equal(p.requiresOverwrite, false);
  const result = await f.updater.apply(applyArgs(p));
  assert.equal(result.trackingOnly, true); assert.equal(result.backup, null); assert.equal(result.origin.commit, COMMIT);
});

test('tracked dirty snapshot already matching GitHub changes tracking only', async t => {
  const f = fixture(t, { dirty: true, proposed: tree('local edits\n') });
  const p = await f.updater.prepare(args());
  assert.equal(p.localDirty, true); assert.equal(p.hasChanges, false); assert.equal(p.requiresOverwrite, false);
  assert.equal((await f.updater.apply(applyArgs(p))).trackingOnly, true);
});

test('local replacements require explicit boolean confirmation and still reject unseen resource edits', async t => {
  const f = fixture(t, { dirty: true }); const p = await f.updater.prepare(args());
  assert.equal(p.requiresOverwrite, true);
  await assert.rejects(f.updater.apply(applyArgs(p, { allowLocalChanges: 'true' })), /must be a boolean/);
  await assert.rejects(f.updater.apply(applyArgs(p)), /explicit backup-and-replace/);
  f.state = { ...f.state, ...tree('local edits\n', [{ path: 'new.txt', type: 'file', sha256: hash('unseen'), size: 6 }]) };
  await assert.rejects(f.updater.apply(applyArgs(p, { allowLocalChanges: true })), error => error.status === 409);
  await assert.rejects(f.updater.apply(applyArgs(p, { allowLocalChanges: true })), error => error.status === 410);
});

test('reject wrong format, stale detail revision, unsafe sources and silent source retargeting before download', async t => {
  const f = fixture(t);
  for (const payload of [args({ kind: 'flat' }), args({ name: '../demo' }), args({ expectedRevision: 'stale' }), args({ source: 'acme/different' })]) await assert.rejects(f.updater.prepare(payload));
  assert.equal(f.calls.prepare.length, 0);
  const legacy = fixture(t, { tracked: false });
  for (const source of ['https://evil.example/a/b', 'acme/skills;id', 'https://token@github.com/acme/skills', 'npx skills update', '../local']) await assert.rejects(legacy.updater.prepare(args({ source })));
  assert.equal(legacy.calls.prepare.length, 0);
});

test('token binds project, scope and exact kind/name without consuming on mismatched context', async t => {
  const f = fixture(t); const p = await f.updater.prepare(args());
  for (const extra of [{ projectRoot: '/other' }, { scope: 'user' }, { name: 'other' }, { kind: 'flat' }]) await assert.rejects(f.updater.apply(applyArgs(p, extra)));
  assert.equal(f.calls.apply.length, 0);
  await f.updater.apply(applyArgs(p)); assert.equal(f.calls.apply.length, 1);
});

test('changed local provenance or files during network checking invalidate and clean the preview', async t => {
  let f;
  f = fixture(t, { prepare: () => { f.state = { ...f.state, originRevision: hash('changed origin') }; } });
  await assert.rejects(f.updater.prepare(args()), error => error.status === 409);
  assert.equal(f.pending.size, 0);
});

test('changed staged snapshot cannot be applied and consumes preview', async t => {
  const f = fixture(t); const p = await f.updater.prepare(args());
  f.proposed = tree('tampered after preview');
  await assert.rejects(f.updater.apply(applyArgs(p)), /prepared GitHub files changed/);
  assert.equal(f.calls.apply.length, 0); assert.equal(f.pending.size, 0);
});

test('preview leases reject concurrent apply/discard; failure never becomes success', async t => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { applyUpdate: async () => { started(); await gate; throw Object.assign(new Error('publication failed'), { status: 500 }); } });
  const p = await f.updater.prepare(args());
  const applying = f.updater.apply(applyArgs(p)); const rejection = assert.rejects(applying, /publication failed/);
  await ready;
  try {
    await assert.rejects(f.updater.apply(applyArgs(p)), /in use/);
    await assert.rejects(f.updater.discard({ token: p.token }), /in use/);
  } finally { release(); }
  await rejection; assert.equal(f.pending.size, 0);
});

test('unconfirmed store response is a failure and preview cannot be reused', async t => {
  const f = fixture(t, { applyUpdate: async () => ({}) }); const p = await f.updater.prepare(args());
  await assert.rejects(f.updater.apply(applyArgs(p)), /did not confirm/);
  await assert.rejects(f.updater.apply(applyArgs(p)), error => error.status === 410);
});

test('expiry, discard, three-preview cap and dispose release remote resources', async t => {
  const f = fixture(t); const previews = [];
  for (let i = 0; i < 4; i++) previews.push(await f.updater.prepare(args()));
  assert.equal(f.pending.size, 3);
  await assert.rejects(f.updater.apply(applyArgs(previews[0])), error => error.status === 410);
  f.advance(600001);
  await assert.rejects(f.updater.apply(applyArgs(previews[3])), error => error.status === 410);
  await f.updater.dispose(); assert.equal(f.pending.size, 0);
  await assert.rejects(f.updater.prepare(args()), error => error.status === 410);
});

test('aborted preparation and disposal do not leave a staged update', async t => {
  const controller = new AbortController();
  const f = fixture(t, { prepare: () => controller.abort() });
  await assert.rejects(f.updater.prepare(args(), controller.signal), error => error.status === 499);
  assert.equal(f.pending.size, 0); assert.equal(f.calls.apply.length, 0);
});

test('file comparison includes deletion, type and executable changes; list and text diff are bounded', () => {
  const changes = changedEntries([{ path: 'old', type: 'file', sha256: hash('a'), size: 1 }, { path: 'script', type: 'file', sha256: hash('a'), size: 1, executable: false }],
    [{ path: 'script', type: 'file', sha256: hash('a'), size: 1, executable: true }, { path: 'new', type: 'dir' }]);
  assert.deepEqual(changes.summary, { added: 1, modified: 1, removed: 1, total: 3 });
  const many = changedEntries([], Array.from({ length: 1000 }, (_, i) => ({ path: 'file-' + i, type: 'dir' })));
  assert.equal(many.files.length, 200); assert.equal(many.filesTruncated, true); assert.equal(many.summary.total, 1000);
  assert.deepEqual(instructionDiff('same', 'same'), { text: '', truncated: false });
  assert.match(instructionDiff('a\nb\n', 'a\nc\n').text, /-b\n\+c/);
  const long = instructionDiff('a\n'.repeat(10000), 'b\n'.repeat(10000));
  assert.equal(long.truncated, true); assert(Buffer.byteLength(long.text) < 64 * 1024);
});
