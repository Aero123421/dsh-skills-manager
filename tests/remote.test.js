import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteInstaller } from '../remote-installer.js';

const fixture = fileURLToPath(new URL('./fixtures/remote-cli.mjs', import.meta.url));
const projectRoot = resolve('remote-test-project');
const request = (input = 'npx skills add owner/repo') => ({ input, scope: 'project', projectRoot });
const body = (name) => `---\nname: ${name}\ndescription: Description ${name}\n---\n`;
const validation = (text) => {
  const name = /^name: (.+)$/m.exec(text)?.[1];
  const description = /^description: (.+)$/m.exec(text)?.[1];
  if (!name || !description) throw new Error('invalid skill');
  return { data: { name, description } };
};
const exists = (path) => fs.stat(path).then(() => true, () => false);
async function skill(directory, name, folder = name) {
  await fs.mkdir(join(directory, folder), { recursive: true });
  await fs.writeFile(join(directory, folder, 'SKILL.md'), body(name));
}
function harness(t, options = {}) {
  const calls = { downloads: [], runs: [], imports: [], stages: [] };
  let time = 100000, readonly = false;
  const manager = createRemoteInstaller({
    cliEntry: options.pinned ? undefined : fixture,
    now: () => time,
    resolveTarget: async (payload) => {
      if (readonly) throw Object.assign(new Error('user writes disabled'), { status: 403 });
      const scope = payload.scope ?? 'project';
      const root = scope === 'user' ? resolve('remote-user', 'skills') : join(payload.projectRoot, '.dsh', 'skills');
      return { scope, root, canonical: root };
    },
    validateBody: validation,
    fetchSource: async (source, directory, { signal }) => {
      calls.downloads.push(source); calls.stages.push(dirname(directory));
      if (options.fetchSource) return options.fetchSource(source, directory, { signal });
      for (const name of ['alpha', 'beta']) await skill(directory, name);
      return { source, commit: 'a'.repeat(40) };
    },
    runner: options.realRunner ? undefined : async (run) => {
      calls.runs.push(run);
      if (options.runner) return options.runner(run);
      await fs.mkdir(join(run.cwd, '.agents', 'skills'), { recursive: true });
      for (const name of ['alpha', 'beta']) await fs.cp(join(run.args[2], name), join(run.cwd, '.agents', 'skills', name), { recursive: true });
      return { code: 0 };
    },
    importSkill: async (payload) => {
      calls.imports.push(payload);
      return options.importSkill ? options.importSkill(payload) : { installed: true };
    },
  });
  t.after(() => manager.dispose());
  return { manager, calls, advance: (ms) => { time += ms; }, readonly: () => { readonly = true; } };
}
const selected = (preview, names = ['alpha']) => ({ token: preview.token, skillNames: names, scope: 'project', projectRoot });

test('restricted forms normalize public GitHub sources and force isolated local CLI args/env', async (t) => {
  const { manager, calls } = harness(t);
  for (const input of [
    'owner/repo', 'https://github.com/owner/repo/tree/main/skills',
    'npx -y skills@1.7.4 add owner/repo --skill alpha beta -s alpha --copy --yes',
    "npx --yes skills add owner/repo -s '*'",
  ]) {
    const preview = await manager.prepare(request(input));
    assert.equal(preview.source.startsWith('https://github.com/owner/repo'), true);
    assert.equal(preview.commit, 'a'.repeat(40));
    assert.deepEqual(preview.skills.map((item) => item.name), ['alpha', 'beta']);
    assert.deepEqual(Object.keys(preview).sort(), ['commit', 'expiresAt', 'root', 'scope', 'skills', 'source', 'token']);
    const run = calls.runs.at(-1);
    assert.equal(run.executable, process.execPath);
    assert.equal(run.args[0], fixture);
    assert.equal(run.args[1], 'add');
    assert.ok(isAbsolute(run.args[2]));
    assert.equal(run.args[2], join(dirname(run.cwd), 'source'));
    assert.deepEqual(run.args.slice(3, 9), ['--agent', 'universal', '--copy', '--yes', '--json', ...(input.includes('--skill') ? ['--skill'] : input.includes('-s') ? ['--skill'] : [])]);
    assert.equal(run.args.includes('--global'), false);
    assert.equal(run.timeoutMs, 90000);
    assert.equal(run.maxOutputBytes, 256 * 1024);
    for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'APPDATA', 'GH_CONFIG_DIR', 'TMPDIR', 'PATH']) assert.ok(run.env[key].startsWith(dirname(run.cwd)));
    assert.equal(run.env.DISABLE_TELEMETRY, '1');
    assert.equal(run.env.DO_NOT_TRACK, '1');
    assert.equal(run.env.NODE_DISABLE_COMPILE_CACHE, '1');
    assert.equal(run.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(run.env.GIT_ALLOW_PROTOCOL, 'https');
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'NODE_PATH', 'SSH_AUTH_SOCK', 'AWS_SECRET_ACCESS_KEY', 'HTTP_PROXY']) assert.equal(run.env[key], undefined);
    assert.equal(run.signal.aborted, false);
    await manager.discard({ token: preview.token });
  }
  const preview = await manager.prepare({ input: 'npx skills add owner/repo -g', scope: 'user' });
  assert.equal(preview.scope, 'user');
});

