/** GitHub update orchestration. All filesystem publication is delegated to the
 * shared, identity-locked history store; staged paths never cross the HTTP API. */
import { randomUUID } from 'node:crypto';
import { parseGithubSource } from './github-source.js';

const TTL = 10 * 60 * 1000;
const SHA = /^[a-f0-9]{40}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const check = signal => { if (signal?.aborted) throw fail('GitHub update operation aborted', 499); };
function sourceOf(value) {
  try { return parseGithubSource(value).display; }
  catch (error) { throw fail(error.message, 400); }
}
function context(payload) {
  return { scope: payload.scope ?? 'project', ...(payload.projectRoot !== undefined && { projectRoot: payload.projectRoot }) };
}
function identity(payload) {
  if (!payload || typeof payload !== 'object' || payload.kind !== 'dir' ||
      typeof payload.name !== 'string' || payload.name.length > 64 || !NAME.test(payload.name)) {
    throw fail('GitHub updates require an exact directory skill identity');
  }
}
function sameContext(payload, ticket) {
  return (payload.scope ?? 'project') === ticket.context.scope &&
    (ticket.context.scope !== 'project' || payload.projectRoot === ticket.context.projectRoot) &&
    payload.name === ticket.name && payload.kind === ticket.kind;
}
function snapshotValid(snapshot) {
  if (!snapshot || !HASH.test(snapshot.treeHash ?? '') || !Array.isArray(snapshot.manifest) || typeof snapshot.body !== 'string') {
    throw fail('invalid skill snapshot', 500);
  }
}
function entrySignature(entry) {
  return JSON.stringify([entry.type, entry.sha256 ?? null, entry.size ?? null, entry.executeBits ?? (entry.executable ? 0o111 : 0)]);
}
/** Entry changes include empty directories and execute-bit changes, not just markdown. */
export function changedEntries(before, after) {
  const old = new Map(before.map(entry => [entry.path, entry]));
  const next = new Map(after.map(entry => [entry.path, entry]));
  const files = [];
  const summary = { added: 0, modified: 0, removed: 0, total: 0 };
  for (const path of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const a = old.get(path), b = next.get(path);
    const status = !a ? 'added' : !b ? 'removed' : entrySignature(a) !== entrySignature(b) ? 'modified' : null;
    if (!status) continue;
    summary[status]++; summary.total++;
    if (files.length < 200) files.push({ path, status, ...(a && { oldType: a.type, oldSize: a.size }), ...(b && { newType: b.type, newSize: b.size }) });
  }
  return { summary, files, filesTruncated: summary.total > files.length };
}
/** Bounded LCS for ordinary SKILL.md files. Large inputs use an explicitly
 * truncated whole-block comparison, never unbounded quadratic work. */
export function instructionDiff(before, after) {
  if (before === after) return { text: '', truncated: false };
  const a = before.split('\n'), b = after.split('\n');
  if (a.length > 500 || b.length > 500 || Buffer.byteLength(before) + Buffer.byteLength(after) > 48 * 1024) {
    const clip = text => Buffer.from(text).subarray(0, 20 * 1024).toString('utf8').split('\n').slice(0, 250);
    return { text: ['--- installed (limited preview)', '+++ GitHub (limited preview)',
      ...clip(before).map(line => '-' + line), ...clip(after).map(line => '+' + line)].join('\n'), truncated: true };
  }
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  }
  const lines = ['--- installed', '+++ GitHub'];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { lines.push(' ' + a[i]); i++; j++; }
    else if (j < b.length && (i === a.length || rows[i][j + 1] > rows[i + 1][j])) lines.push('+' + b[j++]);
    else lines.push('-' + a[i++]);
  }
  return { text: lines.join('\n'), truncated: false };
}

