# Verification history

## 0.6.0 integration follow-up

In an isolated Linux clone on Node 22.23.4, `npm ci --ignore-scripts` and `npm run check` passed 177 tests with one optional native test skipped. With the isolated official npm DSH `0.2.1-rc.5` via `DSH_NATIVE_MODULES`, the check passed all 180 tests with zero failures or skips. The final PR head also passed the GitHub Actions Ubuntu/macOS/Windows × Node 22/24 matrix; these CI jobs do not run the opt-in native smoke. No production DSH profile or existing browser was modified for this follow-up.

The independent integration clone adds a warning when the selected nested cwd has an old `.dsh/skills` or `.dsh/skills-manager` location. The check does not scan other subdirectories, follow legacy links, move files or migrate provenance, journals or backups. Host tests cover directory and flat manual copies, resources, same-name refusal, original preservation, history-only detection and linked legacy roots; a client test covers the warning and context changes. A reproduced stale-edit case added a `.git` between loading and saving, with an identical same-name skill at both roots: the previous implementation updated the wrong root. The GUI now sends its displayed `expectedRoot` on reads and mutations, and the host rejects a changed root with 409; this is carried through GitHub and remote staging. Older direct API callers that omit this optional field do not receive that protection. Local-owner filesystem races are not eliminated. The native service smoke and offline tests are separate from browser, HTTP authentication and live-provider testing. Earlier records below describe only the versions and commits stated there.

## 2026-10-29 compatibility check

The current local changes were checked against official npm distributions `@deepseek-ai/dsh@0.2.1-rc.2` (`latest`, source `687f282e8625c6b8d11ff58211a90524be2e4317`), `@deepseek-ai/dsh@0.2.1-rc.4` (`next`, source `504a01a9578abc2c6f1fb896b1dc322c9fe24f66`) and `@deepseek-ai/dsh@0.2.2-alpha.2` (`alpha`, source `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`). `npm view @deepseek-ai/dsh dist-tags repository --json` confirmed those tags; these are prereleases, not stable versions. The full check passed 171 tests with the native smoke enabled on each distribution.

`npm run check` passes 168 offline tests; one optional native smoke is skipped without `DSH_NATIVE_MODULES`. Point that variable to an isolated official DSH installation's `node_modules` to also exercise real Cordis, Connection exact-route registration, Tools and Skill filesystem services. The smoke covers nested Git cwd and a `.git` worktree-file fixture, CRLF save and native discovery/load, invocation flags, canonical tool values and rendered content, cancellation, unload cleanup and reload of persisted bytes. It does not start an application, obtain credentials, access a provider or test browser authentication. Its Connection authentication object deliberately throws if accessed; only the real registry and owner Peer are used. The no-Git fallback is covered by an offline fixture because this managed environment supplies `.git` entries on shared temporary ancestors.

