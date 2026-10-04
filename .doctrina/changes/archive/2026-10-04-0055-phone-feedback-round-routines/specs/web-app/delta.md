# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
replace-requirement event 3: When the stream connection drops, the web app shall reconnect with backoff and reload the open timeline; when the page comes back on screen, gets the focus or goes back online, it shall open a closed stream at once and replace an open one that does not answer within 4 seconds.
append-requirement ubiquitous: The web app shall show in a bot's conversation header its face, name, handle, role, brain and state, open the bot's details from them, and keep its other options (details, routines, computer, settings, clearing the conversation) in a ⋮ menu, as a group's header does.
append-requirement ubiquitous: The web app shall say a routine's schedule in words in the user's language (every day, weekdays, chosen weekdays, a day of the month or every hour, at a time; any other cron as a cron), with its timezone when it is not the device's, in the routines panel and in routine cards, and say in a routine card whose routine it is.
append-requirement ubiquitous: The web app shall let a routine's schedule be picked as every day, weekdays, chosen weekdays or a day of the month at a time, every hour at a minute, a cron, or a webhook, and read the pick back in words before the routine is created.
append-requirement event: When the user enables a routine that was never tested, the web app shall say so in the user's language and offer to test it or to enable it anyway.
append-requirement ubiquitous: The web app shall offer a bot in a list of bots to pick (who a bot reports to, a squad's manager, a new squad's members) with its role, and a new squad's members one per row with their face, role and current squad.
append-criterion [verified] A bot's header shows its name and role and keeps details, routines, computer, settings and clearing in a ⋮ menu; a routine reads "Weekdays (Mon to Fri) at 07:23"; enabling an untested routine offers to test or enable anyway in the user's language; Monday and Friday at 18:00 is sent as `0 18 * * 1,5` with its timezone; a routine card says whose routine it is and when it runs; a bot is offered with its role — verified by `packages/web/test/phone-feedback.test.tsx`
append-criterion [verified] The usual repeats turn into their cron and back, any other cron stays custom, and a schedule is said in Portuguese or English with the timezone only when it is not the device's — verified by `packages/web/test/schedule.test.tsx`
append-criterion [verified] Back on screen, a closed stream opens at once instead of waiting out its backoff, an open one that does not answer within 4 seconds is replaced, and a connection that never opens is tried again — verified by `packages/web/test/audit-cycle2.test.tsx`
append-criterion [verified] In a real browser, the ⋮ menu opens a bot's routines, a routine picked as every day at 02:00 in America/Sao_Paulo is saved as `0 2 * * *` in that timezone, tested and enabled — verified by `tests/e2e/skills-routines.test.ts`
```
