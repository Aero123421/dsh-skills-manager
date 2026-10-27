'use strict';

// Run with: node --test tests/client*.test.js
// Tiny hook renderer: exercise the shipped, unbundled client rather than a duplicate controller.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const client = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function harness({ baseURI = 'https://example.test/mounted/dsh/', storage = new Map(), picker, locale } = {}) {
  const hooks = [], effects = [], requests = [], listeners = new Map();
  let cursor = 0, changed = true, tree, Panel, mounted = true, lateUpdates = 0;
  const react = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...props, children: children.flat(Infinity) } };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => {
        if (!mounted) lateUpdates++;
        const next = typeof value === 'function' ? value(hooks[index]) : value;
        if (!Object.is(next, hooks[index])) { hooks[index] = next; changed = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ||= { current: initial };
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const old = hooks[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        effects.push(() => {
          old?.cleanup?.();
          hooks[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const pluginEffects = [];
  const ctx = {
    get: () => ({ pickDirectory: picker }),
    effect(callback) { pluginEffects.push(callback); },
    locale: locale || { bind: () => value => value },
    slots: {
      inject(_name, callback) { callback(); },
      register(options, component) { if (options.name === 'main') Panel = component; },
    },
  };
  const window = {
    confirm: () => true,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    __ModuleLoader__: { load(module) { module.factory(name => {
      assert.equal(name, 'react', 'only the public React dependency is imported');
      return react;
    }).apply(ctx); } },
  };
  const sandbox = {
    window, document: { baseURI }, URL, AbortController,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      // Deliberately ignore abort: generation guards must work even when a response already arrived.
      requests.push({ url, options, method: url.split('/').at(-1), payload: JSON.parse(options.body),
        resolve, reject, answered: false });
      return promise;
    },
  };
  vm.runInNewContext(client, sandbox, { filename: 'client.js' });
  function render() {
    for (let count = 0; changed && count < 30; count++) {
      changed = false;
      cursor = 0;
      tree = Panel({ ctx, t: value => value });
      while (effects.length) effects.shift()();
    }
    assert.equal(changed, false, 'render converges');
  }
  async function flush() {
    for (let i = 0; i < 12; i++) { await Promise.resolve(); if (mounted) render(); }
  }
  function all(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child =>
      child === undefined ? [] : all(predicate, child))];
  }
  function one(predicate) {
    const found = all(predicate);
    assert.ok(found.length, 'expected control is present');
    return found[0];
  }
  function button(label) {
    return one(node => (node.type === 'button' || node.type?.name === 'Button') && node.props.children.includes(label));
  }
  function request(method) {
    const found = requests.find(item => item.method === method && !item.answered);
    assert.ok(found, `pending ${method} request exists`);
    return found;
  }
  async function reply(method, value, { status = 200, error, target } = {}) {
    const pending = target || request(method);
    pending.answered = true;
    pending.resolve({ ok: status < 400, status, json: async () => error ?
      { ok: false, error: { message: error } } : { ok: true, value } });
    await flush();
    return pending;
  }
  function click(node) { const result = node.props.onClick?.(); render(); return result; }
  function change(node, value) { node.props.onChange({ target: { value, checked: value } }); render(); }
  function unmount() {
    for (const hook of hooks) hook?.cleanup?.();
    mounted = false;
  }
  render();
  return { all, one, button, request, requests, reply, click, change, flush, render, storage,
    unmount, listeners, effects: pluginEffects, lateUpdates: () => lateUpdates, tree: () => tree };
}

const skill = (name = 'alpha', kind = 'dir', revision = 'r1') => ({
  name, storageName: name, kind, revision, description: name + ' description', valid: true,
  body: `---\nname: ${name}\ndescription: Example\n---\n\nOriginal instructions`,
  path: `/skills/${name}${kind === 'flat' ? '.md' : '/SKILL.md'}`,
});
const list = (skills = [skill()], root = '/skills') => ({ skills, root });
const card = app => app.one(node => node.props.className === 'dsm-card');
const textarea = app => app.one(node => node.type === 'textarea');
const back = app => app.one(node => node.props.className === 'dsm-back');
async function openSkill(app, item = skill()) {
  await app.reply('list', list([item]));
  app.click(card(app));
  await app.reply('get', item);
}

test('API resolves under document baseURI and all reads are abortable', async () => {
  const app = harness();
  const request = app.request('list');
  assert.equal(request.url, 'https://example.test/mounted/dsh/api/dsh-skills-manager/list');
  assert.equal(request.options.credentials, 'same-origin');
  assert.ok(request.options.signal instanceof AbortSignal);
  await app.reply('list', list());
  app.click(card(app));
  assert.equal(app.request('get').payload.kind, 'dir');
  assert.equal(app.request('get').payload.name, 'alpha');
  app.unmount();
  assert.equal(app.request('get').options.signal.aborted, true);
  await app.reply('get', skill());
  assert.equal(app.lateUpdates(), 0, 'late detail does not update an unmounted panel');
});

test('delayed detail blocks project form, scope changes, and targets the original revision', async () => {
  const storage = new Map([['dsh-skills-manager:projectRoot', '/project/A']]);
  const app = harness({ storage });
  await app.reply('list', list());
  app.click(app.button('project'));
  await app.reply('list', list([skill('same', 'flat')], '/project/A/.dsh/skills'));
  const projectInput = app.one(node => node.type === 'input' && node.props['aria-label'] === 'projectPath');
  app.change(projectInput, '/project/B');
  const form = app.one(node => node.type === 'form' && node.props.className === 'dsm-context');
  app.click(card(app));
  assert.equal(app.button('user').props.disabled, true);
  form.props.onSubmit({ preventDefault() {} }); // Even a stale callback must not switch.
  app.click(app.button('user'));
  await app.flush();
  assert.equal(app.requests.filter(item => item.method === 'list').length, 2);
  await app.reply('get', skill('same', 'flat'));
  app.click(app.button('delete'));
  const remove = app.all(node => node.type?.name === 'Button' && node.props.children.includes('delete')).at(-1);
  app.click(remove);
  assert.deepEqual(app.request('remove').payload, {
    scope: 'project', projectRoot: '/project/A', name: 'same', kind: 'flat', expectedRevision: 'r1',
  });
  await app.reply('remove', {});
  await app.reply('list', list([], '/project/A/.dsh/skills'));
});

test('context switches clear old cards/root and ignore late list success and failure', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/B']]) });
  const old = app.request('list');
  app.click(app.button('project'));
  assert.equal(old.options.signal.aborted, true);
  assert.equal(app.all(node => node.props.className === 'dsm-card').length, 0);
  assert.equal(app.button('create').props.disabled, true);
  const current = app.requests.filter(item => item.method === 'list').at(-1);
  await app.reply('list', null, { target: current, status: 500, error: 'No access' });
  await app.reply('list', list([skill('stale')], '/old/root'), { target: old });
  assert.equal(app.all(node => node.props.className === 'dsm-card').length, 0);
  assert.equal(app.button('install').props.disabled, true);
  assert.equal(app.all(node => node.props.title === '/old/root').length, 0);
  assert.ok(app.all(node => node.props.role === 'alert' && node.props.children.includes('No access')).length);
});

test('failed refresh removes previous cards and root and gates stale row handlers', async () => {
  const app = harness();
  await app.reply('list', list([skill()], '/old/root'));
  const oldCard = card(app);
  app.click(app.one(node => node.type?.name === 'Button' && node.props.icon === 'refresh'));
  app.click(oldCard);
  assert.equal(app.requests.filter(item => item.method === 'get').length, 0);
  await app.reply('list', null, { status: 500, error: 'Refresh failed' });
  assert.equal(app.all(node => node.props.className === 'dsm-card').length, 0);
  assert.equal(app.all(node => node.props.title === '/old/root').length, 0);
  assert.equal(app.button('create').props.disabled, true);
});

test('save locks text and navigation, sends update identity, and refreshes revision', async () => {
  const app = harness();
  const original = skill('alpha', 'flat');
  await openSkill(app, original);
  app.click(app.button('edit'));
  const editor = textarea(app);
  const savedBody = original.body + '\nSaved edit';
  app.change(editor, savedBody);
  app.click(app.button('save'));
  assert.equal(textarea(app).props.readOnly, true);
  app.change(editor, savedBody + '\nInvisible late edit');
  app.click(back(app));
  assert.equal(textarea(app).props.value, savedBody);
  await app.reply('validate', { valid: true, frontmatter: { name: 'alpha', description: 'Example' } });
  assert.deepEqual(app.request('save').payload, {
    scope: 'user', name: 'alpha', kind: 'flat', expectedRevision: 'r1', body: savedBody, mode: 'update',
  });
  await app.reply('save', { revision: 'r2' });
  await app.reply('get', { ...original, body: savedBody, revision: 'r2' });
  await app.reply('list', list([{ ...original, revision: 'r2' }]));
  assert.equal(app.all(node => node.type === 'textarea').length, 0);
  app.click(app.one(node => node.props.role === 'switch'));
  assert.equal(app.request('setInvocation').payload.expectedRevision, 'r2');
  await app.reply('setInvocation', { revision: 'r3' });
  await app.reply('get', { ...original, body: savedBody, revision: 'r3', modelInvocable: false });
  await app.reply('list', list([{ ...original, revision: 'r3' }]));
  app.click(app.button('edit'));
  assert.equal(textarea(app).props.value, savedBody);
});

test('create chooses an unused name and uses create mode rather than update', async () => {
  const app = harness();
  await app.reply('list', list([skill('my-skill', 'flat'), skill('my-skill-2')]));
  app.click(app.button('create'));
  assert.match(textarea(app).props.value, /name: my-skill-3/);
  app.click(app.button('save'));
  await app.reply('validate', { valid: true, frontmatter: { name: 'my-skill-3' } });
  assert.equal(app.request('save').payload.mode, 'create');
  assert.equal(app.request('save').payload.kind, 'dir');
  assert.equal(app.request('save').payload.name, 'my-skill-3');
  await app.reply('save', null, { status: 409, error: 'Already exists' });
  assert.equal(textarea(app).props.readOnly, false);
  assert.match(textarea(app).props.value, /name: my-skill-3/);
});

test('drafts stay on the canonical root and ignore legacy keys from another home', async () => {
  const storage = new Map();
  const legacy = 'dsh-skills-manager:draft:' + JSON.stringify([{ scope: 'user' }, 'dir', 'alpha']);
  storage.set(legacy, JSON.stringify({ text: 'LEGACY PRIVATE', baseline: 'old', revision: 'r1' }));
  const homeA = '/home/a/.dsh/skills';
  const homeB = '/home/b/.dsh/skills';
  const first = harness({ storage });
  await openSkill(first, { ...skill(), root: homeA });
  first.click(first.button('edit'));
  first.change(textarea(first), skill().body + '\nPRIVATE DRAFT FOR HOME A');
  first.unmount();
  assert.ok([...storage.keys()].some(key => key.includes(homeA)));
  assert.equal(storage.has(legacy), true);
  const second = harness({ storage });
  await openSkill(second, { ...skill(), root: homeB });
  assert.equal(second.all(node => node.type === 'textarea').length, 0, 'home B does not open home A draft');
  assert.equal([...second.storage.keys()].some(key => String(second.storage.get(key)).includes('LEGACY PRIVATE') && key !== legacy), false);
  const third = harness({ storage });
  await openSkill(third, { ...skill(), root: homeA });
  assert.match(textarea(third).props.value, /PRIVATE DRAFT FOR HOME A/);
  const notice = [].concat(third.all(node => node.props.className === 'dsm-notice')[0].props.children).join('');
  assert.match(notice, /draftRestored/);
  assert.match(notice, /\/home\/a\/\.dsh\/skills/);
});

test('new-skill drafts are keyed by the listed root', async () => {
  const app = harness();
  await app.reply('list', list([skill()], '/home/a/.dsh/skills'));
  app.click(app.button('create'));
  const keys = [...app.storage.keys()].filter(key => key.includes(':draft:'));
  assert.equal(keys.length, 1);
  assert.match(keys[0], /\/home\/a\/\.dsh\/skills/);
});

test('Japanese is added as a selectable language and a second registration is ignored', () => {
  const added = [];
  let calls = 0;
  const app = harness({ locale: {
    bind: () => value => value,
    register() { return () => {}; },
    addLanguage(input) {
      calls++;
      if (calls > 1) throw new Error('locale "ja" is already registered');
      added.push(input);
      return () => {};
    },
  } });
  for (const effect of app.effects) effect();
  for (const effect of app.effects) effect();
  assert.equal(added.length, 1);
  assert.equal(added[0].id, 'ja');
  assert.equal(added[0].label, '日本語');
  assert.equal(added[0].fallback, 'en');
});

test('external main-slot unmount preserves context drafts, restores revision, and cancel clears them', async () => {
  const storage = new Map();
  const original = skill();
  const first = harness({ storage });
  await openSkill(first, original);
  first.click(first.button('edit'));
  first.change(textarea(first), original.body + '\nUnsaved draft');
  first.unmount();
  assert.ok([...storage.keys()].some(key => key.includes(':draft:')));
  const second = harness({ storage });
  await openSkill(second, { ...original, revision: 'r2' });
  assert.match(textarea(second).props.value, /Unsaved draft/);
  assert.ok(second.all(node => node.props.children.includes('draftConflict')).length);
  second.click(second.button('save'));
  await second.reply('validate', { valid: true, frontmatter: { name: 'alpha' } });
  assert.equal(second.request('save').payload.expectedRevision, 'r1', 'old draft cannot silently overwrite newer content');
  await second.reply('save', null, { status: 409, error: 'Changed externally' });
  second.click(second.button('cancel'));
  assert.equal([...storage.keys()].filter(key => key.includes(':draft:')).length, 0);
  second.click(second.one(node => node.props.role === 'switch'));
  assert.equal(second.request('setInvocation').payload.expectedRevision, 'r2', 'cancel restores server revision');
  second.unmount();
});

test('legacy bundle/Markdown name collisions have distinct labels, keys, and get kinds', async () => {
  const app = harness();
  await app.reply('list', list([skill('same', 'dir'), skill('same', 'flat')]));
  const cards = app.all(node => node.props.className === 'dsm-card');
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(node => node.props['data-skill-kind']), ['dir', 'flat']);
  assert.ok(app.all(node => node.props.className === 'dsm-tag' && node.props.children.includes('bundle')).length);
  assert.ok(app.all(node => node.props.className === 'dsm-tag' && node.props.children.includes('markdown')).length);
  const rows = app.all(node => node.type === 'li');
  assert.notEqual(rows[0].props.key, rows[1].props.key);
  app.click(cards[1]);
  assert.equal(app.request('get').payload.kind, 'flat');
});

