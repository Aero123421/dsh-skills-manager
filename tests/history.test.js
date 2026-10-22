import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, parse, relative, sep, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createSkillHistory } from '../skill-history.js';

const body = (suffix = '') => `---\nname: demo\ndescription: Example\n---\n${suffix}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const proof = { source: 'https://github.com/acme/skills', commit: 'a'.repeat(40) };
const ID = '12345678-1234-4234-8234-123456789abc';
async function fixture(t) {
  const base = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'dsh-skill-history-'));
  t.after(async () => { assert.ok(resolve(base).startsWith(join(await fs.realpath(tmpdir()), 'dsh-skill-history-'))); await fs.rm(base, { recursive: true, force: true }); });
  const root = join(base, '.dsh', 'skills'); await fs.mkdir(root, { recursive: true });
  const info = path => fs.lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  async function noSymlinks(path) {
    const absolute = resolve(path); let current = parse(absolute).root;
    for (const part of relative(current, absolute).split(sep).filter(Boolean)) {
      current = join(current, part); const st = await info(current);
      if (!st) break;
      if (st.isSymbolicLink()) throw Object.assign(new Error('symbolic links are not allowed'), { status: 403 });
    }
  }
  const history = createSkillHistory({ info, noSymlinks,
    readSkill: async path => { await noSymlinks(path); const raw = await fs.readFile(path); if (raw.length > 262144) throw new Error('body too large'); return { body: raw.toString('utf8'), revision: sha(raw) }; },
    validated: text => { if (!text.startsWith('---\nname: demo\n')) throw new Error('invalid skill'); return { data: { name: 'demo' } }; },
  });
  async function bundle(path, suffix = '') {
    await fs.mkdir(join(path, 'empty'), { recursive: true }); await fs.mkdir(join(path, 'scripts'));
    await fs.writeFile(join(path, 'SKILL.md'), body(suffix));
    await fs.writeFile(join(path, 'scripts', 'run.sh'), '#!/bin/sh\ntrue\n');
    await fs.chmod(join(path, 'scripts', 'run.sh'), 0o755);
    return history.snapshot(path);
  }
  const old = await bundle(join(root, 'demo'), 'original'), src = join(base, 'candidate'), next = await bundle(src, 'updated');
  const origin = history.makeOrigin('demo', proof, old.treeHash); await history.setOrigin(root, 'demo', origin);
  return { base, root, src, old, next, origin, history, bundle, target: join(root, 'demo') };
}
async function journalFixture(f, { moveOld = false, publish = false, metadata = false } = {}) {
  const p = f.history.paths(f.root, 'demo', ID), nextOrigin = f.history.makeOrigin('demo', { ...proof, commit: 'b'.repeat(40) }, f.next.treeHash);
  await fs.mkdir(p.backup, { recursive: true });
  await fs.writeFile(join(p.backup, 'origin.json'), JSON.stringify(f.origin));
  await f.history.clone(f.src, p.stage, f.next);
  await fs.writeFile(p.journal, JSON.stringify({ schema: 1, name: 'demo', id: ID, oldHash: f.old.treeHash, newHash: f.next.treeHash, oldOrigin: f.origin, newOrigin: nextOrigin }));
  if (moveOld) await fs.rename(p.target, p.tree);
  if (publish) await fs.rename(p.stage, p.target);
  if (metadata) await f.history.setOrigin(f.root, 'demo', nextOrigin);
  return { p, nextOrigin };
}

test('full-tree snapshot is deterministic and includes resources, empty directories and exact execute flags', async t => {
  const f = await fixture(t), h = f.history;
  assert.equal((await h.snapshot(f.target)).treeHash, f.old.treeHash);
  assert.equal(f.old.manifest.find(item => item.path === 'empty').type, 'dir');
  assert.equal(f.old.manifest.find(item => item.path === 'scripts/run.sh').executable, process.platform !== 'win32');
  await fs.writeFile(join(f.target, 'scripts/run.sh'), 'changed resource');
  const resource = await h.snapshot(f.target); assert.equal(resource.revision, f.old.revision); assert.notEqual(resource.treeHash, f.old.treeHash);
  await fs.rmdir(join(f.target, 'empty')); assert.notEqual((await h.snapshot(f.target)).treeHash, resource.treeHash);
  if (process.platform !== 'win32') {
    await fs.chmod(join(f.target, 'scripts/run.sh'), 0o700); const one = await h.snapshot(f.target);
    await fs.chmod(join(f.target, 'scripts/run.sh'), 0o710); assert.notEqual((await h.snapshot(f.target)).treeHash, one.treeHash);
  }
});

test('snapshot rejects linked and special resources and enforces byte, entry and depth limits', async t => {
  const f = await fixture(t);
  const huge = join(f.src, 'huge'); const handle = await fs.open(huge, 'w'); await handle.truncate(32 * 1024 * 1024 + 1); await handle.close();
  await assert.rejects(f.history.snapshot(f.src), error => error.status === 413); await fs.unlink(huge);
  let deep = f.src; for (let i = 0; i < 33; i++) { deep = join(deep, 'd'); await fs.mkdir(deep); }
  await assert.rejects(f.history.snapshot(f.src), /nesting/); await fs.rm(join(f.src, 'd'), { recursive: true });
  for (let start = 0; start < 2048; start += 64) await Promise.all(Array.from({ length: 64 }, (_, i) => fs.mkdir(join(f.src, `entry-${start + i}`))));
  await assert.rejects(f.history.snapshot(f.src), error => error.status === 413);
  const linked = join(f.target, 'linked');
  try { await fs.symlink(f.src, linked, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('symlinks require OS privilege'); throw error; }
  await assert.rejects(f.history.snapshot(f.target), /symbolic/);
});

test('origin records are canonical, bounded, outside discovery and malformed state is explicit', async t => {
  const f = await fixture(t), p = f.history.paths(f.root, 'demo');
  assert.equal(dirname(dirname(p.directory)), dirname(f.root));
  const state = await f.history.readOrigin(f.root, 'demo'); assert.deepEqual(state.origin, f.origin); assert.match(state.originRevision, /^[a-f0-9]{64}$/);
  assert.throws(() => f.history.makeOrigin('demo', { ...proof, source: 'https://evil.test/a/b' }, f.old.treeHash), /source/);
  for (const raw of ['{', 'null', JSON.stringify({ ...f.origin, commit: 'bad' }), JSON.stringify({ ...f.origin, extra: '/tmp/authority' }), ' '.repeat(16385)]) {
    await fs.writeFile(p.origin, raw); await assert.rejects(f.history.readOrigin(f.root, 'demo'), /malformed|oversized/);
  }
});

test('publication retains complete original backup and origin while replacing the full tree', async t => {
  const f = await fixture(t), origin = f.history.makeOrigin('demo', { ...proof, commit: 'b'.repeat(40) }, f.next.treeHash);
  const result = await f.history.publish(f.root, 'demo', f.src, f.next, f.old, origin);
  assert.match(result.backup.id, /^[a-f0-9-]{36}$/);
  assert.equal((await f.history.snapshot(join(result.backup.path, 'tree'))).treeHash, f.old.treeHash);
  assert.deepEqual(JSON.parse(await fs.readFile(join(result.backup.path, 'origin.json'), 'utf8')), f.origin);
  assert.equal((await f.history.snapshot(f.target)).treeHash, f.next.treeHash);
  assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, origin);
  assert.deepEqual(await f.history.pendingNames(f.root), []);
});

test('journal creation, tree publication and metadata failures preserve or roll back the original', async t => {
  for (const point of ['journal', 'publish', 'metadata']) await t.test(point, async t => {
    const f = await fixture(t), originalRename = fs.rename, originalLink = fs.link;
    let injected = false;
    if (point === 'journal') t.mock.method(fs, 'link', async (source, target) => {
      if (basename(target) === 'journal.json') { injected = true; throw new Error('injected journal failure'); }
      return originalLink(source, target);
    });
    else t.mock.method(fs, 'rename', async (source, target) => {
      if (!injected && (point === 'publish' && target === f.target && basename(source).startsWith('stage-') || point === 'metadata' && basename(target) === 'origin.json' && basename(dirname(target)) === 'demo')) {
        injected = true; throw new Error(`injected ${point} failure`);
      }
      return originalRename(source, target);
    });
    await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, f.old, f.history.makeOrigin('demo', proof, f.next.treeHash)), /injected/);
    assert.equal(injected, true); assert.equal((await f.history.snapshot(f.target)).treeHash, f.old.treeHash);
    assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, f.origin);
    assert.deepEqual(await f.history.pendingNames(f.root), []);
  });
});

test('verified committed publication returns backup and warning after transient journal finalization errors', async t => {
  for (const afterUnlink of [false, true]) await t.test(afterUnlink ? 'after unlink' : 'before unlink', async t => {
    const f = await fixture(t), unlink = fs.unlink; let injected = false;
    t.mock.method(fs, 'unlink', async path => {
      if (!injected && basename(path) === 'journal.json') {
        injected = true; if (afterUnlink) await unlink(path);
        throw new Error('transient journal finalization failure');
      }
      return unlink(path);
    });
    const origin = f.history.makeOrigin('demo', proof, f.next.treeHash);
    const result = await f.history.publish(f.root, 'demo', f.src, f.next, f.old, origin);
    assert.match(result.warning, /committed and verified/);
    assert.equal((await f.history.snapshot(join(result.backup.path, 'tree'))).treeHash, f.old.treeHash);
    assert.equal((await f.history.snapshot(f.target)).treeHash, f.next.treeHash);
    assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, origin);
    assert.deepEqual(await f.history.pendingNames(f.root), []);
  });
});

function failOriginDirectorySyncOnce(t, originPath) {
  const rename = fs.rename, open = fs.open; let renamed = false, injected = false;
  t.mock.method(fs, 'rename', async (source, target) => {
    const result = await rename(source, target); if (target === originPath) renamed = true; return result;
  });
  t.mock.method(fs, 'open', async (path, ...args) => {
    let handle;
    try { handle = await open(path, ...args); }
    catch (error) {
      // Windows may not expose directory handles. Still exercise the same
      // post-rename sync failure branch there without skipping the whole test.
      if (process.platform !== 'win32' || !renamed || injected || path !== dirname(originPath) ||
          !['EPERM', 'EACCES', 'EISDIR'].includes(error.code)) throw error;
      handle = { async sync() {}, async close() {} };
    }
    if (renamed && !injected && path === dirname(originPath)) {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { if (!injected) { injected = true; throw new Error('injected post-rename directory fsync failure'); } return sync(); };
    }
    return handle;
  });
}

test('post-rename metadata fsync errors are verified for full publication and metadata-only registration', async t => {
  for (const metadataOnly of [false, true]) await t.test(metadataOnly ? 'metadata only' : 'full tree', async t => {
    const f = await fixture(t), expected = metadataOnly ? f.old : f.next;
    const origin = f.history.makeOrigin('demo', { ...proof, commit: 'd'.repeat(40) }, expected.treeHash);
    failOriginDirectorySyncOnce(t, f.history.paths(f.root, 'demo').origin);
    const result = metadataOnly ? await f.history.setOriginConfirmed(f.root, 'demo', origin, f.old.treeHash) :
      await f.history.publish(f.root, 'demo', f.src, f.next, f.old, origin);
    assert.match(result.warning, /committed and verified/);
    assert.equal((await f.history.snapshot(f.target)).treeHash, expected.treeHash);
    assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, origin);
    assert.deepEqual(await f.history.pendingNames(f.root), []);
  });
});

test('repeated journal and publication failures do not consume backup capacity without original trees', async t => {
  for (const point of ['journal', 'publish']) await t.test(point, async t => {
    const f = await fixture(t), rename = fs.rename, link = fs.link;
    const mock = point === 'journal' ? t.mock.method(fs, 'link', async (source, target) => {
      if (basename(target) === 'journal.json') throw new Error('injected journal failure'); return link(source, target);
    }) : t.mock.method(fs, 'rename', async (source, target) => {
      if (target === f.target && basename(source).startsWith('stage-')) throw new Error('injected publish failure'); return rename(source, target);
    });
    const origin = f.history.makeOrigin('demo', proof, f.next.treeHash);
    for (let i = 0; i < 12; i++) await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, f.old, origin), /injected/);
    assert.deepEqual(await fs.readdir(f.history.paths(f.root, 'demo').backups), []);
    assert.equal((await f.history.snapshot(f.target)).treeHash, f.old.treeHash);
    mock.mock.restore(); const result = await f.history.publish(f.root, 'demo', f.src, f.next, f.old, origin);
    assert.ok(result.backup); assert.equal((await f.history.snapshot(join(result.backup.path, 'tree'))).treeHash, f.old.treeHash);
  });
});

test('journal-finalization failures retain committed backup and intent until lazy recovery can finish', async t => {
  const f = await fixture(t), unlink = fs.unlink;
  const mock = t.mock.method(fs, 'unlink', async path => {
    if (basename(path) === 'journal.json') throw new Error('injected journal cleanup failure');
    return unlink(path);
  });
  const origin = f.history.makeOrigin('demo', proof, f.next.treeHash);
  await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, f.old, origin), /recovery blocked/);
  assert.deepEqual(await f.history.pendingNames(f.root), ['demo']);
  assert.equal((await f.history.snapshot(f.target)).treeHash, f.next.treeHash);
  const journal = JSON.parse(await fs.readFile(f.history.paths(f.root, 'demo').journal));
  const p = f.history.paths(f.root, 'demo', journal.id);
  assert.equal((await f.history.snapshot(p.tree)).treeHash, f.old.treeHash);
  mock.mock.restore(); await f.history.recover(f.root, 'demo');
  assert.deepEqual(await f.history.pendingNames(f.root), []); assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, origin);
  assert.equal((await f.history.snapshot(p.tree)).treeHash, f.old.treeHash);
});

test('verified install metadata failures roll publication back without losing a stale original record', async t => {
  const f = await fixture(t); await fs.rm(f.target, { recursive: true });
  const rename = fs.rename; let injected = false;
  t.mock.method(fs, 'rename', async (source, target) => {
    if (!injected && basename(target) === 'origin.json' && basename(dirname(target)) === 'demo') { injected = true; throw new Error('injected origin failure'); }
    return rename(source, target);
  });
  await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, null, f.history.makeOrigin('demo', proof, f.next.treeHash)), /origin failure/);
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
  assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, f.origin);
  assert.deepEqual(await f.history.pendingNames(f.root), []);
});

test('failed rollback retains durable journal and original backup; next operation recovers', async t => {
  const f = await fixture(t), rename = fs.rename; let published = false;
  const mock = t.mock.method(fs, 'rename', async (source, target) => {
    if (basename(target) === 'origin.json' && basename(dirname(target)) === 'demo') throw new Error('injected metadata failure');
    if (source === f.target && basename(target).startsWith('stage-')) { published = true; throw new Error('injected rollback failure'); }
    return rename(source, target);
  });
  await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, f.old, f.history.makeOrigin('demo', proof, f.next.treeHash)), /recovery blocked/);
  assert.equal(published, true); assert.deepEqual(await f.history.pendingNames(f.root), ['demo']);
  const p = f.history.paths(f.root, 'demo'), journal = JSON.parse(await fs.readFile(p.journal, 'utf8'));
  assert.equal((await f.history.snapshot(f.history.paths(f.root, 'demo', journal.id).tree)).treeHash, f.old.treeHash);
  mock.mock.restore(); await f.history.recover(f.root, 'demo');
  assert.equal((await f.history.snapshot(f.target)).treeHash, f.old.treeHash); assert.deepEqual(await f.history.pendingNames(f.root), []);
});

test('lazy recovery handles every durable crash boundary without losing the old tree', async t => {
  for (const [label, options] of [['intent', {}], ['old moved', { moveOld: true }], ['published', { moveOld: true, publish: true }], ['complete', { moveOld: true, publish: true, metadata: true }]]) await t.test(label, async t => {
    const f = await fixture(t), { p, nextOrigin } = await journalFixture(f, options);
    await f.history.recover(f.root, 'demo');
    assert.equal((await f.history.snapshot(f.target)).treeHash, options.metadata ? f.next.treeHash : f.old.treeHash);
    assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, options.metadata ? nextOrigin : f.origin);
    await assert.rejects(fs.stat(p.journal), { code: 'ENOENT' });
    if (options.metadata) assert.equal((await f.history.snapshot(p.tree)).treeHash, f.old.treeHash);
  });
});

test('ambiguous recovery, changed external files and readonly recovery preserve all data and block', async t => {
  const f = await fixture(t), { p } = await journalFixture(f, { moveOld: true, publish: true });
  await assert.rejects(f.history.recover(f.root, 'demo', false), error => error.status === 403);
  await fs.writeFile(join(f.target, 'external.txt'), 'must not be deleted');
  await assert.rejects(f.history.recover(f.root, 'demo'), /target changed/);
  assert.equal(await fs.readFile(join(f.target, 'external.txt'), 'utf8'), 'must not be deleted');
  assert.equal((await f.history.snapshot(p.tree)).treeHash, f.old.treeHash); assert.ok(await fs.stat(p.journal));
  const invalid = JSON.parse(await fs.readFile(p.journal, 'utf8')); invalid.id = '../../escape'; await fs.writeFile(p.journal, JSON.stringify(invalid));
  await assert.rejects(f.history.recover(f.root, 'demo'), /malformed/);
});

test('backup retention limits refuse before staging or moving originals', async t => {
  const f = await fixture(t), p = f.history.paths(f.root, 'demo'); await fs.mkdir(p.backups);
  for (let i = 0; i < 10; i++) await fs.mkdir(join(p.backups, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));
  await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, f.old, f.history.makeOrigin('demo', proof, f.next.treeHash)), error => error.status === 413);
  assert.equal((await f.history.snapshot(f.target)).treeHash, f.old.treeHash);
  assert.deepEqual((await fs.readdir(p.directory)).sort(), ['backups', 'origin.json']);
});

test('untracked installs clear stale provenance transactionally and failed metadata does not leave a new target', async t => {
  const f = await fixture(t); await fs.rm(f.target, { recursive: true });
  const rename = fs.rename; let injected = false;
  t.mock.method(fs, 'rename', async (source, target) => {
    if (!injected && target === f.target) { injected = true; throw new Error('publish failed'); }
    return rename(source, target);
  });
  await assert.rejects(f.history.publish(f.root, 'demo', f.src, f.next, null, null), /publish failed/);
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' }); assert.deepEqual((await f.history.readOrigin(f.root, 'demo')).origin, f.origin);
  await f.history.publish(f.root, 'demo', f.src, f.next, null, null);
  assert.equal((await f.history.readOrigin(f.root, 'demo')).origin, null);
});
