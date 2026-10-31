/** Host-side skill operations, exposed through DSH's authenticated exact /api routes. */
import { homedir } from 'node:os';
import { join, resolve, basename, parse, isAbsolute, relative, sep } from 'node:path';
import { constants } from 'node:fs';
import fs, { readdir, mkdir, rm, lstat, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, isMap, visit } from 'yaml';
import { createRemoteInstaller } from './remote-installer.js';
import { createSkillHistory } from './skill-history.js';
import { createGithubUpdater } from './github-updater.js';

export const name = 'dsh-skills-manager';
const NS = name;
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const MAX_BUNDLE_FILES = 2048;

function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
function parseConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('config must be an object');
  if (input.allowUserWrite !== undefined && typeof input.allowUserWrite !== 'boolean') throw fail('allowUserWrite must be a boolean');
  if (input.allowRemoteInstall !== undefined && typeof input.allowRemoteInstall !== 'boolean') throw fail('allowRemoteInstall must be a boolean');
  const maxBodyBytes = input.maxBodyBytes ?? 262144;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0 || maxBodyBytes > MAX_REQUEST_BYTES) {
    throw fail('maxBodyBytes must be a positive integer no greater than 4194304');
  }
  return { allowUserWrite: input.allowUserWrite ?? true, allowRemoteInstall: input.allowRemoteInstall ?? true, maxBodyBytes };
}