test('detached old-project row cannot reinterpret its identity in a ready new project', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/B']]) });
  await app.reply('list', list([skill('same')], '/user/root'));
  const oldCard = card(app);
  app.click(app.button('project'));
  await app.reply('list', list([skill('same')], '/project/B/.dsh/skills'));
  app.click(oldCard);
  assert.equal(app.requests.filter(item => item.method === 'get').length, 0);
  app.click(card(app));
  assert.equal(app.request('get').payload.projectRoot, '/project/B');
});

test('fresh get frontmatter, not stale list flags, controls invocation switches', async () => {
  const app = harness();
  const item = { ...skill(), modelInvocable: true, userInvocable: true };
  await app.reply('list', list([item]));
  app.click(card(app));
  await app.reply('get', { name: item.name, kind: item.kind, body: item.body, revision: 'r1',
    frontmatter: { name: 'alpha', description: 'Fresh description', 'disable-model-invocation': true, 'user-invocable': 'off' } });
  const switches = app.all(node => node.props.role === 'switch');
  assert.equal(switches[0].props['aria-checked'], false);
  assert.equal(switches[1].props['aria-checked'], false);
  app.click(switches[0]);
  assert.equal(app.request('setInvocation').payload.modelInvocable, true);
  await app.reply('setInvocation', { revision: 'r2' });
  await app.reply('get', { ...item, revision: 'r2',
    frontmatter: { name: 'alpha', description: 'Fresh description', 'disable-model-invocation': false } });
  await app.reply('list', list([item]));
  assert.equal(app.one(node => node.props.role === 'switch').props['aria-checked'], true);
});

