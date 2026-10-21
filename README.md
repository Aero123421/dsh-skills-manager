# dsh-skills-manager

Manage [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) from the DeepSeek Harness sidebar: list, preview, create, edit, delete, enable/disable, validate, and install — for both **project** (`.dsh/skills`) and **user** (`~/.dsh/skills`) roots.

No dependencies, no build step. Plain `index.js` (Host) + `client.js` (browser).

## Preview

Actual DSH Web screenshots with temporary test skills (not a mock):

![Skills list](docs/images/skills-list-dark.png)

<details>
<summary>Install dialog</summary>

![Install a local skill](docs/images/skills-install-dark.png)

</details>

## Requirements

- DeepSeek Harness (`dsh`) with a `web`-family profile
- Node.js `^22.19.0 || >=24.0.0`

## Install

GitHubから直接入れられます（`github:` は `dsh plugin` が受け付ける `pnpm add` 形式です）。

```sh
# 最新の main を入れる
dsh plugin --profile web add github:Aero123421/dsh-skills-manager

# バージョンを固定する（再現性が必要な場合に推奨）
dsh plugin --profile web add github:Aero123421/dsh-skills-manager#v0.2.0
```

インストール後に再起動（または HMR リロード）すると、左サイドバーに **SKILLS** が増えます。

会話中のエージェント経由で入れる場合:

> `plugin_manager` で `install_bundle` を呼び、target に
> `github:Aero123421/dsh-skills-manager`（または `#v0.2.0` 付き）を指定してください。

### Update / Uninstall

```sh
# 更新: いったん外して入れ直し（DSHのgit/tarball更新フロー）
dsh plugin --profile web remove dsh-skills-manager
dsh plugin --profile web add github:Aero123421/dsh-skills-manager#v0.2.0

# 削除
dsh plugin --profile web remove dsh-skills-manager
```

## Use

- 左サイドバーの **SKILLS** から管理画面を開きます。表示言語はDSHの言語設定に追従します（日本語・英語）。
- **プロジェクト** = `<projectRoot>/.dsh/skills`、**ユーザー** = `$DSH_HOME/skills`（未設定なら `~/.dsh/skills`）。
- プロジェクトのパスを入力して **開く**。参照ボタンはHostがディレクトリ選択を提供する環境で利用できます。
- 一覧は名前・説明で検索できます。クリックすると手順と保存場所、利用設定を表示します。
- **新規作成／編集**でfrontmatterと手順を編集し、形式チェック・保存できます。
- **エージェントからの利用**は `disable-model-invocation`、**スラッシュコマンド**は `user-invocable` に対応します。未知のmetadataやコメントは保持します。
- **スキルをインストール**でDSHホスト上のフォルダ（`SKILL.md`入り）または `.md` ファイルを指定します。同梱リソースもコピーし、既存のインストール先は上書きしません。GitHubのスキルを直接ダウンロードする機能ではありません。
- 削除は確認ダイアログを経由し、対象のスキルと同梱ファイルを削除します。

画面は公式Plugin Managerの余白・文字サイズ・管理リストのパターンに合わせ、`--dsw-alias-*` のテーマ色を使用しています。Harness内部のClientパッケージへのruntime importや独自の配色テーマはありません。

## Config

`cordis.patch.yml` の row で上書きできます（`dsh profile` の patch 層、または `--patch` オーバーレイで）。

```yaml
- id: dsh-skills-manager
  config:
    allowUserWrite: true   # false にすると user scope は読み取り専用
    maxBodyBytes: 262144   # 1 skill の最大バイト数
```

## API

Host は認証済み `/api` チャネルに exact route を出します（auth + Host/Origin fence は DSH 側で適用済み）。

- `POST /api/dsh-skills-manager/list | get | save | remove | validate | setInvocation | install`
- JSON: `{ ok: true, value }` / `{ ok: false, error }`

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
- frontmatterは `name`、`description`、invocationのフィールドを検証します。未知のYAMLは保持しますが、完全なYAML構文検証器ではありません。
- `user` scopeへの書き込みは `allowUserWrite: false` で無効化できます。
- HostはNode標準APIのみ使用し、shell-out・スキルの自動実行・外部ダウンロードを行いません。
- Linux/macOS/Windows向けのpath・改行処理を使用していますが、実機での操作検証は現時点で **Linux + DSH 0.2.1-rc.2** のみです。macOS/Windowsでの実動作確認は未実施です。

## Verification

`npm run check`: 8 host regression tests pass. Real DSH Web acceptance covered create/edit/install/toggles/delete, light/dark themes and a 390px viewport, with no browser errors. See [verification details](docs/verification.md).

## Development

依存ゼロ・ビルド不要。`index.js` / `client.js` を編集して `node --check` で構文確認し、
`plugin_manager` の `install_bundle`（target = このディレクトリの絶対パス）で開発用 profile に入れて動作確認できます。

## License

MIT — see [LICENSE](LICENSE).
