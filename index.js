/** Host-side skill operations, exposed through DSH's authenticated exact /api routes. */
import { homedir } from 'node:os';
import { join, resolve, basename, parse, isAbsolute, relative, sep } from 'node:path';
import { constants } from 'node:fs';
import { readdir, readFile, mkdir, rm, lstat, copyFile, open } from 'node:fs/promises';

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
  const maxBodyBytes = input.maxBodyBytes ?? 262144;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0 || maxBodyBytes > MAX_REQUEST_BYTES) {
    throw fail('maxBodyBytes must be a positive integer no greater than 4194304');
  }
  return { allowUserWrite: input.allowUserWrite ?? true, maxBodyBytes };
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
async function locate(root, skillName) {
  await noSymlinks(root);
  for (const [kind, path] of [['dir', join(root, skillName, 'SKILL.md')], ['flat', join(root, `${skillName}.md`)]]) {
    await noSymlinks(path);
    const st = await info(path);
    if (st) {
      if (!st.isFile()) throw fail('skill path must be a regular file');
      return { kind, path };
    }
  }
  return null;
}

// Only managed top-level fields are interpreted; unknown YAML (including nested
// metadata and block scalars) remains opaque and is never serialized back out.
function scalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const match = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?\s*$/.exec(value);
    if (!match) throw fail('invalid quoted frontmatter value');
    try { return JSON.parse(match[1]); } catch { throw fail('invalid quoted frontmatter value'); }
  }
  if (value.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'(?:\s+#.*)?\s*$/.exec(value);
    if (!match) throw fail('invalid quoted frontmatter value');
    return match[1].replace(/''/g, "'");
  }
  return value.replace(/\s+#.*$/, '').trim();
}
function parseFrontmatter(body) {
  const match = /^(---[ \t]*\r?\n)([\s\S]*?)(^---[ \t]*(?:\r?\n|$))([\s\S]*)/m.exec(body);
  if (!match || match.index !== 0) return { error: 'missing YAML frontmatter (--- ... ---)' };
  const lines = match[2].split(/\r?\n/);
  const data = Object.create(null);
  const managed = new Set(['name', 'description', 'disable-model-invocation', 'user-invocable']);
  try {
    for (let i = 0; i < lines.length; i++) {
      const entry = /^([a-zA-Z][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
      if (!entry || !managed.has(entry[1])) continue;
      const [, key, raw] = entry;
      if (Object.hasOwn(data, key)) return { error: `duplicate frontmatter field: ${key}` };
      if (key === 'description' && /^[|>][+-]?(?:\s+#.*)?$/.test(raw)) {
        const block = [];
        while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i]);
        data[key] = block.map((line) => line.trim()).join(raw[0] === '>' ? ' ' : '\n').trim();
      } else data[key] = scalar(raw);
    }
    if (!data.name) return { error: 'frontmatter requires name' };
    checkName(data.name);
    if (!data.description) return { error: 'frontmatter requires description' };
    for (const key of ['disable-model-invocation', 'user-invocable']) {
      if (data[key] !== undefined && !/^(true|false|yes|no|on|off|1|0)$/i.test(data[key])) return { error: `frontmatter field "${key}" must be a boolean` };
    }
    return { data, prefix: match[1], raw: match[2], closing: match[3], content: match[4] };
  } catch (error) { return { error: error.message }; }
}
function toBool(value, fallback) { return value === undefined ? fallback : /^(true|yes|on|1)$/i.test(value); }
function patchInvocation(body, parsed, payload) {
  let raw = parsed.raw;
  const newline = parsed.prefix.endsWith('\r\n') ? '\r\n' : '\n';
  for (const [field, key, invert] of [['modelInvocable', 'disable-model-invocation', true], ['userInvocable', 'user-invocable', false]]) {
    if (payload[field] === undefined) continue;
    if (typeof payload[field] !== 'boolean') throw fail(`${field} must be a boolean`);
    const value = invert ? !payload[field] : payload[field];
    const pattern = new RegExp(`^${key}:[^\\r\\n]*(?:\\r?\\n|$)`, 'm');
    if (pattern.test(raw)) raw = raw.replace(pattern, (line) => {
      const comment = /([ \t]+#.*?)(?:\r?\n)?$/.exec(line)?.[1] ?? '';
      const ending = /\r?\n$/.exec(line)?.[0] ?? '';
      return `${key}: ${value}${comment}${ending}`;
    });
    else raw += `${raw && !raw.endsWith('\n') ? newline : ''}${key}: ${value}${newline}`;
  }
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
    const st = await info(path);
    if (!st?.isFile()) throw fail('skill path must be a regular file');
    if (st.size > config.maxBodyBytes) throw fail('body too large', 413);
    return checkBody(await readFile(path, 'utf8'));
  }
  function validated(body) {
    const parsed = parseFrontmatter(checkBody(body));
    if (parsed.error) throw fail(`invalid skill: ${parsed.error}`);
    return parsed;
  }
  async function writeSkill(path, body) {
    await noSymlinks(path);
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(body, 'utf8'); } finally { await handle.close(); }
  }
  function scopeOf(payload) { return payload.scope ?? 'project'; }
  function writable(scope) { if (scope === 'user' && !config.allowUserWrite) throw fail('user writes disabled', 403); }
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
      try {
        checkName(skillName);
        const parsed = validated(await readSkill(path));
        if (parsed.data.name !== skillName) throw fail('name mismatch between directory/file and frontmatter');
        result.push({ name: skillName, storageName: skillName, kind, valid: true, path, description: parsed.data.description,
          modelInvocable: !toBool(parsed.data['disable-model-invocation'], false), userInvocable: toBool(parsed.data['user-invocable'], true) });
      } catch (error) { result.push({ name: skillName, storageName: skillName, kind, valid: false, error: error.message, path }); }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  const handlers = {
    async list(payload) {
      const scope = scopeOf(payload), root = dirFor(scope, payload);
      return { skills: await listSkills(root), root, scope };
    },
    async get(payload) {
      const scope = scopeOf(payload), root = dirFor(scope, payload);
      checkName(payload.name);
      const loc = await locate(root, payload.name);
      if (!loc) throw fail('not found', 404);
      const body = await readSkill(loc.path), parsed = parseFrontmatter(body);
      return { ...loc, body, frontmatter: parsed.data ?? null, parseError: parsed.error ?? null, root, scope };
    },
    async validate(payload) {
      const parsed = parseFrontmatter(checkBody(payload.body));
      return parsed.error ? { valid: false, error: parsed.error } : { valid: true, frontmatter: parsed.data };
    },
    async save(payload) {
      const scope = scopeOf(payload); writable(scope); checkName(payload.name);
      const parsed = validated(payload.body);
      if (parsed.data.name !== payload.name) throw fail('name mismatch between request and frontmatter');
      const root = dirFor(scope, payload);
      await noSymlinks(root);
      await mkdir(root, { recursive: true });
      const kind = payload.kind === 'flat' ? 'flat' : 'dir';
      const path = kind === 'flat' ? join(root, `${payload.name}.md`) : join(root, payload.name, 'SKILL.md');
      await noSymlinks(path);
      if (kind === 'dir') await mkdir(join(root, payload.name), { recursive: true });
      await writeSkill(path, payload.body);
      return { saved: true, scope, kind, root };
    },
    async setInvocation(payload) {
      const scope = scopeOf(payload); writable(scope); checkName(payload.name);
      const loc = await locate(dirFor(scope, payload), payload.name);
      if (!loc) throw fail('not found', 404);
      const body = await readSkill(loc.path), parsed = validated(body);
      const next = patchInvocation(body, parsed, payload);
      checkBody(next);
      await writeSkill(loc.path, next);
      return { saved: true, path: loc.path };
    },
    async remove(payload) {
      const scope = scopeOf(payload); writable(scope); checkName(payload.name);
      const root = dirFor(scope, payload), loc = await locate(root, payload.name);
      if (!loc) throw fail('not found', 404);
      const target = loc.kind === 'dir' ? join(root, payload.name) : loc.path;
      await noSymlinks(target);
      await rm(target, { recursive: loc.kind === 'dir' });
      return { removed: true };
    },
    async install(payload) {
      const scope = scopeOf(payload); writable(scope);
      if (typeof payload.srcDir !== 'string' || !payload.srcDir.trim()) throw fail('srcDir is required');
      const src = resolve(payload.srcDir.trim());
      if (parse(src).root === src) throw fail('invalid srcDir');
      await noSymlinks(src);
      const st = await info(src);
      if (!st) throw fail('srcDir not found', 404);
      if (!st.isDirectory() && !(st.isFile() && src.endsWith('.md'))) throw fail('srcDir must be a skill bundle directory or .md file');
      const body = await readSkill(st.isDirectory() ? join(src, 'SKILL.md') : src);
      const parsed = validated(body), skillName = parsed.data.name;
      const root = dirFor(scope, payload);
      const target = st.isDirectory() ? join(root, skillName) : join(root, `${skillName}.md`);
      await noSymlinks(root); await noSymlinks(target);
      if (await info(target)) throw fail('target skill already exists', 409);
      // Reject destination nesting inside the source before creating anything.
      const rel = relative(src, target);
      if (st.isDirectory() && (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)))) throw fail('target must not be inside source bundle');
      const files = [];
      let totalBytes = 0;
      async function inspect(directory, depth = 0) {
        if (depth > 32) throw fail('bundle nesting too deep');
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name), item = await lstat(path);
          if (item.isSymbolicLink()) throw fail('bundle symbolic links are not allowed', 403);
          if (item.isDirectory()) await inspect(path, depth + 1);
          else if (item.isFile()) {
            totalBytes += item.size;
            files.push({ path, relative: relative(src, path) });
            if (totalBytes > MAX_BUNDLE_BYTES || files.length > MAX_BUNDLE_FILES) throw fail('bundle too large', 413);
          } else throw fail('bundle must contain only regular files and directories');
        }
      }
      if (st.isDirectory()) await inspect(src);
      await mkdir(root, { recursive: true });
      if (st.isDirectory()) {
        // A new directory is claimed exclusively; never merge or overwrite an installed bundle.
        try { await mkdir(target); } catch (error) { if (error.code === 'EEXIST') throw fail('target skill already exists', 409); throw error; }
        try {
          for (const file of files) {
            await noSymlinks(file.path);
            const dest = join(target, file.relative);
            await noSymlinks(dest);
            await mkdir(parse(dest).dir, { recursive: true });
            await copyFile(file.path, dest, constants.COPYFILE_EXCL);
          }
        } catch (error) { await noSymlinks(target); await rm(target, { recursive: true, force: true }); throw error; }
      } else {
        try { await copyFile(src, target, constants.COPYFILE_EXCL); }
        catch (error) { if (error.code === 'EEXIST') throw fail('target skill already exists', 409); throw error; }
      }
      return { installed: true, name: skillName, kind: st.isDirectory() ? 'dir' : 'flat', root };
    },
  };

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
          try { return json({ ok: true, value: await operation(await readJson(request)) }); }
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
      ['skills_manager_read', 'get', 'Read one skill body by name.', { name: { type: 'string' } }, ['name']],
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