test('late mutation after unmount cannot issue follow-up reads or change UI state', async () => {
  const app = harness();
  await openSkill(app);
  app.click(app.one(node => node.props.role === 'switch'));
  const pending = app.request('setInvocation');
  app.unmount();
  assert.equal(pending.options.signal.aborted, true);
  await app.reply('setInvocation', { revision: 'r2' });
  assert.equal(app.requests.filter(item => item.method === 'get').length, 1);
  assert.equal(app.lateUpdates(), 0);
});

test('install keeps existing scope/project/srcDir contract and locks context while writing', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/A']]) });
  await app.reply('list', list());
  app.click(app.button('project'));
  await app.reply('list', list([], '/project/A/.dsh/skills'));
  app.click(app.button('install'));
  const source = app.one(node => node.type === 'input' && node.props.placeholder === '/path/to/skill');
  app.change(source, '/source/skill');
  const form = app.all(node => node.type === 'form').at(-1);
  form.props.onSubmit({ preventDefault() {} });
  app.render();
  assert.deepEqual(app.request('install').payload, {
    scope: 'project', projectRoot: '/project/A', srcDir: '/source/skill',
  });
  app.click(app.button('user'));
  assert.equal(app.requests.filter(item => item.method === 'list').length, 2);
  await app.reply('install', {});
  await app.reply('list', list([skill()], '/project/A/.dsh/skills'));
  assert.equal(app.button('project').props['aria-selected'], true);
});

const remoteInput = app => app.one(node => node.type === 'input' && node.props['aria-label'] === 'remoteSource');
const remoteTrust = app => app.one(node => node.type === 'input' && node.props['aria-label'] === 'remoteTrust');
const choice = (app, name) => app.one(node => node.type === 'input' && node.props['aria-label'] === name);
const preview = (overrides = {}) => ({ token: 'preview-token', source: 'https://github.com/vercel-labs/agent-skills',
  commit: 'abc123', scope: 'user', root: '/skills', expiresAt: Date.now() + 600000,
  skills: [{ name: 'alpha', description: 'First remote skill' }, { name: 'beta', description: 'Second remote skill' }], ...overrides });
function submitInstall(app) {
  app.all(node => node.type === 'form').at(-1).props.onSubmit({ preventDefault() {} });
  app.render();
}
function beginRemote(app, input = 'vercel-labs/agent-skills') {
  app.click(app.button('install'));
  app.click(app.button('remoteMode'));
  app.change(remoteInput(app), input);
  app.change(remoteTrust(app), true);
  submitInstall(app);
}
async function prepare(app, value = preview()) {
  beginRemote(app);
  await app.reply('prepareRemote', value);
  return value;
}
function textOf(node) {
  if (node == null || node === false) return '';
  if (typeof node !== 'object') return String(node);
  return (node.props?.children || []).map(textOf).join('');
}

