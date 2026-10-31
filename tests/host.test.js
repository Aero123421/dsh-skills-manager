import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat, chmod, realpath, readdir, truncate } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { apply, Config } from '../index.js';

const skill = (name = 'demo') => `---\nname: ${name}\ndescription: Test skill\n---\n\n# Instructions\nKeep exact bytes.  \n`;
async function fixture(t, config = {}) {
  // macOS /var is a symlink; fixtures must obey the same canonical-root policy.
  const temporaryRoot = await realpath(tmpdir());
  const base = await mkdtemp(join(temporaryRoot, 'dsh-skills-host-'));
  t.after(async () => {
    assert.equal(resolve(base).startsWith(join(temporaryRoot, 'dsh-skills-host-')), true);
    await rm(base, { recursive: true, force: true });
  });
  const projectRoot = join(base, 'project');
  // Isolate discovery from any .git supplied on a shared temp ancestor.
  await mkdir(join(projectRoot, '.git'), { recursive: true });
  const routes = new Map(), tools = new Map(), disposers = [];
  const services = {
    connection: { fetch: { register(route) {
      routes.set(route.path, route);
      const dispose = () => routes.delete(route.path);
      disposers.push(dispose);
      return dispose;
    } } },
    tools: { register(tool) {
      // Installed DSH ToolDefinition requires canonical output plus renderer.
      assert.equal(tool.output.schema.type, 'object');
      assert.equal(typeof tool.output.render, 'function');
      assert.equal(tool.parameters.type, 'object');
      tools.set(tool.name, tool);
      return () => tools.delete(tool.name);
    } },
    workingDirectory: { async ensure() { return projectRoot; } },
  };
  const ctx = {
    get: key => services[key],
    inject(_keys, callback) { callback(ctx); },
    effect(callback) { const dispose = callback(); if (dispose) t.after(dispose); },
  };
  apply(ctx, config);
  async function call(method, payload = {}, init = {}) {
    const route = routes.get(`/api/dsh-skills-manager/${method}`);
    assert.ok(route);
    assert.deepEqual(route.methods, ['POST']);
    assert.equal(route.requestBody, 'buffered');
    const request = new Request(`http://localhost${route.path}`, {
      method: 'POST', body: JSON.stringify({ scope: 'project', projectRoot, ...payload }), ...init,
    });
    const response = await route.fetch(request);
    return { status: response.status, ...await response.json() };
  }
  return { base, projectRoot, root: join(projectRoot, '.dsh', 'skills'), routes, tools, call, disposers };
}
async function create(f, { name = 'demo', kind = 'dir', body = skill(name) } = {}) {
  const result = await f.call('save', { name, kind, body, mode: 'create' });
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.value;
}
async function get(f, name = 'demo', kind = 'dir') {
  const result = await f.call('get', { name, kind });
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.value;
}
function identity(current) { return { name: current.name, kind: current.kind, expectedRevision: current.revision }; }
async function linkOrSkip(t, source, dest, directory = false) {
  try { await symlink(source, dest, directory ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file'); return true; }
  catch (error) { if (error.code === 'EPERM') { t.skip('symlink creation requires OS privileges'); return false; } throw error; }
}
function setHome(t, path) {
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = path;
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; });
}
async function assertNoStaging(root) {
  const names = await readdir(dirname(root));
  assert.deepEqual(names.filter((name) => name.startsWith('.dsh-skills-')), []);
}

test('frontmatter delimiters match DSH and reject trailing space or tab', async (t) => {
  const f = await fixture(t);
  const valid = '---\nname: demo\ndescription: Test skill\n---\n\nBody\n';
  assert.equal((await f.call('validate', { body: valid })).value.valid, true);
  const crlf = '---\r\nname: demo\r\ndescription: Test skill\r\n---\r\n\r\nBody\r\n';
  assert.equal((await create(f, { body: crlf })).revision.length, 64);
  assert.equal((await get(f)).body, crlf);
  for (const body of [
    '--- \nname: demo\ndescription: Test skill\n---\n\nBody\n',
    '---\t\nname: demo\ndescription: Test skill\n---\n\nBody\n',
    '---\nname: spaced\ndescription: Audit fixture\n--- \n\nInstructions.\n',
    '---\nname: spaced\ndescription: Audit fixture\n---\t\n\nInstructions.\n',
  ]) {
    const validated = await f.call('validate', { body });
    assert.equal(validated.status, 200);
    assert.equal(validated.value.valid, false, body);
    assert.match(validated.value.error, /frontmatter/);
    assert.equal((await f.call('save', { mode: 'create', name: 'spaced', kind: 'flat', body })).status, 400);
  }
  await writeFile(join(f.root, 'spaced.md'), '--- \nname: spaced\ndescription: Audit fixture\n---\n\nInstructions.\n');
  const listed = (await f.call('list')).value.skills.find((item) => item.storageName === 'spaced');
  assert.equal(listed.valid, false);
  assert.match(listed.error, /frontmatter/);
});

test('Config implements the Cordis Standard Schema contract and rejects unsafe limits', () => {
  assert.equal(Config['~standard'].version, 1);
  assert.deepEqual(Config['~standard'].validate(undefined).value, { allowUserWrite: true, allowRemoteInstall: true, maxBodyBytes: 262144 });
  for (const maxBodyBytes of [0, -1, Infinity, 1.5, 4194305]) assert.ok(Config['~standard'].validate({ maxBodyBytes }).issues);
  assert.ok(Config['~standard'].validate({ allowUserWrite: 'true' }).issues);
  assert.ok(Config['~standard'].validate({ allowRemoteInstall: 'true' }).issues);
  assert.ok(Config['~standard'].validate(null).issues);
});

