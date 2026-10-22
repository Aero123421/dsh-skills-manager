/** Restricted public-GitHub importer. Local-owner safety checks, NOT an OS sandbox:
 * the trusted pinned local-only CLI can transiently exceed scan limits between samples.
 * Never call this with a cliEntry or runner obtained from a request payload.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import fs from 'node:fs/promises';
import { downloadGithubSkills, parseGithubSource } from './github-source.js';

const VERSION = '1.7.4';
const TTL = 10 * 60 * 1000;
const TIMEOUT = 90 * 1000;
const MAX_OUTPUT = 256 * 1024;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 8192;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const require = createRequire(import.meta.url);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const aborted = () => fail('remote operation aborted', 499);
function checkSignal(signal) { if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : aborted(); }
function skillName(name) {
  return typeof name === 'string' && name.length <= 64 && NAME.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name);
}
function sourceOf(value) {
  try { return parseGithubSource(value).display; }
  catch (error) { throw fail(error.message); }
}
function parseInput(input, scope) {
  if (typeof input !== 'string' || !input.trim() || input.length > 4096 || /[\x00-\x1f\x7f;&|`$<>\\(){}]/.test(input)) {
    throw fail('input must be one restricted skills add command (no shell operators or multiline input)');
  }
  // Quotes may surround a whole token (not concatenate/interpolate shell words).
  const tokens = [];
  for (const word of input.trim().split(/ +/)) {
    const match = /^(?:'([^']*)'|"([^"]*)"|([^'"\s]+))$/.exec(word);
    if (!match) throw fail('unsupported quoting in skills add input');
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  let offset = 0;
  if (tokens[0] === 'npx') {
    offset++;
    if (tokens[offset] === '-y' || tokens[offset] === '--yes') offset++;
    if (!['skills', `skills@${VERSION}`].includes(tokens[offset++]) || tokens[offset++] !== 'add') {
      throw fail(`expected npx skills[@${VERSION}] add`);
    }
  }
  let source;
  const names = [];
  for (let i = offset; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--skill' || token === '-s') {
      const start = names.length;
      while (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        const name = tokens[++i];
        if (name !== '*' && !skillName(name)) throw fail('skill filters must be kebab-case names or *');
        names.push(name);
      }
      if (names.length === start) throw fail('--skill requires one or more names');
    } else if (['--copy', '-y', '--yes'].includes(token)) {
      // These are always forced independently below.
    } else if (token === '-g' || token === '--global') {
      if (scope !== 'user') throw fail('--global conflicts with project scope; choose user scope explicitly');
    } else if (token.startsWith('-')) throw fail(`unsupported option: ${token}`);
    else if (source) throw fail('only one GitHub source is allowed');
    else source = sourceOf(token);
  }
  if (!source) throw fail('a public GitHub source is required');
  return { source, names: [...new Set(names)] };
}
async function pinnedEntry() {
  // Resolve only this module's installed dependency, never npx, PATH, or payload.
  const packagePath = require.resolve('skills/package.json');
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  if (pkg.name !== 'skills' || pkg.version !== VERSION || pkg.bin?.skills !== './bin/cli.mjs') throw fail(`skills@${VERSION} dependency with the expected CLI entry is required`, 503);
  return join(dirname(packagePath), 'bin', 'cli.mjs');
}
function childEnv(stage) {
  const home = join(stage, 'home'), config = join(home, 'config');
  const env = {
    PATH: join(stage, 'empty'), HOME: home, USERPROFILE: home, NODE_DISABLE_COMPILE_CACHE: '1',
    XDG_CONFIG_HOME: config, XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'),
    APPDATA: config, LOCALAPPDATA: join(home, 'local'), GH_CONFIG_DIR: join(config, 'gh'),
    TMPDIR: join(stage, 'tmp'), TMP: join(stage, 'tmp'), TEMP: join(stage, 'tmp'),
    DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', CI: '1', NO_COLOR: '1',
    GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(stage, 'gitconfig'),
    GIT_CONFIG_SYSTEM: join(stage, 'gitconfig'), GIT_ATTR_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'https',
    GIT_CONFIG_COUNT: '5',
    GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: join(stage, 'empty'),
    GIT_CONFIG_KEY_1: 'init.templateDir', GIT_CONFIG_VALUE_1: join(stage, 'empty'),
    GIT_CONFIG_KEY_2: 'credential.helper', GIT_CONFIG_VALUE_2: '',
    GIT_CONFIG_KEY_3: 'credential.interactive', GIT_CONFIG_VALUE_3: 'never',
    GIT_CONFIG_KEY_4: 'protocol.allow', GIT_CONFIG_VALUE_4: 'never',
    GH_PROMPT_DISABLED: '1', GH_HOST: 'github.com',
  };
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}
async function scan(stage, transient = false, signal) {
  let bytes = 0, entries = 0;
  async function visit(path, depth) {
    if (signal) checkSignal(signal);
    if (depth > 40) throw fail('staging nesting too deep', 413);
    let list;
    try { list = await fs.readdir(path); }
    catch (error) { if (transient && error.code === 'ENOENT') return; throw error; }
    for (const name of list) {
      if (signal) checkSignal(signal);
      const child = join(path, name);
      let item;
      try { item = await fs.lstat(child); }
      catch (error) { if (transient && error.code === 'ENOENT') continue; throw error; }
      if (item.isSymbolicLink()) throw fail('staging symbolic links are not allowed', 403);
      if (!item.isDirectory() && !item.isFile()) throw fail('staging must contain only regular files and directories', 403);
      bytes += item.size;
      if (++entries > MAX_ENTRIES || bytes > MAX_BYTES) throw fail('remote staging resource limit exceeded', 413);
      if (item.isDirectory()) await visit(child, depth + 1);
    }
  }
  await visit(stage, 0);
}
async function killTree(child) {
  if (!child.pid) return;
  if (process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    return;
  }
  // Fixed OS executable, no PATH resolution or shell; bounded even if taskkill stalls.
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  await new Promise((done) => {
    const killer = spawn(executable, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { killer.kill(); child.kill(); done(); }, 3000);
    killer.once('error', () => { clearTimeout(timer); child.kill(); done(); });
    killer.once('close', () => { clearTimeout(timer); done(); });
  });
}
async function runChild({ executable, args, cwd, env, signal, maxOutputBytes }) {
  checkSignal(signal);
  return new Promise((done, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let error, bytes = 0, killing;
    const stop = () => { error ??= signal.reason instanceof Error ? signal.reason : aborted(); killing ??= killTree(child).catch(() => child.kill()); };
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) { error = fail('remote CLI output limit exceeded', 413); stop(); }
    });
    child.once('error', (cause) => { error = cause; });
    child.once('close', async (code) => {
      signal.removeEventListener('abort', stop);
      // Reap any descendants that retained pipes or outlived the CLI leader.
      if (killing) await killing;
      else await killTree(child).catch(() => {});
      if (error) reject(error); else done({ code });
    });
  });
}

/** runner is a trusted test seam: it must settle after signal abort, before resolving.
 * now returns epoch milliseconds. All methods (including dispose) return promises.
 */