test('remote preview requires explicit trust and sends npx syntax without executing a shell', async () => {
  const app = harness();
  await app.reply('list', list());
  app.click(app.button('install'));
  assert.equal(app.button('localFolder').props['aria-selected'], true);
  app.click(app.button('remoteMode'));
  const input = 'npx skills add vercel-labs/agent-skills --skill web-design-guidelines';
  app.change(remoteInput(app), '  ' + input + '  ');
  assert.equal(remoteTrust(app).props.required, true);
  assert.equal(app.button('fetchSkills').props.disabled, true);
  submitInstall(app); // Bypass native validation too: controller must still enforce consent.
  assert.equal(app.requests.filter(item => item.method === 'prepareRemote').length, 0);
  app.change(remoteTrust(app), true);
  submitInstall(app);
  assert.deepEqual(app.request('prepareRemote').payload, { scope: 'user', input });
  assert.equal(remoteInput(app).props.disabled, true);
  assert.equal(remoteTrust(app).props.disabled, true);
  assert.equal(app.button('localFolder').props.disabled, true);
  assert.equal(app.button('project').props.disabled, true);
  assert.equal(app.one(node => node.type === 'input' && node.props.type === 'search').props.disabled, true);
  assert.equal(card(app).props.disabled, true);
  assert.ok(app.all(node => node.props.role === 'status' && node.props.children.includes('fetching')).length);
  app.change(remoteInput(app), 'other/repo'); // Detached events must respect the synchronous busy lock.
  app.change(remoteTrust(app), false);
  app.click(app.button('cancel'));
  assert.equal(remoteInput(app).props.value, '  ' + input + '  ');
  await app.reply('prepareRemote', preview());
  assert.equal(choice(app, 'alpha').props.checked, false);
  assert.equal(choice(app, 'beta').props.checked, false);
  assert.equal(app.all(node => node.type === 'button' && node.props.type === 'submit').at(-1).props.disabled, true);
  assert.match(textOf(app.tree()), /https:\/\/github.com\/vercel-labs\/agent-skills/);
  assert.match(textOf(app.tree()), /abc123/);
  assert.match(textOf(app.tree()), /\/skills/);
  assert.match(client, /public GitHub repositories and add only/);
  assert.match(client, /No arbitrary shell execution/);
  assert.match(client, /pinned official skills 1\.7\.4 CLI/);
  assert.match(client, /No skill scripts are executed/);
});

test('editing a remote source invalidates and discards preview and requires renewed trust', async () => {
  const app = harness();
  await app.reply('list', list());
  await prepare(app);
  const oldChoice = choice(app, 'alpha');
  app.change(oldChoice, true);
  app.change(remoteInput(app), 'other/repository');
  assert.deepEqual(app.request('discardRemote').payload, { scope: 'user', token: 'preview-token' });
  assert.equal(app.all(node => node.type === 'fieldset').length, 0);
  assert.equal(remoteTrust(app).props.checked, false);
  app.change(oldChoice, true); // A detached checkbox cannot revive its previous token.
  submitInstall(app);
  assert.equal(app.requests.filter(item => item.method === 'installRemote').length, 0);
  assert.equal(app.requests.filter(item => item.method === 'prepareRemote').length, 1);
  app.change(remoteTrust(app), true);
  submitInstall(app);
  assert.deepEqual(app.request('prepareRemote').payload, { scope: 'user', input: 'other/repository' });
  await app.reply('prepareRemote', preview({ token: 'replacement' }));
  assert.equal(choice(app, 'alpha').props.checked, false);
});

test('remote install uses context-bound token and only explicitly selected skills, then consumes preview', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/A']]) });
  await app.reply('list', list());
  app.click(app.button('project'));
  await app.reply('list', list([], '/project/A/.dsh/skills'));
  await prepare(app, preview({ scope: 'project', root: '/project/A/.dsh/skills' }));
  assert.deepEqual(app.requests.find(item => item.method === 'prepareRemote').payload,
    { scope: 'project', projectRoot: '/project/A', input: 'vercel-labs/agent-skills' });
  submitInstall(app);
  assert.equal(app.requests.filter(item => item.method === 'installRemote').length, 0);
  app.change(choice(app, 'alpha'), true);
  app.change(choice(app, 'beta'), true);
  app.change(choice(app, 'alpha'), false);
  const oldChoice = choice(app, 'alpha');
  submitInstall(app);
  assert.deepEqual(app.request('installRemote').payload,
    { scope: 'project', projectRoot: '/project/A', token: 'preview-token', skillNames: ['beta'] });
  assert.equal(remoteInput(app).props.disabled, true);
  assert.equal(choice(app, 'beta').props.disabled, true);
  assert.equal(app.one(node => node.type === 'input' && node.props['aria-label'] === 'projectPath').props.disabled, true);
  app.change(oldChoice, true);
  app.click(app.button('user'));
  await app.reply('installRemote', { installed: true, results: [{ name: 'beta', installed: true, value: {} }], errors: [] });
  assert.deepEqual(app.request('discardRemote').payload,
    { scope: 'project', projectRoot: '/project/A', token: 'preview-token' });
  assert.deepEqual(app.request('list').payload, { scope: 'project', projectRoot: '/project/A' });
  await app.reply('list', list([skill('beta')], '/project/A/.dsh/skills'));
  assert.equal(app.all(node => node.type === 'fieldset').length, 0);
  assert.match(textOf(app.tree()), /beta: remoteInstalled/);
  assert.match(textOf(app.tree()), /remoteComplete/);
  assert.equal(app.button('fetchSkills').props.disabled, false);
  submitInstall(app); // The consumed token is never reused, even after successful installation.
  assert.equal(app.requests.filter(item => item.method === 'installRemote').length, 1);
  assert.equal(app.requests.filter(item => item.method === 'prepareRemote').length, 2);
});

test('remote partial failure reports each outcome, refreshes actual list, and never reports blanket success', async () => {
  const app = harness();
  await app.reply('list', list([]));
  await prepare(app);
  app.change(choice(app, 'alpha'), true);
  app.change(choice(app, 'beta'), true);
  submitInstall(app);
  assert.deepEqual(app.request('installRemote').payload.skillNames, ['alpha', 'beta']);
  await app.reply('installRemote', { installed: false, results: [
    { name: 'alpha', installed: true, value: { name: 'alpha' } },
    { name: 'beta', installed: false, error: { message: 'Already exists', status: 409 } },
  ], errors: [] });
  const summary = app.one(node => node.props.role === 'alert' && textOf(node).includes('remoteResults'));
  assert.match(textOf(summary), /alpha: remoteInstalled/);
  assert.match(textOf(summary), /beta: remoteFailed — Already exists/);
  assert.doesNotMatch(textOf(app.tree()), /remoteComplete|installedDone/);
  assert.equal(app.request('list').payload.scope, 'user');
  await app.reply('list', list([skill('alpha')]));
  assert.match(textOf(app.tree()), /beta: remoteFailed — Already exists/);
  assert.equal(app.all(node => node.props.className === 'dsm-card').length, 1);
  assert.equal(app.all(node => node.type === 'fieldset').length, 0, 'partial attempt also consumes token');
});

test('missing remote results are failures and refresh failures do not erase the actionable summary', async () => {
  const app = harness();
  await app.reply('list', list([]));
  await prepare(app);
  app.change(choice(app, 'alpha'), true);
  submitInstall(app);
  await app.reply('installRemote', { installed: true, results: [], errors: [{ message: 'Import interrupted' }] });
  await app.reply('list', null, { status: 500, error: 'List unavailable' });
  assert.match(textOf(app.tree()), /alpha: remoteFailed — remoteMissingResult/);
  assert.match(textOf(app.tree()), /Import interrupted/);
  assert.match(textOf(app.tree()), /List unavailable/);
  assert.doesNotMatch(textOf(app.tree()), /remoteComplete|installedDone/);
});

