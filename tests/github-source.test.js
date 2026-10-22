import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, readdir, readFile, rm, stat, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseGithubSource, downloadGithubSkills } from '../github-source.js';

const COMMIT = 'a'.repeat(40), TREE = 'b'.repeat(40);
const API = 'https://api.github.com/repos/acme/skills';
const SKILL = '---\nname: demo\ndescription: Example\n---\n';
const dir = (path) => ({ path, mode: '040000', type: 'tree', sha: TREE });
const blob = (path, content = SKILL, mode = '100644') => ({ path, mode, type: 'blob', size: Buffer.byteLength(content), sha: 'c'.repeat(40) });
async function fixture(t) {
  const temporaryRoot = await realpath(tmpdir());
  const destination = await mkdtemp(join(temporaryRoot, 'dsh-github-source-'));
  t.after(async () => {
    assert.ok(resolve(destination).startsWith(join(temporaryRoot, 'dsh-github-source-')));
    await rm(destination, { recursive: true, force: true });
  });
  return destination;
}
function server({ entries = [dir('skills'), dir('skills/demo'), blob('skills/demo/SKILL.md')],
  metadata = { private: false, default_branch: 'main' }, treeExtra = {}, raw = {}, intercept } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['Cache-Control'], 'no-cache');
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    assert.equal(Object.keys(options.headers).some((key) => /authorization|cookie/i.test(key)), false);
    const intercepted = await intercept?.(url, options);
    if (intercepted) return intercepted;
    if (url === API) return Response.json(metadata);
    if (url.startsWith(`${API}/commits/`)) return Response.json({ sha: COMMIT, commit: { tree: { sha: TREE } } });
    if (url === `${API}/git/trees/${TREE}?recursive=1`) return Response.json({ truncated: false, tree: entries, ...treeExtra });
    const prefix = `https://raw.githubusercontent.com/acme/skills/${COMMIT}/`;
    assert.ok(url.startsWith(prefix), `Unexpected URL: ${url}`);
    const path = url.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
    return new Response(raw[path] ?? SKILL);
  };
  return { calls, fetchImpl };
}
const rawCalls = (server) => server.calls.filter(({ url }) => url.startsWith('https://raw.'));

test('parse supported public GitHub sources and canonical display', () => {
  assert.deepEqual(parseGithubSource('acme/skills'), { owner: 'acme', repo: 'skills', display: 'https://github.com/acme/skills' });
  assert.deepEqual(parseGithubSource('https://github.com/acme/skills/tree/main/skills/demo#feature/docs'), {
    owner: 'acme', repo: 'skills', ref: 'feature/docs', subpath: 'skills/demo',
    display: 'https://github.com/acme/skills/tree/main/skills/demo#feature/docs',
  });
  assert.equal(parseGithubSource('https://github.com/acme/skills/').display, 'https://github.com/acme/skills');
  assert.equal(parseGithubSource(`acme/skills#${COMMIT}`).ref, COMMIT);
});

test('reject arbitrary hosts, credentials, queries, ports, flags and unsafe paths', () => {
  for (const source of [
    '', ' acme/skills', 'acme/skills ', '--global', 'acme/skills@demo', 'acme/skills/path',
    'http://github.com/acme/skills', 'git@github.com:acme/skills', 'file:///acme/skills',
    'https://evil.test/acme/skills', 'https://github.com.evil.test/acme/skills',
    'https://github.com@evil.test/acme/skills', 'https://u:p@github.com/acme/skills',
    'https://github.com:443/acme/skills', 'https://github.com:8443/acme/skills',
    'https://github.com/acme/skills?x=1', 'https://github.com/acme/skills?',
    'https://github.com/acme/skills/tree/main/../escape',
    'https://github.com/acme/skills/tree/../escape#main',
    'https://github.com/acme/skills/tree/main/%2e%2e/escape',
    'https://github.com/acme/skills/tree/main/CON.txt',
    'https://github.com/acme/skills/tree/main/a:b',
    'https://github.com/acme/skills/tree/main/a\\b',
    'https://github.com/acme/skills/tree/main/a.',
    'https://github.com/acme/skills/tree/main//b',
    'https://github.com/acme/skills/issues/1', 'acme/skills#', 'acme/skills#a#b',
    'acme/skills#../main', 'acme/skills#-main', 'acme/skills#ref.lock', 'acme/NUL',
  ]) assert.throws(() => parseGithubSource(source), Error, source);
});

