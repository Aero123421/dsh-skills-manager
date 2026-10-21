window.__ModuleLoader__.load({
  id: 'dsh-skills-manager',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const NS = 'dsh-skills-manager';
    const PANEL_ID = 'dsh-skills-manager';

    async function call(method, payload, signal) {
      const res = await fetch(`/api/${NS}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload ?? {}),
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok !== true) {
        throw new Error(data?.error?.message || `request failed (${res.status})`);
      }
      return data.value;
    }

    function Icon() {
      return h('svg', { viewBox: '0 0 64 64', width: 20, height: 20, 'aria-hidden': true },
        h('rect', { x: 10, y: 8, width: 44, height: 48, rx: 8, fill: '#7c5cff' }),
        h('path', { d: 'M20 24h24M20 32h24M20 40h14', stroke: '#fff', strokeWidth: 4, strokeLinecap: 'round' }));
    }

    const TEMPLATE = (name) => `---\nname: ${name}\ndescription: Describe what this skill does and when to use it.\n---\n\n# ${name}\n\nWrite instructions here.\n`;

    function Panel(props) {
      const controller = props.controller;
      const [scope, setScope] = useState('project');
      const [projectRoot, setProjectRoot] = useState(() => { try { return localStorage.getItem('dsh-skills-manager:projectRoot') || ''; } catch { return ''; } });
      const [skills, setSkills] = useState([]);
      const [root, setRoot] = useState('');
      const [q, setQ] = useState('');
      const [sel, setSel] = useState(null);
      const [body, setBody] = useState('');
      const [kind, setKind] = useState('dir');
      const [status, setStatus] = useState('');
      const [busy, setBusy] = useState(false);
      const [srcDir, setSrcDir] = useState('');

      useEffect(() => { try { localStorage.setItem('dsh-skills-manager:projectRoot', projectRoot); } catch {} }, [projectRoot]);

      const refresh = useCallback(async () => {
        setBusy(true); setStatus('');
        try {
          const v = await call('list', { scope, projectRoot: scope === 'project' ? projectRoot : undefined });
          setSkills(v.skills || []); setRoot(v.root || '');
          setStatus(`${(v.skills || []).length} skills @ ${v.root || ''}`);
        } catch (e) { setStatus(`error: ${e.message}`); setSkills([]); }
        finally { setBusy(false); }
      }, [scope, projectRoot]);

      useEffect(() => { refresh(); }, [refresh]);

      const open = async (s) => {
        setBusy(true); setStatus('');
        try {
          const v = await call('get', { scope, name: s.name, projectRoot: scope === 'project' ? projectRoot : undefined });
          setSel(s.name); setBody(v.body || ''); setKind(v.kind || 'dir');
          if (v.parseError) setStatus(`parse warning: ${v.parseError}`);
          else setStatus(`opened ${s.name}`);
        } catch (e) { setStatus(`error: ${e.message}`); }
        finally { setBusy(false); }
      };

      const createNew = () => {
        const name = (q || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-skill';
        setSel(null); setBody(TEMPLATE(name)); setKind('dir'); setStatus(`editing new skill: ${name}`);
      };

      const save = async () => {
        const m = /^name:\s*(.+)$/m.exec(body);
        const frontName = (m ? m[1].trim().replace(/^["']|["']$/g, '') : '').split(/\s/)[0];
        if (!frontName) { setStatus('error: frontmatter name not found'); return; }
        setBusy(true);
        try {
          const v = await call('validate', { body });
          if (!v.valid) { setStatus(`invalid: ${v.error}`); setBusy(false); return; }
          await call('save', { scope, name: frontName, body, kind, projectRoot: scope === 'project' ? projectRoot : undefined });
          setStatus(`saved ${frontName}`); setSel(frontName); setQ('');
          await refresh();
        } catch (e) { setStatus(`error: ${e.message}`); }
        finally { setBusy(false); }
      };

      const remove = async () => {
        if (!sel || !confirm(`Delete skill "${sel}"?`)) return;
        setBusy(true);
        try {
          await call('remove', { scope, name: sel, projectRoot: scope === 'project' ? projectRoot : undefined });
          setStatus(`deleted ${sel}`); setSel(null); setBody('');
          await refresh();
        } catch (e) { setStatus(`error: ${e.message}`); }
        finally { setBusy(false); }
      };

      const toggle = async (field) => {
        if (!sel) return;
        setBusy(true);
        try {
          const cur = skills.find((s) => s.name === sel);
          const patch = field === 'model'
            ? { modelInvocable: !(cur ? cur.modelInvocable !== false : true) }
            : { userInvocable: !(cur ? cur.userInvocable !== false : true) };
          await call('setInvocation', { scope, name: sel, projectRoot: scope === 'project' ? projectRoot : undefined, ...patch });
          setStatus(`updated ${sel}`); await refresh();
          await open({ name: sel });
        } catch (e) { setStatus(`error: ${e.message}`); }
        finally { setBusy(false); }
      };

      const install = async () => {
        if (!srcDir.trim()) { setStatus('error: srcDir is empty (skill bundle dir or .md file)'); return; }
        setBusy(true);
        try {
          const v = await call('install', { scope, srcDir: srcDir.trim(), projectRoot: scope === 'project' ? projectRoot : undefined });
          setStatus(`installed ${v.name} (${v.kind})`); setSrcDir(''); await refresh();
        } catch (e) { setStatus(`error: ${e.message}`); }
        finally { setBusy(false); }
      };

      const pickDir = async () => {
        try {
          const uiWs = controller?.uiWorkspace?.();
          if (uiWs && typeof uiWs.pickDirectory === 'function') {
            const p = await uiWs.pickDirectory();
            if (p) { setProjectRoot(p); return; }
          }
          setStatus('picker unavailable: type the project path manually');
        } catch (e) { setStatus(`picker error: ${e.message}`); }
      };

      const filtered = skills.filter((s) => !q || s.name.includes(q.toLowerCase()));
      const cur = skills.find((s) => s.name === sel);

      const row = (label, content) => h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' } },
        h('span', { style: { minWidth: 110, opacity: 0.7, fontSize: 12 } }, label), content);

      return h('div', { style: { padding: 16, maxWidth: 1100, fontSize: 13 } },
        h('h2', { style: { margin: '0 0 4px' } }, 'SKILLS manager'),
        h('div', { style: { opacity: 0.7, marginBottom: 12 } }, 'Project (.dsh/skills) + user (~/.dsh/skills) roots. One level only: <name>/SKILL.md or <name>.md.'),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
          ['project', 'user'].map((s) => h('button', {
            key: s, onClick: () => setScope(s), disabled: busy,
            style: { fontWeight: scope === s ? 'bold' : 'normal', padding: '4px 12px' },
          }, s === 'project' ? 'Project' : 'User'))),
        scope === 'project' ? row('projectRoot',
          h('span', { style: { display: 'flex', gap: 6, flex: 1 } },
            h('input', { value: projectRoot, onChange: (e) => setProjectRoot(e.target.value), placeholder: '/path/to/project', style: { flex: 1, padding: 4 } }),
            h('button', { onClick: pickDir }, 'Browse'))) : null,
        row('root', h('code', null, root || '(unknown)')),
        row('actions',
          h('span', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            h('button', { onClick: refresh, disabled: busy }, 'Reload'),
            h('button', { onClick: createNew }, 'New'),
            h('input', { value: srcDir, onChange: (e) => setSrcDir(e.target.value), placeholder: 'srcDir to install', style: { width: 220, padding: 4 } }),
            h('button', { onClick: install, disabled: busy }, 'Install'))),
        row('search', h('input', { value: q, onChange: (e) => setQ(e.target.value), placeholder: 'filter / new name', style: { flex: 1, padding: 4 } })),
        h('div', { style: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { flex: '1 1 280px', minWidth: 240 } },
            h('div', { style: { fontWeight: 'bold', margin: '8px 0 4px' } }, `Skills (${filtered.length})`),
            h('ul', { style: { listStyle: 'none', padding: 0, margin: 0, border: '1px solid #4443', borderRadius: 6 } },
              filtered.map((s) => h('li', { key: s.name },
                h('button', {
                  onClick: () => open(s),
                  style: { display: 'flex', width: '100%', textAlign: 'left', gap: 8, padding: '6px 8px', background: sel === s.name ? '#7c5cff22' : 'transparent', border: 0, cursor: 'pointer' },
                },
                  h('span', { style: { flex: 1 } },
                    h('div', { style: { fontWeight: sel === s.name ? 'bold' : 'normal' } }, (s.valid === false ? '⚠ ' : '') + s.name),
                    h('div', { style: { opacity: 0.65, fontSize: 12 } }, s.valid === false ? (s.error || 'invalid') : (s.description || ''))),
                  h('span', { title: 'model invocable', style: { fontSize: 12, opacity: 0.8 } }, s.modelInvocable === false ? '🚫🤖' : '🤖'),
                  h('span', { title: 'user invocable', style: { fontSize: 12, opacity: 0.8 } }, s.userInvocable === false ? '🚫👤' : '👤')))))),
          h('div', { style: { flex: '2 1 420px', minWidth: 300 } },
            h('div', { style: { fontWeight: 'bold', margin: '8px 0 4px' } }, sel ? `Edit: ${sel}` : 'Editor'),
            cur ? h('div', { style: { display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' } },
              h('button', { onClick: () => toggle('model'), disabled: busy }, `Model: ${cur.modelInvocable === false ? 'OFF' : 'ON'}`),
              h('button', { onClick: () => toggle('user'), disabled: busy }, `User: ${cur.userInvocable === false ? 'OFF' : 'ON'}`),
              h('span', { style: { opacity: 0.6, fontSize: 12 } }, cur.kind === 'flat' ? 'flat .md' : 'bundle dir')) : null,
            h('textarea', {
              value: body, onChange: (e) => setBody(e.target.value),
              rows: 22, spellCheck: false,
              placeholder: 'SKILL.md body with frontmatter…',
              style: { width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8 },
            }),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
              h('label', null, 'kind: ',
                h('select', { value: kind, onChange: (e) => setKind(e.target.value) },
                  h('option', { value: 'dir' }, 'bundle dir'), h('option', { value: 'flat' }, 'flat .md'))),
              h('button', { onClick: save, disabled: busy || !body }, 'Save'),
              h('button', { onClick: remove, disabled: busy || !sel }, 'Delete')))),
        h('div', { style: { marginTop: 10, minHeight: 20, color: status.startsWith('error') ? '#e5484d' : '#30a46c' } }, status || (busy ? 'working…' : '')),
      );
    }

    function createController(api) {
      const listeners = new Set();
      return {
        uiWorkspace: () => { try { return api.get('uiWorkspace'); } catch { return undefined; } },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      };
    }

    return {
      inject: ['slots', 'connection'],
      apply(ctx) {
        const label = () => 'SKILLS';
        const controller = createController({ get: (n) => { try { return ctx.get(n); } catch { return undefined; } } });
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 25, label }, Icon));
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, inject: () => ({ controller }) }, Panel));
      },
    };
  },
});