test('closing and replacing remote previews discards once and clears selection without changing local behavior', async () => {
  const app = harness();
  await app.reply('list', list());
  await prepare(app);
  app.change(choice(app, 'alpha'), true);
  app.click(app.button('fetchSkills')); // Explicit replacement, even with unchanged source.
  assert.equal(app.requests.filter(item => item.method === 'discardRemote').length, 1);
  await app.reply('prepareRemote', preview({ token: 'second-token' }));
  assert.equal(choice(app, 'alpha').props.checked, false);
  app.click(app.button('cancel'));
  const discards = app.requests.filter(item => item.method === 'discardRemote');
  assert.equal(discards.length, 2);
  assert.equal(discards[1].payload.token, 'second-token');
  discards[1].reject(new Error('Cleanup unavailable')); // Best effort cleanup must never leak UI errors.
  await app.flush();
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
  app.click(app.button('install'));
  assert.equal(app.button('localFolder').props['aria-selected'], true);
  app.click(app.button('remoteMode'));
  assert.equal(remoteTrust(app).props.checked, false);
  assert.equal(app.all(node => node.type === 'fieldset').length, 0);
  app.click(app.button('localFolder'));
  assert.ok(app.one(node => node.type === 'input' && node.props.placeholder === '/path/to/skill'));
  assert.equal(app.requests.filter(item => item.method === 'discardRemote').length, 2);
});

test('native modal close and mode replacement clear remote previews', async () => {
  const app = harness();
  await app.reply('list', list());
  await prepare(app);
  app.click(app.button('localFolder'));
  assert.equal(app.request('discardRemote').payload.token, 'preview-token');
  app.click(app.button('remoteMode'));
  app.change(remoteTrust(app), true);
  submitInstall(app);
  await app.reply('prepareRemote', preview({ token: 'native-close-token' }));
  const modal = app.one(node => node.type?.name === 'Modal');
  modal.props.close();
  app.render();
  assert.equal(app.requests.filter(item => item.method === 'discardRemote').at(-1).payload.token, 'native-close-token');
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
});

test('context changes discard the old remote token and detached submit cannot retarget it', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/B']]) });
  await app.reply('list', list());
  await prepare(app);
  app.change(choice(app, 'alpha'), true);
  const oldForm = app.all(node => node.type === 'form').at(-1);
  app.click(app.button('project'));
  assert.deepEqual(app.request('discardRemote').payload, { scope: 'user', token: 'preview-token' });
  await app.reply('list', list([], '/project/B/.dsh/skills'));
  oldForm.props.onSubmit({ preventDefault() {} });
  app.render();
  assert.equal(app.requests.filter(item => item.method === 'installRemote').length, 0);
  assert.equal(app.requests.filter(item => item.method === 'prepareRemote').length, 1);
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
});

test('project/global conflict is surfaced as server error instead of silently retargeting', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/A']]) });
  await app.reply('list', list());
  app.click(app.button('project'));
  await app.reply('list', list([], '/project/A/.dsh/skills'));
  beginRemote(app, 'npx skills add owner/repo -g');
  assert.deepEqual(app.request('prepareRemote').payload,
    { scope: 'project', projectRoot: '/project/A', input: 'npx skills add owner/repo -g' });
  await app.reply('prepareRemote', null, { status: 400, error: '-g conflicts with project destination' });
  assert.match(textOf(app.tree()), /-g conflicts with project destination/);
  assert.equal(app.button('project').props['aria-selected'], true);
  assert.equal(app.requests.filter(item => item.method === 'list').length, 2);
});

test('expired remote previews cannot be submitted and are discarded', async () => {
  const app = harness();
  await app.reply('list', list());
  await prepare(app, preview({ expiresAt: Date.now() - 1 }));
  app.change(choice(app, 'alpha'), true);
  submitInstall(app);
  assert.equal(app.requests.filter(item => item.method === 'installRemote').length, 0);
  assert.match(textOf(app.tree()), /remoteExpired/);
  assert.equal(app.request('discardRemote').payload.token, 'preview-token');
});

test('unmount discards a context-bound remote preview and late install cannot trigger follow-up work', async () => {
  const app = harness();
  await app.reply('list', list());
  await prepare(app);
  app.change(choice(app, 'alpha'), true);
  submitInstall(app);
  const pending = app.request('installRemote');
  app.unmount();
  assert.equal(pending.options.signal.aborted, true);
  assert.deepEqual(app.request('discardRemote').payload, { scope: 'user', token: 'preview-token' });
  const requestCount = app.requests.length;
  await app.reply('installRemote', { installed: true, results: [{ name: 'alpha', installed: true, value: {} }], errors: [] });
  await app.reply('discardRemote', { discarded: true });
  assert.equal(app.requests.length, requestCount, 'no follow-up list, install, or cleanup after late response');
  assert.equal(app.lateUpdates(), 0);
});

test('late remote prepare after unmount cannot update state or launch install or cleanup', async () => {
  const app = harness();
  await app.reply('list', list());
  beginRemote(app);
  const pending = app.request('prepareRemote');
  app.unmount();
  assert.equal(pending.options.signal.aborted, true);
  await app.reply('prepareRemote', preview());
  assert.equal(app.requests.length, 2, 'unobserved token expires server-side, no post-unmount work');
  assert.equal(app.lateUpdates(), 0);
});

