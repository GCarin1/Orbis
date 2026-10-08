# Spec — web-app

**Capability:** web-app
**Status:** active
**Implementation:** verified — the Orbis look: bot faces with state motion, one conversation list with search and unread dots, dark and light bubbles with time separators and "Messages from", mention chips, the pill composer with the microphone and the read-aloud switch, the bot panel (screen, routines, team, brain), the new-bot screen with face pickers and suggestions, the phone layout, the System/Light/Dark theme; timeline cards, the skills, usage, routines, computer, bot settings and settings screens (brains, voice and appearance), approvals inbox, languages, PWA and the end-to-end paths
**Realizes:** SC7, SC4, SC5
**Depends on:** hub-api
**Last updated:** 2026-10-08
**Version:** 0.37.0

## Purpose

The web app is the main way people work with their bots, and it is the same
code the desktop app shows. It is organised around bots, not around
conversations: the sidebar is the roster, each bot's state is always visible,
and the conversation is one timeline with messages, events, cards and each
run's steps.

## Requirements (EARS)

### Ubiquitous

- The web app shall show a sidebar with a search field and one list of conversations — each visible bot and each group — pinned first and then by latest activity, each with the bot's face (or its members' faces), its name, what it is doing or said last, the time and an unread dot.
- The web app shall show a conversation's timeline with the user's messages on the right in dark bubbles and the bots' on the left in light bubbles, a time separator after a pause of 20 minutes, a "Messages from …" label when other bots speak in a bot's own conversation, mentions drawn in the mentioned bot's color with its face, reactions, the approval, draft, handoff, secret-request and routine cards, thread replies, and each run's steps as a collapsible list.
- The web app shall provide a composer with a button that starts a mention, autocomplete for `@handle` and `@role` mentions and `/skill` invocations, a microphone, a switch that reads replies aloud, and a send button.
- The web app shall provide screens for bot settings (identity, description, brain, policy, computer, spend cap), skills, routines, usage, settings in tabs (the brains on the hub's machine and the brain of each bot; the kinds of computer; voice and appearance), the approvals inbox, and the computer view as a side panel and full screen.
- The web app shall show every text in pt-BR or English, following the browser language, with a manual switch that is remembered.
- The web app shall ship a web app manifest and a service worker so it can be installed on desktop and mobile browsers.
- The web app shall state each bot's state in words: in its face's accessible name, and as a visible label while the bot is not idle.
- The web app shall list group conversations in the same list as the bots, provide a dialog that creates a group of 2 bots up to the hub's group limit with a lead, and show in a group's header its photo (or its members' faces), its name and its members, or who among them is working.
- The web app shall show the brain and model of the open bot next to its name.
- The web app shall draw each bot as a face: one of eight shapes (orb, blob, square, pill, triangle, hexagon, cloud, drop) in the bot's color with two eyes, the orb with the Orbis orbit ring, moving with the bot's state unless the user asks for reduced motion.
- The web app shall provide a new-bot screen with a live preview of the face, ten colors and the eight shapes to choose from, name, role, manager and brain fields, suggestions that fill them in, and template import.
- The web app shall show beside a bot's conversation a panel with the bot's screen, its routines with their schedule in words, the bot it reports to and its reports, and its brain.
- The web app shall, on a screen narrower than 760 px, show either the conversation list or one conversation with a back button.
- The web app shall offer three themes — follow the system, light and dark — from a switch in the sidebar and in the settings screen, remembered per browser and applied before the first paint.
- The web app shall let the user pick each bot's computer among three cards — a private folder, "My computer" with the folder it works in, and a Docker container — show what Docker needs with a button that prepares the desktop image, and name the bot's kind of computer under its screen.
- The web app shall provide an MCP screen, named MCP in the sidebar, with two tabs. Explore holds a search, a filter for how a server connects (no account, sign-in, free key), categories with their counts, the servers to start with, and a card per server with its logo, name, category, where it runs, what it does, how it connects, whether it only reads, and Connect (or its state once connected). Connected lists each server with its logo, its state, the faces of the bots that may use it, a switch per bot, its tools with which only read and which ask first, and Reconnect and Disconnect in its ⋮ menu; with nothing connected, it says so and leads to Explore. Your own server opens a form for an address or a program.
- The web app shall let the user choose each bot's tools in its settings with switches for Orbis's tool groups and for each connected server, written to the bot's allowlist.
- The web app shall show, at the top of the brains settings, a ChatGPT card in three steps — install the Codex CLI, sign in with the ChatGPT account (in the browser, or with the one-time code shown large and the page to open), use it in a bot with a test — and the account once connected.
- The web app shall render messages as Markdown — headings, lists, quotes, code blocks with a copy button, tables, links opening in a new tab, bold, italic and strikethrough — as elements, never as HTML, with mentions in each bot's color.
- The web app shall show one working bubble per busy bot in a conversation, with the number of its runs waiting behind it, a stop button that cancels them, and "waiting for you" instead of typing dots while the bot waits for the user.
- The approvals inbox shall say what each approval would do (the command, file, address or recipient) and open the conversation the approval waits in, a group included.
- The web app shall show the conversation list's last message and read replies aloud without Markdown marks.
- The web app shall offer, for the `chat-http` brain in the new-bot screen and the bot's settings, the address, a password field for the Bearer token with its expiry, the model, advanced request settings, and a box that fills them from a pasted cURL command and then clears it.
- The web app shall offer, in the `chat-http` brain's advanced settings, a box to give new chats a title, checked by default, that saves `chat.titles: false` when cleared.
- The web app shall show in the Claude Code card of the brains screen whether Claude Code is signed in and offer signing in, with the page to open and a box for the code it shows, and when a test of that brain fails because its login expired the web app shall say so and point to the sign-in.
- The web app shall show in a `chat-http` bot's settings whether a token is saved in the vault and when it expires, and the browser headers copied from a pasted cURL, which can be removed.
- The web app shall let a `chat-http` bot's HTTP call be chosen in its advanced settings — automatic, curl or Node — and show how many browser headers a pasted cURL gave.
- The web app shall offer in a `chat-http` bot's settings a connection test that lists each way to the API with what the firewall said and lets the user use one that got through, and fields for the curl program and the proxy.
- The web app shall offer plain chat in a `chat-http` bot's settings, off by default and explained, and shall name the fields a refused save got wrong.
- The web app shall show in Settings → Brains, for each chat API that `chat-http` bots use, its token's status and its bots, and take a new token or cURL that applies to all of them; a bot's settings and the new-bot screen shall save the token as its API's.
- The web app shall let the user change the side panel's width by dragging its left edge or with the arrow keys, keep it within the window, remember it in the browser, and show a wide bot settings panel in two columns.
- The web app shall show a group's joins, leaves and info changes in its timeline (joins, leaves and a new lead with the bot's face), and offer in the group's ⋮ menu adding members, its info, its links, search, muting, and under More exporting the conversation as text, clearing it and deleting the group, each destructive one after a confirmation, and follow a deleted bot out of its groups.
- The web app shall offer a Phone tab in Settings: in a browser, a pairing code with this computer's addresses, how long the code works and a warning when the hub listens on this computer only; inside the Android app, the hub, the app's version, changing the hub, the notification permission, staying connected in the background and the battery settings.
- The web app shall show each MCP server's logo on a white tile on its catalog card, its connected card and the bot's tool switches, and the server's emoji in its place when the server has no logo or the logo does not load.
- The web app shall show in Settings → Phone, beside a pairing code, a QR code that holds the link `<address>#pair=<code>`, for an address the phone can reach: the page's own address when it is not this computer's, or the hub's network card the user picks.
- The web app shall show in a bot's conversation header its face, name, handle, role, brain and state, open the bot's details from them, and keep its other options (details, routines, computer, settings, clearing the conversation) in a ⋮ menu, as a group's header does.
- The web app shall say a routine's schedule in words in the user's language (every day, weekdays, chosen weekdays, a day of the month or every hour, at a time; any other cron as a cron), with its timezone when it is not the device's, in the routines panel and in routine cards, and say in a routine card whose routine it is.
- The web app shall let a routine's schedule be picked as every day, weekdays, chosen weekdays or a day of the month at a time, every hour at a minute, a cron, or a webhook, and read the pick back in words before the routine is created.
- The web app shall offer a bot in a list of bots to pick (who a bot reports to, a squad's manager, a new squad's members) with its role, and a new squad's members one per row with their face, role and current squad.
- The web app shall let the user attach files to a message with the clip button, by pasting (a screenshot) or by dropping them on the message box, show each as a chip with its thumbnail or name and size that can be taken out, and send the files alone or with text.
- The web app shall show a message's images in place (opened large on a tap), play its audio and video, show every other file as a card with its extension and size that downloads it, and list a conversation's files from the bot's ⋮ menu and from a group's info and menu.
- The web app shall show in a bot's settings its initiative switch, how often it writes, whether it answers its MCP servers' updates and a "Try it now" button; in Settings → Initiative the switch for every bot and the quiet hours, saved with the device's timezone; and above a message a bot wrote on its own, that it did.
- The web app shall say on a connected MCP server's card which bots it tells about its updates, while any do, and above a message a bot wrote about an MCP update, that it did.
- The web app shall offer Settings → Health: inside the Android app, Health Connect's state, allowing it, syncing now and syncing on its own when the app opens and every 30 minutes while it is open (a choice of the device); anywhere, the last sync, its apps, the last 7 days, the bots that may read it and deleting it.
- The web app shall open the event stream with a one-time ticket and show files with the hub's file key, renewed every 20 minutes and when the stream reconnects, never putting the token or a session in an address.
- The web app shall keep an Orbis account's session on the device and renew it a minute before it ends, once for every request waiting, ending it when its renewal is refused; the hub's token, when the device has one, comes first.

### Event-driven

- When the stream delivers an event, the web app shall update the conversation list, the open timeline and the approvals inbox without a page reload.
- When the user answers an approval card or sends or discards a draft card, the web app shall call the API and show the card's new state.
- When the stream connection drops, the web app shall reconnect with backoff and reload the open timeline; when the page comes back on screen, gets the focus or goes back online, it shall open a closed stream at once and replace an open one that does not answer within 4 seconds.
- When the desktop app reports a notification click, the web app shall open that notification's conversation — the group, or the bot of a direct conversation.
- When the user presses Test on a brain or a bot in the settings screen, the web app shall call the brain test and show the reply and its duration, a warning when no model answered, or the error.
- When the user picks the `ollama` or `lmstudio` brain for a bot, the web app shall suggest the models that server has and say when it is not running.
- When a timeline item arrives in a conversation the user is not looking at, the web app shall mark that conversation unread until the user opens it.
- When the user presses the microphone, the web app shall write what the user says into the composer after the text already there, with the browser's speech recognition in the interface language, or, where the browser has none, by recording until the user presses stop and sending the recording to the hub's transcription service; the user reviews the text and sends it.
- When a bot message arrives in the open conversation while reading aloud is on, the web app shall read it with the system's voices in the interface language; any bot message can be read on demand with its Listen button.
- When a run fails, the web app shall offer to try it again on its failure line, once.
- When the user scrolls up in a conversation, the web app shall keep its place as messages arrive and offer a button to the newest; when older messages exist, a button loads the previous page.
- When the event stream has not answered a ping within 10 seconds (sent every 25 seconds, when the network comes back and when the app is shown again), the web app shall close it, connect again and reload what it may have missed.
- When the hub refuses an answer to an approval or a draft, the web app shall say why on the card and show the approval as the hub has it now.
- When the user edits a message the hub did not accept, the web app shall clear the send error.
- When the web app loads a conversation's runs, it shall keep the steps that already streamed in for a run whose loaded copy has fewer.
- When a pasted cURL only reads (no body), the web app shall keep the request address, take its token and, for a history request, the history's address, and say so.
- When a connection test of a `chat-http` bot finds a way through, the web app shall say that the test sends no message, and that messages still blocked mean the firewall reads them.
- When the user types an API key for an API brain in a bot's settings or on the new-bot screen and saves, the web app shall send it to the bot's vault, set the bot's `apiKeySecret` to that secret's name, empty the field and show that a key is saved, without the key being part of the bot.
- When the user clicks a group's photo or name, the web app shall open the group's info beside the conversation (full screen on a phone) with its photo, name and description to change, buttons to add, search, mute and export, its links, its members with their role, state and lead badge (each offering a direct conversation, making it lead and removing it), its notifications, and clearing and deleting it.
- When the user opens Add members, the web app shall list the visible bots outside the group with a search field, allow picking bots up to the room the group's limit leaves, and say when every bot is already in the group (offering a new bot) or the group holds its limit (naming ORBIS_MAX_GROUP_SIZE).
- When the user picks a search result or a link's line in the group's info, the web app shall load the conversation back to that message, scroll to it and mark it for a moment.
- When the web app opens with `#pair=<code>` in its address, or the user types six digits where the token goes, the web app shall trade the code for the hub's token, save the token and remove the code from the address bar, or say that the code is wrong, used or expired.
- When the user opens a catalog server (its card or its name), the web app shall show its details in a sheet — on the right edge, the whole screen on a phone — with how it connects, where it runs (the program it starts or the address it calls), whether it only reads or asks before changing something, who may use it, and its key fields or its Connect button; Esc, the close button and the phone's Back close the sheet.
- When the user opens Claude Code's card in Settings → Brains, the system shall show whether a subscription token is saved, since when and until about when, or set on the server, say how to get one with `claude setup-token`, and let the user save it in a masked field, replace it or remove it, showing the hub's reason when it is refused.
- When a test of Claude Code fails because its saved subscription token was refused, the system shall say to make a new token with `claude setup-token` and replace it.
- When the user opens Settings → Phone, the system shall point to running Orbis in the cloud with the Claude subscription token, in `docs/cloud.md`.
- When the user enables a routine that was never tested, the web app shall say so in the user's language and offer to test it or to enable it anyway.
- When the hub has an account linked, the sign-in screen shall ask first for that account's email and password, offer to email a reset link that comes back to the page, and still offer the token or a pairing code.
- When an email's reset link opens the page, the web app shall take its session out of the address and ask for a new password of at least 10 characters, typed twice.
- When the user, signed in with the hub's token, signs in to their account or creates it in Settings → Account, the web app shall offer to link this hub to it, and show the account linked, how this device signed in, signing out and unlinking.
- When the user downloads their data in Settings → Data, the web app shall ask for a password typed twice to seal the bots' keys (or none, leaving them out) and save the `.orbis` file to the browser's downloads or the phone's Downloads.
- When the user imports a `.orbis` file in Settings → Data, the web app shall send it to this hub with the file's password, or to the cloud account it is signed in to (or signs in to there) without that password, and show per kind of data what came in and what was already there, and the warnings.

### State-driven

- While a group is muted, the web app shall show a muted mark beside its name in the header and the list, and a gray unread dot.

### Unwanted-behavior (must-not)

- If neither the browser nor the hub can transcribe, or the microphone is blocked, the web app shall not record, and shall say how to fix it instead.
- The web app shall not save "My computer" for a bot that did not have it until the user ticks the consent that says what the bot will be able to do.
- The web app shall not clear a message the hub did not accept; it shall say why under the composer, and it shall not send on the Enter that confirms an accent or an input-method candidate.
- The web app shall not count a bot starting to work as a new message below.
- The web app shall not offer Try again on a routine's run, and shall say why when trying again is refused.
- The web app shall not put a `chat-http` token in the bot; it shall save it as the bot's secret, keep a saved one when the field is left empty, and never show it back.
- The web app shall not scroll a screen, panel or dialog sideways on a screen 390 px wide; a table wider than its screen scrolls inside its own box.
- The web app shall not attach a file over 25 MB or more than 10 files to one message; it shall say which file and the limit.

### Optional

- Where the brain is OpenAI-compatible, the web app may offer how to send the key (Authorization Bearer or an `api-key` header) and say that `{model}` in the address is replaced by the model.

## Acceptance criteria

1. [verified] The sidebar lists bots and groups in one list, pinned first then by latest activity, with each bot's face and its state in words, an unread dot, search by name, handle or role, the + menu for a new bot or group, and an invitation to create the first bot — verified by `packages/web/test/sidebar.test.tsx`.
2. [verified] The timeline renders a message, an event and an approval card, and pressing "Allow once" calls the approvals API — verified by `packages/web/test/timeline.test.tsx`.
3. [verified] Switching the language to English and back to pt-BR changes the interface texts — verified by `packages/web/test/i18n.test.tsx`.
4. [verified] Typing `@` in the composer offers the member handles and `/` offers the skills — verified by `packages/web/test/composer.test.tsx`.
5. [verified] In a real browser, a user creates a bot, sends it a message and sees the reply appear — verified by `tests/e2e/skeleton.test.ts`.
6. [verified] In a real browser, a user creates a group in the dialog, picks a member from the `@` autocomplete, gets only that member's reply, and sees a handoff card with the receiver's answer — verified by `tests/e2e/collaboration.test.ts`.
7. [verified] A handoff card shows sender, receiver, task, context and state, and the receiver's reply shows which item it answers — verified by `packages/web/test/collab.test.tsx`.
8. [verified] The computer panel shows the computer's state, the latest screenshot (or noVNC for a desktop), and sends Take over and Hand back — verified by `packages/web/test/computer.test.tsx`.
9. [verified] In a real browser, after a bot opens a page, the user sees that page in the computer panel, takes over, hands back and switches to full screen — verified by `tests/e2e/computer.test.ts`.
10. [verified] In a real browser, a user writes a skill in the skills screen, invokes it with the `/` autocomplete, and creates, tests and enables a routine whose cards appear in the conversation — verified by `tests/e2e/skills-routines.test.ts`.
11. [verified] The secret-request card posts the masked value to the vault route (or declines), and the usage screen shows runs, tokens, cost, the subscription part and the cap per bot — verified by `packages/web/test/secrets-usage.test.tsx`.
12. [verified] In a real browser, a user answers a bot's secret request in the masked card, the bot's command uses the value, and the value appears nowhere on the page — verified by `tests/e2e/secrets.test.ts`.
13. [verified] The bot settings panel edits identity, brain, policy rules and grants, computer, allowlists and the spend cap in one patch, and asks before deleting — verified by `packages/web/test/settings.test.tsx`.
14. [verified] In a real browser, a user edits a bot's settings, exports it as a template file and imports that file as a new bot — verified by `tests/e2e/templates.test.ts`.
15. [verified] Opening a conversation by id selects the group, or the bot whose direct conversation it is — verified by `packages/web/test/desktop.test.tsx`.
16. [verified] The settings screen shows installed and missing CLIs with install hints, local servers with their models (or off), and each bot's brain; it tests a brain or a bot and shows the answer, the echo warning or the error, and Configure opens the bot; the new-bot dialog offers Cursor, Ollama and LM Studio and suggests the Ollama models — verified by `packages/web/test/brains.test.tsx`.
17. [verified] In a real browser, a user opens Settings, sees a local server's models, tests it and a bot on the Cursor CLI (both answer 391), sees the mock bot flagged as an echo, and opens a bot's brain settings from the list — verified by `tests/e2e/settings.test.ts`.
18. [verified] A face draws its shape and color with two eyes, the orb with its ring and happy eyes when done; the timeline separates pauses with the time, introduces colleagues once per stretch as "Messages from", colors mentions and shows reactions; the bot panel shows the screen, routines in words, the team and the brain — verified by `packages/web/test/look.test.tsx`.
19. [verified] The new-bot screen previews the chosen color and shape, sends name, role, manager, brain and face, and a suggestion fills everything in, a specialist reporting to the team's chief — verified by `packages/web/test/newbot.test.tsx`.
20. [verified] In a real browser, the user asks the chief, the chief delegates to its reports, their answers appear under "Messages from", the chief reports back on its own, a message elsewhere lights that conversation's unread dot, and the bot panel links the team — verified by `tests/e2e/team.test.ts`.
21. [verified] The microphone writes what the browser hears after the typed text and stops on send; without browser dictation it records and sends the audio to the hub and writes the returned text; with neither it explains the setup; Listen reads a reply, reading aloud reads only new bot replies; the voice settings save the service without showing the key back and test it; the theme switch cycles System, Light and Dark, applies and remembers it — verified by `packages/web/test/voice.test.tsx`.
22. [verified] In a real browser with a fake microphone and no dictation, the user speaks, the recording goes through the hub to a transcription service, the words land in the composer and are sent, and the dark theme picked in the sidebar survives a reload — verified by `tests/e2e/voice.test.ts`.
23. [verified] Bot settings offer the three kinds of computer; "My computer" takes a folder and saves only after the consent, and not again for a bot that has it; the container shows Docker's state and prepares the image with one click; the computers tab explains the three kinds and what Docker needs; the bot panel names the kind of computer — verified by `packages/web/test/computers.test.tsx`.
24. [verified] In a real browser, the user gives a bot their own folder with the consent, the panel names it, the bot's file write waits for "Allow once" and then lands in that folder, and the settings screen explains the three kinds — verified by `tests/e2e/computer-modes.test.ts`.
25. [verified] The catalog shows how each server connects, searches and filters by category, connects one with no account in one click, asks for a key with where to get it, shows the sign-in link of a server that needs an account, gives a server to the bots ticked, and the bot's tool switches write `!group.*`, `mcp.<server>.*` and `!*` for nothing — verified by `packages/web/test/marketplace.test.tsx`.
26. [verified] In a real browser, the user browses the catalog, adds their own MCP server, gives it to one bot, sees it among that bot's tools, and the bot's call reaches the server with its key and argument — verified by `tests/e2e/marketplace.test.ts`.
27. [verified] The ChatGPT card installs Codex, starts a sign-in with a code, shows the code and the OpenAI page, shows the connected account after it polls, and tests the ChatGPT brain — verified by `packages/web/test/chatgpt.test.tsx`.
28. [verified] In a real browser with fake `npm` and `codex`, the user installs Codex from Settings, signs in with a code shown on the card, and sees the connected ChatGPT account — verified by `tests/e2e/chatgpt.test.ts`.
29. [verified] Markdown lists, code, tables, links and mentions render and raw HTML stays text; one bubble per bot with "+1 queued" and a stop that cancels both runs; the waiting note; Try again posts the retry once; earlier messages load on request; a failed send keeps the text and says why; a composing Enter does not send — verified by `packages/web/test/chat-audit.test.tsx`.
30. [verified] A stream that stops answering its ping is closed and replaced and the app reloads; a refused approval answer shows the hub's reason and the expired state; the inbox shows "npm run build" for a Claude Bash approval and opens its conversation; Markdown marks are dropped from a preview — verified by `packages/web/test/audit-cycle2.test.tsx`.
31. [verified] The send error shown after a refused message goes away when the user edits it — verified by `packages/web/test/audit-cycle5.test.tsx`.
32. [verified] While the user reads history, a bot starting to work shows no "new below" and a new message shows "1 new below"; a routine's failed run offers no Try again; a refused retry says why; loaded runs keep the steps that streamed in — verified by `packages/web/test/review.test.tsx`.
33. [verified] A pasted cURL fills the address, token, model, agent and Origin and leaves the screen; saving puts the token in the bot's secret and the rest in the brain; a saved token is kept when the field is empty, with the brain's time and step limits; a new bot hands its token apart from the bot — verified by `packages/web/test/chat-http.test.tsx`.
34. [verified] Pasting a history GET cURL keeps the request address, saves its token and the history's address — verified by `packages/web/test/chat-http.test.tsx`.
35. [verified] The title box is checked for a bot with no setting, and clearing it saves the brain with `chat: { titles: false }` — verified by `packages/web/test/chat-http.test.tsx`.
36. [verified] After a Claude Code test fails with an expired login the card says so, signs in with the page and the code, clears the failure and tests well; a login that fails shows why — verified by `packages/web/test/claude-sign-in.test.tsx`.
37. [verified] The settings show a token saved with its expiry, expired, or none; a pasted Authorization line is saved bare and shown as saved; Referer, User-Agent and Accept-Language are copied from a cURL without a cookie or another header, and can be removed — verified by `packages/web/test/chat-http.test.tsx`.
38. [verified] The HTTP call is automatic by default and saves nothing; choosing Node saves `transport: fetch`; a pasted cURL gives its browser headers, counted and shown, and no cookie — verified by `packages/web/test/chat-http.test.tsx`.
39. [verified] The connection test lists each way (curl with its program and proxy, Node) with its verdict, offers Use this way only for one that got through, which fills the curl program and the proxy that the save keeps; with none through it says so — verified by `packages/web/test/chat-http.test.tsx`.
40. [verified] Plain chat is off by default, explained, and saved as `plain: true` when turned on; a refused save names its field — verified by `packages/web/test/chat-http.test.tsx`.
41. [verified] The tokens card changes the token of an API's two bots from a pasted cURL, refuses a cURL of another API and text with no token, and hides with no chat API; a new bot of an API with a token needs none typed; a bot's settings ask for the address first and say when a bot uses its own token from before; the panel's width follows the keys and a drag within its limits, is remembered and is reset by a double-click — verified by `packages/web/test/chat-http.test.tsx`.
42. [verified] In a browser, a group shows its two joins with faces; a bot added from the header and one removed from its chip are said to join and leave and the member count follows; a deleted bot is said to leave and the last bot cannot be removed; clearing empties the conversation and deleting the group closes it — verified by `tests/e2e/groups.test.ts`.
43. [verified] A typed key goes to `PUT /bots/:id/secrets/API_KEY` and the saved brain holds only the name and the `api-key` choice; a saved key is kept when the field is left empty; a new bot hands its key apart from the bot — verified by `packages/web/test/api-key.test.tsx`.
44. [verified] The header shows the photo, the members or who works and opens the info; the ⋮ menu lists every option with the rarer ones under More; Add members picks outsiders up to the limit and says when all are in or the group is full; the info changes the photo, description and name, makes a member lead, removes it, opens its conversation, mutes and deletes; search marks the words and shows the message; links show who wrote them; the timeline says the info changes in pt-BR; the export writes one line per message — verified by `packages/web/test/group-info.test.tsx`.
45. [verified] In a real browser, a user adds a member from the ⋮ menu, opens the group's info on the right edge from its name, sets a description and a photo (shrunk to a JPEG and shown in the header and the list), mutes the group, removes a member from its row, finds a message by searching without accents and sees it marked, then clears and deletes the group from ⋮ → More — verified by `tests/e2e/groups.test.ts`.
46. [verified] The catalog and a connected server show the service's logo; with no logo, or when the logo fails to load, the catalog and a bot's tool switches show the emoji on the same tile; the search box is "Search MCPs" — verified by `packages/web/test/marketplace.test.tsx`.
47. [verified] In a real browser the sidebar names the screen MCP and the GitHub card's logo loads from `/logos/mcp/github.svg` — verified by `tests/e2e/marketplace.test.ts`.
48. [verified] In a real browser 390 px wide, no screen, panel or dialog scrolls sideways. The sweep covers the list, a conversation, its details, the bot settings with each brain, routines, computer, the new-bot screen, the new-group dialog, a group with its info, search, menu and add-members dialog, every Settings tab, MCP, Skills and Usage — verified by `tests/e2e/phone-layout.test.ts`.
49. [verified] The QR code holds the address picked and the code, and decoding its image gives back exactly that link; the page's own address comes first when it is not this computer's; the sign-in screen trades a QR code's code once and six typed digits, and says when a code is refused — verified by `packages/web/test/android.test.tsx`.
50. [verified] In a real browser, Settings → Phone shows the QR code, its link opens the web app on a phone signed in with the code gone from the address bar, the same link again is refused, and six digits typed on the sign-in screen sign in — verified by `tests/e2e/phone-pairing.test.ts`.
51. [verified] Explore shows where to start until a search or a filter, filters by search, by how a server connects and by category, says when nothing matches and clears the filters; a card or its name opens the details with how it connects, the address, whether it only reads and who uses it, and Esc or Close shuts them; a key is asked in the details; Connected says when nothing is connected and sums up what is; a connected server's card says so; Reconnect waits in the ⋮ menu — verified by `packages/web/test/marketplace.test.tsx`.
52. [verified] Claude Code's card saves the token from a masked field and clears it, shows the hub's refusal of an API key, says since when and until about when the token lasts, replaces and removes it, names a token set on the server, and asks for a new token when a saved one was refused — verified by `packages/web/test/claude-sign-in.test.tsx`.
53. [verified] The phone pairing card points to the cloud guide and the claude setup-token token — verified by `packages/web/test/android.test.tsx`.
54. [verified] A bot's header shows its name and role and keeps details, routines, computer, settings and clearing in a ⋮ menu; a routine reads "Weekdays (Mon to Fri) at 07:23"; enabling an untested routine offers to test or enable anyway in the user's language; Monday and Friday at 18:00 is sent as `0 18 * * 1,5` with its timezone; a routine card says whose routine it is and when it runs; a bot is offered with its role — verified by `packages/web/test/phone-feedback.test.tsx`
55. [verified] The usual repeats turn into their cron and back, any other cron stays custom, and a schedule is said in Portuguese or English with the timezone only when it is not the device's — verified by `packages/web/test/schedule.test.tsx`
56. [verified] Back on screen, a closed stream opens at once instead of waiting out its backoff, an open one that does not answer within 4 seconds is replaced, and a connection that never opens is tried again — verified by `packages/web/test/audit-cycle2.test.tsx`
57. [verified] In a real browser, the ⋮ menu opens a bot's routines, a routine picked as every day at 02:00 in America/Sao_Paulo is saved as `0 2 * * *` in that timezone, tested and enabled — verified by `tests/e2e/skills-routines.test.ts`
58. [verified] The clip adds files shown as chips, one can be taken out, files alone are sent and the box empties; a pasted screenshot gets a name and a dropped file is added; a file over 25 MB is refused with its name and the limit; a message shows its image (opened large and closed with Escape), its audio player and a card for its PDF, the token in each address; the conversation's files list its documents with who sent them and its images in a grid — verified by `packages/web/test/files.test.tsx`
59. [verified] A bot's initiative is off until ticked, how often waits until then, both and the MCP choice go with Save, Try it now gives the bot its chance; Settings → Initiative saves every bot's switch and the quiet hours with the device's timezone; a message of initiative says so — verified by `packages/web/test/initiative.test.tsx`
60. [verified] A connected server's card says nothing of updates while no bot watches it and names the bots it tells once they do — verified by `packages/web/test/marketplace.test.tsx`
61. [verified] Inside the Android app, Health Connect is allowed through the app and the days it read are synced to the hub, an outdated Health Connect sends to its install; in a browser the screen says where to connect it; a bot ticked gets the data and deleting empties the hub; the automatic sync runs only in the app and when the device chose it — verified by `packages/web/test/health.test.tsx`
62. [verified] The client signs in with the publishable key, refuses a short password before asking, renews a session once for many requests and ends it when refused, and takes an email link's session or error out of the address; the sign-in screen signs in with the linked account, says a wrong password, emails a reset link back to the page, saves a new password and still offers the token; Settings → Account signs in, links, unlinks and creates an account that must be confirmed — verified by `packages/web/test/account.test.tsx`
63. [verified] Settings → Data downloads the file with the secrets sealed by the password typed twice, or without them; imports into this hub with the file's password and shows what came in; imports into the cloud account it signs in to without sending the file's password — verified by `packages/web/test/data.test.tsx`

## Maturity

**MVP (committed):**

- Roster, timeline with cards and steps, composer, settings screens, approvals inbox, computer view, i18n, PWA.

**Future (aspirational, not committed):**

- Native mobile apps with push notifications.
- A wallpaper for the bot's computer that follows the time of day.

## Out of scope for this spec

- Native window, tray and notifications (see `specs/desktop-app`).
