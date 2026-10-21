# Changelog

## 0.3.0 — 2026-10-22

### Data integrity

- Replaced truncating in-place saves with flushed temporary-file writes and atomic publication; serialized same-name mutations and added revision preconditions to reject stale updates.
- Separated create and update semantics: creating an existing name never silently overwrites either storage format.
- Bound every read/update/toggle/delete to a specific directory or Markdown-file identity. Existing same-name formats remain separately manageable; new cross-format collisions are rejected.
- Applied the user read-only setting to canonical storage roots, including overlapping project/user roots.
- Staged bundle installation outside scanned skill roots before publication, preserving resources and empty directories.

### Client and compatibility

- Bound asynchronous work to its original project/scope and cancelled stale requests; failed list reads no longer retain actionable cards from another context.
- Locked editing and context/navigation controls during mutations, retained per-context drafts, and refreshed authoritative revisions after changes.
- Resolved API requests relative to the application base for prefix-stripping deployments.
- Replaced the malformed refresh glyph with balanced circular arrows matching the native monochrome controls.
- Replaced the ad-hoc frontmatter reader with pinned `yaml` parsing and source-preserving edits, including quoted keys, duplicate-key validation and native invocation-field semantics.

### API changes

- `save` now requires `mode: create|update`; updates, toggles and deletes require `kind` and `expectedRevision`.
- `list` and `get` return opaque `revision` values. Ambiguous legacy reads must specify `kind`.
- Added Host and Client regression coverage for the reviewed failure cases. See the verification document for the tested environment and limits.

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
