# Tasks — Change 0072-server-image-amd64

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0072-server-image-amd64` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] amd64 by default, arm64 on demand in the Server image workflow
- [x] npm's own error shown when the image build fails
- [x] Workflow test, umbrel guide, CHANGELOG
- [x] `packages/cli/test/audit-cycle4.test.ts`: wait for the CLI's own run instead of a fixed 200 ms (it lost the race under the full suite's load)