Project storage now follows the nearest accessible `.git` ancestor, matching native discovery. The input cwd remains visible alongside the resolved storage path. Existing nested skill files stay in place; they are not migrated. The delimiter, draft-root, update-URL and Japanese-language fixes in [PR #5](https://github.com/Aero123421/dsh-skills-manager/pull/5) were separate and were not included in that historical check. The earlier live acceptance records below describe their original versions and were not rerun as browser tests in this check.

## Earlier 0.5.0 verification

Verified 2026-10-22 on Linux, Node 22.23.4 and the existing installed DSH 0.2.1-rc.2. This retains the v0.3 data-integrity fixes and adds verified, backed-up GitHub skill updates. Happy-path tests alone do not establish transaction safety.

## Automated regression tests

`npm ci --ignore-scripts` then `npm run check` checks all six runtime JavaScript modules and runs **163 tests**, including nested cases. These tests do not contact live GitHub. A fixture runs the actual pinned `skills@1.7.4` CLI against a local, network-free snapshot.

Existing coverage includes atomic body publication, partial-write/rename failure preservation, one-winner concurrent CAS, cross-format create/install conflicts, exact-format legacy deletion, quoted/anchored YAML preservation, executable resources/empty directories, bounded imports, symbolic-link rejection, canonical user read-only roots, real tool contracts, asynchronous UI context/draft locks, prefix-mounted URLs and restricted command staging.

New history/update coverage includes:

- Verified source/commit recording through registered Host remote-install handlers; HTTP-supplied provenance is not trusted.
- Full-tree hashes including file bytes, paths, empty directories and exact Unix execute bits, plus a separate origin revision.
- Resource-only/provenance changes after preview rejected even with overwrite consent; dirty and untracked replacement requires explicit consent.
- Source-identical legacy registration and metadata-only updates leave installed file inode/timestamp unchanged.
- Same-name local creation/install clears stale associations; updates/availability edits retain the original baseline; flat skills stay separate.
- Durable journal/stage/backup boundaries, injected publication/metadata/rollback errors, conservative crash recovery and read-only recovery refusal.
- Real post-rename directory-sync and before/after journal-unlink faults: only verified completed recovery returns success with a warning and backup. Unconfirmed/ambiguous recovery remains an error and retains originals.
- Repeated failed transactions do not consume backup slots with metadata-only empty containers; useful backup trees are never automatically deleted.
- Malformed sidecars/unsafe resources disable updates explicitly without blocking ordinary instruction inspection/repair/removal.
- Context-bound leased preview tokens, expiry/cleanup/disposal, bounded diffs/file lists, initially unchecked trust/replacement consent, accurate no-update/link/success warnings, escaped remote text and no late post-unmount actions.
- Compressed HTTP wire lengths versus decoded Git blob sizes, strict decoded byte caps, fixed-origin requests and fresh moving-reference resolution while raw content stays SHA-pinned.

An independent read-only review reproduced stale-source inheritance and committed-but-reported-failed outcomes. Both, including metadata-only publication, were corrected and rechecked with targeted regression tests. No concrete P1/P2 remained in the reviewed storage/update scope.

CI is configured for Ubuntu, macOS and Windows on Node 22 and 24. The linked GitHub Actions result is the authority for those runners; this is not a desktop DSH GUI test on every OS. Directory-sync guarantees vary by OS/filesystem.

## Existing DSH Web acceptance

Chromium opened the **existing authenticated DSH app**, not a replacement server or mock UI. Fixtures used uniquely owned temporary project directories; no pre-existing user skill was edited.

Normal CRUD acceptance passed local bundle install/resources, create/save/search/edit/validation, invocation switches, metadata preservation, confirmed delete, Escape-close, project/user lists and native light/dark appearance. Original appearance was restored. The 390px content layout had no horizontal overflow. Browser page errors: zero.

The eight corrective checks were rerun: exact flat deletion preserving the same-name bundle, cross-format create rejection, simultaneous real API saves yielding one 200/one409 without mixed bytes, quoted YAML toggles, pending-detail context locks, save-time read-only editor, cleared failed context lists, and the actual app under a browser-emulated prefix-stripping mount. Expected409/injected failures are intentional; page errors were zero.

The real `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` install was also rerun at observed commit `063bee94c3f4df8453406c830b0a7df0f2860278`: trust gating, no default selection, fixed snapshot, installation/readable instructions, shell rejection and conflicting global flag rejection all passed.

## Real GitHub update acceptance

A disposable **public GitHub branch** containing one verification bundle advanced through three real commits:

- v1: `578ac065095837d21af8413afb35210286852292`
- v2: `06818880b37753cad8763ab5661363ce693be204`
- v3: `c73516fb3d70a2ca94e6145463b90fd9b11e519d`

Through the installed GUI, all seven checks passed:

1. Install v1 and observe persisted verified source, commit and complete-tree baseline.
2. Advance upstream to v2, preview instruction/resource changes and deletion, apply, and verify the complete v1 tree plus old origin in the backup.
3. Add a local resource, advance upstream to v3, and verify the separate replacement checkbox defaults to unchecked and blocks Apply.
4. Add another resource **after** preview. Even after explicit overwrite consent, Apply returns409 and preserves both local resource and current instructions.
5. Prepare again and explicitly replace; verify both custom resources remain byte-for-byte in the new backup.
6. Copy a v0.4-style untracked bundle into another owned project, supply the source explicitly, and register identical contents without changing file inode/mtime or creating a backup.
7. Check again: no upstream changes, no Apply action, and no retained temporary preview.

Browser page errors: zero. The temporary public branch and all owned local fixtures/previews were removed. Screenshots show this real fixture, not a shipped example skill.

These acceptance tests require public GitHub networking and are separate from deterministic CI. Initial live runs uncovered the small compressed-file header bug and GitHub's60-second branch-endpoint cache; both were fixed and covered before the final successful run.

## Distribution and limits

- Direct dependencies remain pinned `yaml@2.9.1` and official `skills@1.7.4`; no new runtime library or build/install lifecycle script was introduced. Node22.20+ is required.
- Only public GitHub and directory-form same-name skills are supported for updates. Legacy source association is explicit; no source is inferred from a name. Native `npx skills update` command input is not provided.
- The CLI receives a prevalidated local snapshot, never the pasted raw command or remote URL. Fixed-origin anonymous downloads, credential-stripped temporary environment, empty/private PATH, telemetry off and no Git/gh/SSH or skill-script execution remain in effect.
- Backups live outside the scanned skill root, retain the whole original bundle and origin, and are limited to10 entries/256MiB per name before mutation. There is no backup-restore GUI or automatic original-backup garbage collection.
- Ordinary `revision` hashes SKILL.md; GitHub updates additionally compare a full-tree hash and origin revision. Timestamps, ACLs and non-executable permission bits are not part of that tree hash.
- Directory replacement is journaled, not an OS-level atomic exchange. Manager access triggers lazy recovery; unrelated native filesystem readers may briefly observe a missing directory during switching. Once publication begins, cancellation/disconnection does not guarantee rollback; reload actual state.
- Same-name locks cover this plugin process, not unrelated writers. Link guards, temporary directories and periodic limits are conservative local-owner safeguards, not a race-proof sandbox, hard disk quota or universal power-loss guarantee.
- Windows/macOS DSH GUI acceptance has not been performed, even when their Node CI succeeds.