test('save/list/read expose exact bodies, storage identity and stable content revisions', async (t) => {
  const f = await fixture(t);
  const saved = await create(f);
  const listed = await f.call('list');
  assert.equal(listed.value.skills[0].storageName, 'demo');
  assert.equal(listed.value.skills[0].valid, true);
  assert.equal(listed.value.skills[0].kind, 'dir');
  assert.equal(listed.value.skills[0].revision, saved.revision);
  const current = await get(f);
  assert.equal(current.body, skill());
  assert.equal(current.revision, saved.revision);
  assert.equal((await f.call('get', { name: 'demo' })).value.kind, 'dir');
  assert.equal((await f.call('save', { mode: 'create', name: '../escape', body: skill() })).status, 400);
  assert.equal((await f.call('list', { scope: 'other' })).status, 400);
  assert.equal((await f.call('list', { projectRoot: resolve(f.projectRoot).split(/[\\/]/)[0] + '/' })).status, 400);
  assert.equal((await f.call('list', { projectRoot: 'relative' })).status, 400);
});

test('nested cwd uses the nearest Git root for CRUD, imports and agent tools', async (t) => {
  for (const gitKind of ['directory', 'worktree-file']) await t.test(gitKind, async (t) => {
    const f = await fixture(t), nested = join(f.projectRoot, 'packages', 'nested');
    await mkdir(nested, { recursive: true });
    if (gitKind === 'worktree-file') {
      await rm(join(f.projectRoot, '.git'), { recursive: true });
      await writeFile(join(f.projectRoot, '.git'), 'gitdir: /unused-fixture-target\n');
    }
    const oldRoot = join(nested, '.dsh', 'skills');
    await mkdir(oldRoot, { recursive: true });
    await writeFile(join(oldRoot, 'legacy.md'), skill('legacy'));
    const saved = await f.call('save', { projectRoot: nested, mode: 'create', name: 'demo', kind: 'dir', body: skill() });
    assert.equal(saved.status, 200);
    assert.equal(saved.value.root, f.root);
    assert.equal(saved.value.path, join(f.root, 'demo', 'SKILL.md'));
    const listed = await f.call('list', { projectRoot: nested });
    assert.equal(listed.value.root, f.root);
    assert.deepEqual(listed.value.skills.map(item => item.name), ['demo']);
    const direct = await get(f);
    const read = await f.tools.get('skills_manager_read').execute({ projectRoot: nested, name: 'demo', kind: 'dir' });
    assert.equal(read.root, f.root);
    assert.equal(read.revision, direct.revision);
    const toggled = await f.call('setInvocation', { projectRoot: nested, ...identity(direct), modelInvocable: false });
    assert.equal(toggled.status, 200);
    assert.equal((await get(f)).revision, toggled.value.revision);
    assert.equal((await f.call('remove', { projectRoot: nested, ...identity(toggled.value) })).status, 200);
    const source = join(f.base, 'source');
    await mkdir(source); await writeFile(join(source, 'SKILL.md'), skill());
    const installed = await f.call('install', { projectRoot: nested, srcDir: source });
    assert.equal(installed.status, 200);
    assert.equal(installed.value.root, f.root);
    assert.equal(await readFile(join(oldRoot, 'legacy.md'), 'utf8'), skill('legacy'));
    await mkdir(join(nested, '.git'));
    assert.equal((await f.call('list', { projectRoot: nested })).value.root, oldRoot, 'nearer Git root wins');
  });
});

test('project cwd without Git keeps its own root and cancelled tools do no work', async (t) => {
  const f = await fixture(t), nested = join(f.projectRoot, 'nested');
  await mkdir(nested);
  t.mock.method(fs, 'access', async () => { throw Object.assign(new Error('no Git fixture'), { code: 'ENOENT' }); });
  assert.equal((await f.call('list', { projectRoot: nested })).value.root, join(nested, '.dsh', 'skills'));
  const controller = new AbortController();
  controller.abort(new Error('fixture cancelled'));
  for (const tool of f.tools.values()) await assert.rejects(tool.execute({}, { signal: controller.signal }), /fixture cancelled/);
});

test('save is never an upsert; create conflicts across both formats and update requires CAS', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('save', { name: 'demo', body: skill() })).status, 400);
  const original = await create(f, { kind: 'flat' });
  for (const kind of ['flat', 'dir']) assert.equal((await f.call('save', { mode: 'create', kind, name: 'demo', body: skill() + 'other' })).status, 409);
  for (const extra of [{}, { kind: 'flat' }, { expectedRevision: original.revision }, { kind: 'other', expectedRevision: original.revision }]) {
    assert.equal((await f.call('save', { mode: 'update', name: 'demo', body: skill(), ...extra })).status, 400);
  }
  assert.equal((await f.call('save', { mode: 'update', ...identity(original), expectedRevision: 'stale', body: skill() })).status, 409);
  assert.equal((await f.call('save', { mode: 'update', ...identity(original), name: 'missing', body: skill('missing') })).status, 409);
  const body = skill() + '\nChanged ✓\n';
  const updated = await f.call('save', { mode: 'update', ...identity(original), body });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.value.revision, original.revision);
  assert.equal((await get(f, 'demo', 'flat')).body, body);
  assert.equal((await f.call('remove', identity(original))).status, 409);
  assert.equal((await f.call('setInvocation', { ...identity(original), modelInvocable: false })).status, 409);
  for (const method of ['remove', 'setInvocation']) {
    assert.equal((await f.call(method, { name: 'demo', kind: 'flat' })).status, 400);
    assert.equal((await f.call(method, { name: 'demo', expectedRevision: updated.value.revision })).status, 400);
  }
  await assert.rejects(stat(join(f.root, 'demo')), { code: 'ENOENT' });
});