test('reject shell syntax, arbitrary transports, credentials, unpinned CLI and broad options before network', async (t) => {
  const { manager, calls } = harness(t);
  const invalid = [
    'npx skills add owner/repo;whoami', 'npx skills add owner/repo\necho hi', 'owner/repo\t',
    'npx skills add $(whoami)', 'npx skills add owner/repo && id', 'npx skills add owner/repo | cat',
    'npx skills add owner/repo > /tmp/file', 'npx skills add owner/repo `id`',
    'npx skills@latest add owner/repo', 'npx skills@1.7.3 add owner/repo', 'skills add owner/repo',
    'npx --package skills add owner/repo', 'https://evil.test/owner/repo', 'http://github.com/owner/repo',
    'git@github.com:owner/repo', 'ssh://git@github.com/owner/repo', 'git+https://github.com/owner/repo',
    'https://user:pass@github.com/owner/repo', 'npm:skills', '../repo', '/tmp/skill',
    'https://github.com/owner/repo/tree/../escape', 'https://github.com/owner/repo?token=x',
    'https://github.com/owner/repo%2fother', 'owner/repo.git',
    ...['--agent universal', '--all', '--package foo', '--global', '-g', '--skill', '--skill bad_name', '--force', '--'].map((flag) => `npx skills add owner/repo ${flag}`),
  ];
  for (const input of invalid) await assert.rejects(manager.prepare(request(input)), undefined, input);
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.runs.length, 0);
});

test('write gate precedes download; install rechecks policy and context', async (t) => {
  const { manager, calls, readonly } = harness(t);
  const preview = await manager.prepare(request());
  await assert.rejects(manager.install({ ...selected(preview), projectRoot: resolve('different') }), /context/);
  await assert.rejects(manager.install({ ...selected(preview), scope: 'user' }), /context/);
  readonly();
  await assert.rejects(manager.prepare(request()), /writes disabled/);
  await assert.rejects(manager.install(selected(preview)), /writes disabled/);
  assert.equal(calls.downloads.length, 1);
  assert.equal(calls.imports.length, 0);
});

test('tokens preserve exact candidate selection and recorded paths, consume after import', async (t) => {
  const { manager, calls } = harness(t);
  const preview = await manager.prepare(request());
  for (const names of [[], ['*'], ['unknown'], ['../alpha'], ['alpha', 'alpha']]) await assert.rejects(manager.install(selected(preview, names)), /exact names/);
  const result = await manager.install({ ...selected(preview, ['beta']), srcDir: '/evil', cliEntry: '/evil' });
  assert.equal(result.installed, true);
  assert.equal(calls.imports.length, 1);
  assert.equal(calls.imports[0].srcDir, join(calls.runs[0].cwd, '.agents', 'skills', 'beta'));
  assert.equal(calls.imports[0].projectRoot, projectRoot);
  assert.equal(await exists(calls.stages[0]), false);
  await assert.rejects(manager.install(selected(preview)), /expired or unavailable/);
});