test('refresh glyph has two balanced tangent arcs, monochrome 1.5 stroke, and native button size', async () => {
  const app = harness();
  await app.reply('list', list());
  const refresh = app.one(node => node.type?.name === 'Button' && node.props.icon === 'refresh');
  const button = refresh.type(refresh.props);
  const icon = button.props.children.find(node => node?.type?.name === 'Icon');
  const svg = icon.type(icon.props);
  assert.equal(svg.props.width, 16);
  assert.equal(svg.props.height, 16);
  assert.equal(svg.props.stroke, 'currentColor');
  assert.equal(svg.props.strokeWidth, 1.5);
  const d = svg.props.children[0].props.d;
  assert.equal((d.match(/a8 8/g) || []).length, 2);
  assert.match(d, /13\.657-5\.657/);
  assert.match(d, /-13\.657 5\.657/);
  const css = app.one(node => node.type === 'style').props.children[0];
  assert.match(css, /height:32px/);
  assert.match(css, /dsm-icon-button\{padding:0;width:32px/);
});

const updateOrigin = { source: 'https://github.com/owner/repo', commit: '111111111111abcdef',
  baselineHash: 'baseline', updatedAt: 100 };
const updateSkill = (overrides = {}) => ({ ...skill(),
  update: { supported: true, origin: updateOrigin, treeHash: 'tree1', originRevision: 'origin1' }, ...overrides });
const updatePreview = (overrides = {}) => ({ token: 'update-token', name: 'alpha', kind: 'dir', scope: 'user',
  root: '/skills', source: updateOrigin.source, currentCommit: updateOrigin.commit, latestCommit: '222222222222abcdef',
  localDirty: false, untracked: false, upstreamChanged: true, hasChanges: true, canApply: true,
  requiresOverwrite: false, status: 'available', expiresAt: Date.now() + 600000,
  summary: { added: 1, modified: 1, removed: 1, total: 3 },
  files: [{ path: 'new.txt', status: 'added' }, { path: 'SKILL.md', status: 'modified' }, { path: 'old.txt', status: 'removed' }],
  filesTruncated: false, diff: { text: '@@ instructions @@\n-Old\n+New', truncated: false },
  revision: 'r1', treeHash: 'tree1', ...overrides });
const updateResult = (overrides = {}) => ({ updated: true, name: 'alpha', kind: 'dir', root: '/skills',
  scope: 'user', revision: 'r2', treeHash: 'tree2', origin: { ...updateOrigin, commit: '222222222222abcdef' },
  backup: { id: 'backup1', path: '/backups/alpha/backup1' }, ...overrides });
const updateInput = app => app.one(node => node.type === 'input' && node.props['aria-label'] === 'updateSource');
const updateTrust = app => choice(app, 'updateTrust');
const updateModal = app => app.one(node => node.type?.name === 'Modal' && node.props.title === 'githubUpdate');
async function beginUpdate(app, item = updateSkill()) {
  await openSkill(app, item);
  app.click(app.button('githubUpdate'));
}
async function checkUpdate(app, value = updatePreview()) {
  app.change(updateTrust(app), true);
  app.click(app.button('updateCheck'));
  await app.reply('prepareUpdate', value);
}

test('GitHub update is explicit and supported directory-only, never available in an editor', async () => {
  for (const item of [skill(), updateSkill({ kind: 'flat' }), updateSkill({ update: { supported: false } })]) {
    const app = harness();
    await openSkill(app, item);
    assert.equal(app.all(node => node.props.children.includes('githubUpdate')).length, 0);
  }
  const app = harness();
  await openSkill(app, updateSkill());
  const detached = app.button('githubUpdate');
  assert.equal(detached.props.icon, 'download');
  app.click(app.button('edit'));
  app.change(textarea(app), skill().body + '\nDraft');
  app.click(detached);
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
  assert.match(textarea(app).props.value, /Draft/);
  assert.equal(app.all(node => node.props.children.includes('githubUpdate')).length, 0);
});

test('untracked GitHub source is never guessed, rejects commands, and requires explicit renewed trust', async () => {
  const app = harness();
  await beginUpdate(app, updateSkill({ update: { supported: true, origin: null } }));
  assert.equal(updateInput(app).props.value, '');
  assert.equal(updateInput(app).props.readOnly, false);
  assert.equal(updateTrust(app).props.checked, false);
  assert.match(textOf(updateModal(app)), /updateUntracked/);
  assert.equal(app.button('updateCheck').props.disabled, true);
  app.change(updateInput(app), 'npx skills add owner/repo');
  app.click(app.button('updateCheck'));
  assert.equal(app.requests.filter(r => r.method === 'prepareUpdate').length, 0);
  app.change(updateTrust(app), true);
  app.click(app.button('updateCheck'));
  assert.match(textOf(updateModal(app)), /updateInvalidSource/);
  assert.equal(app.requests.filter(r => r.method === 'prepareUpdate').length, 0);
  for (const invalid of ['https://evil.test/owner/repo', 'https://github.com/owner/repo/issues', 'owner/repo; rm -rf /',
    'https://github.com/owner/repo\n/tree/main', 'https://github.com/owner/repo\t/tree/main']) {
    app.change(updateInput(app), invalid);
    app.change(updateTrust(app), true);
    app.click(app.button('updateCheck'));
    assert.equal(app.requests.filter(r => r.method === 'prepareUpdate').length, 0);
  }
  app.change(updateInput(app), '  owner/repo  ');
  assert.equal(updateTrust(app).props.checked, false);
  app.change(updateTrust(app), true);
  app.click(app.button('updateCheck'));
  assert.deepEqual(app.request('prepareUpdate').payload,
    { scope: 'user', name: 'alpha', kind: 'dir', expectedRevision: 'r1', source: 'owner/repo' });
  await app.reply('prepareUpdate', updatePreview({ untracked: true, currentCommit: null }));
  assert.equal(app.all(node => node.type === 'input' && node.props.type === 'checkbox').length, 1,
    'no selection or overwrite checkbox when not required');
  app.change(updateInput(app), 'https://github.com/other/repo/tree/main/skills');
  assert.deepEqual(app.request('discardUpdate').payload, { scope: 'user', token: 'update-token' });
  assert.equal(updateTrust(app).props.checked, false);
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
  app.change(updateTrust(app), true);
  app.click(app.button('updateCheck'));
  assert.equal(app.request('prepareUpdate').payload.source, 'https://github.com/other/repo/tree/main/skills');
});

test('tracked updates bind immutable scope/root/identity and never include or edit tracked source', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/A']]) });
  await app.reply('list', list());
  const detachedScope = app.button('user');
  app.click(app.button('project'));
  await app.reply('list', list([updateSkill()], '/project/A/.dsh/skills'));
  app.click(card(app));
  await app.reply('get', updateSkill());
  const detachedEdit = app.button('edit');
  app.click(app.button('githubUpdate'));
  assert.equal(updateInput(app).props.readOnly, true);
  app.change(updateInput(app), 'evil/repo');
  assert.equal(updateInput(app).props.value, updateOrigin.source);
  assert.match(textOf(updateModal(app)), /111111111111/);
  app.change(updateTrust(app), true);
  app.click(app.button('updateCheck'));
  assert.deepEqual(app.request('prepareUpdate').payload,
    { scope: 'project', projectRoot: '/project/A', name: 'alpha', kind: 'dir', expectedRevision: 'r1' });
  assert.equal(back(app).props.disabled, true);
  assert.equal(updateInput(app).props.disabled, true);
  assert.equal(updateTrust(app).props.disabled, true);
  assert.equal(updateModal(app).props.busy, true);
  app.click(detachedScope);
  app.click(detachedEdit);
  app.click(back(app));
  updateModal(app).props.close();
  app.change(updateInput(app), 'other/repo');
  assert.equal(app.requests.filter(r => r.method === 'list').length, 2);
  assert.equal(app.all(node => node.type === 'textarea').length, 0);
  await app.reply('prepareUpdate', updatePreview({ scope: 'project', root: '/project/A/.dsh/skills' }));
  app.click(app.button('updateApply'));
  assert.deepEqual(app.request('applyUpdate').payload,
    { scope: 'project', projectRoot: '/project/A', token: 'update-token', name: 'alpha', kind: 'dir', allowLocalChanges: false });
  assert.equal(app.button('close').props.disabled, true);
  await app.reply('applyUpdate', updateResult({ scope: 'project', root: '/project/A/.dsh/skills' }));
  assert.deepEqual(app.request('get').payload, { scope: 'project', projectRoot: '/project/A', name: 'alpha', kind: 'dir' });
  await app.reply('get', updateSkill({ revision: 'r2', body: 'New instructions' }));
  assert.deepEqual(app.request('list').payload, { scope: 'project', projectRoot: '/project/A' });
  await app.reply('list', list([updateSkill({ revision: 'r2' })], '/project/A/.dsh/skills'));
  assert.match(textOf(updateModal(app)), /updateDone/);
  assert.match(textOf(updateModal(app)), /updateBackup.*\/backups\/alpha\/backup1/);
  assert.match(textOf(app.tree()), /New instructions/);
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
  assert.equal(app.requests.filter(r => r.method === 'discardUpdate').length, 0, 'apply consumes token');
  app.click(app.button('close'));
  app.click(app.one(node => node.props.role === 'switch'));
  assert.equal(app.request('setInvocation').payload.expectedRevision, 'r2');
});

