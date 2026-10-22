/** Bounded provenance and recoverable bundle publication.
 * These are local-owner safeguards, NOT a race-proof OS sandbox or a claim of
 * cross-process filesystem transactions. Every recovery decision is conservative:
 * unfamiliar content is retained and blocks the operation for manual inspection.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseGithubSource } from './github-source.js';

const MAX_BYTES = 32 * 1024 * 1024, MAX_ENTRIES = 2048, MAX_JSON = 16384;
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const failure = (message, status = 409) => Object.assign(new Error(message), { status });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function nameCheck(name) { if (typeof name !== 'string' || name.length > 64 || !NAME.test(name)) throw failure('invalid history name', 400); }
function keys(value, expected) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(','); }

export function createSkillHistory({ noSymlinks, info, readSkill, validated }) {
  function paths(root, name, id) {
    nameCheck(name);
    const base = join(dirname(resolve(root)), 'skills-manager'), directory = join(base, name);
    if (id !== undefined && !UUID.test(id)) throw failure('invalid transaction id');
    return { base, directory, origin: join(directory, 'origin.json'), journal: join(directory, 'journal.json'),
      target: join(root, name), backups: join(directory, 'backups'),
      ...(id && { stage: join(directory, `stage-${id}`), backup: join(directory, 'backups', id), tree: join(directory, 'backups', id, 'tree') }) };
  }
  async function syncDirectory(path) {
    let handle;
    try { handle = await fs.open(path, constants.O_RDONLY); await handle.sync(); }
    catch (error) { if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES'].includes(error.code) || process.platform !== 'win32' && ['EPERM', 'EACCES'].includes(error.code)) throw error; }
    finally { await handle?.close(); }
  }
  async function directory(path) {
    await noSymlinks(path);
    const created = []; let ancestor = path;
    while (!(await info(ancestor))) { created.push(ancestor); ancestor = dirname(ancestor); }
    await fs.mkdir(path, { recursive: true, mode: 0o700 }); await noSymlinks(path);
    if (!(await info(path))?.isDirectory()) throw failure('history path must be a directory');
    await syncDirectory(path);
    // Persist every newly created ancestor entry, not just the final directory.
    for (const child of created) await syncDirectory(dirname(child));
  }
  async function bytes(path, max = MAX_JSON) {
    await noSymlinks(path);
    const st = await info(path);
    if (!st) return null;
    if (!st.isFile() || st.size > max) throw failure('invalid or oversized history file');
    const handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > max) throw failure('invalid or oversized history file');
      const chunks = []; let count = 0;
      while (true) {
        const buffer = Buffer.alloc(Math.min(65536, max - count + 1));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        count += bytesRead;
        if (count > max) throw failure('file exceeds byte limit', 413);
        chunks.push(buffer.subarray(0, bytesRead));
      }
      return Buffer.concat(chunks, count);
    } finally { await handle.close(); }
  }
  function originCheck(value, name) {
    if (value === null) return null;
    if (!keys(value, ['schema', 'name', 'kind', 'source', 'commit', 'baselineHash', 'updatedAt']) || value.schema !== 1 || value.name !== name || value.kind !== 'dir' ||
      typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/.test(value.commit) || !HASH.test(value.baselineHash) ||
      typeof value.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) throw failure('malformed skill origin record');
    try { if (parseGithubSource(value.source).display !== value.source) throw new Error(); }
    catch { throw failure('malformed skill origin source'); }
    return value;
  }
  function makeOrigin(name, proof, treeHash) {
    if (!proof || typeof proof.commit !== 'string' || !/^[a-f0-9]{40}$/i.test(proof.commit) || !HASH.test(treeHash)) throw failure('invalid verified GitHub provenance', 400);
    let source;
    try { source = parseGithubSource(proof.source).display; } catch { throw failure('invalid verified GitHub source', 400); }
    return originCheck({ schema: 1, name, kind: 'dir', source, commit: proof.commit.toLowerCase(), baselineHash: treeHash, updatedAt: new Date().toISOString() }, name);
  }
  async function readOrigin(root, name) {
    const raw = await bytes(paths(root, name).origin);
    if (!raw) return { origin: null, originRevision: null };
    let value;
    try { value = JSON.parse(raw.toString('utf8')); } catch { throw failure('malformed skill origin JSON'); }
    if (value === null) throw failure('malformed skill origin record');
    return { origin: originCheck(value, name), originRevision: digest(raw) };
  }
  async function writeJSON(path, value, exclusive = false) {
    await noSymlinks(path);
    const raw = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(raw) > MAX_JSON) throw failure('history JSON exceeds limit');
    const temp = join(dirname(path), `.json-${randomUUID()}`);
    let handle;
    try {
      handle = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      await handle.writeFile(raw); await handle.sync(); await handle.close(); handle = null;
      await noSymlinks(path);
      if (exclusive) await fs.link(temp, path); else await fs.rename(temp, path);
      await syncDirectory(dirname(path));
    } finally { await handle?.close(); await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function unlink(path) { await noSymlinks(path); await fs.unlink(path); await syncDirectory(dirname(path)); }
  async function setOrigin(root, name, origin) {
    const p = paths(root, name); await directory(p.directory);
    if (origin) await writeJSON(p.origin, originCheck(origin, name));
    else if (await info(p.origin)) await unlink(p.origin);
  }
  async function setOriginConfirmed(root, name, origin, expectedTreeHash) {
    const p = paths(root, name);
    try { await setOrigin(root, name, origin); return {}; }
    catch (error) {
      // Metadata-only registration also has a rename + fsync boundary. Verify
      // BOTH the full unchanged target and intended record, then durably sync.
      // Rollback/publication retain strict low-level setOrigin semantics.
      if (await hashIfPresent(p.target) === expectedTreeHash && same((await readOrigin(root, name)).origin, origin)) {
        await syncDirectory(p.directory);
        return { warning: `provenance committed and verified after write error: ${error.message}` };
      }
      throw error;
    }
  }
  async function snapshot(srcDir) {
    const src = resolve(srcDir); await noSymlinks(src);
    if (!(await info(src))?.isDirectory()) throw failure('bundle must be a directory', 400);
    const manifest = [], hashEntries = []; let size = 0;
    async function walk(directory, depth) {
      if (depth > 32) throw failure('bundle nesting too deep', 400);
      const entries = (await fs.readdir(directory)).sort();
      for (const entry of entries) {
        const path = join(directory, entry), st = await fs.lstat(path), rel = relative(src, path).split(sep).join('/');
        if (st.isSymbolicLink()) throw failure('bundle symbolic links are not allowed', 403);
        if (!st.isFile() && !st.isDirectory()) throw failure('bundle must contain only regular files and directories', 400);
        if (manifest.length >= MAX_ENTRIES) throw failure('bundle too large', 413);
        if (st.isDirectory()) {
          manifest.push({ path: rel, type: 'dir' }); hashEntries.push({ path: rel, type: 'dir' });
          await walk(path, depth + 1);
        } else {
          if (size + st.size > MAX_BYTES) throw failure('bundle too large', 413);
          const raw = await bytes(path, MAX_BYTES - size);
          if (!raw) throw failure('bundle changed during snapshot');
          size += raw.length;
          const executeBits = process.platform === 'win32' ? 0 : st.mode & 0o111;
          const item = { path: rel, type: 'file', sha256: digest(raw), size: raw.length, executable: executeBits !== 0, executeBits };
          manifest.push(item); hashEntries.push(item);
        }
      }
    }
    await walk(src, 0);
    const current = await readSkill(join(src, 'SKILL.md'));
    const skillEntry = manifest.find(item => item.path === 'SKILL.md' && item.type === 'file');
    if (!skillEntry || skillEntry.sha256 !== current.revision) throw failure('bundle changed during snapshot');
    return { ...current, treeHash: digest(JSON.stringify(hashEntries)), manifest, size };
  }
  async function clone(src, dest, expected) {
    await noSymlinks(src); await noSymlinks(dest);
    await fs.mkdir(dest, { mode: 0o700 });
    let total = 0;
    for (const item of expected.manifest) {
      const source = join(src, ...item.path.split('/')), target = join(dest, ...item.path.split('/'));
      if (item.type === 'dir') { await fs.mkdir(target, { mode: 0o700 }); continue; }
      await noSymlinks(source);
      const raw = await bytes(source, MAX_BYTES - total); total += raw?.length ?? 0;
      if (!raw || digest(raw) !== item.sha256) throw failure('candidate changed during copy');
      const inputStat = await fs.lstat(source);
      const output = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), inputStat.mode & 0o777);
      try { await output.writeFile(raw); await output.chmod(inputStat.mode & 0o777); await output.sync(); } finally { await output.close(); }
    }
    for (const item of [...expected.manifest].reverse()) if (item.type === 'dir') await syncDirectory(join(dest, ...item.path.split('/')));
    await syncDirectory(dest);
    const copied = await snapshot(dest);
    if (copied.treeHash !== expected.treeHash) throw failure('candidate changed during copy');
    return copied;
  }
  function journalCheck(value, name) {
    if (!keys(value, ['schema', 'name', 'id', 'oldHash', 'newHash', 'oldOrigin', 'newOrigin']) || value.schema !== 1 || value.name !== name || !UUID.test(value.id) ||
      value.oldHash !== null && !HASH.test(value.oldHash) || !HASH.test(value.newHash)) throw failure('malformed skill transaction journal');
    originCheck(value.oldOrigin, name); originCheck(value.newOrigin, name);
    return value;
  }
  async function readJournal(root, name) {
    const raw = await bytes(paths(root, name).journal);
    if (!raw) return null;
    let value;
    try { value = JSON.parse(raw.toString('utf8')); } catch { throw failure('malformed skill transaction journal'); }
    return journalCheck(value, name);
  }
  async function hashIfPresent(path) {
    await noSymlinks(path);
    return await info(path) ? (await snapshot(path)).treeHash : null;
  }
  async function move(source, target) {
    await noSymlinks(source); await noSymlinks(target);
    if (await info(target)) throw failure('recovery destination is occupied; manual inspection required');
    await fs.rename(source, target); await syncDirectory(dirname(source));
    if (dirname(source) !== dirname(target)) await syncDirectory(dirname(target));
  }
  async function discardStage(p, hash) {
    if (!(await info(p.stage))) return;
    if (await hashIfPresent(p.stage) !== hash) throw failure('staged tree changed; manual recovery required');
    // p.stage is derived exclusively from a validated UUID, never client authority.
    await noSymlinks(p.stage); await fs.rm(p.stage, { recursive: true }); await syncDirectory(p.directory);
  }
  async function discardEmptyBackup(p, expectedOrigin) {
    await noSymlinks(p.backup);
    if (!(await info(p.backup))) return;
    const entries = await fs.readdir(p.backup);
    // Only this transaction's derived UUID container may be cleaned. Never
    // remove a tree (including an unfamiliar one) or unexpected owner content.
    if (entries.some(entry => entry !== 'origin.json')) return;
    if (entries.includes('origin.json')) {
      const raw = await bytes(join(p.backup, 'origin.json'));
      let origin;
      try { origin = JSON.parse(raw); } catch { return; }
      if (!same(origin, expectedOrigin)) return;
      await unlink(join(p.backup, 'origin.json'));
    }
    // rmdir, not recursive rm: a newly appeared file causes refusal, not loss.
    await fs.rmdir(p.backup); await syncDirectory(p.backups);
  }
  async function finishJournal(p) {
    await noSymlinks(p.journal);
    try { await fs.unlink(p.journal); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await syncDirectory(p.directory);
  }
  async function recover(root, name, writable = true, ownIntent = null) {
    // ownIntent is used only by this process's failed publication when unlink
    // removed the journal but its following fsync failed. Restart recovery never
    // invents an intent for an absent journal.
    const journal = await readJournal(root, name) ?? (ownIntent ? journalCheck(ownIntent, name) : null);
    if (!journal) return;
    if (!writable) throw failure('pending skill transaction requires recovery; user writes disabled', 403);
    const p = paths(root, name, journal.id);
    const targetHash = await hashIfPresent(p.target), backupHash = await hashIfPresent(p.tree), stageHash = await hashIfPresent(p.stage);
    const { origin } = await readOrigin(root, name);
    if (!same(origin, journal.oldOrigin) && !same(origin, journal.newOrigin)) throw failure('origin changed during transaction; manual recovery required');
    if (stageHash !== null && stageHash !== journal.newHash) throw failure('staged tree changed; manual recovery required');
    if (backupHash !== null && backupHash !== journal.oldHash) throw failure('backup changed; manual recovery required');
    if (targetHash === journal.newHash && same(origin, journal.newOrigin) && (journal.oldHash === null || backupHash === journal.oldHash)) {
      // Publication and metadata are complete. Preserve the original backup.
      await discardStage(p, journal.newHash); await finishJournal(p); return { committed: true };
    }
    if (targetHash === journal.oldHash && backupHash === null) {
      // No tree moved, or rollback completed before the process stopped.
      if (!same(origin, journal.oldOrigin)) await setOrigin(root, name, journal.oldOrigin);
      await discardStage(p, journal.newHash); await discardEmptyBackup(p, journal.oldOrigin); await finishJournal(p); return { committed: false };
    }
    if (journal.oldHash !== null && backupHash !== journal.oldHash) throw failure('original tree unavailable; manual recovery required');
    if (targetHash !== null && targetHash !== journal.newHash) throw failure('target changed during transaction; manual recovery required');
    if (targetHash !== null) {
      if (stageHash !== null) throw failure('both published and staged trees exist; manual recovery required');
      await move(p.target, p.stage); // Never delete a published target to roll back.
    }
    if (journal.oldHash !== null) await move(p.tree, p.target);
    await setOrigin(root, name, journal.oldOrigin);
    await discardStage(p, journal.newHash); await discardEmptyBackup(p, journal.oldOrigin); await finishJournal(p);
    return { committed: false };
  }
  async function pendingNames(root) {
    const base = paths(root, 'history').base; await noSymlinks(base);
    if (!(await info(base))) return [];
    const entries = await fs.readdir(base, { withFileTypes: true });
    if (entries.length > 10000) throw failure('history directory exceeds entry limit');
    const names = [];
    for (const entry of entries) {
      nameCheck(entry.name); await noSymlinks(join(base, entry.name));
      if (!entry.isDirectory()) throw failure('invalid history directory entry');
      if (await info(paths(root, entry.name).journal)) names.push(entry.name);
    }
    return names;
  }
  async function checkBackupBudget(root, name, bytesNeeded) {
    const p = paths(root, name); await noSymlinks(p.backups);
    if (!(await info(p.backups))) return;
    const entries = await fs.readdir(p.backups, { withFileTypes: true });
    if (entries.length >= 10) throw failure('backup limit reached (10/name); archive backups before updating', 413);
    let total = bytesNeeded;
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID.test(entry.name)) throw failure('invalid backup directory; manual inspection required');
      const backup = paths(root, name, entry.name);
      const children = await fs.readdir(backup.backup);
      if (children.some(child => !['tree', 'origin.json'].includes(child))) throw failure('unexpected backup contents');
      if (await info(backup.tree)) total += (await snapshot(backup.tree)).size;
      const raw = await bytes(join(backup.backup, 'origin.json'));
      if (raw) {
        let origin; try { origin = JSON.parse(raw); } catch { throw failure('malformed backup origin'); }
        originCheck(origin, name); total += raw.length;
      }
      if (total > 256 * 1024 * 1024) throw failure('backup byte limit reached (256 MiB/name)', 413);
    }
  }
  async function publish(root, name, srcDir, expected, current, newOrigin, expectedOriginRevision) {
    const id = randomUUID(), p = paths(root, name, id);
    const { origin: oldOrigin, originRevision: oldOriginRevision } = await readOrigin(root, name);
    if (expectedOriginRevision !== undefined && oldOriginRevision !== expectedOriginRevision) throw failure('skill provenance changed during staging');
    if (current) await checkBackupBudget(root, name, current.size + MAX_JSON);
    await directory(p.directory); await directory(root);
    let journalWritten = false;
    const journal = { schema: 1, name, id, oldHash: current?.treeHash ?? null, newHash: expected.treeHash, oldOrigin, newOrigin };
    try {
      await clone(srcDir, p.stage, expected);
      // Recheck after potentially slow staging, before creating the durable intent.
      if (await hashIfPresent(p.target) !== journal.oldHash || (await readOrigin(root, name)).originRevision !== oldOriginRevision) throw failure('skill changed during staging');
      if (current) {
        await directory(p.backups); await fs.mkdir(p.backup, { mode: 0o700 }); await syncDirectory(p.backups);
        await writeJSON(join(p.backup, 'origin.json'), oldOrigin, true);
      }
      await writeJSON(p.journal, journal, true); journalWritten = true;
      if (current) await move(p.target, p.tree);
      await move(p.stage, p.target);
      await setOrigin(root, name, newOrigin);
      await unlink(p.journal); journalWritten = false;
      return { backup: current ? { id, path: p.backup } : null };
    } catch (error) {
      // A failed fsync/link can mean the journal exists despite a rejected call.
      if (journalWritten || await info(p.journal)) {
        try {
          const outcome = await recover(root, name, true, journalWritten ? journal : null);
          if (outcome?.committed) return { backup: current ? { id, path: p.backup } : null, warning: `publication committed and verified during recovery: ${error.message}` };
        } catch (recovery) { throw failure(`${error.message}; recovery blocked: ${recovery.message}; retained journal ${p.journal}`, 500); }
      } else {
        // This stage was generated by this operation and never published. Only
        // discard it if its full verified contents still match; otherwise retain.
        if (await info(p.stage)) {
          try { await discardStage(p, expected.treeHash); }
          catch (stageError) { error.message += `; staging retained at ${p.stage}: ${stageError.message}`; }
        }
        try { await discardEmptyBackup(p, oldOrigin); }
        catch (cleanup) { error.message += `; metadata container retained at ${p.backup}: ${cleanup.message}`; }
      }
      throw error;
    }
  }
  return { snapshot, clone, readOrigin, makeOrigin, setOrigin, setOriginConfirmed, recover, pendingNames, publish, paths };
}
