# Verification — 0.2.0

Verified 2026-10-22 on Linux, Node 22.23.4 and installed DSH 0.2.1-rc.2.

## Host regression tests

`npm run check` checks both JavaScript entry points and runs 8 Node tests:

- Cordis Standard Schema configuration and bounds.
- Save/list/read and name/storage validation.
- CRLF frontmatter toggles preserving unknown metadata, comments, instruction bytes and multiline descriptions.
- Recursive resources, executable permissions, no overwrite, empty source rejection.
- Symbolic link rejection for sources and mutation targets/ancestors.
- Request/skill size limits, including bodies without Content-Length.
- User write gate and actual tool output/default-working-directory contract.

## Real browser acceptance

Chromium opened the **existing authenticated DSH Web app**, not a mock or replacement server. All screenshots were captured from its live React plugin view. The three example skills were test fixtures under a uniquely owned temporary project and were removed after testing; no pre-existing user skill was changed.

Passed: local install (including references), create/save, name/description search, edit, format check, agent access and slash-command toggles, raw metadata preservation, confirmed delete, Escape-close dialog, project/user scope switching, light/dark appearance, 390px layout without horizontal content overflow. Browser console/page errors: **0**.

The original DSH appearance preference was restored after the light-theme check. The plugin remains installed in the web profile as a local development link for this session; GitHub installation syntax is documented in the README.

## Limits

- Windows/macOS runtime acceptance has not been performed.
- The frontmatter reader validates managed fields, not arbitrary YAML syntax.
- Filesystem link checks are conservative local-owner safeguards, not a race-proof sandbox.
- Browser acceptance includes the host's installed UI plugins; mobile shell controls are provided by that existing deployment.
