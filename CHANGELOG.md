# Changelog

## 0.1.0 — 2026-10-22

- Initial release.
- Sidebar **SKILLS** panel: list / preview / create / edit / delete for
  project (`.dsh/skills`) and user (`~/.dsh/skills`) roots.
- Enable/disable via `disable-model-invocation` / `user-invocable` toggles.
- Frontmatter validation (`name` + `description` required, kebab-case).
- Install from a skill bundle directory (`SKILL.md`) or a single `.md` file.
- Optional agent tools: `skills_manager_list`, `skills_manager_read`,
  `skills_manager_validate`.
- Multi-OS: `node:path`/`node:fs` only, CRLF-tolerant parsing,
  Windows reserved device names rejected.