test('colliding directory and flat names are read, toggled and removed only by exact kind', async (t) => {
  const f = await fixture(t);
  const dirBody = skill() + 'directory instructions\n', flatBody = skill() + 'flat instructions\n';
  await mkdir(join(f.root, 'demo'), { recursive: true });
  await writeFile(join(f.root, 'demo', 'SKILL.md'), dirBody);
  await writeFile(join(f.root, 'demo.md'), flatBody);
  const dir = await get(f), flat = await get(f, 'demo', 'flat');
  assert.equal(dir.body, dirBody); assert.equal(flat.body, flatBody);
  assert.notEqual(dir.revision, flat.revision);
  assert.deepEqual((await f.call('list')).value.skills.map(({ kind, revision }) => ({ kind, revision })), [{ kind: 'dir', revision: dir.revision }, { kind: 'flat', revision: flat.revision }]);
  assert.equal((await f.call('get', { name: 'demo' })).status, 409);
  for (const method of ['save', 'setInvocation', 'remove']) {
    assert.equal((await f.call(method, { name: 'demo', mode: 'update', body: skill(), expectedRevision: dir.revision })).status, 409);
  }
  assert.equal((await f.call('save', { mode: 'update', ...identity(flat), expectedRevision: dir.revision, body: flatBody })).status, 409);
  const toggled = await f.call('setInvocation', { ...identity(flat), modelInvocable: false });
  assert.equal(toggled.status, 200);
  assert.equal((await get(f)).body, dirBody);
  assert.match((await get(f, 'demo', 'flat')).body, /disable-model-invocation: true/);
  assert.equal((await f.call('remove', identity(dir))).status, 200);
  assert.equal((await f.call('get', { name: 'demo', kind: 'dir' })).status, 404);
  assert.equal((await get(f, 'demo', 'flat')).revision, toggled.value.revision);
});

test('atomic update leaves readers on original bytes until publish and concurrent CAS has one winner', { timeout: 15000 }, async (t) => {
  const f = await fixture(t), alternate = await fixture(t);
  const original = await create(f);
  const originalOpen = fs.open;
  let enter, release;
  const entered = new Promise((done) => { enter = done; });
  const resume = new Promise((done) => { release = done; });
  t.after(() => release());
  let intercepted = false;
  t.mock.method(fs, 'open', async (path, flags, ...args) => {
    const handle = await originalOpen(path, flags, ...args);
    if (!intercepted && basename(path).startsWith('.dsh-skills-') && (flags & constants.O_WRONLY)) {
      intercepted = true;
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (body) => {
        const bytes = Buffer.from(body), middle = Math.floor(bytes.length / 2);
        await write(bytes.subarray(0, middle)); enter();
        await resume; await write(bytes.subarray(middle));
      };
    }
    return handle;
  });
  const winner = skill() + 'A'.repeat(90000) + '\n';
  const first = f.call('save', { mode: 'update', ...identity(original), body: winner });
  await entered;
  assert.equal((await get(f)).body, skill());
  const pending = [
    alternate.call('save', { projectRoot: f.projectRoot, mode: 'update', ...identity(original), body: skill() + 'B'.repeat(70000) }),
    f.call('setInvocation', { ...identity(original), userInvocable: false }),
    f.call('remove', identity(original)),
  ];
  release();
  assert.equal((await first).status, 200);
  assert.deepEqual((await Promise.all(pending)).map((result) => result.status), [409, 409, 409]);
  assert.equal((await get(f)).body, winner);
  assert.deepEqual((await readdir(join(f.root, 'demo'))), ['SKILL.md']);
});

test('failed partial temp write and failed rename never destroy the original', async (t) => {
  const f = await fixture(t), original = await create(f);
  const originalOpen = fs.open;
  const mocked = t.mock.method(fs, 'open', async (path, flags, ...args) => {
    const handle = await originalOpen(path, flags, ...args);
    if (basename(path).startsWith('.dsh-skills-') && (flags & constants.O_WRONLY)) {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (body) => { await write(Buffer.from(body).subarray(0, 23)); throw Object.assign(new Error('injected disk full'), { code: 'ENOSPC' }); };
    }
    return handle;
  });
  assert.equal((await f.call('save', { mode: 'update', ...identity(original), body: skill() + 'changed' })).status, 500);
  assert.equal((await get(f)).body, skill());
  assert.equal((await get(f)).revision, original.revision);
  assert.deepEqual(await readdir(join(f.root, 'demo')), ['SKILL.md']);
  mocked.mock.restore();
  t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('injected rename failure'), { code: 'EIO' }); });
  assert.equal((await f.call('save', { mode: 'update', ...identity(original), body: skill() + 'changed' })).status, 500);
  assert.equal((await get(f)).body, skill());
  assert.deepEqual(await readdir(join(f.root, 'demo')), ['SKILL.md']);
});

