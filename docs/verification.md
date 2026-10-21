# Verification — 0.4.0

Verified 2026-10-22 on Linux, Node 22.23.4 and installed DSH 0.2.1-rc.2. This corrects the v0.2.0 review findings; passing v0.2.0's eight happy-path tests did not establish safety under concurrency or identity collisions.

## Automated regression tests

`npm ci --ignore-scripts` then `npm run check` checks all four JavaScript entry points and runs **90 tests**, including nested cases: 22 Host, 25 Client, 15 GitHub adapter and 28 remote-installer cases. Deterministic tests do not call live GitHub. A fixture executes the actual pinned `skills@1.7.4` CLI only against a local network-free snapshot.

Host coverage includes atomic publication, injected partial-write/rename failures preserving original bytes, simultaneous CAS updates with one winner, concurrent cross-format create/install conflicts, exact-format legacy collision reads/toggles/deletes, quoted YAML keys, duplicate and malformed YAML rejection, comments/CRLF/instruction-byte preservation, anchored values with untargeted aliases, resource/mode/empty-directory copying, bounded staged installs, symbolic-link rejection, canonical overlapping user/project read-only roots and actual tool contracts.

Client coverage uses the actual Client factory in a deterministic VM React/fetch harness: delayed detail responses and context locks, stale success/failure suppression, cleared failed lists, kind+revision+context-bound mutation payloads, locked save input/navigation, collision-safe create mode, draft restore after unmount, detached old row callbacks, fresh invocation flags, mutation completion after unmount, mounted-prefix URLs and the refresh glyph.

New remote tests cover shell/option/source rejection before retrieval, immutable public-tree/raw requests, link/path/redirect/size rejection, credential-stripped subprocess args/env, output/deadline/abort/process cleanup, limited active/retained previews, context-bound token leases/TTL, explicit selections, partial results and cleanup. Client tests cover trust gating, source invalidation, selection, expiry and unmount behavior. An independent read-only security review found no concrete P1/P2 defect within this stated local-owner model.

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

## Real public-source / npx UI acceptance

The registered Host handlers first retrieved and installed a real public source in a unique temporary target. Then Chromium used the installed DSH dialog with:

```sh
npx skills add vercel-labs/agent-skills --skill web-design-guidelines
```

The observed snapshot was commit `063bee94c3f4df8453406c830b0a7df0f2860278`. All seven browser checks passed: preview disabled until explicit trust, actual fixed-commit source retrieval plus pinned local-only CLI, no initial candidate selection, selected-skill install and success summary, installed instructions readable in the normal detail view, shell operators rejected without execution, and conflicting `-g` rejected without retargeting. JavaScript page errors: zero. Temporary installed skills and previews were cleaned; no pre-existing user skill was altered.

These checks require public GitHub networking; they are separate from the offline CI tests. The normal CRUD/light/dark and eight corrective browser checks above were also rerun against v0.4.0.

## Distribution and limits

- The current web profile uses a local development link to the reviewed source. GitHub tag installation is documented separately in the README.
- Direct runtime dependencies are pinned `yaml@2.9.1` and official `skills@1.7.4`; no bundle build or install lifecycle scripts are needed. Node 22.20+ is required.
- The remote CLI receives a prevalidated **local** source, never the user's raw command/URL. GitHub snapshot retrieval is anonymous and fixed-origin. Child PATH is empty/private, environment excludes host credentials and loader options, telemetry/compile cache are off, and no Git/gh/SSH or skill scripts run.
- Public GitHub/add-only syntax is a deliberately restricted subset, not full CLI/source compatibility. A private temporary directory and periodic resource checks are not an OS security sandbox or hard disk quota.
- Per-name serialization covers this loaded plugin process, not unrelated processes. Revisions hash SKILL.md bytes, not the complete resource tree. External filesystem changes are not a full multi-process transaction.
- Symbolic-link guards are conservative local-owner safeguards, not a race-proof sandbox.
- Windows/macOS DSH GUI runtime acceptance has not been performed, even when their Node regression CI succeeds.