export function createRemoteInstaller({ resolveTarget, validateBody, importSkill, cliEntry, runner = runChild, fetchSource = downloadGithubSkills, now = Date.now }) {
  if (![resolveTarget, validateBody, importSkill, runner, fetchSource, now].every((value) => typeof value === 'function')) throw new TypeError('remote installer callbacks are required');
  const previews = new Map(), owned = new Set(), operations = new Set();
  let disposed = false, preparing = 0;
  function operate(signal, work) {
    if (disposed) return Promise.reject(fail('remote installer disposed', 410));
    const controller = new AbortController();
    const abort = () => controller.abort(aborted());
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const operation = { controller };
    operations.add(operation);
    operation.done = (async () => {
      try { checkSignal(controller.signal); return await work(controller); }
      finally { signal?.removeEventListener('abort', abort); operations.delete(operation); }
    })();
    return operation.done;
  }
  async function cleanup(stage) {
    // stage must be an exact absolute mkdtemp result recorded by this instance.
    if (owned.has(stage)) { await fs.rm(stage, { recursive: true, force: true }); owned.delete(stage); }
  }
  async function remove(token, preview) {
    clearTimeout(preview.timer);
    previews.delete(token);
    await cleanup(preview.stage);
  }
  async function expire() {
    for (const [token, preview] of previews) if (!preview.busy && preview.expiresAt <= now()) await remove(token, preview);
  }
  function lookup(payload) {
    if (!payload || typeof payload.token !== 'string') throw fail('preview token is required');
    const preview = previews.get(payload.token);
    if (!preview) throw fail('preview token expired or unavailable; prepare again', 410);
    if (preview.busy) throw fail('preview token is in use', 409);
    preview.busy = true; // Claim synchronously, before any target/read-only checks.
    return preview;
  }
  async function candidates(stage) {
    const directory = join(stage, 'cwd', '.agents', 'skills');
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') throw fail('no skills were staged by the CLI'); throw error; }
    const found = new Map();
    for (const entry of entries) {
      if (!entry.isDirectory() || !skillName(entry.name)) throw fail('invalid staged skill directory');
      const srcDir = join(directory, entry.name), path = join(srcDir, 'SKILL.md');
      const st = await fs.lstat(path);
      if (!st.isFile() || st.size > 4 * 1024 * 1024) throw fail('invalid staged SKILL.md');
      const parsed = await validateBody(await fs.readFile(path, 'utf8'));
      if (parsed?.data?.name !== entry.name || typeof parsed.data.description !== 'string') throw fail('staged skill name/frontmatter mismatch');
      found.set(entry.name, { srcDir, name: entry.name, description: parsed.data.description });
    }
    if (!found.size) throw fail('no valid skills were staged by the CLI');
    return found;
  }
  async function validateSource(directory) {
    const names = new Set();
    async function visit(path) {
      for (const entry of await fs.readdir(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) await visit(child);
        else if (entry.name === 'SKILL.md') {
          const st = await fs.lstat(child);
          if (!st.isFile() || st.size > 4 * 1024 * 1024) throw fail('invalid downloaded SKILL.md');
          const parsed = await validateBody(await fs.readFile(child, 'utf8'));
          const name = parsed?.data?.name;
          if (!skillName(name)) throw fail('downloaded skill requires a valid kebab-case name');
          if (names.has(name)) throw fail(`duplicate downloaded skill name: ${name}`, 409);
          names.add(name);
        }
      }
    }
    await visit(directory);
    if (!names.size) throw fail('source contains no valid SKILL.md files');
  }
  return {
    prepare(payload, signal) {
      if (preparing >= 2) return Promise.reject(fail('too many active remote previews; wait for a retrieval to finish', 429));
      preparing++;
      return operate(signal, async (controller) => {
        const target = await resolveTarget(payload); // Write/read-only gate BEFORE CLI or network.
        checkSignal(controller.signal);
        const parsed = parseInput(payload.input, target.scope);
        await expire();
        const entry = cliEntry ?? await pinnedEntry();
        if (typeof entry !== 'string' || !isAbsolute(entry)) throw fail('CLI entry must be an absolute trusted path', 503);
        // macOS /var (and other system tmp aliases) must not leak into source paths:
        // downloader and safe importer require canonical, non-symlink ancestors.
        const stage = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'dsh-skills-remote-'));
        owned.add(stage);
        let retained = false, timer, interval, monitoring = Promise.resolve(), scanning = false;
        try {
          const cwd = join(stage, 'cwd');
          await Promise.all(['cwd', 'home', 'tmp', 'empty', 'source'].map((name) => fs.mkdir(join(stage, name), { mode: 0o700 })));
          await fs.writeFile(join(stage, 'gitconfig'), '', { mode: 0o600 });
          checkSignal(controller.signal);
          timer = setTimeout(() => controller.abort(fail('remote CLI timed out after 90 seconds', 504)), TIMEOUT);
          interval = setInterval(() => {
            if (scanning || controller.signal.aborted) return;
            scanning = true;
            monitoring = scan(stage, true, controller.signal)
              .catch((error) => controller.abort(error))
              .finally(() => { scanning = false; });
          }, 200);
          const sourceDir = join(stage, 'source');
          const args = [entry, 'add', sourceDir, '--agent', 'universal', '--copy', '--yes', '--json'];
          if (parsed.names.length) args.push('--skill', ...parsed.names);
          let result, snapshot;
          try {
            snapshot = await fetchSource(parsed.source, sourceDir, { signal: controller.signal });
            checkSignal(controller.signal);
            await scan(stage, false, controller.signal);
            await validateSource(sourceDir); // Prevent CLI sanitization/duplicate overwrites before copy.
            checkSignal(controller.signal);
            result = await runner({ executable: process.execPath, args, cwd, env: childEnv(stage), signal: controller.signal, timeoutMs: TIMEOUT, maxOutputBytes: MAX_OUTPUT });
          } finally { clearInterval(interval); clearTimeout(timer); await monitoring; }
          checkSignal(controller.signal);
          if (result?.code !== undefined && result.code !== 0) throw fail(`skills CLI failed (exit ${result.code})`, 502);
          if (Buffer.byteLength(result?.stdout ?? '') + Buffer.byteLength(result?.stderr ?? '') > MAX_OUTPUT) throw fail('remote CLI output limit exceeded', 413);
          await scan(stage, false, controller.signal);
          const skills = await candidates(stage);
          checkSignal(controller.signal);
          // Recheck target even for preview: policy/root may have changed during fetch.
          const current = await resolveTarget(payload);
          if (current.root !== target.root || current.scope !== target.scope || current.canonical !== target.canonical) throw fail('target changed; prepare again', 409);
          await expire();
          while (previews.size >= 3) {
            const victim = [...previews].find(([, preview]) => !preview.busy);
            if (!victim) throw fail('all remote previews are in use; try again', 409);
            victim[1].busy = true;
            await remove(...victim);
          }
          checkSignal(controller.signal);
          const token = randomUUID(), expiresAt = now() + TTL;
          const commit = typeof snapshot?.commit === 'string' && /^[a-f0-9]{40}$/i.test(snapshot.commit) ? snapshot.commit : null;
          const preview = { stage, target, projectRoot: payload.projectRoot, source: parsed.source, commit, skills, expiresAt, busy: false };
          preview.timer = setTimeout(() => {
            if (!preview.busy && previews.get(token) === preview) {
              preview.busy = true;
              remove(token, preview).catch(() => {}); // dispose retries any failed owned-dir cleanup.
            }
          }, TTL);
          preview.timer.unref?.();
          previews.set(token, preview);
          retained = true;
          return { token, source: parsed.source, ...(typeof snapshot?.commit === 'string' && /^[a-f0-9]{40}$/i.test(snapshot.commit) ? { commit: snapshot.commit } : {}), scope: target.scope, root: target.root, skills: [...skills.values()].map(({ name, description }) => ({ name, description })).sort((a, b) => a.name.localeCompare(b.name)), expiresAt };
        } finally {
          clearInterval(interval); clearTimeout(timer); await monitoring;
          if (!retained) await cleanup(stage);
        }
      }).finally(() => { preparing--; });
    },
    install(payload, signal) {
      return operate(signal, async (controller) => {
        const preview = lookup(payload);
        let consumed = false;
        try {
          if (preview.expiresAt <= now()) { consumed = true; throw fail('preview token expired; prepare again', 410); }
          const current = await resolveTarget(payload); // Recheck read-only on every import.
          const target = preview.target;
          if (current.root !== target.root || current.scope !== target.scope || current.canonical !== target.canonical || (target.scope === 'project' && payload.projectRoot !== preview.projectRoot)) throw fail('preview target context does not match; prepare again', 409);
          if (!Array.isArray(payload.skillNames) || !payload.skillNames.length || payload.skillNames.length > preview.skills.size || new Set(payload.skillNames).size !== payload.skillNames.length || payload.skillNames.some((name) => !preview.skills.has(name))) throw fail('select one or more exact names from this preview (no duplicates)');
          consumed = true;
          checkSignal(controller.signal);
          await scan(preview.stage, false, controller.signal);
          const results = [], errors = [];
          for (const name of payload.skillNames) {
            checkSignal(controller.signal);
            try {
              const proof = preview.commit ? { source: preview.source, commit: preview.commit } : undefined;
              const value = await importSkill({ srcDir: preview.skills.get(name).srcDir, scope: target.scope, projectRoot: preview.projectRoot }, proof);
              results.push({ name, installed: true, value });
            } catch (error) {
              const detail = { name, message: error.message ?? String(error), status: error.status ?? 500 };
              errors.push(detail); results.push({ name, installed: false, error: { message: detail.message, status: detail.status } });
            }
          }
          return { installed: errors.length === 0, results, errors };
        } finally {
          if (consumed) await remove(payload.token, preview);
          else preview.busy = false;
        }
      });
    },
    // Trusted in-process updater hook only: never expose staged paths or callbacks over HTTP.
    withPrepared(payload, signal, work, { consume = false } = {}) {
      if (typeof work !== 'function') return Promise.reject(new TypeError('a trusted prepared-snapshot callback is required'));
      return operate(signal, async controller => {
        const preview = lookup(payload);
        let consumed = false;
        try {
          if (preview.expiresAt <= now()) { consumed = true; throw fail('preview token expired; prepare again', 410); }
          const current = await resolveTarget(payload);
          const target = preview.target;
          if (current.root !== target.root || current.scope !== target.scope || current.canonical !== target.canonical ||
              (target.scope === 'project' && payload.projectRoot !== preview.projectRoot)) throw fail('preview target context does not match; prepare again', 409);
          checkSignal(controller.signal);
          consumed = consume;
          await scan(preview.stage, false, controller.signal);
          return await work({ source: preview.source, commit: preview.commit, skills: preview.skills, expiresAt: preview.expiresAt }, controller.signal);
        } finally {
          // Do not turn an already committed store update into an HTTP failure
          // merely because temporary-file cleanup failed. Owned dirs are retried on dispose.
          if (consumed) await remove(payload.token, preview).catch(() => {});
          else preview.busy = false;
        }
      });
    },
    discard(payload) {
      return operate(undefined, async () => {
        if (!payload || typeof payload.token !== 'string') throw fail('preview token is required');
        if (!previews.has(payload.token)) return { discarded: false };
        const preview = lookup(payload);
        await remove(payload.token, preview);
        return { discarded: true };
      });
    },
    async dispose() {
      disposed = true;
      for (const operation of operations) operation.controller.abort(aborted());
      await Promise.allSettled([...operations].map((operation) => operation.done));
      for (const preview of previews.values()) clearTimeout(preview.timer);
      previews.clear();
      await Promise.all([...owned].map(cleanup));
    },
  };
}