test('concurrent creates and installs cannot publish both formats of one name', async (t) => {
  const f = await fixture(t), alternate = await fixture(t);
  const src = join(f.base, 'source.md');
  await writeFile(src, skill());
  const results = await Promise.all([
    f.call('save', { mode: 'create', name: 'demo', kind: 'dir', body: skill() }),
    alternate.call('save', { projectRoot: f.projectRoot, mode: 'create', name: 'demo', kind: 'flat', body: skill() }),
    f.call('install', { srcDir: src }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409, 409]);
  assert.equal((await f.call('list')).value.skills.length, 1);
  await assertNoStaging(f.root);
});

test('toggle preserves quoted keys, unknown YAML, comments, CRLF, and exact instruction bytes', async (t) => {
  const f = await fixture(t);
  const original = '---\r\n"name": demo\r\n\'description\': >\r\n  Multiple lines\r\n  still work.\r\nmetadata:\r\n  author: Test\r\n  nested:\r\n    - x\r\nlicense: MIT\r\n"disable-model-invocation": false # keep comment\r\n---\r\n\r\nDo exactly this.  \r\n\r\n';
  const saved = await create(f, { body: original });
  const toggle = await f.call('setInvocation', { ...identity(saved), modelInvocable: false, userInvocable: false });
  assert.equal(toggle.status, 200);
  const next = await get(f);
  assert.equal(next.body, original.replace('false # keep comment', 'true # keep comment').replace('---\r\n\r\nDo', 'user-invocable: false\r\n---\r\n\r\nDo'));
  assert.equal(next.frontmatter['disable-model-invocation'], true);
  assert.equal(next.frontmatter['user-invocable'], false);
  assert.equal(next.frontmatter.description, 'Multiple lines still work.\n');
  assert.equal((await f.call('setInvocation', { ...identity(next), modelInvocable: 'false' })).status, 400);
  const again = await f.call('setInvocation', { ...identity(next), modelInvocable: true });
  assert.equal(again.status, 200);
  assert.equal((await get(f)).body.match(/disable-model-invocation/g).length, 1);
});

test('YAML parser validates quoted duplicates, nested syntax, mapping shape, and DSH legacy fields', async (t) => {
  const f = await fixture(t);
  const bodies = [
    '---\nname: demo\n"name": demo\ndescription: valid\n---\nbody',
    '---\nname: demo\ndescription: valid\nmetadata: [broken\n---\nbody',
    '---\n- name: demo\n- description: valid\n---\nbody',
    ...['null', '42', 'false', '[]', '{}', '""', '"  "'].map((value) => `---\nname: demo\ndescription: ${value}\n---\nbody`),
    ...['disableModelInvocation', 'modelInvocable', 'userInvocable'].map((key) => skill().replace('description: Test skill', `description: Test skill\n"${key}": false`)),
    ...['null', '[]', '{}', '2', 'perhaps'].map((value) => skill().replace('description: Test skill', `description: Test skill\n"user-invocable": ${value}`)),
  ];
  for (const body of bodies) {
    const result = await f.call('validate', { body });
    assert.equal(result.status, 200);
    assert.equal(result.value.valid, false, body);
    assert.equal((await f.call('save', { mode: 'create', name: 'demo', body })).status, 400);
  }
  for (const value of ['true', 'false', '"YES"', "'off'", 'on', 'no', '1', '0', '"0"']) {
    assert.equal((await f.call('validate', { body: skill().replace('description: Test skill', `description: Test skill\n"user-invocable": ${value}`) })).value.valid, true, value);
  }
});

test('AST toggle supports flow mappings, escaped quoted keys, aliases, and boolean strings without duplicate keys', async (t) => {
  const f = await fixture(t);
  const body = '---\n{ "name": demo, description: "Flow: value", "disable-model-\\u0069nvocation": "yes", metadata: { unknown: [1, 2] } } # root comment\n---\n\nExact body\n';
  const saved = await create(f, { body });
  const result = await f.call('setInvocation', { ...identity(saved), modelInvocable: true, userInvocable: false });
  assert.equal(result.status, 200);
  const next = await get(f);
  assert.equal(next.body, body.replace('{ "name"', '{user-invocable: false,  "name"').replace(': "yes"', ': false'));
  assert.equal(next.frontmatter['disable-model-invocation'], false);
  assert.equal(next.frontmatter['user-invocable'], false);
  assert.deepEqual(next.frontmatter.metadata, { unknown: [1, 2] });
  const aliased = '---\nname: demo\ndescription: Test\nmetadata:\n  flag: &flag true\n"user-invocable": *flag # retain alias comment\n---\nBody\n';
  const update = await f.call('save', { mode: 'update', ...identity(next), body: aliased });
  assert.equal(update.status, 200);
  assert.equal((await f.call('setInvocation', { ...identity(update.value), userInvocable: false })).status, 200);
  assert.equal((await get(f)).body, aliased.replace('*flag #', 'false #'));
});

test('editing anchored invocation scalars preserves untargeted aliases and metadata values', async (t) => {
  const f = await fixture(t);
  const body = '---\nname: demo\ndescription: Test\ndisable-model-invocation: &flag false # anchor comment\nuser-invocable: *flag # other invocation\nmetadata:\n  flag: *flag # metadata alias\n---\nExact body\n';
  const saved = await create(f, { body });
  assert.equal((await f.call('setInvocation', { ...identity(saved), modelInvocable: false })).status, 200);
  const next = await get(f);
  assert.equal(next.frontmatter['disable-model-invocation'], true);
  assert.equal(next.frontmatter['user-invocable'], false);
  assert.equal(next.frontmatter.metadata.flag, false);
  assert.equal(next.body, body.replace('&flag false', '&flag true').replaceAll('*flag', 'false'));
  const stringBody = body.replace('&flag false', '&flag "no"');
  const updated = await f.call('save', { mode: 'update', ...identity(next), body: stringBody });
  assert.equal(updated.status, 200);
  assert.equal((await f.call('setInvocation', { ...identity(updated.value), modelInvocable: false, userInvocable: true })).status, 200);
  const final = await get(f);
  assert.equal(final.frontmatter['disable-model-invocation'], true);
  assert.equal(final.frontmatter['user-invocable'], true);
  assert.equal(final.frontmatter.metadata.flag, 'no');
  assert.match(final.body, /flag: "no" # metadata alias/);
});

test('invalid and empty existing skills retain revisions for repair or exact removal', async (t) => {
  const f = await fixture(t);
  await mkdir(f.root, { recursive: true });
  await writeFile(join(f.root, 'demo.md'), '');
  const current = await get(f, 'demo', 'flat');
  assert.equal(current.body, '');
  assert.ok(current.parseError);
  assert.equal((await f.call('list')).value.skills[0].revision, current.revision);
  assert.equal((await f.call('save', { mode: 'update', ...identity(current), body: skill() })).status, 200);
  const repaired = await get(f, 'demo', 'flat');
  assert.notEqual(repaired.revision, current.revision);
  await writeFile(join(f.root, 'demo.md'), 'invalid external edit');
  assert.equal((await f.call('remove', identity(repaired))).status, 409);
  assert.equal((await f.call('remove', identity(await get(f, 'demo', 'flat')))).status, 200);
});

test('bundle install copies resources, executable bits and empty directories; refuses either-format overwrites', async (t) => {
  const f = await fixture(t);
  const source = join(f.base, 'source');
  for (const dir of ['references', 'scripts', 'assets/nested', 'empty']) await mkdir(join(source, dir), { recursive: true });
  await writeFile(join(source, 'SKILL.md'), skill());
  await writeFile(join(source, 'references', 'guide.md'), 'reference');
  await writeFile(join(source, 'scripts', 'run.sh'), '#!/bin/sh\ntrue\n');
  await chmod(join(source, 'scripts', 'run.sh'), 0o755);
  await writeFile(join(source, 'assets', 'nested', 'data.bin'), Buffer.from([0, 255, 20]));
  const installed = await f.call('install', { srcDir: source });
  assert.equal(installed.status, 200);
  assert.equal(installed.value.revision, (await get(f)).revision);
  assert.equal(await readFile(join(f.root, 'demo', 'references', 'guide.md'), 'utf8'), 'reference');
  if (process.platform !== 'win32') assert.equal((await stat(join(f.root, 'demo', 'scripts', 'run.sh'))).mode & 0o111, 0o111);
  assert.deepEqual(await readFile(join(f.root, 'demo', 'assets', 'nested', 'data.bin')), Buffer.from([0, 255, 20]));
  assert.equal((await stat(join(f.root, 'demo', 'empty'))).isDirectory(), true);
  await writeFile(join(f.root, 'demo', 'references', 'guide.md'), 'local edit');
  assert.equal((await f.call('install', { srcDir: source })).status, 409);
  assert.equal(await readFile(join(f.root, 'demo', 'references', 'guide.md'), 'utf8'), 'local edit');
  const flat = join(f.base, 'source.md'); await writeFile(flat, skill());
  assert.equal((await f.call('install', { srcDir: flat })).status, 409);
  assert.equal((await f.call('remove', identity(await get(f)))).status, 200);
  await create(f, { kind: 'flat' });
  assert.equal((await f.call('install', { srcDir: source })).status, 409);
  assert.equal((await f.call('install', { srcDir: '' })).status, 400);
  await assertNoStaging(f.root);
});

test('install is staged outside discovery and a failed copy publishes nothing and cleans staging', async (t) => {
  const f = await fixture(t), source = join(f.base, 'source');
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), skill());
  await writeFile(join(source, 'resource.bin'), 'resource bytes');
  const originalOpen = fs.open;
  let inspected = false;
  t.mock.method(fs, 'open', async (path, flags, ...args) => {
    const handle = await originalOpen(path, flags, ...args);
    if (basename(path) === 'resource.bin' && (flags & constants.O_WRONLY)) {
      inspected = true;
      assert.equal(dirname(dirname(path)), dirname(f.root));
      assert.deepEqual((await f.call('list')).value.skills, []);
      await assert.rejects(stat(join(f.root, 'demo')), { code: 'ENOENT' });
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (bytes) => { await write(bytes.subarray(0, 3)); throw Object.assign(new Error('injected copy failure'), { code: 'ENOSPC' }); };
    }
    return handle;
  });
  assert.equal((await f.call('install', { srcDir: source })).status, 500);
  assert.equal(inspected, true);
  assert.deepEqual((await f.call('list')).value.skills, []);
  await assertNoStaging(f.root);
});

