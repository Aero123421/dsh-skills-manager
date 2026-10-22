import { lstat, realpath, readdir, mkdir, open } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_TREE_ENTRIES = 10000;
const MAX_FILES = 2048;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const SHA = /^[a-f0-9]{40}$/i;
const DEVICE = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i;

function invalid(message) { throw new Error(message); }
function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 4096) invalid('Invalid repository path');
  const parts = path.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.toLowerCase() === '.git' || part.length > 255 ||
      /[\\<>:"|?*\u0000-\u001f\u007f]/u.test(part) || /[. ]$/u.test(part) || DEVICE.test(part)) {
      invalid('Unsafe repository path');
    }
  }
  if (parts.length > 32) invalid('Repository nesting too deep');
  return path;
}
function safeRef(ref) {
  if (typeof ref !== 'string' || ref.length > 255 || ref.startsWith('-') ||
      /[\s~^:?*\[\\@#%]/u.test(ref) || ref.includes('..') || ref.includes('@{') ||
      ref.endsWith('.lock')) invalid('Invalid GitHub reference');
  return safePath(ref);
}

/** Public owner/repo, or HTTPS github.com/owner/repo[/tree/ref/subpath], optionally #ref.
 * Tree URLs have a single-segment ref; use #feature/branch for slash-containing refs.
 * Deliberately excludes arbitrary URLs, Git transports, credentials and CLI flags.
 */
export function parseGithubSource(sourceString) {
  if (typeof sourceString !== 'string' || !sourceString || sourceString !== sourceString.trim() ||
      sourceString.length > 2048 || /[\s\\\u0000-\u001f\u007f%]/u.test(sourceString)) invalid('Invalid public GitHub source');
  const fragments = sourceString.split('#');
  if (fragments.length > 2 || fragments.length === 2 && !fragments[1]) invalid('Invalid GitHub reference');
  const [source, fragment] = fragments;
  let parts;
  if (source.startsWith('https://')) {
    // Inspect the original spelling before URL normalization can erase dot segments.
    if (!/^https:\/\/github\.com\//.test(source)) invalid('Only public github.com HTTPS sources are supported');
    const url = new URL(source);
    if (url.origin !== 'https://github.com' || url.username || url.password || url.port || url.search ||
        source.includes('?') || source.includes(':443')) invalid('Invalid GitHub URL');
    parts = source.slice('https://github.com/'.length).split('/');
    if (parts.at(-1) === '') parts.pop();
  } else {
    if (source.includes(':') || source.includes('?')) invalid('Invalid GitHub shorthand');
    parts = source.split('/');
    if (parts.length !== 2) invalid('Use owner/repo shorthand');
  }
  const [owner, repo, marker, treeRef, ...rest] = parts;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(owner ?? '') ||
      !/^[a-z0-9_.-]{1,100}$/i.test(repo ?? '') || repo.endsWith('.git')) invalid('Invalid GitHub owner or repository');
  safePath(owner); safePath(repo);
  if (parts.length > 2 && (marker !== 'tree' || !treeRef)) invalid('Only GitHub repository or tree URLs are supported');
  if (treeRef) safeRef(treeRef);
  const ref = fragment ? safeRef(fragment) : treeRef;
  const subpath = rest.length ? safePath(rest.join('/')) : undefined;
  const display = `https://github.com/${owner}/${repo}${subpath ? `/tree/${treeRef}/${subpath}` : treeRef ? `/tree/${treeRef}` : ''}${fragment ? `#${fragment}` : ''}`;
  return { owner, repo, ...(ref && { ref }), ...(subpath && { subpath }), display };
}

function abortReason(signal) { return signal.reason ?? new DOMException('Aborted', 'AbortError'); }
function checkAbort(signal) { if (signal?.aborted) throw abortReason(signal); }
function abortable(promise, signal) {
  checkAbort(signal);
  return new Promise((resolvePromise, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolvePromise, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function boundedRequest(url, limit, parentSignal, fetchImpl) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error('GitHub request timed out')), REQUEST_TIMEOUT_MS);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout.signal]) : timeout.signal;
  let reader, response;
  try {
    checkAbort(signal);
    response = await abortable(fetchImpl(url, {
      method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-skills-manager', 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity' },
    }), signal);
    // fetch's redirect:error is enforced again for injected implementations.
    if (response.redirected || response.status >= 300 && response.status < 400 ||
        response.url && response.url !== url) invalid('GitHub redirects are not allowed');
    if (!response.ok) invalid(`GitHub request failed (HTTP ${response.status})`);
    const length = response.headers.get('content-length');
    // fetch decodes gzip/br automatically, but Content-Length still describes
    // the encoded wire bytes. Small gzip bodies can be larger than the Git blob.
    // Ask for identity above; tolerate bounded coding overhead if a proxy ignores it.
    const encoding = response.headers.get('content-encoding');
    const wireLimit = encoding && encoding.trim().toLowerCase() !== 'identity' ? limit + 65536 : limit;
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > wireLimit)) invalid('GitHub response exceeds byte limit');
    if (!response.body) invalid('Empty GitHub response');
    reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) invalid('GitHub response exceeds byte limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    clearTimeout(timer);
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}
function within(path, directory) { return directory === '' || path.startsWith(`${directory}/`); }

