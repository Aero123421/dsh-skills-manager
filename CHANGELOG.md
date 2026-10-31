# Changelog

## 0.6.0 — 2026-11-01

- Align project skill storage and read tools with the nearest Git root used by DSH, including worktree files. The selected cwd and resolved root are shown separately.
- Warn about old skills or history in the selected nested cwd; never move or overwrite them. Back up and copy individual skills manually, and retain old history/journals. Other subdirectories are not searched.
- Bind GUI operations to the displayed root so a changed `.git` location is rejected with 409. Direct API callers should send `expectedRoot`; omitting it retains legacy behavior. Cross-process filesystem races remain possible.
- Match native strict frontmatter delimiters, fix GitHub URL whitespace validation, isolate browser drafts by storage root, and register Japanese as a selectable language. Old rootless browser drafts are not restored; save them before upgrading.
- Added root-change, migration-warning, manual-copy and native DSH service regression coverage. No new runtime dependencies.

## 0.5.0 — 2026-10-22

- Added **Update from GitHub** in bundle details: explicit trust, commit comparison, changed-file list, bounded instruction diff, confirmation, and complete original-bundle backup.
- Persist verified GitHub source/commit/full-tree baseline outside scanned skill roots. Legacy v0.4/manual bundles can explicitly register a source; identical registration leaves installed files unchanged.
- Detect local instruction/resource/empty-directory/Unix execute-bit edits. Replacement requires separate consent, and unseen edits after preview are rejected even with consent.
- Added same-filesystem staged replacement, bounded persistent backups, validated transaction journals and conservative lazy recovery shared with existing per-name locks. Ambiguous states retain data and stop instead of guessing. Backup retention refuses before mutation rather than deleting originals.
- Preserve normal body inspection/repair when unsafe resources or malformed provenance disable updates. New local installs and authored bundles clear stale associations; ordinary edits keep the recorded baseline.
- Report verified recovered commits as success with a visible warning and backup path, not a misleading failed operation.
- Fixed small compressed GitHub files being rejected by wire/decoded size confusion. Decoded byte limits remain strict; moving-reference lookups avoid reusing GitHub's 60-second CDN cache while all content remains pinned to the resolved SHA.
- Expanded offline regression coverage and real existing-DSH acceptance with a disposable public GitHub branch advancing through three commits, resource-only conflicts, explicit replacement backups, legacy linking and unchanged-source checks.

## 0.4.0 — 2026-10-22

- Added a trust-gated **npx skills** install tab: paste restricted `npx skills add` syntax, preview candidates and immutable commit, explicitly select skills, and import into the fixed project/user target.
- Supports public GitHub shorthand/repository/tree URLs, `--skill` filters and explicitly matching user/global scope. Unsupported CLI options and shell syntax fail closed; this is not a generic npx runner.
- Added a bounded unauthenticated GitHub snapshot downloader. Symlinks, submodules, unsafe paths, redirects and oversized/truncated sources are rejected before the pinned CLI sees any source.
- Runs official `skills@1.7.4` only against a validated local snapshot with a private temporary cwd/HOME and credential-stripped environment, no PATH tools, no shell, no Git/gh/SSH, telemetry off, and execution/output/resource limits.
- Added context-bound ten-minute preview tokens, selection validation, limited active/retained previews, cleanup/cancellation and explicit per-skill partial conflict results. Existing atomic no-overwrite imports are reused.
- Added `allowRemoteInstall` operator setting, default true. Existing user read-only rules still apply before network and again before import.
- Added command/downloader/process/UI regression tests and an actual pinned-CLI offline fixture. Minimum Node.js is now 22.20.0, matching the CLI.

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
