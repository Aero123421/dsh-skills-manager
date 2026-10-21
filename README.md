# dsh-skills-manager

Manage [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) from the DeepSeek Harness sidebar: list, preview, create, edit, delete, enable/disable, validate, and install — for both **project** (`.dsh/skills`) and **user** (`~/.dsh/skills`) roots.

No build step. Plain Host/Client JavaScript, with pinned `yaml` and official `skills@1.7.4` runtime dependencies. The CLI is used only for an explicitly requested staged installation, never as an arbitrary shell runner.

## Preview

Actual DSH Web screenshots with temporary test skills (not a mock):

![Skills list](docs/images/skills-list-dark.png)

<details>
<summary>Install dialog</summary>

![Install a local skill](docs/images/skills-install-dark.png)

</details>

<details>
<summary>npx skills preview and selection</summary>

![Preview public GitHub skills](docs/images/npx-skills-preview.png)

</details>

## Requirements

- DeepSeek Harness (`dsh`) with a `web`-family profile
- Node.js `^22.20.0 || >=24.0.0` (required by the pinned skills CLI)

## Install

GitHubから直接入れられます（`github:` は `dsh plugin` が受け付ける `pnpm add` 形式です）。

```sh
# 最新の main を入れる
dsh plugin --profile web add github:Aero123421/dsh-skills-manager

# バージョンを固定する（再現性が必要な場合に推奨）
dsh plugin --profile web add github:Aero123421/dsh-skills-manager#v0.4.0
```

インストール後に再起動（または HMR リロード）すると、左サイドバーに **SKILLS** が増えます。

会話中のエージェント経由で入れる場合:

> `plugin_manager` で `install_bundle` を呼び、target に
> `github:Aero123421/dsh-skills-manager`（または `#v0.4.0` 付き）を指定してください。

### Update / Uninstall

**v0.2.0以前を使用している場合は、スキルをバックアップしてから最新版へ更新してください。** v0.3.0以降には、保存の原子性、同名スキルの識別、更新競合の検出の修正が含まれます。旧版ですでに破損・上書きされた内容を自動復元するものではありません。

```sh
# 更新: いったん外して入れ直し（DSHのgit/tarball更新フロー）
dsh plugin --profile web remove dsh-skills-manager
dsh plugin --profile web add github:Aero123421/dsh-skills-manager#v0.4.0

# 削除
dsh plugin --profile web remove dsh-skills-manager
```

## Use

- 左サイドバーの **SKILLS** から管理画面を開きます。表示言語はDSHの言語設定に追従します（日本語・英語）。
- **プロジェクト** = `<projectRoot>/.dsh/skills`、**ユーザー** = `$DSH_HOME/skills`（未設定なら `~/.dsh/skills`）。
- プロジェクトのパスを入力して **開く**。参照ボタンはHostがディレクトリ選択を提供する環境で利用できます。
- 一覧は名前・説明で検索できます。クリックすると手順と保存場所、利用設定を表示します。
- **新規作成／編集**でfrontmatterと手順を編集し、形式チェック・保存できます。新規作成は既存の同名スキルを上書きせず、更新・切替・削除は読み込んだ版と一致するときだけ実行します。競合（409）の場合は内容を確認し、再読み込みしてください。
- **エージェントからの利用**は `disable-model-invocation`、**スラッシュコマンド**は `user-invocable` に対応します。未知のmetadataやコメントは保持します。
- **スキルをインストール**の **ローカルフォルダ** タブでは、DSHホスト上のフォルダ（`SKILL.md`入り）または `.md` ファイルを指定します。**npx skills** タブでは公開GitHubのスキルを取得・プレビューして選択できます。同梱リソースもコピーし、既存のインストール先は上書きしません。
- 削除は確認ダイアログを経由し、対象のスキルと同梱ファイルを削除します。
- 未保存の下書きはブラウザのローカルストレージにプロジェクト・形式別で保持します。保存・明示的な破棄で消去します。ストレージが無効または容量不足の場合は保持できません。