test('bundle byte, entry and depth limits fail before publication', { timeout: 30000 }, async (t) => {
  const f = await fixture(t), source = join(f.base, 'source');
  await mkdir(source); await writeFile(join(source, 'SKILL.md'), skill());
  const huge = join(source, 'large.bin');
  await writeFile(huge, ''); await truncate(huge, 32 * 1024 * 1024 + 1);
  assert.equal((await f.call('install', { srcDir: source })).status, 413);
  await rm(huge);
  let deep = source;
  for (let i = 0; i < 33; i++) { deep = join(deep, 'd'); await mkdir(deep); }
  assert.equal((await f.call('install', { srcDir: source })).status, 400);
  await rm(join(source, 'd'), { recursive: true });
  for (let start = 0; start < 2048; start += 64) await Promise.all(Array.from({ length: 64 }, (_, offset) => mkdir(join(source, `empty-${start + offset}`))));
  assert.equal((await f.call('install', { srcDir: source })).status, 413);
  await assert.rejects(stat(join(f.root, 'demo')), { code: 'ENOENT' });
});

test('source bundle symlinks reject before creating destination', async (t) => {
  const f = await fixture(t), source = join(f.base, 'source');
  await mkdir(source); await writeFile(join(source, 'SKILL.md'), skill());
  if (!await linkOrSkip(t, f.projectRoot, join(source, 'linked'), true)) return;
  assert.equal((await f.call('install', { srcDir: source })).status, 403);
  await assert.rejects(stat(join(f.root, 'demo')), { code: 'ENOENT' });
});

test('symlink skill files and ancestor roots cannot be read or mutated', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'demo'), { recursive: true });
  const outside = join(f.base, 'outside.md'); await writeFile(outside, skill());
  if (!await linkOrSkip(t, outside, join(f.root, 'demo', 'SKILL.md'))) return;
  for (const method of ['get', 'save', 'setInvocation', 'remove']) {
    assert.equal((await f.call(method, { name: 'demo', kind: 'dir', mode: 'update', expectedRevision: 'any', body: skill(), modelInvocable: false })).status, 403);
  }
  assert.equal(await readFile(outside, 'utf8'), skill());
  const linkedProject = join(f.base, 'linked-project');
  if (!await linkOrSkip(t, f.projectRoot, linkedProject, true)) return;
  assert.equal((await f.call('save', { projectRoot: linkedProject, mode: 'create', name: 'demo', body: skill() })).status, 403);
});