test('download fixed commit snapshots and only complete selected bundles', async (t) => {
  const destination = await fixture(t);
  const script = '#!/bin/sh\necho example\n';
  const s = server({ entries: [dir('skills'), dir('skills/demo'), dir('skills/demo/empty'), dir('skills/demo/scripts'),
    blob('skills/demo/SKILL.md'), blob('skills/demo/scripts/run.sh', script, '100755'),
    dir('skills/other'), blob('skills/other/SKILL.md'), blob('README.md', 'outside')],
  raw: { 'skills/demo/scripts/run.sh': script } });
  const result = await downloadGithubSkills('https://github.com/acme/skills/tree/v1/skills/demo', destination, s);
  assert.deepEqual(result, { source: 'https://github.com/acme/skills/tree/v1/skills/demo', commit: COMMIT });
  assert.equal(await readFile(join(destination, 'skills/demo/SKILL.md'), 'utf8'), SKILL);
  assert.equal(await readFile(join(destination, 'skills/demo/scripts/run.sh'), 'utf8'), script);
  // Windows has no Unix executable permission bits; content is verified on every OS above.
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(destination, 'skills/demo/scripts/run.sh'))).mode & 0o111, 0o111);
  }
  assert.deepEqual(await readdir(join(destination, 'skills/demo/empty')), []);
  assert.equal(rawCalls(s).length, 2);
  const lookup = new URL(s.calls.find(({ url }) => url.startsWith(`${API}/commits/`)).url);
  assert.equal(lookup.origin + lookup.pathname, `${API}/commits/v1`);
  assert.match(lookup.searchParams.get('_dsh_check'), /^[a-f0-9-]{36}$/);
  assert.ok(rawCalls(s).every(({ url }) => url.includes(`/${COMMIT}/`)));
  assert.deepEqual(await readdir(join(destination, 'skills')), ['demo']);
});

test('slash-containing fragment ref is encoded for commit lookup', async (t) => {
  const destination = await fixture(t), s = server();
  await downloadGithubSkills('acme/skills#feature/docs', destination, s);
  const url = new URL(s.calls[1].url);
  assert.equal(url.origin + url.pathname, `${API}/commits/feature%2Fdocs`);
  assert.ok(url.searchParams.has('_dsh_check'));
});

test('moving references bypass cached branch resolution but immutable SHA requests remain stable', async t => {
  const s = server();
  await downloadGithubSkills('acme/skills#main', await fixture(t), s);
  await downloadGithubSkills('acme/skills#main', await fixture(t), s);
  const moving = s.calls.filter(({ url }) => url.startsWith(`${API}/commits/main`));
  assert.notEqual(moving[0].url, moving[1].url);
  await downloadGithubSkills(`acme/skills#${COMMIT}`, await fixture(t), s);
  const pinned = s.calls.find(({ url }) => url.startsWith(`${API}/commits/${COMMIT}`));
  assert.equal(pinned.url, `${API}/commits/${COMMIT}`);
});

test('reject symlinks, submodules and special candidate entries before raw requests or copies', async (t) => {
  for (const [type, mode] of [['blob', '120000'], ['commit', '160000'], ['blob', '100600'], ['tree', '120000']]) {
    const destination = await fixture(t);
    const s = server({ entries: [dir('skills'), dir('skills/demo'), blob('skills/demo/SKILL.md'),
      { path: 'skills/demo/evil', type, mode, size: 5 }] });
    await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /link or special/);
    assert.equal(rawCalls(s).length, 0);
    assert.deepEqual(await readdir(destination), []);
  }
});

test('reject unsafe ancestors and linked SKILL.md before downloading', async (t) => {
  for (const entries of [
    [{ path: 'skills', type: 'blob', mode: '120000', size: 9 }, dir('skills/demo'), blob('skills/demo/SKILL.md')],
    [dir('skills'), dir('skills/demo'), blob('skills/demo/SKILL.md', 'evil', '120000')],
    [dir('skills/demo'), blob('skills/demo/SKILL.md')],
  ]) {
    const destination = await fixture(t), s = server({ entries });
    await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /ancestor|link or special/);
    assert.equal(rawCalls(s).length, 0);
    assert.deepEqual(await readdir(destination), []);
  }
});

test('reject traversal, cross-platform invalid names and case collisions in trees', async (t) => {
  for (const path of ['../outside', '/absolute', 'skills/../outside', 'skills/a\\b', 'skills/C:bad',
    'skills/NUL.txt', 'skills/COM1', 'skills/CONIN$', 'skills/.git/config', 'skills/a.', 'skills//a', 'skills/./a']) {
    const destination = await fixture(t), s = server({ entries: [blob(path)] });
    await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /path/);
    assert.equal(rawCalls(s).length, 0);
  }
  const destination = await fixture(t), s = server({ entries: [blob('SKILL.md'), blob('skill.md')] });
  await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /colliding/);
});

test('reject private repositories, truncated trees and bad commit metadata', async (t) => {
  for (const options of [{ metadata: { private: true } }, { metadata: {} }, { treeExtra: { truncated: true } },
    { intercept: (url) => url.includes('/commits/') ? Response.json({ sha: 'not-a-sha' }) : undefined }]) {
    const destination = await fixture(t), s = server(options);
    await assert.rejects(downloadGithubSkills('acme/skills', destination, s));
    assert.equal(rawCalls(s).length, 0);
  }
});

test('enforce entry, selected-file and declared-byte limits before raw requests', async (t) => {
  for (const entries of [
    Array.from({ length: 10001 }, (_, i) => blob(`f${i}`)),
    [blob('SKILL.md'), ...Array.from({ length: 2048 }, (_, i) => blob(`f${i}`, ''))],
    [blob('SKILL.md'), { ...blob('huge'), size: 32 * 1024 * 1024 }],
  ]) {
    const destination = await fixture(t), s = server({ entries });
    await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /limit|oversized/);
    assert.equal(rawCalls(s).length, 0);
    assert.deepEqual(await readdir(destination), []);
  }
});