// Cordis 4 validates the Standard Schema contract before calling apply().
// Keep this dependency-free rather than importing a second schema runtime.
export const Config = {
  '~standard': {
    version: 1,
    vendor: NS,
    validate(input) {
      try { return { value: parseConfig(input) }; }
      catch (error) { return { issues: [{ message: error.message }] }; }
    },
  },
  parse: parseConfig,
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function checkName(value) {
  if (typeof value !== 'string' || value.length > 64 || !KEBAB_RE.test(value)) throw fail('invalid skill name (kebab-case, <=64)');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) throw fail('reserved name on Windows');
}
function dirFor(scope, payload) {
  if (scope === 'user') return join(process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh'), 'skills');
  if (scope !== 'project') throw fail('scope must be project or user');
  const value = typeof payload.projectRoot === 'string' ? payload.projectRoot.trim() : '';
  if (!value || !isAbsolute(value)) throw fail('an absolute projectRoot is required for project scope');
  const root = resolve(value);
  if (parse(root).root === root || root === homedir()) throw fail('projectRoot must not be a filesystem root or home directory');
  return join(root, '.dsh', 'skills');
}
async function info(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
// Reject links at every existing component, not just the final SKILL.md.
// This is a local owner UI, not a race-proof filesystem sandbox.
async function noSymlinks(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  const parts = relative(current, absolute).split(sep).filter(Boolean);
  for (const part of parts) {
    current = join(current, part);
    const st = await info(current);
    if (!st) break;
    if (st.isSymbolicLink()) throw fail(`symbolic links are not allowed: ${current}`, 403);
  }
  return absolute;
}
function checkKind(kind, required = false) {
  if (kind === undefined && !required) return;
  if (kind !== 'dir' && kind !== 'flat') throw fail('kind must be dir or flat');
}
function skillPath(root, skillName, kind) {
  return kind === 'dir' ? join(root, skillName, 'SKILL.md') : join(root, `${skillName}.md`);
}
async function locate(root, skillName, kind, requireKind = false) {
  checkKind(kind);
  await noSymlinks(root);
  const found = [];
  for (const candidate of kind ? [kind] : ['dir', 'flat']) {
    const path = skillPath(root, skillName, candidate);
    await noSymlinks(path);
    const parent = candidate === 'dir' ? await info(join(root, skillName)) : null;
    if (parent && !parent.isDirectory()) throw fail('skill directory must be a directory');
    const st = await info(path);
    if (st) {
      if (!st.isFile()) throw fail('skill path must be a regular file');
      found.push({ kind: candidate, path });
    }
  }
  if (found.length > 1) throw fail('ambiguous skill name; specify kind (dir or flat)', 409);
  if (requireKind) checkKind(kind, true);
  return found[0] ?? null;
}
async function ensureVacant(root, skillName) {
  for (const path of [join(root, skillName), join(root, `${skillName}.md`)]) {
    await noSymlinks(path);
    if (await info(path)) throw fail('target skill already exists (dir or flat)', 409);
  }
}
// Resolve even a not-yet-created root through its closest existing ancestor.
async function canonicalPath(path) {
  let ancestor = resolve(path);
  const suffix = [];
  while (true) {
    try { return join(await realpath(ancestor), ...suffix); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      suffix.unshift(basename(ancestor));
      const parent = parse(ancestor).dir;
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}
// Shared across apply() instances and scopes, and keyed by name, not kind: a
// create/install must not race another format. This serializes this process,
// not unrelated local-owner filesystem writers or other DSH processes.
const skillLocks = new Map();
async function serialized(root, skillName, operation) {
  const key = `${root}\0${skillName}`;
  const previous = skillLocks.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise((done) => { release = done; });
  skillLocks.set(key, gate);
  await previous;
  try { return await operation(); }
  finally { release(); if (skillLocks.get(key) === gate) skillLocks.delete(key); }
}
function revisionOf(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function checkRevision(payload, revision) {
  if (typeof payload.expectedRevision !== 'string' || !payload.expectedRevision) throw fail('expectedRevision is required');
  if (payload.expectedRevision !== revision) throw fail('skill changed; reload before retrying', 409);
}
function temporaryPath(directory) { return join(directory, `.dsh-skills-${randomUUID()}`); }
async function discard(path, directory = false) {
  // Only call for a freshly generated staging path owned by this operation.
  await rm(path, { recursive: directory, force: true });
}
async function atomicWrite(path, body, create = false) {
  await noSymlinks(path);
  const temporary = temporaryPath(parse(path).dir);
  let handle;
  try {
    handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    await handle.writeFile(body, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await noSymlinks(path);
    // A hard link publishes new files without an overwrite race; rename replaces
    // existing files atomically. Never open the original with O_TRUNC.
    if (create) await fs.link(temporary, path);
    else await fs.rename(temporary, path);
  } catch (error) {
    if (error.code === 'EEXIST') throw fail('target skill already exists', 409);
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
    await discard(temporary).catch(() => {});
  }
}

function toBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    if (/^(true|yes|on)$/i.test(value)) return true;
    if (/^(false|no|off)$/i.test(value)) return false;
  }
  throw fail('invocation field must be a boolean');
}
function parseFrontmatter(body) {
  // DSH accepts a delimiter only when the line is exactly "---" after one trailing CR.
  // Spaces or tabs are not delimiters. Multiline `$` also matches a closing "---\r" at EOF.
  const match = /^(---\r?\n)([\s\S]*?)(^---(?:\r?\n|$))([\s\S]*)/m.exec(body);
  if (!match || match.index !== 0) return { error: 'missing YAML frontmatter (--- ... ---)' };
  try {
    const doc = parseDocument(match[2], { keepSourceTokens: true, uniqueKeys: true });
    if (doc.errors.length) throw fail(doc.errors[0].message);
    if (!isMap(doc.contents)) throw fail('frontmatter must be a YAML mapping');
    const data = doc.toJS({ maxAliasCount: 100 });
    if (typeof data.name !== 'string' || !data.name.trim()) throw fail('frontmatter requires name string');
    checkName(data.name);
    if (typeof data.description !== 'string' || !data.description.trim()) throw fail('frontmatter requires description string');
    for (const [legacy, canonical] of [['disableModelInvocation', 'disable-model-invocation'], ['modelInvocable', 'disable-model-invocation'], ['userInvocable', 'user-invocable']]) {
      if (Object.hasOwn(data, legacy)) throw fail(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
    }
    for (const key of ['disable-model-invocation', 'user-invocable']) {
      if (!Object.hasOwn(data, key)) continue;
      try { toBool(data[key]); } catch { throw fail(`frontmatter field "${key}" must be a boolean`); }
    }
    return { data, doc, prefix: match[1], raw: match[2], closing: match[3], content: match[4] };
  } catch (error) { return { error: error.message }; }
}
function patchInvocation(parsed, payload) {
  const edits = [], additions = [];
  const anchoredValues = new Map(), targetedOffsets = new Set();
  const newline = parsed.prefix.endsWith('\r\n') ? '\r\n' : '\n';
  for (const [field, key, invert] of [['modelInvocable', 'disable-model-invocation', true], ['userInvocable', 'user-invocable', false]]) {
    if (payload[field] === undefined) continue;
    if (typeof payload[field] !== 'boolean') throw fail(`${field} must be a boolean`);
    const value = String(invert ? !payload[field] : payload[field]);
    const node = parsed.doc.get(key, true);
    if (node?.range) {
      const [start, end] = node.range;
      targetedOffsets.add(start);
      if (node.anchor) anchoredValues.set(node, parsed.data[key]);
      const source = parsed.raw.slice(start, end);
      // Block scalars can encode native-compatible strings such as |-/false.
      const blockComment = /^[|>][^\r\n]*?([ \t]+#[^\r\n]*)/.exec(source)?.[1] ?? '';
      const ending = /\r?\n$/.exec(source)?.[0] ?? '';
      edits.push({ start, end, text: value + blockComment + ending });
    } else additions.push(`${key}: ${value}`);
  }
  // Changing an anchored scalar must not change untargeted invocation fields or
  // unknown metadata that alias its old value. Resolve by node, not anchor name
  // (YAML may reuse anchor names), and materialize just those scalar aliases.
  if (anchoredValues.size) visit(parsed.doc, {
    Alias(_key, alias) {
      const target = alias.resolve(parsed.doc);
      if (anchoredValues.has(target) && !targetedOffsets.has(alias.range[0])) {
        edits.push({ start: alias.range[0], end: alias.range[1], text: JSON.stringify(anchoredValues.get(target)) });
      }
    },
  });
  if (additions.length) {
    const map = parsed.doc.contents;
    if (map.flow) {
      const offset = map.srcToken.start.offset + 1;
      edits.push({ start: offset, end: offset, text: `${additions.join(', ')}, ` });
    } else {
      const indent = ' '.repeat(map.srcToken.indent ?? 0);
      const offset = parsed.raw.length;
      edits.push({ start: offset, end: offset, text: `${offset && !parsed.raw.endsWith('\n') ? newline : ''}${additions.map((line) => indent + line).join(newline)}${newline}` });
    }
  }
  let raw = parsed.raw;
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) raw = raw.slice(0, start) + text + raw.slice(end);
  return parsed.prefix + raw + parsed.closing + parsed.content;
}

export function apply(ctx, input = {}) {
  const config = parseConfig(input);
  const log = (...args) => { try { ctx.logger?.info?.(...args); } catch {} };
  function checkBody(body) {
    if (typeof body !== 'string' || !body) throw fail('body must be a nonempty string');
    if (Buffer.byteLength(body) > config.maxBodyBytes) throw fail('body too large', 413);
    return body;
  }
  async function readSkill(path) {
    await noSymlinks(path);
    const before = await info(path);
    if (!before?.isFile()) throw fail('skill path must be a regular file');
    if (before.size > config.maxBodyBytes) throw fail('body too large', 413);
    const handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const st = await handle.stat();
      if (!st.isFile()) throw fail('skill path must be a regular file');
      if (st.size > config.maxBodyBytes) throw fail('body too large', 413);
      const bytes = await handle.readFile();
      if (bytes.length > config.maxBodyBytes) throw fail('body too large', 413);
      return { body: bytes.toString('utf8'), revision: revisionOf(bytes) };
    } finally { await handle.close(); }
  }
  function validated(body) {
    const parsed = parseFrontmatter(checkBody(body));
    if (parsed.error) throw fail(`invalid skill: ${parsed.error}`);
    return parsed;
  }
  function scopeOf(payload) { return payload.scope ?? 'project'; }
  async function rootFor(payload, write = false) {
    const scope = scopeOf(payload), root = dirFor(scope, payload);
    if (write && !config.allowUserWrite) {
      if (scope === 'user' || await canonicalPath(root) === await canonicalPath(dirFor('user', {}))) throw fail('user writes disabled', 403);
    }
    await noSymlinks(root);
    return { root, scope, canonical: await canonicalPath(root) };
  }
  async function existing(root, payload) {
    const loc = await locate(root, payload.name, payload.kind, true);
    if (!loc) throw fail('skill no longer exists; reload before retrying', 409);
    const current = await readSkill(loc.path);
    checkRevision(payload, current.revision);
    return { ...loc, ...current };
  }
  async function listSkills(root) {
    await noSymlinks(root);
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const result = [];
    for (const entry of entries) {
      const kind = entry.isDirectory() ? 'dir' : entry.isFile() && entry.name.endsWith('.md') ? 'flat' : null;
      if (!kind) continue;
      const skillName = kind === 'dir' ? entry.name : basename(entry.name, '.md');
      const path = kind === 'dir' ? join(root, entry.name, 'SKILL.md') : join(root, entry.name);
      if (!(await info(path))) continue;
      let revision;
      try {
        const current = await readSkill(path);
        revision = current.revision;
        checkName(skillName);
        const parsed = validated(current.body);
        if (parsed.data.name !== skillName) throw fail('name mismatch between directory/file and frontmatter');
        result.push({ name: skillName, storageName: skillName, kind, revision, valid: true, path, description: parsed.data.description,
          modelInvocable: !toBool(parsed.data['disable-model-invocation'], false), userInvocable: toBool(parsed.data['user-invocable'], true) });
      } catch (error) { result.push({ name: skillName, storageName: skillName, kind, revision, valid: false, error: error.message, path }); }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  }
  const history = createSkillHistory({ noSymlinks, info, readSkill, validated });
  async function canRecover(payload) {
    try { await rootFor(payload, true); return true; }
    catch (error) { if (error.status === 403) return false; throw error; }
  }
  async function recoverName(root, canonical, payload) {
    // Ordinary atomic body saves retain nonblocking readers. Only pending bundle
    // transactions need the serial lock before reading discovery or one name.
    const pending = await history.pendingNames(root);
    if (pending.includes(payload.name)) await serialized(canonical, payload.name, async () => history.recover(root, payload.name, await canRecover(payload)));
  }
  async function snapshotCandidate(srcDir) {
    const snapshot = await history.snapshot(srcDir);
    validated(snapshot.body);
    return snapshot;
  }
  async function getState(payload) {
    const { root, scope, canonical } = await rootFor(payload);
    checkName(payload.name); checkKind(payload.kind, true);
    if (payload.kind !== 'dir') throw fail('GitHub updates support directory skills only');
    return serialized(canonical, payload.name, async () => {
      await history.recover(root, payload.name, await canRecover(payload));
      const loc = await locate(root, payload.name, 'dir');
      if (!loc) throw fail('not found', 404);
      return { root: canonical, scope, name: payload.name, kind: 'dir', ...await history.snapshot(join(root, payload.name)), ...await history.readOrigin(root, payload.name) };
    });
  }
  async function applyUpdate(payload, candidate) {
    const { root, scope, canonical } = await rootFor(payload, true);
    checkName(payload.name);
    if (payload.kind !== 'dir') throw fail('GitHub updates support directory skills only');
    if (typeof payload.expectedTreeHash !== 'string' || !/^[a-f0-9]{64}$/.test(payload.expectedTreeHash) ||
      payload.expectedOriginRevision !== null && (typeof payload.expectedOriginRevision !== 'string' || !/^[a-f0-9]{64}$/.test(payload.expectedOriginRevision))) throw fail('expected tree and origin revisions are required');
    if (payload.allowLocalChanges !== undefined && typeof payload.allowLocalChanges !== 'boolean') throw fail('allowLocalChanges must be a boolean');
    return serialized(canonical, payload.name, async () => {
      await rootFor(payload, true); await history.recover(root, payload.name);
      const current = await history.snapshot(join(root, payload.name));
      const state = await history.readOrigin(root, payload.name);
      if (current.treeHash !== payload.expectedTreeHash || state.originRevision !== payload.expectedOriginRevision) throw fail('skill or provenance changed; prepare a new preview', 409);
      const next = await snapshotCandidate(candidate.srcDir);
      if (validated(next.body).data.name !== payload.name || next.treeHash !== candidate.treeHash) throw fail('candidate skill changed; prepare a new preview', 409);
      const origin = history.makeOrigin(payload.name, candidate, next.treeHash);
      const dirty = state.origin ? current.treeHash !== state.origin.baselineHash : current.treeHash !== next.treeHash;
      if (dirty && current.treeHash !== next.treeHash && payload.allowLocalChanges !== true) throw fail('local changes require explicit allowLocalChanges confirmation', 409);
      let backup = null, warning;
      if (current.treeHash === next.treeHash) {
        // Legacy registration and identical updates do not rewrite installed files.
        if ((await history.snapshot(join(root, payload.name))).treeHash !== current.treeHash || (await history.readOrigin(root, payload.name)).originRevision !== state.originRevision) throw fail('skill or provenance changed; prepare a new preview', 409);
        ({ warning } = await history.setOriginConfirmed(root, payload.name, origin, current.treeHash));
      } else ({ backup, warning } = await history.publish(root, payload.name, candidate.srcDir, next, current, origin, state.originRevision));
      return { updated: true, name: payload.name, kind: 'dir', root, scope, revision: next.revision, treeHash: next.treeHash, origin, backup, ...(warning && { warning }) };
    });
  }
  const handlers = {
    async list(payload) {
      const { scope, root, canonical } = await rootFor(payload);
      for (const skillName of await history.pendingNames(root)) await serialized(canonical, skillName, async () => history.recover(root, skillName, await canRecover(payload)));
      return { skills: await listSkills(root), root, scope };
    },
    async get(payload) {
      const { scope, root, canonical } = await rootFor(payload);
      checkName(payload.name);
      await recoverName(root, canonical, payload);
      const loc = await locate(root, payload.name, payload.kind);
      if (!loc) throw fail('not found', 404);
      const current = await readSkill(loc.path), parsed = parseFrontmatter(current.body);
      let update = { supported: false, origin: null, treeHash: null, originRevision: null };
      if (loc.kind === 'dir') {
        try { update = { supported: true, treeHash: (await history.snapshot(join(root, payload.name))).treeHash, ...await history.readOrigin(root, payload.name) }; }
        catch (error) {
          // Preserve v0.4 body inspection/repair for bundles whose resources or
          // provenance cannot safely be updated. This is explicitly unsupported,
          // never silently presented as an untracked, updateable installation.
          update = { ...update, error: error.message };
        }
      }
      return { name: payload.name, ...loc, ...current, frontmatter: parsed.data ?? null, parseError: parsed.error ?? null, root, scope, update };
    },
    async validate(payload) {
      const parsed = parseFrontmatter(checkBody(payload.body));
      return parsed.error ? { valid: false, error: parsed.error } : { valid: true, frontmatter: parsed.data };
    },
    async save(payload) {
      const { scope, root, canonical } = await rootFor(payload, true);
      checkName(payload.name);
      if (payload.mode !== 'create' && payload.mode !== 'update') throw fail('mode must be create or update');
      checkKind(payload.kind);
      const parsed = validated(payload.body);
      if (parsed.data.name !== payload.name) throw fail('name mismatch between request and frontmatter');
      return serialized(canonical, payload.name, async () => {
        await rootFor(payload, true); await history.recover(root, payload.name);
        let kind = payload.kind ?? 'dir', warning;
        if (payload.mode === 'update') {
          const current = await existing(root, payload);
          kind = current.kind;
          await atomicWrite(current.path, payload.body);
        } else {
          await ensureVacant(root, payload.name);
          await mkdir(root, { recursive: true });
          if (kind === 'flat') await atomicWrite(skillPath(root, payload.name, kind), payload.body, true);
          else {
            // Stage outside skills/: native DSH discovery also scans dot dirs.
            const stage = temporaryPath(parse(root).dir);
            await mkdir(stage, { mode: 0o700 });
            try {
              await atomicWrite(join(stage, 'SKILL.md'), payload.body, true);
              await ensureVacant(root, payload.name);
              // A freshly authored directory must not inherit provenance left
              // behind by a local-owner deletion of an older tracked bundle.
              const tree = await history.snapshot(stage);
              ({ warning } = await history.publish(root, payload.name, stage, tree, null, null));
            } finally { await discard(stage, true).catch(() => {}); }
          }
        }
        return { saved: true, name: payload.name, scope, kind, root, path: skillPath(root, payload.name, kind), revision: revisionOf(payload.body), ...(warning && { warning }) };
      });
    },
    async setInvocation(payload) {
      const { scope, root, canonical } = await rootFor(payload, true);
      checkName(payload.name);
      return serialized(canonical, payload.name, async () => {
        await rootFor(payload, true); await history.recover(root, payload.name);
        const current = await existing(root, payload), parsed = validated(current.body);
        const next = patchInvocation(parsed, payload);
        validated(next);
        await atomicWrite(current.path, next);
        return { saved: true, name: payload.name, scope, root, kind: current.kind, path: current.path, revision: revisionOf(next) };
      });
    },
    async remove(payload) {
      const { root, canonical } = await rootFor(payload, true);
      checkName(payload.name);
      return serialized(canonical, payload.name, async () => {
        await rootFor(payload, true); await history.recover(root, payload.name);
        const current = await existing(root, payload);
        const target = current.kind === 'dir' ? join(root, payload.name) : current.path;
        await noSymlinks(target);
        await rm(target, { recursive: current.kind === 'dir' });
        if (current.kind === 'dir') {
          try { await history.setOrigin(root, payload.name, null); }
          catch (error) { return { removed: true, name: payload.name, kind: current.kind, warning: `skill removed but provenance cleanup failed: ${error.message}` }; }
        }
        return { removed: true, name: payload.name, kind: current.kind };
      });
    },
    async install(payload, originProof) {
      const { scope, root, canonical } = await rootFor(payload, true);
      if (typeof payload.srcDir !== 'string' || !payload.srcDir.trim()) throw fail('srcDir is required');
      const src = resolve(payload.srcDir.trim());
      if (parse(src).root === src) throw fail('invalid srcDir');
      await noSymlinks(src);
      const st = await info(src);
      if (!st) throw fail('srcDir not found', 404);
      if (!st.isDirectory() && !(st.isFile() && src.endsWith('.md'))) throw fail('srcDir must be a skill bundle directory or .md file');
      const initial = await readSkill(st.isDirectory() ? join(src, 'SKILL.md') : src);
      const skillName = validated(initial.body).data.name;
      const kind = st.isDirectory() ? 'dir' : 'flat';
      const target = kind === 'dir' ? join(root, skillName) : skillPath(root, skillName, kind);
      // Reject destination nesting inside the source before creating anything.
      const rel = relative(src, target);
      if (kind === 'dir' && (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)))) throw fail('target must not be inside source bundle');
      return serialized(canonical, skillName, async () => {
        await rootFor(payload, true); await history.recover(root, skillName);
        await ensureVacant(root, skillName);
        const entries = [];
        let inspectedBytes = 0;
        async function inspect(directory, depth = 0) {
          if (depth > 32) throw fail('bundle nesting too deep');
          for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name), item = await lstat(path);
            if (item.isSymbolicLink()) throw fail('bundle symbolic links are not allowed', 403);
            if (!item.isDirectory() && !item.isFile()) throw fail('bundle must contain only regular files and directories');
            if (item.isFile()) inspectedBytes += item.size;
            entries.push({ path, relative: relative(src, path), directory: item.isDirectory(), mode: item.mode & 0o777 });
            // Count directories too, so a tree of empty directories is bounded.
            if (inspectedBytes > MAX_BUNDLE_BYTES || entries.length > MAX_BUNDLE_FILES) throw fail('bundle too large', 413);
            if (item.isDirectory()) await inspect(path, depth + 1);
          }
        }
        if (kind === 'dir') await inspect(src);
        await mkdir(root, { recursive: true });
        // Keep incomplete bundles outside the native DSH discovery root.
        const stage = temporaryPath(parse(root).dir);
        let copiedBytes = 0;
        async function copyBounded(source, dest) {
          await noSymlinks(source);
          const input = await fs.open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          let output;
          try {
            const item = await input.stat();
            if (!item.isFile()) throw fail('bundle must contain only regular files');
            if (copiedBytes + item.size > MAX_BUNDLE_BYTES) throw fail('bundle too large', 413);
            output = await fs.open(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), item.mode & 0o777);
            const buffer = Buffer.alloc(65536);
            while (true) {
              const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, MAX_BUNDLE_BYTES - copiedBytes + 1), null);
              if (!bytesRead) break;
              copiedBytes += bytesRead;
              if (copiedBytes > MAX_BUNDLE_BYTES) throw fail('bundle too large', 413);
              await output.writeFile(buffer.subarray(0, bytesRead));
            }
            // Creation modes are filtered by umask; retain executable scripts.
            await output.chmod(item.mode & 0o777);
            await output.sync();
          } finally { await input.close(); if (output) await output.close(); }
        }
        try {
          if (kind === 'dir') {
            await mkdir(stage, { mode: 0o700 });
            for (const entry of entries) {
              const dest = join(stage, entry.relative);
              if (entry.directory) await mkdir(dest, { mode: entry.mode | 0o700 });
              else await copyBounded(entry.path, dest);
            }
          } else await copyBounded(src, stage);
          const snapshot = await readSkill(kind === 'dir' ? join(stage, 'SKILL.md') : stage);
          if (validated(snapshot.body).data.name !== skillName) throw fail('source skill changed during install', 409);
          await ensureVacant(root, skillName);
          let origin = null, treeHash, warning;
          if (kind === 'dir') {
            const finalTree = await history.snapshot(stage); treeHash = finalTree.treeHash;
            if (originProof) origin = history.makeOrigin(skillName, originProof, treeHash);
            // Install provenance and tree together. A local import clears a stale
            // directory association; payload source/commit are never authority.
            ({ warning } = await history.publish(root, skillName, stage, finalTree, null, origin));
          } else {
            if (originProof) throw fail('GitHub provenance requires a directory bundle');
            await fs.link(stage, target);
          }
          return { installed: true, name: skillName, kind, root, scope, revision: snapshot.revision, ...(kind === 'dir' && { origin, treeHash }), ...(warning && { warning }) };
        } catch (error) {
          if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') throw fail('target skill already exists', 409);
          throw error;
        } finally { await discard(stage, kind === 'dir').catch(() => {}); }
      });
    },
  };

  // HTTP dispatch supplies an AbortSignal as argument two. Never allow that (or
  // payload fields) to impersonate the internal, verified provenance proof.
  const installManaged = handlers.install;
  handlers.install = payload => installManaged(payload);
  const remote = createRemoteInstaller({
    resolveTarget: async payload => {
      if (!config.allowRemoteInstall) throw fail('remote skill installation is disabled', 403);
      return rootFor(payload, true);
    },
    validateBody: validated,
    importSkill: (payload, proof) => installManaged(payload, proof),
  });
  handlers.prepareRemote = (payload, signal) => remote.prepare(payload, signal);
  handlers.installRemote = (payload, signal) => remote.install(payload, signal);
  handlers.discardRemote = payload => remote.discard(payload);
  const updater = createGithubUpdater({ remote, getState, snapshotCandidate, applyUpdate });
  handlers.prepareUpdate = (payload, signal) => updater.prepare(payload, signal);
  handlers.applyUpdate = (payload, signal) => updater.apply(payload, signal);
  handlers.discardUpdate = payload => updater.discard(payload);
  // Dispose the updater first: it may still own leases on remote previews.
  ctx.effect?.(() => async () => { try { await updater.dispose(); } finally { await remote.dispose(); } }, 'dsh-skills-manager:remote-lifetime');

  async function readJson(request) {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_REQUEST_BYTES) throw fail('request body too large', 413);
    const chunks = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (!reader) throw fail('invalid JSON');
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw fail('request body too large', 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('invalid JSON'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('JSON body must be an object');
    return payload;
  }
  ctx.inject(['connection'], (scoped) => {
    const connection = scoped.get('connection');
    if (typeof connection?.fetch?.register !== 'function') { log(`${NS}: connection.fetch unavailable`); return; }
    for (const [method, operation] of Object.entries(handlers)) {
      connection.fetch.register({
        path: `/api/${NS}/${method}`, methods: ['POST'], requestBody: 'buffered',
        fetch: async (request) => {
          try { return json({ ok: true, value: await operation(await readJson(request), request.signal) }); }
          catch (error) { return json({ ok: false, error: { code: `${NS}/${method}`, message: error.message ?? String(error) } }, error.status ?? 500); }
        },
      });
    }
  });
  // Read-only agent tools reuse exactly the same operations as the HTTP API.
  ctx.inject(['tools'], (scoped) => {
    const tools = scoped.get('tools');
    const properties = { scope: { type: 'string', enum: ['project', 'user'] }, projectRoot: { type: 'string', description: 'Absolute project path; defaults to the calling agent working directory.' } };
    for (const [toolName, method, description, extra, required] of [
      ['skills_manager_list', 'list', 'List installed Agent Skills (project/user).', {}, []],
      ['skills_manager_read', 'get', 'Read one skill body by name and optional storage kind (required for duplicate names).', { name: { type: 'string' }, kind: { type: 'string', enum: ['dir', 'flat'] } }, ['name']],
      ['skills_manager_validate', 'validate', 'Validate a SKILL.md body without writing.', { body: { type: 'string' } }, ['body']],
    ]) {
      tools.register({
        name: toolName, description,
        parameters: { type: 'object', properties: { ...properties, ...extra }, required, additionalProperties: false },
        output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async (args, exec) => {
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail('arguments must be an object');
          const payload = { ...args };
          if (method !== 'validate' && scopeOf(payload) === 'project' && !payload.projectRoot) {
            const directory = scoped.get('workingDirectory');
            if (directory && exec?.agent) payload.projectRoot = await directory.ensure(exec.agent, exec.signal);
          }
          return handlers[method](payload);
        },
      });
    }
  });
}