test('local dirty overwrite is a second unchecked explicit consent, enforced even by detached callbacks', async () => {
  const app = harness();
  await beginUpdate(app);
  await checkUpdate(app, updatePreview({ localDirty: true, requiresOverwrite: true }));
  assert.match(textOf(updateModal(app)), /updateDirty/);
  const overwrite = choice(app, 'updateOverwrite');
  assert.equal(overwrite.props.checked, false);
  assert.equal(app.button('updateApply').props.disabled, true);
  app.click(app.button('updateApply'));
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 0);
  app.change(overwrite, true);
  assert.equal(app.button('updateApply').props.disabled, false);
  app.click(app.button('updateApply'));
  assert.equal(app.request('applyUpdate').payload.allowLocalChanges, true);
  app.change(overwrite, false);
  await app.reply('applyUpdate', null, { status: 409, error: 'Bundle changed since preview' });
  assert.match(textOf(updateModal(app)), /Bundle changed since preview/);
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
  assert.match(textOf(app.tree()), /Original instructions/);
  app.change(overwrite, true);
  app.click(app.button('updateCheck'));
  await app.reply('prepareUpdate', updatePreview({ token: 'fresh-token', localDirty: true, requiresOverwrite: true }));
  assert.equal(choice(app, 'updateOverwrite').props.checked, false);
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 1);
});

test('upToDate with local edits explains preservation and cannot apply or retain a server-cleaned token', async () => {
  const app = harness();
  await beginUpdate(app);
  await checkUpdate(app, updatePreview({ token: null, status: 'upToDate', canApply: false, expiresAt: null,
    localDirty: true, upstreamChanged: false, hasChanges: false }));
  assert.match(textOf(updateModal(app)), /updateDirty.*updateUpToDate/);
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
  assert.equal(app.all(node => node.props['aria-label'] === 'updateOverwrite').length, 0);
  app.click(app.button('close'));
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate' || r.method === 'discardUpdate').length, 0);
  assert.match(client, /Nothing will be overwritten; local edits are preserved/);
});

test('update diff and changed paths are escaped text with bounded keyboard-scroll regions and truncation notices', async () => {
  const app = harness();
  await beginUpdate(app);
  const attack = '<img src=x onerror=alert(1)><script>bad()</script>';
  await checkUpdate(app, updatePreview({ files: [{ path: attack, status: 'modified' }],
    filesTruncated: true, diff: { text: '+ ' + attack, truncated: true } }));
  const diff = app.one(node => node.type === 'pre' && node.props['aria-label'] === 'updateDiff');
  assert.deepEqual(diff.props.children, ['+ ' + attack]);
  assert.equal(diff.props.dangerouslySetInnerHTML, undefined);
  assert.equal(diff.props.tabIndex, 0);
  assert.equal(app.one(node => node.props.className === 'dsm-update-files').props.tabIndex, 0);
  assert.equal(app.all(node => node.type === 'script' || node.type === 'img').length, 0);
  assert.match(textOf(updateModal(app)), /updateAdded: 1 · updateModified: 1 · updateRemoved: 1 · updateTotal: 3/);
  assert.match(textOf(updateModal(app)), /updateFilesTruncated/);
  assert.match(textOf(updateModal(app)), /updateDiffTruncated/);
  assert.match(textOf(updateModal(app)), /111111111111/);
  assert.match(textOf(updateModal(app)), /222222222222/);
  assert.match(client, /dsm-update-diff\{max-height:280px;overflow:auto/);
  assert.match(client, /max-height:calc\(100vh - 48px\);overflow:auto/);
});

test('metadata-only link applies source tracking without claiming instructions changed or a backup', async () => {
  const app = harness();
  await beginUpdate(app, updateSkill({ update: { supported: true, origin: null } }));
  app.change(updateInput(app), 'owner/repo');
  await checkUpdate(app, updatePreview({ status: 'link', untracked: true, currentCommit: null, hasChanges: false,
    files: [], diff: { text: '', truncated: false }, summary: { added: 0, modified: 0, removed: 0, total: 0 } }));
  assert.match(textOf(updateModal(app)), /updateUntracked.*updateLink/);
  app.click(app.button('updateApply'));
  await app.reply('applyUpdate', updateResult({ backup: null })); // Preview status is authoritative even without trackingOnly.
  await app.reply('get', updateSkill({ revision: 'r2' }));
  await app.reply('list', list([updateSkill({ revision: 'r2' })]));
  assert.match(textOf(updateModal(app)), /updateTrackingDone/);
  assert.doesNotMatch(textOf(updateModal(app)), /updateDone|updateBackup/);
  assert.match(textOf(app.tree()), /Original instructions/);
});

test('verified successful update warnings are escaped and visible without obscuring status or backup', async () => {
  const app = harness();
  await beginUpdate(app);
  await checkUpdate(app);
  app.click(app.button('updateApply'));
  const warning = 'Finalization recovered and commit verified: <script>not HTML</script>';
  await app.reply('applyUpdate', updateResult({ warning }));
  await app.reply('get', updateSkill({ revision: 'r2' }));
  await app.reply('list', list([updateSkill({ revision: 'r2' })]));
  const result = app.one(node => node.props.role === 'status' && textOf(node).includes('updateDone'));
  assert.match(textOf(result), /updateDone.*updateBackup.*\/backups\/alpha\/backup1/);
  const notice = app.one(node => node.props['data-update-warning'] === 'result');
  assert.deepEqual(notice.props.children, [warning]);
  assert.equal(notice.props.dangerouslySetInnerHTML, undefined);
  assert.equal(app.all(node => node.type === 'script' || node.props.role === 'alert').length, 0);
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
});

test('an unavailable update source shows its error while preserving normal body and editor access', async () => {
  for (const error of ['Origin unavailable <script>text</script>', { message: 'Unrelated resource is invalid' }]) {
    const app = harness();
    await openSkill(app, updateSkill({ update: { supported: false, error } }));
    const notice = app.one(node => node.props.role === 'alert');
    assert.match(textOf(notice), /updateUnavailable/);
    assert.ok(textOf(notice).includes(typeof error === 'string' ? error : error.message));
    assert.match(textOf(app.tree()), /Original instructions/);
    assert.equal(app.all(node => node.props.children.includes('githubUpdate')).length, 0);
    assert.equal(app.all(node => node.type === 'script').length, 0);
    app.click(app.button('edit'));
    assert.equal(textarea(app).props.readOnly, false);
    app.change(textarea(app), skill().body + '\nStill editable');
    assert.match(textarea(app).props.value, /Still editable/);
  }
});

test('unknown apply results never report success and every attempt consumes its token', async () => {
  for (const result of [null, {}, { updated: true }, updateResult({ name: 'other' }), updateResult({ origin: { source: 'evil/repo' } })]) {
    const app = harness();
    await beginUpdate(app);
    await checkUpdate(app);
    const apply = app.button('updateApply');
    app.click(apply);
    await app.reply('applyUpdate', result);
    assert.match(textOf(updateModal(app)), /updateMissingResult/);
    assert.doesNotMatch(textOf(updateModal(app)), /updateDone|updateTrackingDone/);
    app.click(apply);
    assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 1);
    assert.equal(app.requests.filter(r => r.method === 'get').length, 1);
    assert.match(textOf(app.tree()), /Original instructions/);
  }
});

