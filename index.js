/**
 * dsh-skills-manager — Host half.
 *
 * Serves Agent Skills file management over exact routes on DSH's
 * authenticated /api channel (auth + Host/Origin fence run before us):
 *
 *   POST /api/dsh-skills-manager/list     { scope, projectRoot? } -> { ok, skills[] }
 *   POST /api/dsh-skills-manager/get      { scope, name, projectRoot? }
 *   POST /api/dsh-skills-manager/save     { scope, name, body, projectRoot? } (create/update)
 *   POST /api/dsh-skills-manager/remove   { scope, name, projectRoot? }
 *   POST /api/dsh-skills-manager/validate { body } (no fs write)
 *   POST /api/dsh-skills-manager/install  { scope, srcDir, projectRoot? } (copy dir/* into skills root)
 *
 * Roots:
 *   project -> <projectRoot>/.dsh/skills   (client sends projectRoot from its workspace)
 *   user    -> $DSH_HOME/skills or ~/.dsh/skills
 *
 * Safety: kebab-case names only, top-level SKILL.md / <name>.md only,
 * no path traversal, body size cap, user writes gated by config.
 */

import { homedir } from 'node:os';
import { join, resolve, basename, parse } from 'node:path';
import { readdir, readFile, writeFile, mkdir, rm, stat, copyFile } from 'node:fs/promises';

export const name = 'dsh-skills-manager';
export const Config = {
  parse(input = {}) {
    return {
      allowUserWrite: input.allowUserWrite !== false,
      maxBodyBytes: Number.isFinite(input.maxBodyBytes) ? input.maxBodyBytes : 262144,
    };
  },
};

const NS = 'dsh-skills-manager';
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME_LEN = 64;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function dshHome() {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh');
}

function userRoot() {
  return join(dshHome(), 'skills');
}

function projectRootFor(payload) {
  const p = typeof payload?.projectRoot === 'string' ? payload.projectRoot.trim() : '';
  if (!p) return null;
  const r = resolve(p);
  // Reject filesystem roots on any OS ("/", "C:\", …); the workspace
  // allowlist check itself lives client-side for now.
  if (parse(r).root === r) return null;
  if (r === homedir()) return null;
  return join(r, '.dsh', 'skills');
}

function dirFor(scope, payload) {
  if (scope === 'user') return userRoot();
  const d = projectRootFor(payload);
  if (!d) throw Object.assign(new Error('projectRoot is required for project scope'), { status: 400 });
  return d;
}

function checkName(name) {
  if (typeof name !== 'string' || !name || name.length > MAX_NAME_LEN || !KEBAB_RE.test(name)) {
    throw Object.assign(new Error(`invalid skill name ${JSON.stringify(name)} (kebab-case, <=64)`), { status: 400 });
  }
  if (name === '.system' || name.startsWith('.')) throw Object.assign(new Error('reserved name'), { status: 400 });
  // Windows reserved device names (case-insensitive, with or without extension).
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) {
    throw Object.assign(new Error('reserved name on Windows'), { status: 400 });
  }
}

// Minimal frontmatter parser: only the fields we manage.
// CRLF (Windows) is normalized first so one code path serves all OSes.
function parseFrontmatter(input) {
  const body = String(input).replace(/\r\n/g, '\n');
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(body);
  if (!m) return { error: 'missing YAML frontmatter (--- ... ---)' };
  const raw = m[1];
  const content = m[2];
  const data = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf(':');
    if (i < 0) return { error: `bad frontmatter line: ${t}` };
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    data[k] = v;
  }
  if (!data.name) return { error: 'frontmatter requires name' };
  if (!data.description) return { error: 'frontmatter requires description' };
  if (!KEBAB_RE.test(data.name)) return { error: 'frontmatter name must be kebab-case' };
  for (const k of ['disable-model-invocation', 'user-invocable']) {
    if (data[k] !== undefined && !/^(true|false|yes|no|on|off|1|0)$/i.test(String(data[k]))) {
      return { error: `frontmatter field "${k}" must be a boolean` };
    }
  }
  return { data, content };
}