export function createGithubUpdater({ remote, getState, snapshotCandidate, applyUpdate, now = Date.now }) {
  if (!remote || !['prepare', 'withPrepared', 'discard'].every(key => typeof remote[key] === 'function') ||
      ![getState, snapshotCandidate, applyUpdate, now].every(fn => typeof fn === 'function')) throw new TypeError('GitHub update callbacks are required');
  const tickets = new Map(), operations = new Set();
  let disposed = false;
  function operate(signal, work) {
    if (disposed) return Promise.reject(fail('GitHub updater disposed', 410));
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const operation = { controller };
    operations.add(operation);
    operation.done = (async () => {
      try { check(controller.signal); return await work(controller.signal); }
      finally { signal?.removeEventListener('abort', abort); operations.delete(operation); }
    })();
    return operation.done;
  }
  async function drop(token, ticket) {
    if (tickets.get(token) === ticket) tickets.delete(token);
    clearTimeout(ticket.timer);
    await remote.discard({ ...ticket.context, token: ticket.remoteToken }).catch(() => {});
  }
  async function prune() {
    for (const [token, ticket] of tickets) if (!ticket.busy && ticket.expiresAt <= now()) await drop(token, ticket);
  }
  return {
    prepare(payload, signal) {
      return operate(signal, async activeSignal => {
        identity(payload);
        const originContext = context(payload);
        const state = await getState({ ...originContext, name: payload.name, kind: 'dir' });
        snapshotValid(state);
        if (payload.expectedRevision !== undefined && payload.expectedRevision !== state.revision) throw fail('skill changed; reload its detail before checking updates', 409);
        let source;
        if (state.origin) {
          source = sourceOf(state.origin.source);
          if (payload.source !== undefined && sourceOf(payload.source) !== source) throw fail('tracked GitHub source changed; do not silently retarget an update', 409);
        } else {
          if (typeof payload.source !== 'string' || !payload.source) throw fail('this skill has no recorded GitHub source; enter its repository explicitly');
          source = sourceOf(payload.source);
        }
        check(activeSignal);
        await prune();
        let prepared, retained = false;
        try {
          prepared = await remote.prepare({ ...originContext, input: `npx skills add ${source} --skill ${state.name}` }, activeSignal);
          check(activeSignal);
          if (!prepared?.token || !Number.isFinite(prepared.expiresAt)) throw fail('invalid remote preview response', 502);
          const candidate = await remote.withPrepared({ ...originContext, token: prepared.token }, activeSignal, async snapshot => {
            if (snapshot.source !== source || !SHA.test(snapshot.commit ?? '')) throw fail('remote source is not bound to a verified GitHub commit', 502);
            const skill = snapshot.skills.get(state.name);
            if (!skill) throw fail('GitHub source no longer contains this exact skill name', 404);
            const tree = await snapshotCandidate(skill.srcDir);
            snapshotValid(tree);
            return { ...tree, source: snapshot.source, commit: snapshot.commit };
          });
          check(activeSignal);
          // Fetching can take time: do not preview stale local files or provenance.
          const current = await getState({ ...originContext, name: state.name, kind: 'dir' });
          if (current.root !== state.root || current.scope !== state.scope || current.treeHash !== state.treeHash || current.originRevision !== state.originRevision) {
            throw fail('skill files or GitHub association changed while checking; prepare again', 409);
          }
          const hasChanges = candidate.treeHash !== state.treeHash;
          const upstreamChanged = !state.origin || candidate.treeHash !== state.origin.baselineHash;
          const localDirty = state.origin ? state.treeHash !== state.origin.baselineHash : hasChanges;
          const canApply = !state.origin || upstreamChanged;
          const requiresOverwrite = canApply && hasChanges && localDirty;
          const expiresAt = Math.min(prepared.expiresAt, now() + TTL);
          const value = {
            token: null, name: state.name, kind: 'dir', scope: state.scope, root: state.root, source,
            currentCommit: state.origin?.commit ?? null, latestCommit: candidate.commit,
            localDirty, untracked: !state.origin, upstreamChanged, hasChanges, canApply, requiresOverwrite,
            status: !canApply ? 'upToDate' : !hasChanges ? 'link' : 'available', expiresAt: canApply ? expiresAt : null,
            ...changedEntries(state.manifest, candidate.manifest), diff: instructionDiff(state.body, candidate.body),
            revision: state.revision, treeHash: state.treeHash,
          };
          if (!canApply) return value;
          await prune();
          while (tickets.size >= 3) {
            const victim = [...tickets].find(([, ticket]) => !ticket.busy);
            if (!victim) throw fail('all update previews are in use; try again', 409);
            await drop(...victim);
          }
          check(activeSignal);
          if (expiresAt <= now()) throw fail('update preview expired while checking; prepare again', 410);
          const token = randomUUID();
          const ticket = { context: originContext, root: state.root, name: state.name, kind: 'dir', remoteToken: prepared.token,
            source, commit: candidate.commit, localHash: state.treeHash, originRevision: state.originRevision,
            remoteHash: candidate.treeHash, requiresOverwrite, expiresAt, busy: false };
          ticket.timer = setTimeout(() => { if (!ticket.busy) drop(token, ticket).catch(() => {}); }, Math.max(1, expiresAt - now()));
          ticket.timer.unref?.();
          tickets.set(token, ticket);
          retained = true;
          return { ...value, token };
        } finally {
          if (prepared?.token && !retained) await remote.discard({ ...originContext, token: prepared.token }).catch(() => {});
        }
      });
    },
    apply(payload, signal) {
      return operate(signal, async activeSignal => {
        identity(payload);
        const ticket = typeof payload.token === 'string' && tickets.get(payload.token);
        if (!ticket) throw fail('update preview expired or unavailable; check again', 410);
        if (ticket.busy) throw fail('update preview is in use', 409);
        if (!sameContext(payload, ticket)) throw fail('update preview context or skill identity does not match', 409);
        if (ticket.expiresAt <= now()) { await drop(payload.token, ticket); throw fail('update preview expired; check again', 410); }
        if (payload.allowLocalChanges !== undefined && typeof payload.allowLocalChanges !== 'boolean') throw fail('allowLocalChanges must be a boolean');
        if (ticket.requiresOverwrite && payload.allowLocalChanges !== true) throw fail('local changes require explicit backup-and-replace confirmation', 409);
        ticket.busy = true;
        try {
          check(activeSignal);
          const value = await remote.withPrepared({ ...ticket.context, token: ticket.remoteToken }, activeSignal, async snapshot => {
            if (snapshot.source !== ticket.source || snapshot.commit !== ticket.commit) throw fail('prepared GitHub identity changed; check again', 409);
            const skill = snapshot.skills.get(ticket.name);
            if (!skill) throw fail('prepared skill is no longer available', 410);
            const fresh = await snapshotCandidate(skill.srcDir);
            snapshotValid(fresh);
            if (fresh.treeHash !== ticket.remoteHash) throw fail('prepared GitHub files changed; check again', 409);
            check(activeSignal);
            // Once publication begins the store completes/rolls back its journal,
            // rather than abandoning a moved original on request cancellation.
            return applyUpdate({ ...ticket.context, name: ticket.name, kind: 'dir', expectedTreeHash: ticket.localHash,
              expectedOriginRevision: ticket.originRevision, allowLocalChanges: payload.allowLocalChanges === true },
            { srcDir: skill.srcDir, treeHash: ticket.remoteHash, source: ticket.source, commit: ticket.commit });
          }, { consume: true });
          if (value?.updated !== true) throw fail('store did not confirm the update; reload and check its state', 502);
          return value;
        } finally { await drop(payload.token, ticket); }
      });
    },
    discard(payload) {
      return operate(undefined, async () => {
        if (!payload || typeof payload.token !== 'string') throw fail('update token is required');
        const ticket = tickets.get(payload.token);
        if (!ticket) return { discarded: false };
        if (ticket.busy) throw fail('update preview is in use', 409);
        ticket.busy = true;
        await drop(payload.token, ticket);
        return { discarded: true };
      });
    },
    async dispose() {
      disposed = true;
      for (const operation of operations) operation.controller.abort();
      await Promise.allSettled([...operations].map(operation => operation.done));
      await Promise.allSettled([...tickets].map(([token, ticket]) => drop(token, ticket)));
      tickets.clear();
    },
  };
}
