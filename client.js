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
      updateUnavailable:'GitHub update unavailable',
      githubUpdate:'Update from GitHub',updateSource:'GitHub source',updateSourceHint:'Enter owner/repo or an https://github.com repository or /tree/ URL only. Shell commands are not accepted.',updateInvalidSource:'Enter owner/repo or an HTTPS GitHub repository/tree URL, not a command.',updateTrust:'I trust this GitHub source and allow downloads and the pinned official skills 1.7.4 CLI in the same isolated temporary process used for installation. No skill scripts are executed.',updateUntracked:'This skill has no recorded GitHub source (including older v0.4 installs). Enter and confirm its source manually; no source is guessed.',updateDirty:'Local edits were detected in this bundle. Review the preview before deciding whether to replace them.',updateOverwrite:'Replace local changes after backing up',updateCheck:'Check for updates',updateChecking:'Checking for updates…',updateApply:'Apply update',updateApplying:'Applying update…',updateUpToDate:'No upstream update is available. Nothing will be overwritten; local edits are preserved.',updateLink:'Only source tracking/metadata will be updated. Skill instructions and bundled files will not change.',updateAvailable:'Review the file changes before applying this update.',updateOldCommit:'Current commit',updateNewCommit:'Latest commit',updateUnknownCommit:'Not tracked',updateAdded:'Added',updateModified:'Modified',updateRemoved:'Removed',updateTotal:'Total',updateFiles:'Changed files',updateDiff:'Diff',updateFilesTruncated:'The changed-file list is truncated.',updateDiffTruncated:'The diff is truncated.',updateDone:'GitHub update applied.',updateTrackingDone:'GitHub source tracking updated. Skill files were not changed.',updateBackup:'Backup of the entire previous bundle',updateMissingResult:'The server returned an invalid update result. Check again before applying.',updateExpired:'This update preview has expired. Check again.',updateDestination:'Captured destination',
      localFolder:'Local folder',remoteMode:'npx skills',installMode:'Install source',remoteSource:'Command or GitHub repository',remoteHint:'Paste npx skills add owner/repo --skill name, owner/repo, or a GitHub URL. Initial support: public GitHub repositories and add only. No arbitrary shell execution. The current project/user destination stays fixed; a conflicting -g flag returns an error.',remoteTrust:'I trust this source and allow an external download and the pinned official skills 1.7.4 CLI to run in an isolated temporary directory. No skill scripts are executed.',fetching:'Fetching skills…',fetchSkills:'Preview skills',remoteResolvedSource:'Source',remoteCommit:'Commit',remoteSelect:'Select skills to install',remoteSelectHint:'Nothing is selected by default. Choose one or more skills.',remoteResults:'Installation results',remoteComplete:'All selected skills installed.',remoteIncomplete:'Some skills were not installed. Review each result below.',remoteInstalled:'Installed',remoteFailed:'Failed',remoteMissingResult:'The server did not return a result for this skill.',remoteExpired:'This preview has expired. Fetch a new preview.',
      panel:'SKILLS',title:'Skills',intro:'Reusable instructions for your agents.',project:'Project',user:'User',install:'Install skill',create:'Create skill',refresh:'Refresh',search:'Search skills…',projectPath:'Project directory',browse:'Browse',apply:'Open project',installed:'Installed skills',emptyTitle:'Your skills, in one place',empty:'Install a local skill or create reusable instructions for your agents.',noResults:'No matching skills',disabled:'Disabled',invalid:'Invalid',back:'All skills',preview:'Instructions',edit:'Edit',save:'Save changes',cancel:'Cancel',delete:'Delete skill',model:'Agent access',modelHint:'Allow agents to discover and load this skill.',human:'Slash command',humanHint:'Make this skill available through /name.',location:'Location',details:'Availability',body:'SKILL.md',newTitle:'Create skill',installTitle:'Install a local skill',source:'Source path',sourceHint:'Absolute path on the DSH host to a skill folder or Markdown file.',destination:'Install to',trust:'Only install skills you trust. Instructions and bundled scripts may influence agent actions.',installing:'Installing…',saving:'Saving…',loading:'Loading…',done:'Saved successfully.',installedDone:'Skill installed.',deleteTitle:'Delete this skill?',deleteHint:'The skill and its bundled files will be permanently removed. This cannot be undone.',draft:'Unsaved changes',discard:'Discard unsaved changes?',validation:'Check format',valid:'Skill format is valid.',pickerUnavailable:'Directory picker unavailable. Enter the host directory path.',selectProject:'Choose a project directory to manage its skills.',userHint:'Available across your projects.',renameError:'To use a different skill name, create a new skill.',close:'Close',bundle:'Bundle',markdown:'Markdown',draftRestored:'Unsaved draft restored.',draftConflict:'An older draft was restored. Saving may conflict with newer changes; cancel to use the current version.',
    };
    const ja = {
      updateUnavailable:'GitHubからの更新を利用できません',
      githubUpdate:'GitHubから更新',updateSource:'GitHubソース',updateSourceHint:'owner/repo または https://github.com のリポジトリ／tree URLのみ入力できます。シェルコマンドは使用できません。',updateInvalidSource:'コマンドではなく owner/repo または HTTPSのGitHubリポジトリ／tree URLを入力してください。',updateTrust:'このGitHubソースを信頼し、ダウンロードと、インストール時と同じ隔離された一時プロセスでの公式CLI skills 1.7.4（固定バージョン）の実行を許可します。スキルのスクリプトは実行しません。',updateUntracked:'このスキルのGitHubソースは未記録です（従来のv0.4インストールを含みます）。ソースを推測せず、手動で入力して確認してください。',updateDirty:'このバンドルにローカル変更があります。プレビューを確認してから置き換えるか判断してください。',updateOverwrite:'ローカル変更をバックアップ後に置き換える',updateCheck:'更新を確認',updateChecking:'更新を確認中…',updateApply:'更新を適用',updateApplying:'更新を適用中…',updateUpToDate:'上流の更新はありません。上書きせず、ローカル変更はそのまま保持します。',updateLink:'ソースの追跡情報／メタデータのみ更新します。スキルの手順や同梱ファイルは変更しません。',updateAvailable:'適用前にファイルの変更内容を確認してください。',updateOldCommit:'現在のコミット',updateNewCommit:'最新のコミット',updateUnknownCommit:'未記録',updateAdded:'追加',updateModified:'変更',updateRemoved:'削除',updateTotal:'合計',updateFiles:'変更ファイル',updateDiff:'差分',updateFilesTruncated:'変更ファイル一覧は一部省略されています。',updateDiffTruncated:'差分は一部省略されています。',updateDone:'GitHubからの更新を適用しました。',updateTrackingDone:'GitHubソースの追跡情報を更新しました。スキルのファイルは変更していません。',updateBackup:'変更前のバンドル全体のバックアップ',updateMissingResult:'更新結果が不正です。再確認してから適用してください。',updateExpired:'更新プレビューの有効期限が切れました。再確認してください。',updateDestination:'確認時の保存先',
      localFolder:'ローカルフォルダ',remoteMode:'npx skills',installMode:'インストール元',remoteSource:'コマンドまたはGitHubリポジトリ',remoteHint:'npx skills add owner/repo --skill name、owner/repo、またはGitHub URLを貼り付けてください。初期対応は公開GitHubリポジトリのaddのみです。任意のシェルコマンドは実行しません。現在のプロジェクト／ユーザーの保存先は固定され、競合する-g指定はエラーになります。',remoteTrust:'このソースを信頼し、外部ダウンロードと、隔離された一時ディレクトリでの公式CLI skills 1.7.4（固定バージョン）の実行を許可します。スキルのスクリプトは実行しません。',fetching:'スキルを取得中…',fetchSkills:'スキルをプレビュー',remoteResolvedSource:'ソース',remoteCommit:'コミット',remoteSelect:'インストールするスキルを選択',remoteSelectHint:'初期状態では未選択です。1つ以上のスキルを選んでください。',remoteResults:'インストール結果',remoteComplete:'選択したすべてのスキルをインストールしました。',remoteIncomplete:'インストールできなかったスキルがあります。各結果を確認してください。',remoteInstalled:'インストール済み',remoteFailed:'失敗',remoteMissingResult:'このスキルの結果がサーバーから返されませんでした。',remoteExpired:'プレビューの有効期限が切れました。再取得してください。',
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
.dsm-dialog .dsm-tabs{margin-bottom:16px}.dsm-choices{border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:12px;margin:20px 0 0;min-width:0}.dsm-choices legend{padding:0 4px}.dsm-choice{display:flex;align-items:flex-start;gap:8px;margin:12px 0;overflow-wrap:anywhere}.dsm-choice input{flex:none;margin-top:3px;accent-color:var(--dsw-alias-state-business-primary)}.dsm-choice .dsm-help{display:block;margin-top:2px}.dsm-remote-results{padding-left:20px;overflow-wrap:anywhere}.dsm-remote-results li{margin:8px 0}
.dsm-update-files{max-height:180px;overflow:auto;padding:8px 8px 8px 28px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;overflow-wrap:anywhere}.dsm-update-diff{max-height:280px;overflow:auto;white-space:pre;overflow-wrap:normal;tab-size:4}.dsm-update-meta{overflow-wrap:anywhere}.dsm-update-meta code{white-space:pre-wrap}
[data-platform=darwin] .dsm:not(.dsm-dialog){padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}@media(max-width:600px){.dsm{padding:24px 20px}.dsm-search{width:100%;order:2}.dsm-detail-head,.dsm-context{flex-wrap:wrap}.dsm-detail-head .dsm-actions{margin-left:0}.dsm-editor{height:340px}}
`;
    function Button({ children, icon, primary, ...props }) {
      return h('button', {
        type: 'button', ...props,
        className: `dsm-button${primary ? ' dsm-primary' : ''}${props.className ? ' ' + props.className : ''}`,
      }, icon && h(Icon, { name: icon, size: 16 }), children);
    }
    function Modal({ title, close, children, t, busy = false }) {
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
        h(Button, { icon: 'close', className: 'dsm-icon-button', onClick: close, disabled: busy, 'aria-label': t('close') })), children);
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
      const [remote, setRemote] = useState({ mode: 'local', open: false, input: '', trusted: false,
        preview: null, selection: [], result: null, fetching: false });
      const [github, setGithub] = useState({ session: null, input: '', trusted: false,
        preview: null, metadata: null, overwrite: false, result: null, phase: null });
      const githubView = useRef(github);
      githubView.current = github;
      const remoteView = useRef(remote);
      remoteView.current = remote;
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
      function updateRemote(patch) {
        remoteView.current = { ...remoteView.current, ...patch };
        setRemote(remoteView.current);
      }
      function clearRemote(patch = {}, render = true) {
        const preview = remoteView.current.preview;
        const next = { ...remoteView.current, preview: null, selection: [], result: null, ...patch };
        remoteView.current = next;
        if (render) setRemote(next);
        if (preview) {
          // Cleanup owns its original context and is deliberately independent of aborted UI tickets.
          // No state updates or follow-up work: the server TTL is the fallback if cleanup fails.
          api('discardRemote', preview.origin, { token: preview.token },
            { controller: new AbortController() }).catch(() => {});
        }
      }
      function updateGithub(patch) {
        githubView.current = { ...githubView.current, ...patch };
        setGithub(githubView.current);
      }
      function clearGithub(patch = {}, render = true) {
        const current = githubView.current;
        const next = { ...current, preview: null, metadata: null, overwrite: false, result: null, cleanupToken: null, ...patch };
        githubView.current = next;
        if (render) setGithub(next);
        const token = current.preview?.token || current.cleanupToken;
        if (token) {
          api('discardUpdate', current.session.context, { token },
            { controller: new AbortController() }).catch(() => {});
        }
      }
      function githubCurrent(session) {
        const item = view.current.detail;
        return runtime.current.mounted && session && githubView.current.session === session &&
          JSON.stringify(session.context) === view.current.contextKey && item && !view.current.editor &&
          item.kind === 'dir' && (item.storageName || item.name) === session.name &&
          item.revision === session.revision;
      }
      function openGithub(item) {
        if (runtime.current.busy || !view.current.ready || view.current.editor ||
            view.current.detail !== item || item.isNew || item.kind !== 'dir' || item.update?.supported !== true) return;
        const tracked = item.update.origin;
        // Never infer a source from names, paths, or prior install inputs.
        const session = Object.freeze({ context: Object.freeze({ ...item.context }), root,
          name: item.storageName || item.name, kind: 'dir', revision: item.revision,
          tracked: !!tracked, source: tracked?.source || '', commit: tracked?.commit || null });
        clearGithub({ session, input: session.source, trusted: false, phase: null });
        setModalError('');
        setModal('github');
      }
      function closeGithub(session) {
        if (runtime.current.busy || githubView.current.session !== session) return;
        clearGithub({ session: null, trusted: false });
        setModal(null);
      }
      function editGithub(session, patch) {
        if (runtime.current.busy || !githubCurrent(session)) return;
        if (Object.hasOwn(patch, 'input')) {
          if (session.tracked) return;
          clearGithub({ ...patch, trusted: false });
        } else clearGithub(patch);
        setModalError('');
      }
      function githubSourceValid(input) {
        const part = '[A-Za-z0-9_.-]+';
        if (new RegExp(`^${part}/${part}$`).test(input)) return !input.split('/').some(p => p === '.' || p === '..');
        try {
          const url = new URL(input);
          const parts = url.pathname.split('/').filter(Boolean);
          return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port &&
            !url.username && !url.password && !url.search && !url.hash && !/\\s|[\\\\]/.test(input) &&
            parts.length >= 2 && parts.slice(0, 2).every(p => new RegExp(`^${part}$`).test(p) && p !== '.' && p !== '..') &&
            (parts.length === 2 || parts.length >= 4 && parts[2] === 'tree') &&
            parts.every(p => !['.', '..'].includes(decodeURIComponent(p)));
        } catch { return false; }
      }
      async function prepareGithub(session) {
        const snapshot = githubView.current;
        if (!githubCurrent(session) || !snapshot.trusted) return;
        const input = snapshot.input.trim();
        if (!session.tracked && !githubSourceValid(input)) {
          setModalError(t('updateInvalidSource'));
          return;
        }
        await action('github', session.context, async (request, valid) => {
          clearGithub({ phase: 'check' });
          try {
            const value = await api('prepareUpdate', session.context, { name: session.name, kind: 'dir',
              expectedRevision: session.revision, ...(!session.tracked ? { source: input } : {}) }, request);
            if (!valid() || !githubCurrent(session)) return;
            if (!value || value.name !== session.name || value.kind !== 'dir' || value.scope !== session.context.scope ||
                value.root !== session.root || !['available', 'upToDate', 'link'].includes(value.status) ||
                typeof value.source !== 'string' || !value.source || typeof value.latestCommit !== 'string' || !value.latestCommit ||
                !(value.currentCommit === null || typeof value.currentCommit === 'string') ||
                typeof value.revision !== 'string' || typeof value.treeHash !== 'string' ||
                (session.tracked && value.source !== session.source) ||
                typeof value.canApply !== 'boolean' || typeof value.requiresOverwrite !== 'boolean' ||
                typeof value.localDirty !== 'boolean' || typeof value.untracked !== 'boolean' ||
                !value.summary || !['added', 'modified', 'removed', 'total'].every(key => Number.isInteger(value.summary[key]) && value.summary[key] >= 0) ||
                !Array.isArray(value.files) || !value.files.every(file => typeof file?.path === 'string' && ['added', 'modified', 'removed'].includes(file.status)) ||
                typeof value.diff?.text !== 'string' || typeof value.diff.truncated !== 'boolean' || typeof value.filesTruncated !== 'boolean' ||
                (value.canApply && (typeof value.token !== 'string' || !value.token || value.status === 'upToDate' || !Number.isFinite(value.expiresAt))) ||
                (value.status === 'upToDate' && (value.canApply || value.token !== null))) {
              // Do not retain a token from an invalid response. Cleanup still uses the captured context.
              if (typeof value?.token === 'string' && value.token) {
                api('discardUpdate', session.context, { token: value.token }, { controller: new AbortController() }).catch(() => {});
              }
              throw new Error(t('updateMissingResult'));
            }
            updateGithub({ preview: value, metadata: value, overwrite: false });
          } finally {
            if (valid()) updateGithub({ phase: null });
          }
        }, null, true);
      }
      async function applyGithub(session, preview) {
        const snapshot = githubView.current;
        if (!githubCurrent(session) || !snapshot.trusted || !preview || snapshot.preview !== preview ||
            !preview.canApply || !preview.token || preview.status === 'upToDate' ||
            preview.requiresOverwrite && !snapshot.overwrite) return;
        if (!Number.isFinite(preview.expiresAt) || preview.expiresAt <= Date.now()) {
          clearGithub();
          setModalError(t('updateExpired'));
          return;
        }
        await action('github', session.context, async (request, valid) => {
          // An apply attempt consumes its token even on HTTP errors; never retry automatically.
          // Retain only a non-actionable cleanup handle while the request can be interrupted by unmount.
          updateGithub({ preview: null, overwrite: false, phase: 'apply', cleanupToken: preview.token });
          try {
            const value = await api('applyUpdate', session.context, { token: preview.token,
              name: session.name, kind: 'dir', allowLocalChanges: preview.requiresOverwrite && snapshot.overwrite }, request);
            if (!valid()) return;
            if (!value || value.updated !== true || value.name !== session.name || value.kind !== 'dir' ||
                value.scope !== session.context.scope || value.root !== session.root ||
                typeof value.revision !== 'string' || typeof value.treeHash !== 'string' ||
                !value.origin || value.origin.source !== preview.source ||
                !(value.backup === null || typeof value.backup?.path === 'string')) {
              throw new Error(t('updateMissingResult'));
            }
            updateGithub({ cleanupToken: null,
              result: { ...value, trackingOnly: value.trackingOnly === true || preview.status === 'link' } });
            // Keep the result dialog, but replace detail only with an authoritative read.
            try {
              const updated = await api('get', session.context, { name: session.name, kind: 'dir' }, request);
              if (!valid()) return;
              const item = { ...view.current.detail, ...loaded(updated), storageName: session.name,
                context: session.context, serverRevision: updated.revision, isNew: false };
              setDetail(item);
              setText(updated.body);
              setBaseline(updated.body);
              view.current = { ...view.current, detail: item, text: updated.body, baseline: updated.body,
                editor: false, dirty: false };
            } finally {
              if (valid()) await reload(session.context);
            }
          } finally {
            if (valid()) updateGithub({ phase: null, cleanupToken: null });
          }
        }, null, true);
      }
      function openInstall() {
        if (runtime.current.busy || !view.current.ready) return;
        clearRemote({ mode: 'local', open: true, trusted: false, fetching: false });
        setModalError('');
        setModal('install');
      }
      function closeInstall() {
        if (runtime.current.busy) return;
        clearRemote({ open: false, trusted: false });
        setModal(null);
      }
      function editRemote(patch) {
        if (runtime.current.busy || !remoteView.current.open) return;
        clearRemote(patch);
        setModalError('');
      }
      function selectRemote(name, checked, preview) {
        const current = remoteView.current;
        if (runtime.current.busy || !current.open || current.preview !== preview) return;
        if (!preview.skills.some(skill => skill.name === name)) return;
        const selection = current.selection.filter(item => item !== name);
        if (checked) selection.push(name);
        updateRemote({ selection });
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
          clearRemote({ open: false }, false);
          clearGithub({ session: null }, false);
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
        clearRemote({ open: false, trusted: false });
        clearGithub({ session: null, trusted: false });
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
        clearGithub({ session: null });
        setModal(null);
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
        clearGithub({ session: null });
        setModal(null);
        setDetail(null);
        setEditor(false);
        setNotice(null);
        view.current = { ...view.current, detail: null, editor: false, dirty: false };
      }
      function create() {
        if (!leave() || !view.current.ready) return;
        clearGithub({ session: null });
        setModal(null);
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
      async function prepareRemote() {
        const snapshot = remoteView.current;
        if (!snapshot.open || snapshot.mode !== 'remote' || !snapshot.trusted || !snapshot.input.trim()) return;
        const origin = { ...view.current.context };
        await action('remote', origin, async (request, valid) => {
          clearRemote({ fetching: true });
          try {
            const value = await api('prepareRemote', origin, { input: snapshot.input.trim() }, request);
            if (!valid()) return;
            updateRemote({ preview: { ...value, origin }, selection: [], result: null });
          } finally {
            if (valid()) updateRemote({ fetching: false });
          }
        }, null, true);
      }
      async function installRemote() {
        if (runtime.current.busy) return;
        const snapshot = remoteView.current, preview = snapshot.preview;
        if (!snapshot.open || snapshot.mode !== 'remote' || !snapshot.trusted || !preview ||
            !snapshot.selection.length || JSON.stringify(preview.origin) !== view.current.contextKey) return;
        if (preview.expiresAt <= Date.now()) {
          clearRemote();
          setModalError(t('remoteExpired'));
          return;
        }
        const origin = preview.origin, skillNames = [...snapshot.selection];
        await action('mutation', origin, async (request, valid) => {
          const value = await api('installRemote', origin, { token: preview.token, skillNames }, request);
          if (!valid()) return;
          const results = skillNames.map(name => (value.results || []).find(result => result.name === name) ||
            { name, installed: false, error: { message: t('remoteMissingResult') } });
          const result = { preview, results, errors: value.errors || [],
            installed: value.installed === true && results.every(item => item.installed === true) };
          clearRemote({ result });
          // A partial result is not success. Keep the per-skill summary visible while refreshing reality.
          await reload(origin);
        }, null, true);
      }
      async function install() {
        if (!remoteView.current.open || remoteView.current.mode !== 'local') return;
        const origin = { ...view.current.context };
        const srcDir = source.trim();
        if (!srcDir) return;
        await action('mutation', origin, async (request, valid) => {
          await api('install', origin, { srcDir }, request);
          if (!valid()) return;
          clearRemote({ open: false });
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
          onClick: openInstall }, t('install')));
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
        scope === 'project' && root && h('div', { className: 'dsm-context', 'aria-label': t('location') },
          h('span', null, t('location')), h('code', { className: 'dsm-path', title: root }, root)),
        message,
        h('div', { className: 'dsm-section-head' },
          h('h2', null, t('installed'), h('span', { className: 'dsm-count' }, skills.length)),
          h('div', { className: 'dsm-search' }, h(Icon, { name: 'search', size: 16 }),
            h('input', { type: 'search', className: 'dsm-input', value: query,
              'aria-label': t('search'), placeholder: t('search'), disabled: busy,
              onChange: event => { if (!runtime.current.busy) setQuery(event.target.value); } }))),
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
            !editor && !detail.isNew && detail.kind === 'dir' && detail.update?.supported === true &&
              h(Button, { icon: 'download', disabled: busy || !ready, onClick: () => openGithub(detail) }, t('githubUpdate')),
            !editor && h(Button, { icon: 'code', disabled: busy || !ready, onClick: () => {
              if (!runtime.current.busy && view.current.ready) {
                clearGithub({ session: null });
                setModal(null);
                setEditor(true);
                view.current = { ...view.current, editor: true };
              }
            } }, t('edit')),
            editor && h(Button, { primary: true, icon: 'check', onClick: save, disabled: busy || !ready }, t(busy ? 'saving' : 'save')))),
        message,
        detail.update?.error && h('p', { role: 'alert', className: 'dsm-notice', 'data-error': true },
          t('updateUnavailable') + ': ', typeof detail.update.error === 'string' ? detail.update.error : detail.update.error.message),
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
      const remoteMetadata = remote.preview || remote.result?.preview;
      const errorText = error => typeof error === 'string' ? error : error?.message || error?.error?.message || JSON.stringify(error);
      const installModal = modal === 'install' && h(Modal, {
        title: t('install'), close: closeInstall, t, busy,
      }, h('div', { role: 'tablist', className: 'dsm-tabs', 'aria-label': t('installMode') },
        ['local', 'remote'].map(mode => h('button', {
          type: 'button', role: 'tab', key: mode, id: 'dsm-install-tab-' + mode,
          className: 'dsm-tab', 'aria-selected': remote.mode === mode,
          'aria-controls': 'dsm-install-panel-' + mode, tabIndex: remote.mode === mode ? 0 : -1, disabled: busy,
          onClick: () => { if (remoteView.current.mode !== mode) editRemote({ mode, trusted: false }); },
          onKeyDown: event => {
            if (runtime.current.busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'local' : event.key === 'End' ? 'remote' : mode === 'local' ? 'remote' : 'local';
            if (remoteView.current.mode !== next) editRemote({ mode: next, trusted: false });
            event.currentTarget.parentElement.querySelectorAll('[role=tab]')[next === 'local' ? 0 : 1].focus();
          },
        }, t(mode === 'local' ? 'localFolder' : 'remoteMode')))),
      h('form', { onSubmit: event => {
        event.preventDefault();
        if (remoteView.current.mode === 'local') install();
        else if (remoteView.current.preview) installRemote();
        else prepareRemote();
      } },
        h('div', { role: 'tabpanel', id: 'dsm-install-panel-' + remote.mode,
          'aria-labelledby': 'dsm-install-tab-' + remote.mode },
        remote.mode === 'local' ? h('label', { className: 'dsm-field' }, h('span', null, t('source')),
          h('input', { className: 'dsm-input', value: source, disabled: busy,
            onChange: event => { if (!runtime.current.busy) setSource(event.target.value); },
            placeholder: '/path/to/skill', autoFocus: true, required: true }),
          h('p', { className: 'dsm-help' }, t('sourceHint'))) : h(R.Fragment, null,
          h('label', { className: 'dsm-field' }, h('span', null, t('remoteSource')),
            h('input', { className: 'dsm-input', value: remote.input, disabled: busy,
              'aria-label': t('remoteSource'), 'aria-describedby': 'dsm-remote-hint', required: true,
              placeholder: 'npx skills add vercel-labs/agent-skills --skill web-design-guidelines',
              onChange: event => editRemote({ input: event.target.value, trusted: false }) }),
            h('p', { id: 'dsm-remote-hint', className: 'dsm-help' }, t('remoteHint'))),
          h('label', { className: 'dsm-choice' },
            h('input', { type: 'checkbox', required: true, checked: remote.trusted, disabled: busy,
              'aria-label': t('remoteTrust'), onChange: event => editRemote({ trusted: event.target.checked }) }),
            h('span', { className: 'dsm-help' }, t('remoteTrust'))),
          remote.fetching && h('p', { role: 'status' }, t('fetching')),
          remoteMetadata && h('div', { className: 'dsm-field' }, h('span', null, t('remoteResolvedSource')),
            h('code', { className: 'dsm-help', style: { overflowWrap: 'anywhere' } }, remoteMetadata.source),
            remoteMetadata.commit && h('div', { className: 'dsm-help' }, t('remoteCommit') + ': ', h('code', null, remoteMetadata.commit))),
          remote.preview && h('fieldset', { className: 'dsm-choices', disabled: busy },
            h('legend', null, t('remoteSelect')), h('p', { className: 'dsm-help' }, t('remoteSelectHint')),
            remote.preview.skills.map(skill => h('label', { className: 'dsm-choice', key: skill.name },
              h('input', { type: 'checkbox', checked: remote.selection.includes(skill.name), disabled: busy,
                'aria-label': skill.name, onChange: event => selectRemote(skill.name, event.target.checked, remote.preview) }),
              h('span', null, skill.name, h('span', { className: 'dsm-help' }, skill.description))))),
          remote.result && h('div', { role: remote.result.installed ? 'status' : 'alert', className: 'dsm-notice',
            'data-error': !remote.result.installed }, h('h2', null, t('remoteResults')),
            h('p', null, t(remote.result.installed ? 'remoteComplete' : 'remoteIncomplete')),
            h('ul', { className: 'dsm-remote-results' }, remote.result.results.map(result => h('li', { key: result.name },
              h('strong', null, result.name), ': ', t(result.installed ? 'remoteInstalled' : 'remoteFailed'),
              !result.installed && result.error && ' — ' + errorText(result.error)))),
            remote.result.errors.length > 0 && h('ul', null, remote.result.errors.map((error, index) =>
              h('li', { key: index }, errorText(error))))))),
        h('div', { className: 'dsm-field' }, h('span', null, t('destination')),
          h('div', { className: 'dsm-destination' },
            h('div', null, t(remote.mode === 'remote' && remoteMetadata ? remoteMetadata.scope : scope)),
            h('code', { className: 'dsm-help' }, remote.mode === 'remote' && remoteMetadata ? remoteMetadata.root : root))),
        h('p', { className: 'dsm-help', style: { marginTop: 20 } }, t('trust')),
        modalError && h('p', { role: 'alert', className: 'dsm-notice', 'data-error': true }, modalError),
        h('div', { className: 'dsm-footer' },
          h(Button, { onClick: closeInstall, disabled: busy }, t('cancel')),
          remote.mode === 'remote' && remote.preview && h(Button, {
            onClick: prepareRemote, disabled: busy || !ready || !remote.trusted,
          }, t('fetchSkills')),
          h('button', { className: 'dsm-button dsm-primary', type: 'submit', disabled: busy || !ready ||
            (remote.mode === 'local' ? !source.trim() : !remote.input.trim() || !remote.trusted ||
              (!!remote.preview && !remote.selection.length)) },
          t(remote.fetching ? 'fetching' : busy ? 'installing' :
            remote.mode === 'remote' && !remote.preview ? 'fetchSkills' : 'install')))));
      const updateMetadata = github.metadata;
      const shortCommit = commit => commit ? commit.slice(0, 12) : t('updateUnknownCommit');
      const githubModal = modal === 'github' && github.session && h(Modal, {
        title: t('githubUpdate'), close: () => closeGithub(github.session), t, busy,
      }, h('p', null, github.session.name),
      !github.session.tracked && h('p', { className: 'dsm-notice' }, t('updateUntracked')),
      h('label', { className: 'dsm-field' }, h('span', null, t('updateSource')),
        h('input', { className: 'dsm-input', value: github.input, readOnly: github.session.tracked,
          disabled: busy || !!github.result, 'aria-label': t('updateSource'),
          placeholder: 'owner/repo', autoFocus: !github.session.tracked,
          onChange: event => editGithub(github.session, { input: event.target.value }) }),
        !github.session.tracked && h('p', { className: 'dsm-help' }, t('updateSourceHint'))),
      h('div', { className: 'dsm-field dsm-update-meta' }, h('span', null, t('updateDestination')),
        h('div', { className: 'dsm-destination' }, t(github.session.context.scope),
          h('div', null, h('code', null, github.session.root)))),
      !github.result && h('label', { className: 'dsm-choice' },
        h('input', { type: 'checkbox', checked: github.trusted, required: true, disabled: busy,
          'aria-label': t('updateTrust'), onChange: event => editGithub(github.session, { trusted: event.target.checked }) }),
        h('span', { className: 'dsm-help' }, t('updateTrust'))),
      github.phase && h('p', { role: 'status' }, t(github.phase === 'apply' ? 'updateApplying' : 'updateChecking')),
      h('div', { className: 'dsm-field dsm-update-meta' },
        h('div', null, t('updateOldCommit') + ': ', h('code', { title: updateMetadata?.currentCommit || github.session.commit || '' },
          shortCommit(updateMetadata ? updateMetadata.currentCommit : github.session.commit))),
        updateMetadata && h(R.Fragment, null,
          h('div', null, t('updateSource') + ': ', h('code', null, updateMetadata.source)),
          h('div', null, t('updateNewCommit') + ': ', h('code', { title: updateMetadata.latestCommit }, shortCommit(updateMetadata.latestCommit))))),
      updateMetadata && !github.result && h(R.Fragment, null,
        updateMetadata.localDirty && h('p', { className: 'dsm-notice', 'data-update-warning': 'dirty' }, t('updateDirty')),
        h('p', { role: 'status', className: 'dsm-notice' },
          t(updateMetadata.status === 'upToDate' ? 'updateUpToDate' : updateMetadata.status === 'link' ? 'updateLink' : 'updateAvailable'))),
      updateMetadata && h('div', { className: 'dsm-block' },
        h('h2', null, t('updateFiles')),
        h('p', null, ['added', 'modified', 'removed', 'total'].map(key =>
          t('update' + key[0].toUpperCase() + key.slice(1)) + ': ' + updateMetadata.summary[key]).join(' · ')),
        h('ul', { className: 'dsm-update-files', tabIndex: 0, 'aria-label': t('updateFiles') },
          updateMetadata.files.map((file, index) => h('li', { key: index },
            t('update' + file.status[0].toUpperCase() + file.status.slice(1)) + ': ', h('code', null, file.path)))),
        updateMetadata.filesTruncated && h('p', { className: 'dsm-help' }, t('updateFilesTruncated')),
        h('h2', null, t('updateDiff')),
        // React text children deliberately escape all remote diff/path content; never render HTML.
        h('pre', { className: 'dsm-pre dsm-update-diff', tabIndex: 0, 'aria-label': t('updateDiff') }, updateMetadata.diff.text),
        updateMetadata.diff.truncated && h('p', { className: 'dsm-help' }, t('updateDiffTruncated'))),
      github.preview?.canApply && github.preview.requiresOverwrite && h('label', { className: 'dsm-choice' },
        h('input', { type: 'checkbox', checked: github.overwrite, disabled: busy, 'aria-label': t('updateOverwrite'),
          onChange: event => {
            if (!runtime.current.busy && githubCurrent(github.session) && githubView.current.preview === github.preview) {
              updateGithub({ overwrite: event.target.checked });
            }
          } }), h('span', null, t('updateOverwrite'))),
      github.result && h('div', { role: 'status', className: 'dsm-notice' },
        t(github.result.trackingOnly ? 'updateTrackingDone' : 'updateDone'),
        github.result.backup && h('div', { className: 'dsm-field' }, t('updateBackup') + ': ',
          h('code', null, github.result.backup.path)),
        typeof github.result.warning === 'string' && github.result.warning &&
          h('p', { className: 'dsm-help', 'data-update-warning': 'result' }, github.result.warning)),
      modalError && h('p', { role: 'alert', className: 'dsm-notice', 'data-error': true }, modalError),
      h('div', { className: 'dsm-footer' },
        h(Button, { onClick: () => closeGithub(github.session), disabled: busy }, t('close')),
        !github.result && h(Button, { onClick: () => prepareGithub(github.session),
          disabled: busy || !ready || !github.trusted || (!github.session.tracked && !github.input.trim()) }, t('updateCheck')),
        github.preview?.canApply && github.preview.status !== 'upToDate' && !github.result && h(Button, {
          primary: true, onClick: () => applyGithub(github.session, github.preview),
          disabled: busy || !ready || !github.trusted || (github.preview.requiresOverwrite && !github.overwrite),
        }, t('updateApply'))));
      const deleteModal = modal === 'delete' && h(Modal, {
        title: t('deleteTitle'), close: () => { if (!runtime.current.busy) setModal(null); }, t,
      }, h('p', { className: 'dsm-muted' }, t('deleteHint')), h('p', null, detail?.name),
      h('div', { className: 'dsm-footer' },
        h(Button, { onClick: () => { if (!runtime.current.busy) setModal(null); }, disabled: busy }, t('cancel')),
        h(Button, { className: 'dsm-danger', icon: 'trash', onClick: remove, disabled: busy || !ready }, t('delete'))));
      return h('section', { className: 'dsm', 'aria-label': t('title') },
        h('style', null, CSS), h('div', { className: 'dsm-inner' }, detail ? detailView : listView, installModal, githubModal, deleteModal));
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