test('partial conflicts are explicit, never overwrite or report all-success', async (t) => {
  const { manager } = harness(t, { importSkill: async ({ srcDir }) => {
    if (srcDir.endsWith('beta')) throw Object.assign(new Error('target already exists'), { status: 409 });
    return { installed: true };
  } });
  const preview = await manager.prepare(request());
  const result = await manager.install(selected(preview, ['alpha', 'beta']));
  assert.equal(result.installed, false);
  assert.deepEqual(result.results.map(({ name, installed }) => ({ name, installed })), [{ name: 'alpha', installed: true }, { name: 'beta', installed: false }]);
  assert.deepEqual(result.errors, [{ name: 'beta', message: 'target already exists', status: 409 }]);
});

test('ten-minute TTL, three-preview retention and discard clean owned directories', async (t) => {
  const { manager, calls, advance } = harness(t);
  const first = await manager.prepare(request());
  assert.equal(first.expiresAt, 700000);
  for (let i = 0; i < 3; i++) await manager.prepare(request());
  assert.equal(await exists(calls.stages[0]), false);
  await assert.rejects(manager.install(selected(first)), /expired or unavailable/);
  const last = await manager.prepare(request());
  advance(600001);
  await assert.rejects(manager.install(selected(last)), /expired/);
  assert.equal(await exists(calls.stages.at(-1)), false);
  await manager.dispose();
  assert.deepEqual(await Promise.all(calls.stages.map(exists)), calls.stages.map(() => false));
  await assert.rejects(manager.prepare(request()), /disposed/);
});

test('token lease prevents concurrent install and discard races', async (t) => {
  let started, release;
  const entered = new Promise((done) => { started = done; });
  const gate = new Promise((done) => { release = done; });
  const { manager, calls } = harness(t, { importSkill: async () => { started(); await gate; return { installed: true }; } });
  const preview = await manager.prepare(request());
  const installing = manager.install(selected(preview));
  await entered;
  await assert.rejects(manager.install(selected(preview)), /in use/);
  await assert.rejects(manager.discard({ token: preview.token }), /in use/);
  assert.equal(await exists(calls.stages[0]), true);
  release();
  await installing;
  assert.equal(calls.imports.length, 1);
  assert.equal(await exists(calls.stages[0]), false);
});

