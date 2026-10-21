window.__ModuleLoader__.load({
  id: 'dsh-skills-manager',
  factory(require) {
    const R = require('react'), h = R.createElement;
    const { useState, useEffect, useRef } = R;
    const ID = 'dsh-skills-manager', NS = 'skillsManager';
    // Original artwork, inheriting the same color and size as native sidebar icons.
    const paths = {
      skill: 'M5 3.5h10l4 4V20H5z M15 3.5V8h4 M8.5 12h7 M8.5 15.5h5',
      plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
      refresh: 'M17.657 2.343v4h-4 M6.343 21.657v-4h4 M4 12a8 8 0 0 1 13.657-5.657 M20 12a8 8 0 0 1-13.657 5.657',
      back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12 M18 6 6 18',
      download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5', folder: 'M3 6h7l2 2h9v12H3z',
      check: 'M5 12l4 4L19 6', trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7',
      arrow: 'M9 5l7 7-7 7', code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
    };
    function Icon({ name = 'skill', size = 20 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, h('path', { d: paths[name] }));
    }
    const en = {
      panel:'SKILLS',title:'Skills',intro:'Reusable instructions for your agents.',project:'Project',user:'User',install:'Install skill',create:'Create skill',refresh:'Refresh',search:'Search skills…',projectPath:'Project directory',browse:'Browse',apply:'Open project',installed:'Installed skills',emptyTitle:'Your skills, in one place',empty:'Install a local skill or create reusable instructions for your agents.',noResults:'No matching skills',disabled:'Disabled',invalid:'Invalid',back:'All skills',preview:'Instructions',edit:'Edit',save:'Save changes',cancel:'Cancel',delete:'Delete skill',model:'Agent access',modelHint:'Allow agents to discover and load this skill.',human:'Slash command',humanHint:'Make this skill available through /name.',location:'Location',details:'Availability',body:'SKILL.md',newTitle:'Create skill',installTitle:'Install a local skill',source:'Source path',sourceHint:'Absolute path on the DSH host to a skill folder or Markdown file.',destination:'Install to',trust:'Only install skills you trust. Instructions and bundled scripts may influence agent actions.',installing:'Installing…',saving:'Saving…',loading:'Loading…',done:'Saved successfully.',installedDone:'Skill installed.',deleteTitle:'Delete this skill?',deleteHint:'The skill and its bundled files will be permanently removed. This cannot be undone.',draft:'Unsaved changes',discard:'Discard unsaved changes?',validation:'Check format',valid:'Skill format is valid.',pickerUnavailable:'Directory picker unavailable. Enter the host directory path.',selectProject:'Choose a project directory to manage its skills.',userHint:'Available across your projects.',renameError:'To use a different skill name, create a new skill.',close:'Close',bundle:'Bundle',markdown:'Markdown',draftRestored:'Unsaved draft restored.',draftConflict:'An older draft was restored. Saving may conflict with newer changes; cancel to use the current version.',
    };
    const ja = {
      panel:'SKILLS',title:'Skills',intro:'エージェントに、繰り返し使える手順を。',project:'プロジェクト',user:'ユーザー',install:'スキルをインストール',create:'新規作成',refresh:'更新',search:'スキルを検索…',projectPath:'プロジェクトのディレクトリ',browse:'参照',apply:'開く',installed:'インストール済み',emptyTitle:'スキルをひとつの場所で管理',empty:'ローカルのスキルをインストールするか、エージェント用の手順を作成できます。',noResults:'一致するスキルがありません',disabled:'無効',invalid:'形式エラー',back:'すべてのスキル',preview:'手順',edit:'編集',save:'変更を保存',cancel:'キャンセル',delete:'スキルを削除',model:'エージェントからの利用',modelHint:'エージェントによるスキルの検出と読み込みを許可します。',human:'スラッシュコマンド',humanHint:'/name からこのスキルを呼び出せるようにします。',location:'保存場所',details:'利用設定',body:'SKILL.md',newTitle:'スキルを作成',installTitle:'ローカルのスキルをインストール',source:'インストール元のパス',sourceHint:'DSHホスト上のスキルフォルダ、またはMarkdownファイルの絶対パス。',destination:'インストール先',trust:'信頼できるスキルだけを追加してください。手順や同梱スクリプトはエージェントの動作に影響します。',installing:'インストール中…',saving:'保存中…',loading:'読み込み中…',done:'保存しました。',installedDone:'インストールしました。',deleteTitle:'このスキルを削除しますか？',deleteHint:'スキルと同梱ファイルを完全に削除します。この操作は取り消せません。',draft:'未保存の変更',discard:'未保存の変更を破棄しますか？',validation:'形式をチェック',valid:'スキルの形式は正常です。',pickerUnavailable:'ディレクトリ選択は利用できません。ホスト上のパスを入力してください。',selectProject:'スキルを管理するプロジェクトのディレクトリを指定してください。',userHint:'すべてのプロジェクトで利用できます。',renameError:'名前を変更する場合は、新しいスキルを作成してください。',close:'閉じる',bundle:'バンドル',markdown:'Markdown',draftRestored:'未保存の下書きを復元しました。',draftConflict:'以前の下書きを復元しました。保存時に新しい変更と競合する場合があります。現在の内容を使うにはキャンセルしてください。',
    };
    const CSS = `
.dsm{box-sizing:border-box;height:100%;overflow:auto;color:var(--dsw-alias-label-primary);padding:28px clamp(24px,4vw,48px) 48px;font-size:13px;line-height:20px}.dsm *{box-sizing:border-box}.dsm button,.dsm input,.dsm textarea{font:inherit}.dsm button{cursor:pointer}.dsm button:disabled{cursor:default;opacity:.45}.dsm-inner{max-width:960px;margin:auto}
.dsm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px}.dsm h1{font-size:20px;line-height:28px;font-weight:500;margin:0}.dsm h2{font-size:14px;line-height:22px;font-weight:500;margin:0}.dsm-sub{color:var(--dsw-alias-label-secondary);margin:4px 0 0}.dsm-muted{color:var(--dsw-alias-label-tertiary)}
.dsm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dsm-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}.dsm-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsm-primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}.dsm-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.dsm-icon-button{padding:0;width:32px;border:0;color:var(--dsw-alias-label-secondary)}
.dsm button:focus-visible,.dsm input:focus-visible,.dsm textarea:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.dsm-tabs{display:flex;gap:24px;border-bottom:1px solid var(--dsw-alias-border-l3);margin-bottom:24px}.dsm-tab{background:none;border:0;border-bottom:2px solid transparent;padding:0 0 12px;color:var(--dsw-alias-label-tertiary)}.dsm-tab[aria-selected=true]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-label-primary)}
.dsm-context{display:flex;gap:10px;align-items:center;margin-bottom:24px;min-width:0}.dsm-path{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:1}.dsm-input{width:100%;height:36px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);min-width:0}.dsm-input::placeholder{color:var(--dsw-alias-label-caption)}.dsm-search{position:relative;margin-left:auto;width:260px;max-width:100%}.dsm-search svg{position:absolute;left:10px;top:10px;color:var(--dsw-alias-label-tertiary)}.dsm-search input{padding-left:34px;border-color:var(--dsw-alias-border-l3)}
.dsm-section-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}.dsm-count{color:var(--dsw-alias-label-tertiary);font-weight:400;margin-left:8px}.dsm-list{list-style:none;padding:0;margin:0 -8px;display:flex;flex-direction:column;gap:2px}.dsm-card{display:flex;width:100%;align-items:center;gap:14px;border:0;border-radius:12px;background:transparent;text-align:left;color:inherit;padding:12px 8px}.dsm-card:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsm-tile{flex:none;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;color:var(--dsw-alias-label-secondary)}.dsm-copy{flex:1;min-width:0}.dsm-name{font-size:14px;font-weight:500;line-height:20px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dsm-desc{display:block;color:var(--dsw-alias-label-tertiary);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dsm-tag{font-size:10px;font-weight:400;line-height:18px;padding:0 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:5px;color:var(--dsw-alias-label-tertiary)}
.dsm-empty{padding:64px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px}.dsm-empty p{max-width:380px;margin:0;color:var(--dsw-alias-label-tertiary)}.dsm-notice{margin:16px 0;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}.dsm-notice[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.dsm-back{display:inline-flex;gap:6px;align-items:center;border:0;background:none;color:var(--dsw-alias-label-tertiary);padding:0;margin-bottom:24px}.dsm-detail-head{display:flex;align-items:center;gap:14px;margin-bottom:28px}.dsm-detail-head .dsm-actions{margin-left:auto}.dsm-block{margin-top:28px}.dsm-block h2{margin-bottom:12px}.dsm-switch-row{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:12px 0}.dsm-switch-row+.dsm-switch-row{border-top:.5px solid var(--dsw-alias-border-l3)}.dsm-switch{border:0;padding:2px;width:32px;height:20px;flex:none;display:inline-flex;align-items:center;border-radius:20px;background:var(--dsw-alias-border-l1)}.dsm-switch[aria-checked=true]{background:var(--dsw-alias-button-primary-fill)}.dsm-switch:after{content:'';display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-1)}.dsm-switch[aria-checked=true]:after{margin-left:12px}
.dsm-pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:21px;padding:18px;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dsm-editor{height:400px;min-height:240px;resize:vertical;line-height:22px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;padding:16px}.dsm-footer{display:flex;align-items:center;gap:8px;margin-top:16px}.dsm-danger{color:var(--dsw-alias-state-error-primary)}
.dsm-dialog{padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);width:min(520px,calc(100vw - 48px));height:fit-content;max-height:calc(100vh - 48px);overflow:auto}.dsm-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 65%,transparent)}.dsm-dialog h2{font-size:18px;line-height:26px;font-weight:500;margin:0}.dsm-dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.dsm-field{display:block;margin-top:20px}.dsm-field>span{display:block;margin-bottom:8px}.dsm-help{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:8px 0 0}.dsm-destination{padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;overflow-wrap:anywhere;margin-top:8px}.dsm-dialog .dsm-footer{margin-top:24px;justify-content:flex-end}
[data-platform=darwin] .dsm:not(.dsm-dialog){padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}@media(max-width:600px){.dsm{padding:24px 20px}.dsm-search{width:100%;order:2}.dsm-detail-head,.dsm-context{flex-wrap:wrap}.dsm-detail-head .dsm-actions{margin-left:0}.dsm-editor{height:340px}}
`;
    function Button({ children, icon, primary, ...props }) {
      return h('button', {
        type: 'button', ...props,
        className: `dsm-button${primary ? ' dsm-primary' : ''}${props.className ? ' ' + props.className : ''}`,
      }, icon && h(Icon, { name: icon, size: 16 }), children);
    }
    function Modal({ title, close, children, t }) {
      const ref = useRef();
      useEffect(() => {
        const element = ref.current, previous = document.activeElement;
        element.showModal();
        return () => { element.close(); previous?.focus?.(); };
      }, []);
      return h('dialog', {
        ref, className: 'dsm dsm-dialog', 'aria-label': title,
        onCancel: event => { event.preventDefault(); close(); },
      }, h('div', { className: 'dsm-dialog-head' }, h('h2', null, title),
        h(Button, { icon: 'close', className: 'dsm-icon-button', onClick: close, 'aria-label': t('close') })), children);
    }
    // Every asynchronous operation owns an immutable context and an abortable ticket.
    // Ref locks also cover multiple events in the same render, before React commits.
    function Panel({ ctx, t }) {
      const readStored = key => {
        try { return localStorage.getItem(key); } catch { return null; }
      };
      const store = (key, value) => {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch { /* Storage may be unavailable or full; keep the editor usable. */ }
      };
      const [scope, setScope] = useState('user');
      const [project, setProjectState] = useState(() => readStored(ID + ':projectRoot') || '');
      const [projectDraft, setProjectDraft] = useState(project);
      const [skills, setSkills] = useState([]);
      const [root, setRoot] = useState('');
      const [listKey, setListKey] = useState(null);
      const [query, setQuery] = useState('');
      const [loading, setLoading] = useState(false);
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(null);
      const [detail, setDetail] = useState(null);
      const [editor, setEditor] = useState(false);
      const [text, setText] = useState('');
      const [baseline, setBaseline] = useState('');
      const [modal, setModal] = useState(null);
      const [source, setSource] = useState('');
      const [modalError, setModalError] = useState('');
      const runtime = useRef({ mounted: true, epoch: 0, sequence: 0, requests: new Map(), busy: false });
      const view = useRef(null);
      const context = { scope, ...(scope === 'project' ? { projectRoot: project } : {}) };
      const contextKey = JSON.stringify(context);
      const ready = listKey === contextKey && !loading;
      const dirty = editor && text !== baseline;
      view.current = { context, contextKey, detail, editor, text, baseline, dirty, ready };

      function draftKey(item) {
        return ID + ':draft:' + JSON.stringify([item.context, item.kind, item.storageName || '__new__']);
      }
      function saveDraft(snapshot = view.current) {
        if (!snapshot?.detail || !snapshot.editor || !snapshot.dirty) return;
        store(draftKey(snapshot.detail), JSON.stringify({
          text: snapshot.text,
          baseline: snapshot.baseline,
          revision: snapshot.detail.revision ?? null,
        }));
      }
      function discardDraft(item = view.current.detail) {
        if (item) store(draftKey(item), null);
      }
      function restoreEditor(item, body, newSkill = false) {
        let draft;
        try { draft = JSON.parse(readStored(draftKey(item)) || 'null'); } catch { /* Ignore invalid storage. */ }
        const hasDraft = draft && typeof draft.text === 'string' && typeof draft.baseline === 'string';
        const restored = hasDraft ? { ...item, revision: draft.revision } : item;
        setDetail(restored);
        setText(hasDraft ? draft.text : body);
        setBaseline(hasDraft ? draft.baseline : newSkill ? '' : body);
        setEditor(!!hasDraft || newSkill);
        if (hasDraft) setNotice({ text: t(draft.revision === item.revision ? 'draftRestored' : 'draftConflict') });
        // Keep the latest snapshot available even before the next React render.
        view.current = { ...view.current, detail: restored, text: hasDraft ? draft.text : body,
          baseline: hasDraft ? draft.baseline : newSkill ? '' : body, editor: !!hasDraft || newSkill,
          dirty: !!hasDraft || newSkill };
        if (newSkill) saveDraft();
      }
      function abortRequests() {
        const state = runtime.current;
        state.epoch++;
        for (const request of state.requests.values()) request.controller.abort();
        state.requests.clear();
      }
      function ticket(channel, requestContext) {
        const state = runtime.current;
        state.requests.get(channel)?.controller.abort();
        const request = {
          id: ++state.sequence, epoch: state.epoch, contextKey: JSON.stringify(requestContext),
          controller: new AbortController(),
        };
        state.requests.set(channel, request);
        return request;
      }
      function active(request, channel) {
        const state = runtime.current;
        return state.mounted && request.epoch === state.epoch &&
          request.contextKey === view.current.contextKey && state.requests.get(channel) === request;
      }
      async function api(method, requestContext, payload, request) {
        const url = new URL(`api/${ID}/${method}`, document.baseURI);
        const response = await fetch(url.href, {
          method: 'POST', credentials: 'same-origin', signal: request.controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...requestContext, ...payload }),
        });
        const value = await response.json().catch(() => null);
        if (!response.ok || !value?.ok) throw new Error(value?.error?.message || `HTTP ${response.status}`);
        return value.value;
      }
      function isAborted(error) { return error?.name === 'AbortError'; }
      function loaded(value) {
        if (!value.frontmatter) return value;
        const flag = (input, fallback) => input === undefined ? fallback :
          input === true || input === 1 || /^(true|yes|on|1)$/i.test(String(input));
        return {
          ...value,
          description: value.frontmatter.description,
          modelInvocable: !flag(value.frontmatter['disable-model-invocation'], false),
          userInvocable: flag(value.frontmatter['user-invocable'], true),
        };
      }
      async function reload(requestContext = view.current.context) {
        const request = ticket('list', requestContext);
        if (!active(request, 'list')) return;
        // A failed refresh must never leave old cards or a previous root actionable.
        setSkills([]);
        setRoot('');
        setListKey(null);
        view.current.ready = false;
        setLoading(true);
        try {
          if (requestContext.scope === 'project' && !requestContext.projectRoot) return;
          const value = await api('list', requestContext, {}, request);
          if (!active(request, 'list')) return;
          setSkills(value.skills);
          setRoot(value.root);
          setListKey(request.contextKey);
          view.current.ready = true;
        } catch (error) {
          if (active(request, 'list') && !isAborted(error)) {
            setSkills([]);
            setRoot('');
            setListKey(null);
            setNotice({ error: true, text: error.message });
          }
        } finally {
          if (active(request, 'list')) setLoading(false);
        }
      }
      useEffect(() => {
        runtime.current.mounted = true;
        const beforeUnload = event => {
          saveDraft();
          if (view.current.dirty || runtime.current.busy) {
            event.preventDefault();
            event.returnValue = '';
          }
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
          // The surrounding main slot may unmount without going through our Back button.
          saveDraft();
          runtime.current.mounted = false;
          abortRequests();
          window.removeEventListener('beforeunload', beforeUnload);
        };
      }, []);
      useEffect(() => { reload(context); }, [contextKey]);

      function leave() {
        if (runtime.current.busy) return false;
        if (!view.current.dirty) return true;
        if (!window.confirm(t('discard'))) return false;
        discardDraft();
        return true;
      }
      function switchContext(nextScope, nextProject = project) {
        if (!leave()) return;
        const next = { scope: nextScope, ...(nextScope === 'project' ? { projectRoot: nextProject } : {}) };
        if (JSON.stringify(next) === view.current.contextKey) return;
        abortRequests();
        view.current = { ...view.current, context: next, contextKey: JSON.stringify(next),
          detail: null, editor: false, dirty: false, ready: false };
        setSkills([]);
        setRoot('');
        setListKey(null);
        setDetail(null);
        setEditor(false);
        setModal(null);
        setNotice(null);
        setScope(nextScope);
        setProjectState(nextProject);
        setProjectDraft(nextProject);
        store(ID + ':projectRoot', nextProject);
      }
      async function action(channel, requestContext, fn, success, inModal = false) {
        if (runtime.current.busy || !view.current.ready) return;
        const request = ticket(channel, requestContext);
        if (!active(request, channel)) return;
        runtime.current.busy = true;
        setBusy(true);
        setNotice(null);
        if (inModal) setModalError('');
        const valid = () => active(request, channel);
        try {
          await fn(request, valid);
          if (valid() && success) setNotice({ text: success });
        } catch (error) {
          if (valid() && !isAborted(error)) {
            if (inModal) setModalError(error.message);
            else setNotice({ error: true, text: error.message });
          }
        } finally {
          if (valid()) {
            runtime.current.busy = false;
            setBusy(false);
          }
        }
      }
      function identity(item) {
        return { name: item.storageName || item.name, kind: item.kind, expectedRevision: item.revision };
      }
      async function open(skill, origin, originListKey) {
        // A detached row's event must not reinterpret its name in a newer project.
        if (JSON.stringify(origin) !== view.current.contextKey || originListKey !== view.current.contextKey ||
            !view.current.ready || !leave()) return;
        await action('detail', origin, async (request, valid) => {
          const name = skill.storageName || skill.name;
          const value = await api('get', origin, { name, kind: skill.kind }, request);
          if (!valid()) return;
          restoreEditor({ ...skill, ...loaded(value), storageName: name, context: origin,
            serverRevision: value.revision, isNew: false }, value.body);
        });
      }
      function back() {
        if (!leave()) return;
        setDetail(null);
        setEditor(false);
        setNotice(null);
        view.current = { ...view.current, detail: null, editor: false, dirty: false };
      }
      function create() {
        if (!leave() || !view.current.ready) return;
        let name = 'my-skill', suffix = 2;
        const names = new Set(skills.map(skill => skill.storageName || skill.name));
        while (names.has(name)) name = `my-skill-${suffix++}`;
        const body = `---\nname: ${name}\ndescription: Describe what this skill does and when to use it.\n---\n\n# My skill\n\nWrite reusable instructions here.\n`;
        setNotice(null);
        restoreEditor({ name: '', kind: 'dir', context: { ...view.current.context },
          revision: null, isNew: true }, body, true);
      }
      function editText(value) {
        if (runtime.current.busy) return;
        setText(value);
        view.current = { ...view.current, text: value, dirty: value !== view.current.baseline };
        if (view.current.dirty) saveDraft();
        else discardDraft();
      }
      async function save() {
        const snapshot = view.current;
        const item = snapshot.detail;
        if (!item || !snapshot.editor) return;
        await action('mutation', item.context, async (request, valid) => {
          const checked = await api('validate', item.context, { body: snapshot.text }, request);
          if (!valid()) return;
          if (!checked.valid) throw new Error(checked.error);
          const name = checked.frontmatter.name;
          if (!item.isNew && name !== item.name) throw new Error(t('renameError'));
          await api('save', item.context, {
            ...identity(item), name: item.isNew ? name : item.storageName || item.name,
            body: snapshot.text, mode: item.isNew ? 'create' : 'update',
          }, request);
          if (!valid()) return;
          const value = await api('get', item.context, { name: item.isNew ? name : item.storageName || item.name,
            kind: item.kind }, request);
          if (!valid()) return;
          discardDraft(item);
          const updated = { ...item, ...loaded(value), storageName: item.isNew ? name : item.storageName,
            serverRevision: value.revision, isNew: false };
          setDetail(updated);
          setText(value.body);
          setBaseline(value.body);
          setEditor(false);
          view.current = { ...view.current, detail: updated, text: value.body,
            baseline: value.body, editor: false, dirty: false };
          await reload(item.context);
        }, t('done'));
      }
      async function toggle(key, value) {
        const item = view.current.detail;
        if (!item || view.current.editor || item.isNew) return;
        await action('mutation', item.context, async (request, valid) => {
          await api('setInvocation', item.context, { ...identity(item), [key]: value }, request);
          if (!valid()) return;
          const updated = await api('get', item.context, { name: item.storageName || item.name, kind: item.kind }, request);
          if (!valid()) return;
          restoreEditor({ ...item, ...loaded(updated), serverRevision: updated.revision }, updated.body);
          await reload(item.context);
        });
      }
      async function install() {
        const origin = { ...view.current.context };
        const srcDir = source.trim();
        if (!srcDir) return;
        await action('mutation', origin, async (request, valid) => {
          await api('install', origin, { srcDir }, request);
          if (!valid()) return;
          setModal(null);
          setSource('');
          await reload(origin);
        }, t('installedDone'), true);
      }
      async function remove() {
        const item = view.current.detail;
        if (!item || item.isNew) return;
        await action('mutation', item.context, async (request, valid) => {
          await api('remove', item.context, identity(item), request);
          if (!valid()) return;
          discardDraft(item);
          setModal(null);
          setDetail(null);
          setEditor(false);
          view.current = { ...view.current, detail: null, editor: false, dirty: false };
          await reload(item.context);
        });
      }
      function cancelEdit() {
        if (!leave()) return;
        setText(detail.body || baseline);
        setBaseline(detail.body || baseline);
        setEditor(false);
        const item = detail.isNew ? null : { ...detail, revision: detail.serverRevision };
        setDetail(item);
        view.current = { ...view.current, detail: item, editor: false, dirty: false };
      }
      async function browse() {
        if (runtime.current.busy) return;
        const origin = view.current.contextKey;
        const epoch = runtime.current.epoch;
        try {
          const picker = ctx.get('uiWorkspace');
          const path = await picker?.pickDirectory?.();
          if (!runtime.current.mounted || runtime.current.busy || epoch !== runtime.current.epoch ||
              origin !== view.current.contextKey) return;
          if (path) switchContext('project', path);
          else if (!picker?.pickDirectory) setNotice({ text: t('pickerUnavailable') });
        } catch (error) {
          if (runtime.current.mounted && origin === view.current.contextKey && epoch === runtime.current.epoch) {
            setNotice({ error: true, text: error.message });
          }
        }
      }
      function validate() {
        const snapshot = view.current;
        action('validate', snapshot.detail.context, async (request, valid) => {
          const checked = await api('validate', snapshot.detail.context, { body: snapshot.text }, request);
          if (valid() && !checked.valid) throw new Error(checked.error);
        }, t('valid'));
      }

      const filtered = skills.filter(skill => (skill.name + ' ' + (skill.description || '')).toLowerCase().includes(query.toLowerCase()));
      const message = notice && h('div', {
        role: notice.error ? 'alert' : 'status', className: 'dsm-notice', 'data-error': !!notice.error,
      }, notice.text);
      const switchRow = (label, hint, key, checked) => h('div', { className: 'dsm-switch-row' },
        h('div', null, h('div', null, label), h('div', { className: 'dsm-help' }, hint)),
        h('button', { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked,
          className: 'dsm-switch', disabled: busy || editor || !ready,
          onClick: () => toggle(key, !checked) }));
      const controls = h('div', { className: 'dsm-actions' },
        h(Button, { icon: 'refresh', className: 'dsm-icon-button', title: t('refresh'),
          'aria-label': t('refresh'), disabled: loading || busy, onClick: () => reload() }),
        h(Button, { icon: 'plus', onClick: create, disabled: busy || !ready }, t('create')),
        h(Button, { icon: 'download', primary: true, disabled: busy || !ready,
          onClick: () => { if (!runtime.current.busy && view.current.ready) { setModalError(''); setModal('install'); } } }, t('install')));
      const listView = h(R.Fragment, null,
        h('header', { className: 'dsm-head' },
          h('div', null, h('h1', null, t('title')), h('p', { className: 'dsm-sub' }, t('intro'))), controls),
        h('div', { role: 'tablist', className: 'dsm-tabs', 'aria-label': t('destination') },
          ['project', 'user'].map(tab => h('button', {
            key: tab, role: 'tab', 'aria-selected': scope === tab, className: 'dsm-tab',
            tabIndex: scope === tab ? 0 : -1, disabled: busy,
            onKeyDown: event => {
              if (!runtime.current.busy && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'project' : event.key === 'End' ? 'user' : tab === 'project' ? 'user' : 'project';
                switchContext(next);
                event.currentTarget.parentElement.querySelectorAll('[role=tab]')[next === 'project' ? 0 : 1].focus();
              }
            }, onClick: () => switchContext(tab),
          }, t(tab)))),
        scope === 'project' ? h('form', {
          className: 'dsm-context', onSubmit: event => {
            event.preventDefault();
            if (!runtime.current.busy) switchContext('project', projectDraft.trim());
          },
        },
        h(Icon, { name: 'folder', size: 18 }),
        h('input', { className: 'dsm-input', value: projectDraft, disabled: busy,
          onChange: event => { if (!runtime.current.busy) setProjectDraft(event.target.value); },
          'aria-label': t('projectPath'), placeholder: t('projectPath') }),
        h(Button, { onClick: browse, disabled: busy }, t('browse')),
        h('button', { className: 'dsm-button', type: 'submit', disabled: busy }, t('apply'))) :
          h('div', { className: 'dsm-context' }, h(Icon, { name: 'folder', size: 16 }),
            h('code', { className: 'dsm-path', title: root }, root || t('userHint'))),
        message,
        h('div', { className: 'dsm-section-head' },
          h('h2', null, t('installed'), h('span', { className: 'dsm-count' }, skills.length)),
          h('div', { className: 'dsm-search' }, h(Icon, { name: 'search', size: 16 }),
            h('input', { type: 'search', className: 'dsm-input', value: query,
              'aria-label': t('search'), placeholder: t('search'), onChange: event => setQuery(event.target.value) }))),
        loading ? h('p', { className: 'dsm-muted', role: 'status' }, t('loading')) :
          filtered.length ? h('ul', { className: 'dsm-list' }, filtered.map(skill => h('li', { key: skill.kind + ':' + (skill.storageName || skill.name) },
            h('button', { className: 'dsm-card', onClick: () => open(skill, context, listKey), disabled: busy || !ready,
              'data-skill-kind': skill.kind, 'data-skill-name': skill.storageName || skill.name },
              h('span', { className: 'dsm-tile' }, h(Icon, { size: 24 })),
              h('span', { className: 'dsm-copy' },
                h('span', { className: 'dsm-name' }, skill.name,
                  h('span', { className: 'dsm-tag' }, t(skill.kind === 'flat' ? 'markdown' : 'bundle')),
                  (skill.valid === false || skill.modelInvocable === false && skill.userInvocable === false) &&
                    h('span', { className: 'dsm-tag' }, t(skill.valid === false ? 'invalid' : 'disabled'))),
                h('span', { className: 'dsm-desc' }, skill.error || skill.description)),
              h(Icon, { name: 'arrow', size: 16 }))))) :
            h('div', { className: 'dsm-empty' }, h('span', { className: 'dsm-tile' }, h(Icon, { size: 28 })),
              h('h2', null, t(query ? 'noResults' : 'emptyTitle')),
              h('p', null, t(scope === 'project' && !project ? 'selectProject' : 'empty')),
              !query && h(Button, { icon: 'plus', onClick: create, disabled: busy || !ready }, t('create'))));
      const detailView = detail && h(R.Fragment, null,
        h('button', { className: 'dsm-back', onClick: back, disabled: busy }, h(Icon, { name: 'back', size: 14 }), t('back')),
        h('div', { className: 'dsm-detail-head' },
          h('span', { className: 'dsm-tile' }, h(Icon, { size: 24 })),
          h('div', null, h('h1', null, detail.name || t('newTitle')),
            h('p', { className: 'dsm-sub' }, detail.description || t(detail.context.scope))),
          h('div', { className: 'dsm-actions' },
            !editor && h(Button, { icon: 'code', disabled: busy || !ready, onClick: () => {
              if (!runtime.current.busy && view.current.ready) setEditor(true);
            } }, t('edit')),
            editor && h(Button, { primary: true, icon: 'check', onClick: save, disabled: busy || !ready }, t(busy ? 'saving' : 'save')))),
        message,
        h('div', { className: 'dsm-block' },
          h('div', { className: 'dsm-section-head' }, h('h2', null, t(editor ? 'body' : 'preview')),
            dirty && h('span', { className: 'dsm-tag' }, t('draft'))),
          editor ? h('textarea', { className: 'dsm-input dsm-editor', value: text, readOnly: busy,
            onChange: event => editText(event.target.value), spellCheck: false, 'aria-label': t('body') }) :
            h('pre', { className: 'dsm-pre' }, (detail.body || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''))),
        editor ? h('div', { className: 'dsm-footer' },
          h(Button, { onClick: validate, disabled: busy || !ready }, t('validation')),
          h(Button, { onClick: cancelEdit, disabled: busy }, t('cancel'))) : h(R.Fragment, null,
          h('div', { className: 'dsm-block' }, h('h2', null, t('details')),
            switchRow(t('model'), t('modelHint'), 'modelInvocable', detail.modelInvocable !== false),
            switchRow(t('human'), t('humanHint'), 'userInvocable', detail.userInvocable !== false)),
          h('div', { className: 'dsm-block' }, h('h2', null, t('location')),
            h('code', { className: 'dsm-muted', style: { overflowWrap: 'anywhere' } }, detail.path)),
          h('div', { className: 'dsm-footer' }, h(Button, { icon: 'trash', className: 'dsm-danger',
            disabled: busy || !ready, onClick: () => {
              if (!runtime.current.busy && view.current.ready) setModal('delete');
            } }, t('delete')))));
      const installModal = modal === 'install' && h(Modal, {
        title: t('installTitle'), close: () => { if (!runtime.current.busy) setModal(null); }, t,
      }, h('form', { onSubmit: event => { event.preventDefault(); install(); } },
        h('label', { className: 'dsm-field' }, h('span', null, t('source')),
          h('input', { className: 'dsm-input', value: source, disabled: busy,
            onChange: event => { if (!runtime.current.busy) setSource(event.target.value); },
            placeholder: '/path/to/skill', autoFocus: true, required: true }),
          h('p', { className: 'dsm-help' }, t('sourceHint'))),
        h('div', { className: 'dsm-field' }, h('span', null, t('destination')),
          h('div', { className: 'dsm-destination' }, h('div', null, t(scope)), h('code', { className: 'dsm-help' }, root))),
        h('p', { className: 'dsm-help', style: { marginTop: 20 } }, t('trust')),
        modalError && h('p', { role: 'alert', className: 'dsm-notice', 'data-error': true }, modalError),
        h('div', { className: 'dsm-footer' },
          h(Button, { onClick: () => { if (!runtime.current.busy) setModal(null); }, disabled: busy }, t('cancel')),
          h('button', { className: 'dsm-button dsm-primary', type: 'submit', disabled: busy || !ready || !source.trim() }, t(busy ? 'installing' : 'install')))));
      const deleteModal = modal === 'delete' && h(Modal, {
        title: t('deleteTitle'), close: () => { if (!runtime.current.busy) setModal(null); }, t,
      }, h('p', { className: 'dsm-muted' }, t('deleteHint')), h('p', null, detail?.name),
      h('div', { className: 'dsm-footer' },
        h(Button, { onClick: () => { if (!runtime.current.busy) setModal(null); }, disabled: busy }, t('cancel')),
        h(Button, { className: 'dsm-danger', icon: 'trash', onClick: remove, disabled: busy || !ready }, t('delete'))));
      return h('section', { className: 'dsm', 'aria-label': t('title') },
        h('style', null, CSS), h('div', { className: 'dsm-inner' }, detail ? detailView : listView, installModal, deleteModal));
    }
    return {
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh: en }), ID + ':locale');
        ctx.effect(() => ctx.locale.register(NS, 'ja', ja), ID + ':ja');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: ID, order: 5, label: () => t('panel'), locale: NS,
        }, ({ size }) => h(Icon, { size })));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: ID, locale: NS, inject: () => ({ ctx }),
        }, Panel));
      },
    };
  },
});
