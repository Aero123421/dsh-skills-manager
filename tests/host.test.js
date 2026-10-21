import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { apply, Config } from '../index.js';

const skill = (name = 'demo') => `---\nname: ${name}\ndescription: Test skill\n---\n\n# Instructions\nKeep exact bytes.  \n`;
async function fixture(t, config = {}) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-skills-host-'));
  t.after(async () => {
    assert.equal(resolve(base).startsWith(join(tmpdir(), 'dsh-skills-host-')), true);
    await rm(base, { recursive: true, force: true });
  });
  const projectRoot = join(base, 'project');
  await mkdir(projectRoot);
  const routes = new Map(), tools = new Map(), disposers = [];
  const services = {
    connection: { fetch: { register(route) {
      routes.set(route.path, route);
      const dispose = () => routes.delete(route.path);
      disposers.push(dispose);
      return dispose;
    } } },
    tools: { register(tool) {
      // Actual installed DSH rejects registrations without this contract.
      assert.equal(tool.output.schema.type, 'object');
      assert.equal(typeof tool.output.render, 'function');
      assert.equal(tool.parameters.type, 'object');
      tools.set(tool.name, tool);
      return () => tools.delete(tool.name);
    } },
    workingDirectory: { async ensure() { return projectRoot; } },
  };
  const ctx = { get: (key) => services[key], inject(_keys, callback) { callback(ctx); } };
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

test('Config implements the Cordis Standard Schema contract and rejects unsafe limits', () => {
  assert.equal(Config['~standard'].version, 1);
  assert.deepEqual(Config['~standard'].validate(undefined).value, { allowUserWrite: true, maxBodyBytes: 262144 });
  for (const maxBodyBytes of [0, -1, Infinity, 1.5, 4194305]) assert.ok(Config['~standard'].validate({ maxBodyBytes }).issues);
  assert.ok(Config['~standard'].validate({ allowUserWrite: 'true' }).issues);
  assert.ok(Config['~standard'].validate(null).issues);
});

test('save/list/read validate names and expose storageName', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('save', { name: 'demo', body: skill() })).status, 200);
  const listed = await f.call('list');
  assert.equal(listed.value.skills[0].storageName, 'demo');
  assert.equal(listed.value.skills[0].valid, true);
  assert.equal((await f.call('get', { name: 'demo' })).value.body, skill());
  assert.equal((await f.call('save', { name: '../escape', body: skill() })).status, 400);
  assert.equal((await f.call('list', { scope: 'other' })).status, 400);
  assert.equal((await f.call('list', { projectRoot: '/' })).status, 400);
  assert.equal((await f.call('list', { projectRoot: 'relative' })).status, 400);
});

test('toggle preserves unknown YAML metadata, comments, multiline description, and instruction bytes', async (t) => {
  const f = await fixture(t);
  const original = '---\r\nname: demo\r\ndescription: >\r\n  Multiple lines\r\n  still work.\r\nmetadata:\r\n  author: Test\r\n  nested:\r\n    - x\r\nlicense: MIT\r\ndisable-model-invocation: false # keep comment\r\n---\r\n\r\nDo exactly this.  \r\n\r\n';
  assert.equal((await f.call('save', { name: 'demo', body: original })).status, 200);
  assert.equal((await f.call('setInvocation', { name: 'demo', modelInvocable: false, userInvocable: false })).status, 200);
  const next = (await f.call('get', { name: 'demo' })).value.body;
  assert.equal(next, original.replace('disable-model-invocation: false # keep comment', 'disable-model-invocation: true # keep comment').replace('---\r\n\r\nDo', 'user-invocable: false\r\n---\r\n\r\nDo'));
  assert.equal((await f.call('setInvocation', { name: 'demo', modelInvocable: 'false' })).status, 400);
});