test('enforce actual streamed file sizes and JSON response byte limits', async (t) => {
  const destination = await fixture(t);
  const s = server({ entries: [blob('SKILL.md', 'x')], raw: { 'SKILL.md': 'too much' } });
  await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /byte limit/);
  assert.deepEqual(await readdir(destination), []);
  const jsonDestination = await fixture(t);
  const oversized = server({ intercept: (url) => url === API ? new Response('x'.repeat(4 * 1024 * 1024 + 1)) : undefined });
  await assert.rejects(downloadGithubSkills('acme/skills', jsonDestination, oversized), /byte limit/);
});

test('compressed wire lengths do not reject tiny decoded Git blobs, while both sizes remain bounded', async t => {
  const destination = await fixture(t);
  const entries = [dir('skills'), dir('skills/demo'), blob('skills/demo/SKILL.md'), blob('skills/demo/tiny.txt', 'x')];
  const s = server({ entries, intercept: url => url.endsWith('/tiny.txt') ?
    new Response('x', { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '21' } }) : undefined });
  await downloadGithubSkills('acme/skills', destination, s);
  assert.equal(await readFile(join(destination, 'skills/demo/tiny.txt'), 'utf8'), 'x');
  const huge = server({ entries, intercept: url => url.endsWith('/tiny.txt') ?
    new Response('x', { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '99999999' } }) : undefined });
  await assert.rejects(downloadGithubSkills('acme/skills', await fixture(t), huge), /byte limit/);
  const decodedOverflow = server({ entries, intercept: url => url.endsWith('/tiny.txt') ?
    new Response('too much', { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '21' } }) : undefined });
  await assert.rejects(downloadGithubSkills('acme/skills', await fixture(t), decodedOverflow), /byte limit/);
});

test('refuse redirects, including injected implementations ignoring redirect:error', async (t) => {
  for (const response of [new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    { ok: true, status: 200, redirected: true }, { ok: true, status: 200, url: 'https://evil.test/' }]) {
    const destination = await fixture(t), s = server({ intercept: () => response });
    await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /redirect/);
    assert.deepEqual(await readdir(destination), []);
  }
});

test('honor already-aborted signals and abort pending metadata/body reads', async (t) => {
  const destination = await fixture(t), controller = new AbortController(), s = server();
  controller.abort();
  await assert.rejects(downloadGithubSkills('acme/skills', destination, { ...s, signal: controller.signal }), /abort/i);
  assert.equal(s.calls.length, 0);
  const pendingDestination = await fixture(t), pending = new AbortController();
  const blocked = server({ intercept: (_url, options) => {
    queueMicrotask(() => pending.abort());
    assert.equal(options.signal.aborted, false);
    return new Promise(() => {});
  } });
  await assert.rejects(downloadGithubSkills('acme/skills', pendingDestination, { ...blocked, signal: pending.signal }), /abort/i);
  const bodyDestination = await fixture(t), bodyAbort = new AbortController();
  const bodyServer = server({ intercept: () => new Response(new ReadableStream({ start() {
    setImmediate(() => bodyAbort.abort());
  } })) });
  await assert.rejects(downloadGithubSkills('acme/skills', bodyDestination, { ...bodyServer, signal: bodyAbort.signal }), /abort/i);
});

test('fail clearly on missing subtree or no skill bundles', async (t) => {
  const destination = await fixture(t), s = server({ entries: [blob('README.md', 'docs')] });
  await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /No SKILL.md/);
  assert.equal(rawCalls(s).length, 0);
  const other = await fixture(t), subtree = server();
  await assert.rejects(downloadGithubSkills('https://github.com/acme/skills/tree/main/missing', other, subtree), /subtree not found/);
});

test('exclusive writes cannot overwrite files appearing during a download', async (t) => {
  const destination = await fixture(t);
  const s = server({ entries: [blob('SKILL.md')], intercept: async (url) => {
    if (url.startsWith('https://raw.')) await writeFile(join(destination, 'SKILL.md'), 'keep');
  } });
  await assert.rejects(downloadGithubSkills('acme/skills', destination, s), { code: 'EEXIST' });
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), 'keep');
});

test('refuse existing files and symlink destinations', async (t) => {
  const destination = await fixture(t), s = server();
  await writeFile(join(destination, 'existing'), 'keep');
  await assert.rejects(downloadGithubSkills('acme/skills', destination, s), /empty canonical/);
  assert.equal(await readFile(join(destination, 'existing'), 'utf8'), 'keep');
  assert.equal(s.calls.length, 0);
  const target = await fixture(t), parent = await fixture(t), link = join(parent, 'link');
  try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('OS requires privilege for symlinks'); throw error; }
  await assert.rejects(downloadGithubSkills('acme/skills', link, s), /empty canonical/);
});
