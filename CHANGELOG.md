# Changelog

## 0.2.0 — 2026-10-22

- Rebuilt the UI following the official plugin development skill and Plugin Manager layout: theme aliases, quiet management rows, list/detail navigation, localized controls and an original monochrome outline icon.
- Added Japanese localization, accessible switches and native focus-trapped install/delete dialogs.
- Fixed the Cordis Standard Schema config contract and real tool output contracts.
- Invocation toggles preserve unknown metadata, comments and instruction bytes.
- Local installation copies bundle resources and refuses existing targets and symbolic links.
- Added 8 host regression tests. Live CRUD/install/toggle validation performed on the existing DSH Web with screenshots; test-created skills were cleaned up.

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
