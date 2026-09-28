# Tasks — Change 0017-computer-modes

- [x] Add the `host` provider: commands in the chosen folder with the user's environment minus the hub's, file tools confined there, a visible browser (installed Chrome or Edge), nothing removed on delete.
- [x] Route the work folder through the manager (tools, CLI brains, skills) and tell each bot which computer it has.
- [x] Ask before file writes on the user's machine (per-bot default decisions), validate the folder, keep host access out of templates, stop the old computer on a switch.
- [x] Report what each computer needs (`GET /api/v1/computers`) and build the desktop image on request.
- [x] Add the three computer cards with the folder and the consent to bot settings, the Docker state and image button, the Computers settings tab and the mode under the bot's screen.
- [x] Record ADR 0009 (the user's own machine, by explicit per-bot consent).
- [x] Cover it with hub, web and end-to-end tests.
- [x] Update the docs (computer guide, API), the contract, `.env.example` and the CHANGELOG.