/** Download only complete skill bundles, preserving repository-relative paths.
 * destination must be an existing empty canonical directory owned by the caller.
 * The caller owns cleanup on failure; no downloaded file is ever executed.
 */
export async function downloadGithubSkills(sourceString, destination, { signal, fetchImpl = globalThis.fetch } = {}) {
  const source = parseGithubSource(sourceString);
  checkAbort(signal);
  if (typeof destination !== 'string' || !destination) invalid('Invalid staging destination');
  const root = resolve(destination);
  const destinationInfo = await lstat(root);
  if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink() || await realpath(root) !== root ||
      (await readdir(root)).length !== 0) invalid('Staging destination must be an empty canonical directory');
  const api = `https://api.github.com/repos/${source.owner}/${source.repo}`;
  const json = async (url) => JSON.parse((await boundedRequest(url, MAX_JSON_BYTES, signal, fetchImpl)).toString('utf8'));
  const metadata = await json(api);
  if (metadata?.private !== false) invalid('Only public GitHub repositories are supported');
  const ref = source.ref ?? safeRef(metadata.default_branch);
  // GitHub's public branch endpoint is CDN-cached for 60s even with no-cache
  // request headers. A fresh query avoids reusing a pre-push branch resolution;
  // all tree/raw downloads below remain pinned to the returned immutable SHA.
  const commitURL = new URL(`${api}/commits/${encodeURIComponent(ref)}`);
  if (!SHA.test(ref)) commitURL.searchParams.set('_dsh_check', randomUUID());
  const resolved = await json(commitURL.href);
  const commit = resolved?.sha;
  const treeSHA = resolved?.commit?.tree?.sha;
  if (typeof commit !== 'string' || !SHA.test(commit) || typeof treeSHA !== 'string' || !SHA.test(treeSHA)) invalid('Invalid GitHub commit response');
  const tree = await json(`${api}/git/trees/${treeSHA}?recursive=1`);
  if (tree?.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > MAX_TREE_ENTRIES) invalid('Incomplete or oversized GitHub tree');
  const entries = new Map();
  const folded = new Set();
  for (const entry of tree.tree) {
    if (!entry || typeof entry !== 'object') invalid('Invalid GitHub tree entry');
    const path = safePath(entry.path);
    const key = path.toLowerCase();
    if (entries.has(path) || folded.has(key)) invalid('Duplicate or case-colliding repository paths');
    entries.set(path, entry); folded.add(key);
  }
  if (source.subpath && !entries.has(source.subpath)) invalid('GitHub subtree not found');
  const bundles = [...entries.values()].filter((entry) =>
    (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md')) &&
    (!source.subpath || within(entry.path, source.subpath)))
    .map((entry) => entry.path === 'SKILL.md' ? '' : entry.path.slice(0, -'/SKILL.md'.length));
  if (!bundles.length) invalid('No SKILL.md bundles found in GitHub source');
  const bundleSet = new Set(bundles);
  const selected = [...entries.values()].filter((entry) => {
    if (bundleSet.has('')) return true;
    const segments = entry.path.split('/');
    while (segments.length) {
      if (bundleSet.has(segments.join('/'))) return true;
      segments.pop();
    }
    return false;
  });
  const checked = new Set();
  const validateEntry = (entry) => {
    if (!entry || !(entry.type === 'tree' && entry.mode === '040000' ||
        entry.type === 'blob' && ['100644', '100755'].includes(entry.mode))) invalid('Repository bundle contains a link or special entry');
    if (entry.type === 'blob' && (!Number.isSafeInteger(entry.size) || entry.size < 0)) invalid('Invalid GitHub file size');
  };
  // Validate the entire selection AND every ancestor before requesting any raw content.
  for (const entry of selected) {
    validateEntry(entry);
    const segments = entry.path.split('/');
    segments.pop();
    while (segments.length) {
      const ancestor = segments.join('/');
      if (!checked.has(ancestor)) {
        const parent = entries.get(ancestor);
        if (!parent || parent.type !== 'tree') invalid('Invalid repository ancestor');
        validateEntry(parent); checked.add(ancestor);
      }
      segments.pop();
    }
  }
  const files = selected.filter((entry) => entry.type === 'blob');
  if (files.length > MAX_FILES || files.reduce((sum, entry) => sum + entry.size, 0) > MAX_BYTES) invalid('GitHub skill bundles exceed file or byte limit');
  for (const directory of selected.filter((entry) => entry.type === 'tree')) {
    checkAbort(signal);
    await mkdir(join(root, ...directory.path.split('/')), { recursive: true, mode: 0o700 });
  }
  let totalBytes = 0;
  for (const file of files) {
    checkAbort(signal);
    const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const content = await boundedRequest(url, Math.min(file.size, MAX_BYTES - totalBytes), signal, fetchImpl);
    if (content.length !== file.size) invalid('GitHub file size differs from pinned tree');
    totalBytes += content.length;
    checkAbort(signal);
    const target = join(root, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    // Exclusive creation refuses existing files and links, even for zero-byte files.
    const mode = file.mode === '100755' ? 0o755 : 0o644;
    const output = await open(target, 'wx', mode);
    try {
      await output.writeFile(content);
      await output.chmod(mode); // Preserve Git's executable bit independently of host umask.
    } finally { await output.close(); }
  }
  return { source: source.display, commit };
}
