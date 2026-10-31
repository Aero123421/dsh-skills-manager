import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as Manager from '../index.js';

// Opt-in: use an isolated, already installed official DSH distribution. No
// package download, application launch, credentials or provider call occurs here.
const modules = process.env.DSH_NATIVE_MODULES;
test('official DSH services discover manager saves and release registrations on unload', {
  skip: !modules && 'set DSH_NATIVE_MODULES to an isolated DSH node_modules directory',
}, async (t) => {
  const root = resolve(modules);
  const load = name => import(pathToFileURL(join(root, '@deepseek-ai', name, 'lib', 'index.js')).href);
  const [{ Context }, { default: SystemPrompt }, { default: Tools }, { default: Skills }, Filesystem, { HostConnectionService }] =
    await Promise.all(['cordis', 'dsh-system-prompt', 'dsh-tools', 'dsh-skill', 'dsh-skill-filesystem', 'dsh-client-connection'].map(load));
  const version = JSON.parse(await readFile(join(root, '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version;
  t.diagnostic(`official npm DSH ${version}; ${root}`);
  const batchExecutor = existsSync(join(root, '@deepseek-ai', 'dsh-tool-executor-native', 'lib', 'index.js'));
  const base = await mkdtemp(join(await realpath(tmpdir()), 'dsh-skills-native-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = join(base, 'home');
  const ctx = new Context();
  t.after(async () => {
    try { await ctx.fiber.dispose(); }
    finally {
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
      await rm(base, { recursive: true, force: true });
    }
  });
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(Tools);
  if (batchExecutor) await ctx.plugin(await load('dsh-tool-executor-native'));
  await ctx.plugin(Skills);
  await ctx.plugin(Filesystem, { watch: false, dshHome: process.env.DSH_HOME, agentsHome: join(base, 'agents') });
  // Exercise the real exact-route registry and its owner Peer, without starting
  // an HTTP server or claiming to test authentication/cookies.
  const authNotUsed = new Proxy({}, { get() { throw new Error('authentication is outside this registry test'); } });
  const connection = new HostConnectionService(ctx, [], authNotUsed);
  const routes = connection.createSharedFetchHandler('/api');
  const call = async (method, payload) => {
    const response = await routes.fetch(new Request(`http://localhost/api/dsh-skills-manager/${method}`, {
      method: 'POST', body: JSON.stringify(payload),
    }), connection.browserPeer);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).value;
  };
  const execute = async (name, args, signal = new AbortController().signal) => {
    if (!batchExecutor) return ctx.tools.execute({ callId: 'native-fixture', name, arguments: args, signal });
    const result = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: 'native-fixture', name, arguments: JSON.stringify(args) }], signal,
    });
    return result.results[0].result;
  };
  let plugin = ctx.plugin(Manager, { allowRemoteInstall: false });
  await plugin;
  assert.deepEqual(ctx.tools.schemas().map(item => item.name).sort(), ['skills_manager_list', 'skills_manager_read', 'skills_manager_validate']);
  for (const kind of ['git-directory', 'worktree-file']) await t.test(kind, async () => {
    const project = join(base, kind), cwd = join(project, 'packages', 'nested');
    await mkdir(cwd, { recursive: true });
    if (kind === 'git-directory') await mkdir(join(project, '.git'));
    else await writeFile(join(project, '.git'), 'gitdir: /fixture-only\n');
    const body = '---\r\nname: native-demo\r\ndescription: Native compatibility fixture\r\nuser-invocable: false\r\n---\r\n\r\nNative body.\r\n';
    const payload = { scope: 'project', projectRoot: cwd };
    const saved = await call('save', { ...payload, mode: 'create', kind: 'dir', name: 'native-demo', body });
    assert.equal(saved.root, join(project, '.dsh', 'skills'));
    const list = await call('list', payload);
    assert.deepEqual(list.skills.map(item => item.name), ['native-demo']);
    assert.deepEqual((await ctx.skills.list({ cwd })).map(item => item.name), ['native-demo']);
    const discovered = await ctx.skills.get('native-demo', { cwd });
    assert.equal(discovered.path, saved.path);
    assert.match(discovered.content, /Native body\./);
    assert.deepEqual(discovered.invocation, { modelInvocable: true, userInvocable: false });
    const read = await execute('skills_manager_read', { ...payload, name: 'native-demo', kind: 'dir' });
    assert.equal(read.isError, false, JSON.stringify(read));
    assert.equal(read.value.body, body);
    assert.equal(read.value.root, saved.root);
    assert.deepEqual(read.content, [{ type: 'text', text: JSON.stringify(read.value) }]);
    const controller = new AbortController(); controller.abort(new Error('native cancellation fixture'));
    const cancelled = await execute('skills_manager_list', payload, controller.signal);
    assert.equal(cancelled.isError, true);
  });
  const projectRoot = join(base, 'git-directory', 'packages', 'nested');
  const savedPath = join(base, 'git-directory', '.dsh', 'skills', 'native-demo', 'SKILL.md');
  await plugin.dispose();
  assert.deepEqual(ctx.tools.schemas(), []);
  assert.equal((await routes.fetch(new Request('http://localhost/api/dsh-skills-manager/list', { method: 'POST' }), connection.browserPeer)).status, 404);
  plugin = ctx.plugin(Manager, { allowRemoteInstall: false }); await plugin;
  const restored = await call('get', { scope: 'project', projectRoot, name: 'native-demo', kind: 'dir' });
  assert.equal(restored.path, savedPath);
  assert.equal(restored.body, await readFile(savedPath, 'utf8'));
  await plugin.dispose();
  assert.deepEqual(ctx.tools.schemas(), []);
});