test('invalid or retargeted prepare response is not actionable and discards only in captured context', async () => {
  const app = harness();
  await beginUpdate(app);
  await checkUpdate(app, updatePreview({ source: 'https://github.com/evil/repo' }));
  assert.match(textOf(updateModal(app)), /updateMissingResult/);
  assert.deepEqual(app.request('discardUpdate').payload, { scope: 'user', token: 'update-token' });
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
  assert.match(textOf(app.tree()), /Original instructions/);
});

test('closing, rechecking, trust changes and detail navigation discard exactly once and invalidate detached actions', async () => {
  const app = harness();
  await beginUpdate(app);
  await checkUpdate(app);
  const oldApply = app.button('updateApply');
  app.click(app.button('updateCheck'));
  assert.equal(app.requests.filter(r => r.method === 'discardUpdate').length, 1);
  await app.reply('prepareUpdate', updatePreview({ token: 'second-token' }));
  app.click(oldApply);
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 0);
  app.change(updateTrust(app), false);
  assert.equal(app.requests.filter(r => r.method === 'discardUpdate').length, 2);
  app.change(updateTrust(app), true);
  app.click(app.button('updateCheck'));
  await app.reply('prepareUpdate', updatePreview({ token: 'third-token' }));
  updateModal(app).props.close();
  app.render();
  assert.equal(app.requests.filter(r => r.method === 'discardUpdate').length, 3);
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
  app.click(app.button('githubUpdate'));
  assert.equal(updateTrust(app).props.checked, false);
  await checkUpdate(app, updatePreview({ token: 'fourth-token' }));
  app.click(back(app));
  assert.equal(app.requests.filter(r => r.method === 'discardUpdate').length, 4);
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
  app.click(oldApply);
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 0);
});

test('context change discards captured preview without allowing a detached apply to retarget', async () => {
  const app = harness({ storage: new Map([['dsh-skills-manager:projectRoot', '/project/A']]) });
  await app.reply('list', list());
  const project = app.button('project');
  app.click(card(app));
  await app.reply('get', updateSkill());
  app.click(app.button('githubUpdate'));
  await checkUpdate(app);
  const apply = app.button('updateApply');
  app.click(project);
  assert.deepEqual(app.request('discardUpdate').payload, { scope: 'user', token: 'update-token' });
  await app.reply('list', list([updateSkill()], '/project/A/.dsh/skills'));
  app.click(apply);
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 0);
  assert.equal(app.all(node => node.type?.name === 'Modal').length, 0);
});

test('unmount cleanup is best effort and late update prepare/apply cannot issue any follow-up requests', async () => {
  const first = harness();
  await beginUpdate(first);
  await checkUpdate(first);
  first.unmount();
  assert.deepEqual(first.request('discardUpdate').payload, { scope: 'user', token: 'update-token' });
  first.request('discardUpdate').reject(new Error('Cleanup failed'));
  await first.flush();
  assert.equal(first.lateUpdates(), 0);
  const second = harness();
  await beginUpdate(second);
  second.change(updateTrust(second), true);
  second.click(second.button('updateCheck'));
  const prepare = second.request('prepareUpdate');
  second.unmount();
  assert.equal(prepare.options.signal.aborted, true);
  const count = second.requests.length;
  await second.reply('prepareUpdate', updatePreview());
  assert.equal(second.requests.length, count);
  assert.equal(second.lateUpdates(), 0);
  const third = harness();
  await beginUpdate(third);
  await checkUpdate(third);
  third.click(third.button('updateApply'));
  const apply = third.request('applyUpdate');
  third.unmount();
  assert.equal(apply.options.signal.aborted, true);
  assert.deepEqual(third.request('discardUpdate').payload, { scope: 'user', token: 'update-token' });
  const applyCount = third.requests.length;
  await third.reply('applyUpdate', updateResult());
  assert.equal(third.requests.length, applyCount);
  assert.equal(third.lateUpdates(), 0);
});

test('expired update preview is discarded and HTTP check errors preserve detail', async () => {
  const app = harness();
  await beginUpdate(app);
  await checkUpdate(app, updatePreview({ expiresAt: Date.now() - 1 }));
  app.click(app.button('updateApply'));
  assert.equal(app.requests.filter(r => r.method === 'applyUpdate').length, 0);
  assert.match(textOf(updateModal(app)), /updateExpired/);
  assert.equal(app.request('discardUpdate').payload.token, 'update-token');
  app.click(app.button('updateCheck'));
  await app.reply('prepareUpdate', null, { status: 503, error: 'GitHub unavailable' });
  assert.match(textOf(updateModal(app)), /GitHub unavailable/);
  assert.match(textOf(app.tree()), /Original instructions/);
  assert.equal(app.all(node => node.props.children.includes('updateApply')).length, 0);
});
