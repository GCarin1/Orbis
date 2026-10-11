# Tasks — Change 0070-oracle-only

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0070-oracle-only` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Remove the Cloudflare relay (code, workflow, config, CLI flag, web notice)
- [x] HTTPS with Caddy, the security headers and the firewall in `orbis-server` (`cloud-kit.test.ts`, `server-script.test.ts`)
- [x] `ORBIS_PUBLIC_URL`: trusted proxy, OAuth redirect and minimum token length (`auth.test.ts`)
- [x] Two-step verification in the hub and the web app (`auth.test.ts`, `mfa.test.tsx`)
- [x] Security check, docs, ADR 0026, spec deltas and CHANGELOG