test('download failures and invalid/duplicate source skills clean before CLI', async (t) => {
  for (const mode of ['failure', 'duplicate', 'invalid', 'symlink']) {
    await t.test(mode, async (t) => {
      const { manager, calls } = harness(t, { fetchSource: async (_source, destination) => {
        await skill(destination, 'alpha');
        if (mode === 'failure') throw new Error('fetch failed');
        if (mode === 'duplicate') await skill(destination, 'alpha', 'other');
        if (mode === 'invalid') await skill(destination, 'Bad_Name', 'other');
        if (mode === 'symlink') await fs.symlink(join(destination, 'alpha'), join(destination, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
      } });
      await assert.rejects(manager.prepare(request()));
      assert.equal(calls.runs.length, 0);
      assert.equal(await exists(calls.stages[0]), false);
    });
  }
});

test('runner failure, output size, and unsafe/oversized staged resources are bounded', async (t) => {
  for (const mode of ['exit', 'output', 'symlink', 'size']) {
    await t.test(mode, async (t) => {
      const { manager, calls } = harness(t, { runner: async (run) => {
        if (mode === 'exit') return { code: 5 };
        if (mode === 'output') return { code: 0, stdout: 'x'.repeat(256 * 1024 + 1) };
        if (mode === 'symlink') await fs.symlink(run.args[2], join(run.cwd, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
        if (mode === 'size') { const file = await fs.open(join(run.cwd, 'huge'), 'w'); await file.truncate(65 * 1024 * 1024); await file.close(); }
        return { code: 0 };
      } });
      await assert.rejects(manager.prepare(request()));
      assert.equal(await exists(calls.stages[0]), false);
    });
  }
});

test('abort and dispose await the runner before removing its temporary directory', async (t) => {
  for (const mode of ['abort', 'dispose']) await t.test(mode, async (t) => {
    let started, settled = false;
    const entered = new Promise((done) => { started = done; });
    const { manager, calls } = harness(t, { runner: async ({ signal, cwd }) => {
      started();
      await new Promise((done) => signal.addEventListener('abort', done, { once: true }));
      assert.equal(await exists(cwd), true);
      settled = true;
      throw signal.reason;
    } });
    const controller = new AbortController();
    const preparing = manager.prepare(request(), controller.signal);
    const rejection = assert.rejects(preparing, /aborted/);
    await entered;
    if (mode === 'abort') controller.abort(); else await manager.dispose();
    await rejection;
    assert.equal(settled, true);
    assert.equal(await exists(calls.stages[0]), false);
  });
});

test('periodic resource scanning aborts a still-running runner', async (t) => {
  const { manager, calls } = harness(t, { runner: async ({ signal, cwd }) => {
    const file = await fs.open(join(cwd, 'growing'), 'w'); await file.truncate(65 * 1024 * 1024); await file.close();
    await new Promise((done) => signal.addEventListener('abort', done, { once: true }));
    throw signal.reason;
  } });
  await assert.rejects(manager.prepare(request()), /resource limit/);
  assert.equal(await exists(calls.stages[0]), false);
});

test('actual pinned skills CLI processes local public-source snapshot without network or PATH tools', async (t) => {
  const { manager, calls } = harness(t, { realRunner: true, pinned: true });
  const preview = await manager.prepare(request('npx skills@1.7.4 add owner/repo --skill alpha'));
  assert.deepEqual(preview.skills.map(({ name }) => name), ['alpha']);
  const result = await manager.install(selected(preview));
  assert.equal(result.installed, true);
  assert.equal(await exists(calls.stages[0]), false);
});

test('real Node .mjs fixture stages locally, reports failure, caps output, and aborts cleanly', async (t) => {
  for (const mode of ['copy', 'fail', 'flood', 'hang']) await t.test(mode, async (t) => {
    let downloaded;
    const ready = new Promise((done) => { downloaded = done; });
    const { manager, calls } = harness(t, { realRunner: true, fetchSource: async (_source, destination) => {
      await skill(destination, 'alpha');
      await fs.writeFile(join(destination, 'mode'), mode);
      downloaded();
    } });
    const controller = new AbortController();
    const preparing = manager.prepare(request(), controller.signal);
    if (mode === 'copy') {
      const preview = await preparing;
      assert.deepEqual(preview.skills.map(({ name }) => name), ['alpha']);
      await manager.discard({ token: preview.token });
    } else {
      const rejection = assert.rejects(preparing, mode === 'fail' ? /exit 7/ : mode === 'flood' ? /output limit/ : /aborted/);
      if (mode === 'hang') {
        await ready;
        // Give the fixture time to start; abort remains safe before/after spawn.
        await new Promise((done) => setTimeout(done, 100));
        controller.abort();
      }
      await rejection;
    }
    assert.equal(await exists(calls.stages[0]), false);
  });
});

test('active retrievals are bounded and released after preparation completes', async t => {
  let release, started = 0, bothStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { bothStarted = resolve; });
  const { manager, calls } = harness(t, { fetchSource: async (_source, directory, { signal }) => {
    if (++started === 2) bothStarted();
    await Promise.race([gate, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))]);
    await skill(directory, 'alpha'); await skill(directory, 'beta');
    return { commit: 'b'.repeat(40) };
  } });
  const first = manager.prepare(request());
  const second = manager.prepare(request());
  await ready;
  try {
    await assert.rejects(manager.prepare(request()), error => error.status === 429);
    assert.equal(calls.downloads.length, 2);
  } finally { release(); }
  const previews = await Promise.all([first, second]);
  assert.equal(previews[0].commit, 'b'.repeat(40));
  const next = await manager.prepare(request());
  assert.equal(next.skills.length, 2);
});