function toBool(v, dflt) {
  if (v === undefined) return dflt;
  return /^(true|yes|on|1)$/i.test(String(v));
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

// Locate the skill files under a root (one level deep only).
async function locate(root, name) {
  const dirBundle = join(root, name, 'SKILL.md');
  const flat = join(root, `${name}.md`);
  if (await exists(dirBundle)) return { kind: 'dir', path: dirBundle };
  if (await exists(flat)) return { kind: 'flat', path: flat };
  return null;
}

async function listSkills(root) {
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    try {
      let file = null;
      let kind = null;
      if (e.isDirectory()) { file = join(root, e.name, 'SKILL.md'); kind = 'dir'; }
      else if (e.isFile() && e.name.endsWith('.md')) { file = join(root, e.name); kind = 'flat'; }
      else continue;
      let body = null;
      try { body = await readFile(file, 'utf8'); } catch { continue; }
      const parsed = parseFrontmatter(body);
      const base = kind === 'dir' ? e.name : basename(e.name, '.md');
      if (parsed.error) { out.push({ name: base, kind, valid: false, error: parsed.error, path: file }); continue; }
      out.push({
        name: parsed.data.name, kind, valid: true, path: file,
        description: parsed.data.description,
        modelInvocable: !toBool(parsed.data['disable-model-invocation'], false),
        userInvocable: toBool(parsed.data['user-invocable'], true),
      });
    } catch { /* skip one bad entry */ }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function renderBody({ name, description, modelInvocable, userInvocable, content }) {
  const lines = ['---', `name: ${name}`, `description: ${description}`];
  if (!modelInvocable) lines.push('disable-model-invocation: true');
  if (!userInvocable) lines.push('user-invocable: false');
  lines.push('---', '', content.replace(/\s+$/, '') + '\n');
  return lines.join('\n');
}

export function apply(ctx, input) {
  const config = Config.parse(input ?? {});
  const log = (...a) => { try { ctx.logger?.info?.(...a); } catch {} };

  async function readJson(request) {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > 4 * 1024 * 1024) throw Object.assign(new Error('body too large'), { status: 413 });
    try { return await request.json(); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
  }

  const handlers = {
    async list(payload) {
      const scope = payload?.scope === 'user' ? 'user' : 'project';
      return { skills: await listSkills(dirFor(scope, payload)), root: dirFor(scope, payload), scope };
    },
    async get(payload) {
      const scope = payload?.scope === 'user' ? 'user' : 'project';
      checkName(payload?.name);
      const root = dirFor(scope, payload);
      const loc = await locate(root, payload.name);
      if (!loc) throw Object.assign(new Error('not found'), { status: 404 });
      const body = await readFile(loc.path, 'utf8');
      const parsed = parseFrontmatter(body);
      return { ...loc, body, frontmatter: parsed.data ?? null, parseError: parsed.error ?? null, root, scope };
    },
    async validate(payload) {
      const body = String(payload?.body ?? '');
      if (Buffer.byteLength(body) > config.maxBodyBytes) throw Object.assign(new Error('body too large'), { status: 413 });
      const parsed = parseFrontmatter(body);
      if (parsed.error) return { valid: false, error: parsed.error };
      return { valid: true, frontmatter: parsed.data };
    },
    async save(payload) {
      const scope = payload?.scope === 'user' ? 'user' : 'project';
      if (scope === 'user' && !config.allowUserWrite) throw Object.assign(new Error('user writes disabled'), { status: 403 });
      checkName(payload?.name);
      const body = String(payload?.body ?? '');
      if (!body) throw Object.assign(new Error('empty body'), { status: 400 });
      if (Buffer.byteLength(body) > config.maxBodyBytes) throw Object.assign(new Error('body too large'), { status: 413 });
      const parsed = parseFrontmatter(body);
      if (parsed.error) throw Object.assign(new Error(`invalid skill: ${parsed.error}`), { status: 400 });
      if (parsed.data.name !== payload.name) throw Object.assign(new Error('name mismatch between request and frontmatter'), { status: 400 });
      const root = dirFor(scope, payload);
      await mkdir(root, { recursive: true });
      const kind = payload?.kind === 'flat' ? 'flat' : 'dir';
      if (kind === 'flat') {
        await writeFile(join(root, `${payload.name}.md`), body, 'utf8');
      } else {
        await mkdir(join(root, payload.name), { recursive: true });
        await writeFile(join(root, payload.name, 'SKILL.md'), body, 'utf8');
      }
      return { saved: true, scope, kind, root };
    },
    // Enable/disable without touching the body: flip frontmatter flags.
    async setInvocation(payload) {
      const scope = payload?.scope === 'user' ? 'user' : 'project';
      if (scope === 'user' && !config.allowUserWrite) throw Object.assign(new Error('user writes disabled'), { status: 403 });
      checkName(payload?.name);
      const root = dirFor(scope, payload);
      const loc = await locate(root, payload.name);
      if (!loc) throw Object.assign(new Error('not found'), { status: 404 });
      const body = await readFile(loc.path, 'utf8');
      const parsed = parseFrontmatter(body);
      if (parsed.error) throw Object.assign(new Error(`invalid skill: ${parsed.error}`), { status: 400 });
      const next = renderBody({
        name: parsed.data.name,
        description: parsed.data.description,
        modelInvocable: payload.modelInvocable !== undefined ? !!payload.modelInvocable : !toBool(parsed.data['disable-model-invocation'], false),
        userInvocable: payload.userInvocable !== undefined ? !!payload.userInvocable : toBool(parsed.data['user-invocable'], true),
        content: parsed.content,
      });
      await writeFile(loc.path, next, 'utf8');
      return { saved: true, path: loc.path };
    },
    async remove(payload) {
      const scope = payload?.scope === 'user' ? 'user' : 'project';
      if (scope === 'user' && !config.allowUserWrite) throw Object.assign(new Error('user writes disabled'), { status: 403 });
      checkName(payload?.name);
      const root = dirFor(scope, payload);
      const loc = await locate(root, payload.name);
      if (!loc) throw Object.assign(new Error('not found'), { status: 404 });
      if (loc.kind === 'dir') await rm(join(root, payload.name), { recursive: true, force: true });
      else await rm(loc.path, { force: true });
      return { removed: true };
    },
    // Install: copy <srcDir>/SKILL.md (or <srcDir>/<name>.md) into the target root.
    async install(payload) {
      const scope = payload?.scope === 'user' ? 'user' : 'project';
      if (scope === 'user' && !config.allowUserWrite) throw Object.assign(new Error('user writes disabled'), { status: 403 });
      const src = resolve(String(payload?.srcDir ?? ''));
      if (!src || parse(src).root === src) throw Object.assign(new Error('invalid srcDir'), { status: 400 });
      const root = dirFor(scope, payload);
      await mkdir(root, { recursive: true });
      // Accept either a bundle dir (contains SKILL.md) or a single .md file.
      const st = await stat(src).catch(() => null);
      if (!st) throw Object.assign(new Error('srcDir not found'), { status: 404 });
      let name = typeof payload?.as === 'string' && payload.as ? payload.as : basename(src, '.md');
      checkName(name);
      if (st.isDirectory()) {
        const skillFile = join(src, 'SKILL.md');
        if (!(await exists(skillFile))) throw Object.assign(new Error('srcDir has no SKILL.md'), { status: 400 });
        const body = await readFile(skillFile, 'utf8');
        const parsed = parseFrontmatter(body);
        if (parsed.error) throw Object.assign(new Error(`invalid skill: ${parsed.error}`), { status: 400 });
        name = parsed.data.name; checkName(name);
        await mkdir(join(root, name), { recursive: true });
        await copyFile(skillFile, join(root, name, 'SKILL.md'));
        return { installed: true, name, kind: 'dir', root };
      } else if (src.endsWith('.md')) {
        const body = await readFile(src, 'utf8');
        const parsed = parseFrontmatter(body);
        if (parsed.error) throw Object.assign(new Error(`invalid skill: ${parsed.error}`), { status: 400 });
        name = parsed.data.name; checkName(name);
        await copyFile(src, join(root, `${name}.md`));
        return { installed: true, name, kind: 'flat', root };
      }
      throw Object.assign(new Error('srcDir must be a skill bundle dir or .md file'), { status: 400 });
    },
  };

  ctx.inject(['connection'], (scoped) => {
    let connection = null;
    try { connection = scoped.get('connection'); } catch { return; }
    if (!connection?.fetch || typeof connection.fetch.register !== 'function') {
      log(`${NS}: no connection.fetch; UI unavailable on this build`);
      return;
    }
    const disposers = [];
    for (const [method, fn] of Object.entries(handlers)) {
      const path = `/api/${NS}/${method}`;
      const route = {
        path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            const payload = await readJson(request);
            const value = await fn(payload ?? {});
            return json({ ok: true, value });
          } catch (error) {
            const status = error?.status ?? 500;
            return json({ ok: false, error: { code: `${NS}/${method}`, message: error?.message ?? String(error) } }, status);
          }
        },
      };
      try { disposers.push(connection.fetch.register(route)); } catch (e) { log(`${NS}: route ${path} failed`, e); }
    }
    scoped.effect(() => () => { for (const d of disposers) { try { d?.(); } catch {} } }, `${NS}: routes`);
  });

  // Optional agent tools (only if a tools service exists in this composition).
  try {
    ctx.inject(['tools', 'workspaceRegistry'], (scoped) => {
      const tools = scoped.get('tools');
      if (!tools || typeof tools.register !== 'function') return;
      const defs = [
        { name: 'skills_manager_list', description: 'List installed Agent Skills (project/user).', parameters: { type: 'object', properties: { scope: { type: 'string' } } } },
        { name: 'skills_manager_read', description: 'Read one skill body by name.', parameters: { type: 'object', properties: { scope: { type: 'string' }, name: { type: 'string' } }, required: ['name'] } },
        { name: 'skills_manager_validate', description: 'Validate a SKILL.md body without writing.', parameters: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] } },
      ];
      const impl = {
        skills_manager_list: (a) => handlers.list(a ?? {}),
        skills_manager_read: (a) => handlers.get(a ?? {}),
        skills_manager_validate: (a) => handlers.validate(a ?? {}),
      };
      const offs = defs.map((d) => { try { return tools.register({ ...d, execute: impl[d.name] }); } catch { return null; } });
      scoped.effect(() => () => { for (const o of offs) { try { o?.(); } catch {} } }, `${NS}: tools`);
    });
  } catch { /* tools are optional */ }

  log(`${NS} 0.1.0: routes mounted`);
}
