# Verification — 0.3.0

Verified 2026-10-22 on Linux, Node 22.23.4 and installed DSH 0.2.1-rc.2. This corrects the v0.2.0 review findings; passing v0.2.0's eight happy-path tests did not establish safety under concurrency or identity collisions.

## Automated regression tests

`npm ci --ignore-scripts` then `npm run check` checks the JavaScript entry points and runs **34 tests: 21 Host and 13 Client**.

Host coverage includes atomic publication, injected partial-write/rename failures preserving original bytes, simultaneous CAS updates with one winner, concurrent cross-format create/install conflicts, exact-format legacy collision reads/toggles/deletes, quoted YAML keys, duplicate and malformed YAML rejection, comments/CRLF/instruction-byte preservation, anchored values with untargeted aliases, resource/mode/empty-directory copying, bounded staged installs, symbolic-link rejection, canonical overlapping user/project read-only roots and actual tool contracts.

Client coverage uses the actual Client factory in a deterministic VM React/fetch harness: delayed detail responses and context locks, stale success/failure suppression, cleared failed lists, kind+revision+context-bound mutation payloads, locked save input/navigation, collision-safe create mode, draft restore after unmount, detached old row callbacks, fresh invocation flags, mutation completion after unmount, mounted-prefix URLs and the refresh glyph.

CI is configured for Ubuntu, macOS and Windows on Node 22 and 24. The GitHub Actions result is the authority for those runners; a configured matrix is not a claim of a desktop DSH browser test on each OS.

## Existing DSH Web acceptance

Chromium opened the **existing authenticated DSH Web app**, not a replacement server or a mock UI. Screenshots show its installed plugin. Fixtures lived under uniquely owned temporary project directories and were removed; no pre-existing user skills were edited.

Normal acceptance passed local bundle install including references, create/save, description search, edit/format check, agent and slash-command switches, metadata preservation, confirmed delete, Escape-close dialog, project/user lists and actual native light/dark settings. The original appearance was restored. No unexpected browser console/page errors were recorded in the normal run. The 390px content layout was checked for horizontal overflow; shell navigation behavior is supplied by the host's other installed plugins.

Additional regression acceptance through the same real app passed:

1. Delete a selected flat legacy skill without removing its same-name bundle/resources.
2. Reject a same-name cross-format create with HTTP 409 and preserve original bytes.
3. Send simultaneous real API updates with the same revision: exactly one 200 and one 409; final bytes equal one submitted body, never a mixture.
4. Toggle a quoted invocation key and revalidate the resulting YAML without duplicates.
5. Delay a real detail request: project controls remain locked and the correct loaded identity is retained.
6. Delay validation during Save: the editor is read-only until the update completes.
7. Inject a failed list for another project: previous cards disappear and mutations stay disabled.
8. Load the actual app through a browser-route simulation of a prefix-stripping proxy and observe prefixed skill API URLs. This checks a deployment path, not a separately launched server. Intentional failure/409 responses are expected in these tests; page JavaScript errors were zero.

## Distribution and limits

- The current web profile uses a local development link to the reviewed source. GitHub tag installation is documented separately in the README.
- The only runtime dependency is pinned `yaml`; no bundle build or install scripts are needed.
- Per-name serialization covers this loaded plugin process, not unrelated processes. Revisions hash SKILL.md bytes, not the complete resource tree. External filesystem changes are not a full multi-process transaction.
- Symbolic-link guards are conservative local-owner safeguards, not a race-proof sandbox.
- Windows/macOS DSH GUI runtime acceptance has not been performed, even when their Node regression CI succeeds.
