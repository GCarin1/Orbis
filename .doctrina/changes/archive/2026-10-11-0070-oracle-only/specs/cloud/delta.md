# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Implementation: partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in with two-step verification (`packages/hub/src/auth/`, changes 0064 and 0070), the `.orbis` export and import (`packages/hub/src/export/`, change 0065), the hub as a device of the account keeping a copy there (`supabase/migrations/0002_devices.sql`, `packages/hub/src/sync/`, change 0066), and the hub on an always-on server serving the app over HTTPS (`deploy/`, `scripts/server/orbis-server.sh`, changes 0069 and 0070)
set-header Last updated: 2026-10-11
bump-version minor
replace-requirement ubiquitous 6: The system shall serve the web app and its API from the user's own always-on server, with Caddy in front for HTTPS (a certificate it gets and renews itself) and only ports 22, 80 and 443 open; the hub's own port shall listen on the server only (ADR 0026).
replace-requirement event 8: When the hub is opened at `ORBIS_PUBLIC_URL`, the system shall take the visitor's address from its proxy only on loopback and private networks and count refused sign-ins per visitor, sign MCP servers in back to that address, and refuse to start with an `ORBIS_TOKEN` shorter than 24 characters.
replace-requirement event 9: When two-step verification is on for the linked account, the system shall refuse every account session whose second step (an authenticator's code, `aal2`) was not given; only the hub's token or an `aal2` session shall turn it on or off, and the hub's token stays the recovery key.
replace-requirement event 10: When the user runs `orbis-server token`, the system shall print the hub's token; `orbis-server update` shall pull Orbis and rebuild the hub and Caddy, keeping the data in its volume.
replace-requirement event 11: When the user runs `orbis-server install` on an always-on Linux server, the system shall install Docker when missing, check Orbis out, keep the address (the user's domain, else `<public-ip>.sslip.io`) and the Claude plan's token in a `deploy/.env` readable only by its owner, open ports 80 and 443 in the server's firewall, and start the hub with Caddy; `import` shall bring a `.orbis` file into the hub and remove the copy after (ADR 0026).
replace-requirement event 12: When a hub is linked as a device with `orbis-server link`, the system shall keep a copy of its data in the account as any device does, and the app shall keep talking to the hub itself.
replace-requirement unwanted 7: The system shall not answer a page or API call without HSTS, a CSP limited to its own origin and the Supabase project (the one inline script by hash), `X-Frame-Options: DENY` (SAMEORIGIN for the computer's live view, which the app frames), `nosniff` and `Referrer-Policy: no-referrer`.
replace-criterion 7: [verified] Caddy serves Orbis at `$ORBIS_DOMAIN` to the hub with HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and a CSP without `unsafe-eval` or inline scripts but the app's one, by its hash; the compose file publishes only Caddy's 80 and 443 and the hub's port on the machine only, with no tunnel — verified by `packages/hub/test/cloud-kit.test.ts`
replace-criterion 8: [verified] Behind its proxy a hub refuses a token under 24 characters, makes one visitor wait after 20 refused tries while another and the owner still get in — verified by `packages/hub/test/auth.test.ts`
replace-criterion 9: [verified] With two-step verification on, a session of the password alone is refused and one with the second step opens the hub; only such a session or the hub's token turns it on or off; sessions report their `aal` — verified by `packages/hub/test/auth.test.ts`
replace-criterion 10: [verified] `orbis-server.sh` installs Docker when missing, clones Orbis, writes `deploy/.env` readable only by its owner with the HTTPS address (`<ip>.sslip.io` without a domain), opens 80 and 443, starts the hub with Caddy, takes the user's own domain, links the hub, shows its token, imports a `.orbis` file and removes it after, lists its commands and says when Orbis is not installed — verified by `packages/hub/test/server-script.test.ts`
```