画面は公式Plugin Managerの余白・文字サイズ・管理リストのパターンに合わせ、`--dsw-alias-*` のテーマ色を使用しています。Harness内部のClientパッケージへのruntime importや独自の配色テーマはありません。

## `npx skills add` 形式でインストール

1. インストール先の **プロジェクト／ユーザー** を選びます。
2. **スキルをインストール → npx skills** を開き、コマンドを貼り付けます。
3. ソースを確認して信頼確認にチェックし、**スキルをプレビュー** を押します。
4. 候補は初期状態では未選択です。必要なスキルにチェックし、インストールします。

```sh
npx skills add vercel-labs/agent-skills
npx skills add vercel-labs/agent-skills --skill web-design-guidelines
npx -y skills@1.7.4 add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
# ソースのみの入力も可
vercel-labs/agent-skills
https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines
```

- **初期対応は `add` と公開GitHubソースのみ**です。`--skill` / `-s` の複数指定、`'*'`、`--copy`、`-y` / `--yes` に対応します。`#ref` でGit参照を指定できます。
- `-g` / `--global` は画面で **ユーザー** を選んだ場合だけ受け付けます。保存先をコマンドによって勝手に変更しません。
- `--agent`、`--all`、`--package`、任意のCLIバージョン、`find/update/remove`、GitLab／SSH／private repo、`.git`付きURL、`owner/repo@skill` は未対応で、明示的にエラーにします。CLI全機能の互換を提供するものではありません。
- ローカルパスはローカルフォルダタブで指定してください。入力をシェルへ渡すことはなく、`&&`、パイプ、リダイレクト等は拒否します。
- APIレート制限・巨大／不完全なGitHubツリー・非対応のDSHスキル名・リンクを含むソースは取得できません。ホストのGit／GitHub CLI認証情報を自動利用しません。
- 候補の有効期限は10分です。変更・閉じる・期限切れで破棄します。複数選択の一部が既存名と衝突した場合、成功と失敗を個別に表示します（バッチ全体のトランザクションではありません）。

