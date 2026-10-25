# Squads: teams of bots with a representative and a manager

Open **🛡 Squads** in the sidebar.

## A squad

- **New squad**: give it a name, a description (its bots read it) and pick its
  bots.
  - A bot is in one squad at most. Picking a bot from another squad moves it.
  - The squad gets a handle from its name, like `@growth`. The handle never
    takes a bot's handle or role; if the name is taken, it becomes
    `@growth-squad`.
- **The representative (★)**: one member speaks for the squad.
  - The first member by name is the representative until you pick another
    with ☆.
  - The other members report to the representative.
  - If the representative leaves, or is deleted, the first member left takes
    over.
- **The manager**: a bot outside the squad, which the representative reports
  to.
  - On each card the manager reads as text; **Change** picks another.
  - **One manager for every squad**, in the screen's **⋮** menu, gives the
    same manager to all of them.
  - A bot can manage some squads and be in another. A choice that would make
    a bot report to itself is refused.
- On each card you can rename, change the color, add a bot, take one out,
  delete the squad, or open its chat.
- **In no squad** lists the bots without a squad. Put each one in a squad from
  there.

The squads set who reports to whom. While a bot is in a squad, its settings
say whom it reports to ("Ana, through the Growth squad") instead of offering
a choice. The org chart at the top shows each manager with its squads, their
representatives and their size ("2 bots"); tap a squad to go to its card.

## Squads working together

- **The squad's chat.** From two members on, each squad has a group with its
  members, led by its representative. It is kept in step when bots join or
  leave.
- **The squads room.** One group of every representative and manager.
- **`@squad`.** In a group, `@data` wakes Data's representative. A bot hands
  work to another squad with `team.handoff` to `@data`. The representative
  receives it, splits it among its squad and reports back.
- **A squad works in its own chat.** Work handed to a squad (`@data`) or to
  one of its bots goes to the squad's chat, not to the conversation it came
  from:
  - the sender's message is posted in the squad's chat, and the squad works
    there: the representative shares parts with its squadmates there;
  - the sender's conversation keeps the handoff card, which names the squad
    and opens its chat;
  - the squad's final answer (the representative's, once its squad's parts are
    back) comes back to the sender, who tells you.

  Ask your chief "tell the Data squad to…" and the order reaches the squad's
  chat. A bot naming `@ana` of another squad in its reply sends it there too.
  A bot already in the conversation (a group with both) works there.
- **What bots know.** Each bot is told:
  - its squad, its representative and its manager;
  - its squadmates;
  - the squads it manages;
  - the other squads, with their handles.

  `team.list_squads` lists the squads, and `team.list_bots` gives each bot's
  squad.
- **Routines.** Any bot calls another bot's enabled routine with
  `routine.call` and gets the answer back. See
  [`skills-and-routines.md`](skills-and-routines.md#routines).

## The sidebar

Chips above the list filter it: **All**, one squad (its bots and its chat), or
**No squad**. Your browser remembers the filter. A colored dot before a bot's
name shows its squad.

## Limits

A group holds `ORBIS_MAX_GROUP_SIZE` bots (6 by default). A larger squad's chat
holds its first members, and so does a room with more representatives and
managers than that. The API is in [`api.md`](api.md#squads).