test('skill and streamed request body limits are enforced without content-length', async (t) => {
  const f = await fixture(t, { maxBodyBytes: 100 });
  assert.equal((await f.call('validate', { body: skill() + 'x'.repeat(100) })).status, 413);
  assert.equal((await f.call('save', { mode: 'create', name: 'demo', body: skill() + 'x'.repeat(100) })).status, 413);
  const oversize = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4194305)); controller.close(); } });
  assert.equal((await f.call('validate', {}, { body: oversize, duplex: 'half' })).status, 413);
  assert.equal((await f.call('validate', {}, { body: '[]' })).status, 400);
});

test('user read-only gate follows actual canonical roots even through project scope and DSH_HOME aliases', async (t) => {
  const f = await fixture(t, { allowUserWrite: false });
  for (const method of ['save', 'setInvocation', 'remove', 'install']) assert.equal((await f.call(method, { scope: 'user' })).status, 403);
  setHome(t, join(f.projectRoot, '.dsh'));
  await mkdir(join(f.root, 'demo'), { recursive: true });
  await writeFile(join(f.root, 'demo', 'SKILL.md'), skill());
  const current = await get(f), source = join(f.base, 'source.md'); await writeFile(source, skill('other'));
  for (const scope of ['project', 'user']) {
    assert.equal((await f.call('list', { scope })).value.skills[0].revision, current.revision);
    for (const [method, extra] of [['save', { mode: 'update', body: skill() + 'change' }], ['setInvocation', { modelInvocable: false }], ['remove', {}], ['install', { srcDir: source }]]) {
      assert.equal((await f.call(method, { scope, ...identity(current), ...extra })).status, 403, method);
    }
    assert.equal((await f.call('save', { scope, mode: 'create', name: 'other', body: skill('other') })).status, 403);
  }
  assert.equal((await get(f)).body, skill());
  // A symlink on the DSH_HOME side still aliases the unchanged project target.
  const alias = join(f.base, 'home-alias');
  if (!await linkOrSkip(t, join(f.projectRoot, '.dsh'), alias, true)) return;
  process.env.DSH_HOME = alias;
  assert.equal((await f.call('remove', identity(current))).status, 403);
});

