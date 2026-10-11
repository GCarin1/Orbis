# Tasks — Change 0068-cloud-relay

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0068-cloud-relay` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Relay frames in `packages/shared/src/relay.ts`
- [x] Hub relay client, `ORBIS_CLOUD_URL`, `PUT /api/v1/device/cloud`, `DeviceStatus.cloud` (`packages/hub/test/relay.test.ts`)
- [x] Worker and Durable Object in `packages/cloud` (`packages/cloud/test/cloud.test.ts`)
- [x] `supabase/migrations/0003_device_identity.sql`, applied
- [x] `orbis link --cloud` and the cloud in `--status`; the web app's phone-off notice and cloud line
- [x] `.github/workflows/cloud.yml`
- [x] ADR 0024, spec deltas, docs, contract, CHANGELOG
