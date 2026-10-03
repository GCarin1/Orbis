# Hiring: AI teammates without writing them

Open **💼 Hiring** in the sidebar. A *recruiter* bot's brain writes short
résumés of candidates for your project or one of your teams. You hire only
the ones you want. The full profile is written only on a hire, so hiring
costs few tokens.

## A new opening

1. Choose what it is based on:
   - **Project scope**: describe the project, its goal and what is left to
     do.
   - **My team**: pick one of your groups. The recruiter reads its name, its
     description, its members and its latest 20 messages. Add a **focus** if
     you know what the team lacks, such as "someone for data".
2. Choose **how many candidates**, from 1 to 30.
3. Choose **who writes the résumés**: any bot. Its brain and its key do the
   work, and what it spends counts in its usage and toward its spend cap.
   Orbis picks a bot whose role says RH, HR or recruiter, if there is one.
4. The screen estimates the cost: about 70 response tokens per résumé.

Each résumé holds a name, a role, one sentence on who they are, three to five
strengths, and the tools they would use. The tools are chosen only among what
you have now: the computer, the browser, the web, and your connected MCP
servers, shown with their logos.

On a round:

- **More** asks for more résumés. The recruiter is told who is already in the
  team and in the round, so no name repeats.
- **✕** dismisses a candidate. **See dismissed** brings them back.
- **🗑** deletes the round. The bots you hired stay.

## Hiring

Press **Hire** on a candidate. The sheet asks:

- **Brain: the same as** — the hire gets this bot's brain and its key (the
  recruiter's by default).
- **Reports to** — its manager. In a team round this is the group's lead.
- **Joins the group** — in a team round, on by default.

The recruiter's brain then writes the full profile, about 800 tokens:

- the standing instructions: who they are, how they work, what they own,
  when they ask, how they report;
- what they will do;
- what they need from you;
- their tools;
- one to three skills, saved as the bot's own `SKILL.md` files.

The candidate becomes a bot, which joins its team and says hello in its
conversation, with what it will do first and what it needs. **Open the chat**
takes you there.

If the brain does not answer in the format asked, nothing is created. The
candidate stays open with the reason, and you can try again, perhaps with
another bot's brain.

## Why two steps

Twenty full personas would cost about ten times as much as twenty résumés,
and most candidates are dismissed. ADR 0015 records this decision. The API is
in [`api.md`](api.md#hiring).