test('project and user scope aliases serialize across apply instances when writes are allowed', async (t) => {
  const f = await fixture(t), alternate = await fixture(t);
  setHome(t, join(f.projectRoot, '.dsh'));
  const current = await create(f);
  const results = await Promise.all([
    f.call('save', { mode: 'update', ...identity(current), body: skill() + 'project' }),
    alternate.call('save', { scope: 'user', mode: 'update', ...identity(current), body: skill() + 'user' }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const body = (await get(f)).body;
  assert.ok(body === skill() + 'project' || body === skill() + 'user');
});

test('read-only tools retain installed contracts, cwd fallback, and exact-kind reads', async (t) => {
  const f = await fixture(t, { allowUserWrite: false });
  assert.equal(f.tools.size, 3);
  const exec = { agent: {}, signal: new AbortController().signal };
  const value = await f.tools.get('skills_manager_list').execute({}, exec);
  assert.equal(value.root, f.root);
  assert.deepEqual(f.tools.get('skills_manager_list').output.render({}, value), [{ type: 'text', text: JSON.stringify(value) }]);
  assert.equal((await f.tools.get('skills_manager_validate').execute({ body: skill() })).valid, true);
  await create(f, { kind: 'flat' });
  assert.deepEqual(f.tools.get('skills_manager_read').parameters.properties.kind.enum, ['dir', 'flat']);
  const current = await f.tools.get('skills_manager_read').execute({ name: 'demo', kind: 'flat' }, exec);
  assert.equal(current.body, skill()); assert.equal(typeof current.revision, 'string');
});

// All retrieval is deterministic in-process HTTP data; the pinned CLI sees only
// the verified local snapshot and never contacts a real network or user profile.
function githubFixture(t, initial = {}) {
  let content = initial.body ?? skill(), resource = initial.resource ?? 'upstream resource', commit = initial.commit ?? 'a'.repeat(40), calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    const api = 'https://api.github.com/repos/acme/skills';
    if (url === api) return Response.json({ private: false, default_branch: 'main' });
    if (new URL(url).origin + new URL(url).pathname === `${api}/commits/main`) return Response.json({ sha: commit, commit: { tree: { sha: 'b'.repeat(40) } } });
    if (url === `${api}/git/trees/${'b'.repeat(40)}?recursive=1`) return Response.json({ truncated: false, tree: [
      { path: 'demo', type: 'tree', mode: '040000' },
      { path: 'demo/SKILL.md', type: 'blob', mode: '100644', size: Buffer.byteLength(content) },
      { path: 'demo/resource.txt', type: 'blob', mode: '100644', size: Buffer.byteLength(resource) },
    ] });
    const prefix = `https://raw.githubusercontent.com/acme/skills/${commit}/demo/`;
    if (url === `${prefix}SKILL.md`) return new Response(content);
    if (url === `${prefix}resource.txt`) return new Response(resource);
    throw new Error(`unexpected external request: ${url}`);
  });
  return { change(next = {}) { content = next.body ?? content; resource = next.resource ?? resource; commit = next.commit ?? commit; }, calls: () => calls };
}
async function remoteInstall(f) {
  const prepared = await f.call('prepareRemote', { input: 'npx skills add acme/skills' });
  assert.equal(prepared.status, 200, JSON.stringify(prepared));
  const installed = await f.call('installRemote', { token: prepared.value.token, skillNames: ['demo'] });
  assert.equal(installed.status, 200, JSON.stringify(installed)); assert.equal(installed.value.installed, true);
  return get(f);
}

test('remote routes respect operator disable and user write gates before retrieval', async t => {
  const disabled = await fixture(t, { allowRemoteInstall: false });
  for (const method of ['prepareRemote', 'installRemote', 'discardRemote']) {
    assert.ok(disabled.routes.has(`/api/dsh-skills-manager/${method}`));
  }
  assert.equal((await disabled.call('prepareRemote', { input: 'npx skills add owner/repo' })).status, 403);
  // Local operations remain usable when remote retrieval is disabled.
  await create(disabled);
  const readOnly = await fixture(t, { allowUserWrite: false });
  assert.equal((await readOnly.call('prepareRemote', { scope: 'user', input: 'npx skills add owner/repo' })).status, 403);
});

test('trusted GitHub installs record full final provenance; local saves preserve the baseline and flat metadata stays unsupported', async t => {
  const f = await fixture(t); githubFixture(t);
  const current = await remoteInstall(f);
  assert.equal(current.update.supported, true);
  assert.equal(current.update.origin.source, 'https://github.com/acme/skills');
  assert.equal(current.update.origin.commit, 'a'.repeat(40));
  assert.equal(current.update.origin.baselineHash, current.update.treeHash);
  assert.match(current.update.originRevision, /^[a-f0-9]{64}$/);
  assert.equal(current.manifest, undefined);
  assert.equal((await f.call('setInvocation', { ...identity(current), modelInvocable: false })).status, 200);
  const dirty = await get(f);
  assert.equal(dirty.update.originRevision, current.update.originRevision);
  assert.equal(dirty.update.origin.baselineHash, current.update.treeHash);
  assert.notEqual(dirty.update.treeHash, current.update.treeHash);
  await writeFile(join(f.root, 'demo.md'), skill());
  assert.equal((await get(f, 'demo', 'flat')).update.supported, false);
  assert.equal((await f.call('prepareUpdate', { name: 'demo', kind: 'flat', source: 'acme/skills' })).status, 400);
  assert.equal((await f.call('remove', identity(dirty))).status, 200);
  await assert.rejects(stat(join(dirname(f.root), 'skills-manager', 'demo', 'origin.json')), { code: 'ENOENT' });
  assert.equal((await get(f, 'demo', 'flat')).body, skill());
});

test('whole-tree update CAS rejects unseen resource edits even with force and successful replacement preserves complete backup', async t => {
  const f = await fixture(t), github = githubFixture(t);
  const current = await remoteInstall(f);
  github.change({ resource: 'new upstream resource', commit: 'c'.repeat(40) });
  const request = { name: 'demo', kind: 'dir', expectedRevision: current.revision };
  const prepared = await f.call('prepareUpdate', request);
  assert.equal(prepared.status, 200, JSON.stringify(prepared)); assert.equal(prepared.value.requiresOverwrite, false);
  assert.equal(prepared.value.summary.modified, 1);
  await writeFile(join(f.root, 'demo', 'resource.txt'), 'unseen local resource edit');
  assert.equal((await get(f)).revision, current.revision);
  const stale = await f.call('applyUpdate', { name: 'demo', kind: 'dir', token: prepared.value.token, allowLocalChanges: true });
  assert.equal(stale.status, 409, JSON.stringify(stale));
  assert.equal(await readFile(join(f.root, 'demo', 'resource.txt'), 'utf8'), 'unseen local resource edit');
  const dirty = await f.call('prepareUpdate', request);
  assert.equal(dirty.status, 200, JSON.stringify(dirty)); assert.equal(dirty.value.requiresOverwrite, true);
  const apply = { name: 'demo', kind: 'dir', token: dirty.value.token };
  assert.equal((await f.call('applyUpdate', apply)).status, 409);
  await writeFile(join(f.root, 'demo.md'), skill() + 'flat remains');
  const updated = await f.call('applyUpdate', { ...apply, allowLocalChanges: true });
  assert.equal(updated.status, 200, JSON.stringify(updated)); assert.equal(updated.value.updated, true);
  assert.equal(await readFile(join(updated.value.backup.path, 'tree', 'resource.txt'), 'utf8'), 'unseen local resource edit');
  assert.equal(JSON.parse(await readFile(join(updated.value.backup.path, 'origin.json'), 'utf8')).baselineHash, current.update.treeHash);
  assert.equal(await readFile(join(f.root, 'demo', 'resource.txt'), 'utf8'), 'new upstream resource');
  assert.equal((await get(f, 'demo', 'flat')).body, skill() + 'flat remains');
  const final = await get(f);
  assert.equal(final.update.origin.baselineHash, final.update.treeHash); assert.equal(final.update.origin.commit, 'c'.repeat(40));
});

test('local HTTP imports cannot forge provenance and clear stale directory associations', async t => {
  const f = await fixture(t); githubFixture(t); await remoteInstall(f);
  await rm(join(f.root, 'demo'), { recursive: true }); // Simulate a local-owner manual deletion.
  const source = join(f.base, 'local'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), skill());
  const installed = await f.call('install', { srcDir: source, source: 'acme/forged', commit: 'f'.repeat(40), originProof: { source: 'acme/forged', commit: 'f'.repeat(40) } });
  assert.equal(installed.status, 200, JSON.stringify(installed));
  const current = await get(f); assert.equal(current.update.origin, null); assert.equal(current.update.originRevision, null);
});

test('fresh directory creation clears stale GitHub provenance instead of inheriting a deleted installation', async t => {
  const f = await fixture(t); githubFixture(t); await remoteInstall(f);
  await rm(join(f.root, 'demo'), { recursive: true });
  await create(f, { body: skill() + 'freshly authored locally' });
  const current = await get(f);
  assert.equal(current.update.origin, null); assert.equal(current.update.originRevision, null);
  await assert.rejects(stat(join(dirname(f.root), 'skills-manager', 'demo', 'origin.json')), { code: 'ENOENT' });
});

