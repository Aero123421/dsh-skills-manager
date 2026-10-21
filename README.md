# dsh-skills-manager

Manage [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) from the DeepSeek Harness sidebar: list, preview, create, edit, delete, enable/disable, validate, and install — for both **project** (`.dsh/skills`) and **user** (`~/.dsh/skills`) roots.

No dependencies, no build step. Plain `index.js` (Host) + `client.js` (browser).

## Requirements

- DeepSeek Harness (`dsh`) with a `web`-family profile
- Node.js `^22.19.0 || >=24.0.0`

## Install

GitHubから直接入れられます（`github:` は `dsh plugin` が受け付ける `pnpm add` 形式です）。

```sh
# 最新の main を入れる
dsh plugin --profile web add github:Aero123421/dsh-skills-manager

# バージョンを固定する（再現性が必要な場合に推奨）
dsh plugin --profile web add github:Aero123421/dsh-skills-manager#v0.1.0
```

インストール後に再起動（または HMR リロード）すると、左サイドバーに **SKILLS** が増えます。

会話中のエージェント経由で入れる場合:

> `plugin_manager` で `install_bundle` を呼び、target に
> `github:Aero123421/dsh-skills-manager`（または `#v0.1.0` 付き）を指定してください。

### Update / Uninstall

```sh
# 更新: いったん外して入れ直し（DSHのgit/tarball更新フロー）
dsh plugin --profile web remove dsh-skills-manager
dsh plugin --profile web add github:Aero123421/dsh-skills-manager#v0.2.0

# 削除
dsh plugin --profile web remove dsh-skills-manager
```

## Use

- Scope 切替: `Project` = `<projectRoot>/.dsh/skills`、`User` = `$DSH_HOME/skills`
- Project scope では `projectRoot` を入力（Browse ボタンで選択可、localStorage に保存）
- 一覧: 🤖 = model invocable、👤 = user invocable、🚫 = off、⚠ = invalid
- Editor: frontmatter（`name` + `description` 必須）+ 本文 → `Save`
- ON/OFF: `Model: ON/OFF` = `disable-model-invocation`、`User: ON/OFF` = `user-invocable`
- Install: skill bundle ディレクトリ（`SKILL.md` 入り）か単体 `.md` ファイルのパスを指定して scope の root へコピー

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

- skill 名は `kebab-case`（64 文字以内）のみ。パストラバーサル不可。
- Windows 予約デバイス名（`CON`/`PRN`/`AUX`/`NUL`/`COM1`〜/`LPT1`〜）は拒否。
- 保存時は frontmatter（`name` + `description`）を検証してから書き込み。
- `user` scope への書き込みは `allowUserWrite: false` で無効化できます。
- Host は `node:fs`/`node:path` のみ使用（shell-out・外部通信なし）。
  マルチOS 対応: Linux / macOS / Windows。

## Development

依存ゼロ・ビルド不要。`index.js` / `client.js` を編集して `node --check` で構文確認し、
`plugin_manager` の `install_bundle`（target = このディレクトリの絶対パス）で開発用 profile に入れて動作確認できます。

## License

MIT — see [LICENSE](LICENSE).