公式CLIの書式は [Vercel Labs skills](https://github.com/vercel-labs/skills/blob/main/docs/commands.md#skills-add) を参照してください。本プラグインはDSHの検証・保存先に合わせ、上記のサブセットを提供します。

## Config

`cordis.patch.yml` の row で上書きできます（`dsh profile` の patch 層、または `--patch` オーバーレイで）。

```yaml
- id: dsh-skills-manager
  config:
    allowUserWrite: true   # false にすると user scope は読み取り専用
    allowRemoteInstall: true # false にすると npx skills 取得を禁止（ローカル操作は可能）
    maxBodyBytes: 262144   # 1 skill の最大バイト数
```

## API

Host は認証済み `/api` チャネルに exact route を出します（auth + Host/Origin fence は DSH 側で適用済み）。

- `POST /api/dsh-skills-manager/list | get | save | remove | validate | setInvocation | install`
- リモート追加: `prepareRemote` (`input` → `token/source/commit/skills/expiresAt`)、`installRemote` (`token/skillNames` → スキル別結果)、`discardRemote` (`token`)。各リクエストは `scope` と必要な `projectRoot` を指定します。プレビューtokenは保存先に紐付けられ、実際のインストール試行後に消費されます。
- JSON: `{ ok: true, value }` / `{ ok: false, error }`
- v0.3.0の変更系APIはv0.2.0と互換ではありません。`list` / `get` が返す `kind` (`dir` / `flat`) と `revision` で対象を識別します。
- `save`: 新規は `mode: 'create'`、更新は `mode: 'update'` + `kind` + `expectedRevision` が必須です。
- `setInvocation` / `remove`: `kind` + `expectedRevision` が必須です。古い版・存在しない更新対象・作成時の同名衝突は409で拒否します。
- `get`: 同名のフォルダ版・単体版が共存している場合は `kind` を指定してください。曖昧な対象を自動選択しません。

Agent tools（任意、同梱）: `skills_manager_list`、`skills_manager_read`、`skills_manager_validate`

## Skill format

スキャン対象は各 root の直下のみ（1 階層）です。

- ディレクトリ形式: `<root>/<name>/SKILL.md`（+ `references/` `scripts/` `assets/` 可）
- フラット形式: `<root>/<name>.md`

```markdown
---
name: my-skill
description: What this skill does and when to use it.
---

# My skill
...
```

詳細は DSH の `dsh-skill-filesystem` ドキュメントを参照してください。

## Security notes

- このプラグインは認証済みのDSH利用者がHost所有者としてローカルファイルを管理するためのものです。別ユーザー同士を隔離するsandboxではありません。プロジェクトパスは利用者が明示指定します（workspace allowlistへの囲い込みではありません）。
- skill名のパス区切り・`..`・Windows予約名を拒否し、書き込み先とインストール元のsymbolic linkを保守的に拒否します。Host所有者による同時ファイル操作に対する完全なrace-proof保証ではありません。
- frontmatterは実際のYAMLパーサで構文・重複キー・フィールド型を検証します。利用設定の切替では未知のmetadataやコメントを保持し、引用符付きのキーも扱います。
- `allowUserWrite: false` は実際の保存先にも適用します。ユーザー用保存先とプロジェクト用保存先が重なっていても書き込みを許可しません。
- 保存は一時ファイルからの原子的な置換と同名操作の直列化を使用します。`revision` による競合検出は外部エディタ等のあらゆる同時操作を完全にトランザクション化するものではありません。
- リモート取得ではGitHub API／rawの固定ホストへ匿名HTTPS通信します。リダイレクト、リンク、特殊ファイル、危険なパスを拒否し、固定コミットに紐付く通常ファイルだけを取得します。
- その後、固定版 `skills@1.7.4` を `shell:false` のNode子プロセスで**ローカルの検証済みスナップショット**に対して実行します。リモートURLをCLIへ直接渡さず、Git／gh／SSHは呼びません。CLIのtelemetryとcompile cacheは無効化し、実HOME・認証情報・NODE_OPTIONS等を引き継ぎません。
- 実行は90秒、出力256KiB、取得データ32MiB、ツリー／ファイル数にも上限を設けています。取得中の一時領域は64MiB・8192項目を定期チェックします。上限監視はOSレベルの隔離・クォータを保証するsandboxではありません。同時取得は2件、保持プレビューは3件です。
- スキルのスクリプトをインストール時に自動実行しません。ただしスキルの手順は以後のエージェントの動作に影響するため、信頼できるソースだけを追加してください。
- Linux/macOS/Windows向けのpath・改行処理を使用していますが、実機での操作検証は現時点で **Linux + DSH 0.2.1-rc.2** のみです。macOS/Windowsでの実動作確認は未実施です。

## Verification

`npm run check`: **90 tests** cover existing data-integrity/UI regressions plus restricted commands, source/links/paths, safe downloads, token lifecycle, cancellation, subprocess cleanup, partial results and the actual pinned CLI with an offline fixture. The Node tests do not use live GitHub. Real public-source and DSH browser acceptance are documented separately in [verification details](docs/verification.md).

[![Check](https://github.com/Aero123421/dsh-skills-manager/actions/workflows/check.yml/badge.svg)](https://github.com/Aero123421/dsh-skills-manager/actions/workflows/check.yml)

## Development

`npm ci --ignore-scripts` → `npm run check` でHostとClientの回帰テストを実行できます。ビルドは不要です。
`plugin_manager` の `install_bundle`（target = このディレクトリの絶対パス）で開発用 profile に入れて動作確認できます。

## License

MIT — see [LICENSE](LICENSE).