test('unsafe resources or malformed provenance explicitly disable updates without blocking v0.4 body repair and removal', async t => {
  const f = await fixture(t); await create(f);
  const huge = join(f.root, 'demo', 'huge'); await writeFile(huge, ''); await truncate(huge, 32 * 1024 * 1024 + 1);
  const oversized = await get(f);
  assert.equal(oversized.body, skill()); assert.equal(oversized.update.supported, false); assert.match(oversized.update.error, /too large/);
  assert.equal((await f.call('save', { mode: 'update', ...identity(oversized), body: skill() + 'repair' })).status, 200);
  await rm(huge);
  const directory = join(dirname(f.root), 'skills-manager', 'demo'); await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'origin.json'), '{bad');
  const malformed = await get(f);
  assert.equal(malformed.update.supported, false); assert.match(malformed.update.error, /malformed/);
  const blocked = await f.call('prepareUpdate', { name: 'demo', kind: 'dir', expectedRevision: malformed.revision, source: 'acme/skills' });
  assert.equal(blocked.status, 409, JSON.stringify(blocked));
  assert.equal((await f.call('remove', identity(malformed))).status, 200);
  await assert.rejects(stat(join(directory, 'origin.json')), { code: 'ENOENT' });
});

test('identical legacy source registration only writes provenance and leaves installed files untouched', async t => {
  const f = await fixture(t); githubFixture(t);
  const source = join(f.base, 'local'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), skill()); await writeFile(join(source, 'resource.txt'), 'upstream resource');
  assert.equal((await f.call('install', { srcDir: source })).status, 200);
  const current = await get(f), before = await stat(join(f.root, 'demo', 'SKILL.md'));
  const prepared = await f.call('prepareUpdate', { name: 'demo', kind: 'dir', source: 'acme/skills', expectedRevision: current.revision });
  assert.equal(prepared.status, 200, JSON.stringify(prepared)); assert.equal(prepared.value.hasChanges, false); assert.equal(prepared.value.requiresOverwrite, false);
  const updated = await f.call('applyUpdate', { name: 'demo', kind: 'dir', token: prepared.value.token });
  assert.equal(updated.status, 200, JSON.stringify(updated)); assert.equal(updated.value.backup, null);
  const after = await stat(join(f.root, 'demo', 'SKILL.md')); assert.equal(after.ino, before.ino); assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal((await get(f)).update.origin.baselineHash, current.update.treeHash);
});

test('origin-only changes invalidate update previews even when body and resources are unchanged', async t => {
  const f = await fixture(t), github = githubFixture(t), current = await remoteInstall(f);
  github.change({ resource: 'new resource', commit: 'c'.repeat(40) });
  const preview = await f.call('prepareUpdate', { name: 'demo', kind: 'dir', expectedRevision: current.revision });
  assert.equal(preview.status, 200, JSON.stringify(preview));
  const originPath = join(dirname(f.root), 'skills-manager', 'demo', 'origin.json');
  await writeFile(originPath, JSON.stringify({ ...current.update.origin, commit: 'e'.repeat(40) }));
  const result = await f.call('applyUpdate', { name: 'demo', kind: 'dir', token: preview.value.token, allowLocalChanges: true });
  assert.equal(result.status, 409, JSON.stringify(result));
  assert.equal(await readFile(join(f.root, 'demo', 'resource.txt'), 'utf8'), 'upstream resource');
  assert.equal((await get(f)).update.origin.commit, 'e'.repeat(40));
});

test('root listing and name reads recover moved originals under the shared lock and readonly roots block rather than hiding skills', async t => {
  const f = await fixture(t, { allowUserWrite: false }), candidate = await fixture(t), alternate = await fixture(t);
  await create(f); await create(candidate, { body: skill() + 'candidate' });
  const current = await get(f), next = await get(candidate), id = '12345678-1234-4234-8234-123456789abc';
  const directory = join(dirname(f.root), 'skills-manager', 'demo'), backup = join(directory, 'backups', id), stage = join(directory, `stage-${id}`);
  await mkdir(backup, { recursive: true }); await fs.cp(join(candidate.root, 'demo'), stage, { recursive: true });
  await writeFile(join(backup, 'origin.json'), 'null');
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ schema: 1, name: 'demo', id, oldHash: current.update.treeHash, newHash: next.update.treeHash, oldOrigin: null,
    newOrigin: { schema: 1, name: 'demo', kind: 'dir', source: 'https://github.com/acme/skills', commit: 'a'.repeat(40), baselineHash: next.update.treeHash, updatedAt: '2026-01-01T00:00:00.000Z' } }));
  await fs.rename(join(f.root, 'demo'), join(backup, 'tree'));
  setHome(t, dirname(f.root));
  assert.equal((await f.call('list')).status, 403);
  assert.equal((await f.call('get', { name: 'demo', kind: 'dir' })).status, 403);
  assert.equal(await readFile(join(backup, 'tree', 'SKILL.md'), 'utf8'), skill());
  const recovered = await alternate.call('list', { projectRoot: f.projectRoot });
  assert.equal(recovered.status, 200, JSON.stringify(recovered)); assert.equal(recovered.value.skills[0].name, 'demo');
  assert.equal((await get(f)).body, skill()); assert.equal((await get(f)).update.origin, null);
  await assert.rejects(stat(join(directory, 'journal.json')), { code: 'ENOENT' });
});

test('apply rechecks actual-root readonly policy after preview while bounded read metadata remains available', async t => {
  const f = await fixture(t, { allowUserWrite: false }), github = githubFixture(t);
  const current = await remoteInstall(f); github.change({ resource: 'next', commit: 'd'.repeat(40) });
  const prepared = await f.call('prepareUpdate', { name: 'demo', kind: 'dir', expectedRevision: current.revision });
  assert.equal(prepared.status, 200, JSON.stringify(prepared));
  setHome(t, dirname(f.root));
  assert.equal((await get(f)).update.origin.commit, 'a'.repeat(40));
  const updated = await f.call('applyUpdate', { name: 'demo', kind: 'dir', token: prepared.value.token, allowLocalChanges: true });
  assert.equal(updated.status, 403, JSON.stringify(updated));
  assert.equal(await readFile(join(f.root, 'demo', 'resource.txt'), 'utf8'), 'upstream resource');
});