test('bundle install copies references/scripts/assets and refuses overwrites', async (t) => {
  const f = await fixture(t);
  const source = join(f.base, 'source');
  for (const dir of ['references', 'scripts', 'assets/nested']) await mkdir(join(source, dir), { recursive: true });
  await writeFile(join(source, 'SKILL.md'), skill());
  await writeFile(join(source, 'references', 'guide.md'), 'reference');
  await writeFile(join(source, 'scripts', 'run.sh'), '#!/bin/sh\ntrue\n');
  await chmod(join(source, 'scripts', 'run.sh'), 0o755);
  await writeFile(join(source, 'assets', 'nested', 'data.bin'), Buffer.from([0, 255, 20]));
  assert.equal((await f.call('install', { srcDir: source })).status, 200);
  assert.equal(await readFile(join(f.root, 'demo', 'references', 'guide.md'), 'utf8'), 'reference');
  assert.equal((await stat(join(f.root, 'demo', 'scripts', 'run.sh'))).mode & 0o111, 0o111);
  assert.deepEqual(await readFile(join(f.root, 'demo', 'assets', 'nested', 'data.bin')), Buffer.from([0, 255, 20]));
  await writeFile(join(f.root, 'demo', 'references', 'guide.md'), 'local edit');
  assert.equal((await f.call('install', { srcDir: source })).status, 409);
  assert.equal(await readFile(join(f.root, 'demo', 'references', 'guide.md'), 'utf8'), 'local edit');
  assert.equal((await f.call('install', { srcDir: '' })).status, 400);
});

test('source bundle symlinks reject before creating destination', async (t) => {
  const f = await fixture(t);
  const source = join(f.base, 'source');
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), skill());
  await symlink(f.projectRoot, join(source, 'linked'));
  assert.equal((await f.call('install', { srcDir: source })).status, 403);
  await assert.rejects(stat(join(f.root, 'demo')), { code: 'ENOENT' });
});

test('symlink skill files and ancestor roots cannot be mutated', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'demo'), { recursive: true });
  const outside = join(f.base, 'outside.md');
  await writeFile(outside, skill());
  await symlink(outside, join(f.root, 'demo', 'SKILL.md'));
  for (const method of ['save', 'setInvocation', 'remove']) {
    assert.equal((await f.call(method, { name: 'demo', body: skill(), modelInvocable: false })).status, 403);
  }
  assert.equal(await readFile(outside, 'utf8'), skill());
  const linkedProject = join(f.base, 'linked-project');
  await symlink(f.projectRoot, linkedProject);
  assert.equal((await f.call('save', { projectRoot: linkedProject, name: 'demo', body: skill() })).status, 403);
});

test('skill and streamed request body limits are enforced without content-length', async (t) => {
  const f = await fixture(t, { maxBodyBytes: 100 });
  assert.equal((await f.call('validate', { body: skill() + 'x'.repeat(100) })).status, 413);
  assert.equal((await f.call('save', { name: 'demo', body: skill() + 'x'.repeat(100) })).status, 413);
  const oversize = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4194305)); controller.close(); } });
  assert.equal((await f.call('validate', {}, { body: oversize, duplex: 'half' })).status, 413);
  assert.equal((await f.call('validate', {}, { body: '[]' })).status, 400);
});

test('user writes disabled consistently and project tools use the current agent cwd', async (t) => {
  const f = await fixture(t, { allowUserWrite: false });
  for (const method of ['save', 'setInvocation', 'remove', 'install']) assert.equal((await f.call(method, { scope: 'user' })).status, 403);
  assert.equal(f.tools.size, 3);
  const value = await f.tools.get('skills_manager_list').execute({}, { agent: {}, signal: new AbortController().signal });
  assert.equal(value.root, f.root);
  assert.deepEqual(f.tools.get('skills_manager_list').output.render({}, value), [{ type: 'text', text: JSON.stringify(value) }]);
  assert.equal((await f.tools.get('skills_manager_validate').execute({ body: skill() })).valid, true);
});
