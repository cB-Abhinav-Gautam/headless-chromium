# Security

## Reporting

Please report security problems privately through GitHub's "Report a
vulnerability" (Security tab), not in a public issue.

## Scope

- **In scope:** `build.sh`, `check-needed.js`, `index.js`, the launch flags in
  `chromium.args`, and the CI workflow.
- **Out of scope:** bugs in Chromium itself. Report those to the Chromium
  project. A rebuild picks up Google's fix as soon as it ships to Stable.

## Staying patched

Rebuild images that use this regularly. Each rebuild takes the newest Chrome
Stable release and the newest Debian security updates for the runtime
libraries.
