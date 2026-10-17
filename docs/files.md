# Files in conversations

Send files to your bots and get back the files they make, as in WhatsApp or
Telegram. Every file stays with its conversation, a bot's own or a group.

## Sending files

In the message box:

- press the **clip** 📎 and pick one or more files;
- **paste** a screenshot or a copied file;
- or **drag** files onto the box.

Each file shows as a chip above the box. Tap its ✕ to take it out. Send the
files alone or with a message. A message carries up to **10 files of up to
25 MB** each.

On the phone, the clip opens the phone's file picker, where you can pick
several files.

## What a bot does with them

Each bot that answers the message finds the files in its workspace, in the
`orbis-files/` folder. Its task names each file, its kind, its size and its
path. A text file (`.txt`, `.md`, `.csv`, `.json`…) of up to 20 KB also goes
into the task, so a brain without tools can read it too.

- **Claude Code, Codex, Cursor and Gemini CLI** open the files themselves,
  images and PDFs included.
- **API brains** (Anthropic, OpenAI-compatible, Ollama) read text with
  `computer.read_file`.
- **Images sent with a message** are seen by the Anthropic brain and by a
  remote OpenAI-compatible one (change 0081). That means PNG, JPEG, GIF or
  WebP, up to 5 per message and 5 MB each.
  - A local model (Ollama, LM Studio) gets only the image's path, because not
    every local model sees images.
  - To have a bot look at a Library image, **forward** it to the bot.

A file sent earlier in the conversation is named in the bot's history. The
bot copies it into its workspace again with `files.get`.

### PDFs: Orbis reads them before the bot starts

A PDF you send is read once by the hub, as soon as it is uploaded (change
0084). Next to the PDF in `orbis-files/`, the bot finds:

- **`<name>.txt`**, the PDF's text. Scanned pages are read by OCR.
- **`<name>.pages/page-1.png` …**, each page as an image, up to 20 pages.
- **`<name>.pages/page-1-r1c1.png` …**, for a big sheet (bigger than A3, such
  as an A0 drawing): the page cut into tiles, rows from the top and columns
  from the left, so the details are legible.
- **`<name>.drawing.txt`**, a sheet's lettering read by OCR from the tiles.
  CAD programs draw most of their text as lines, so tables, room names and
  dimensions are not in the PDF's text. OCR can make mistakes; the bot checks
  them in the images.

The bot's task says what is there, with the text itself (up to 20,000
characters). A brain that sees images also gets the pages. `files.get` gives
the same reading for a PDF sent earlier. The bot no longer needs scripts or
approvals to take the PDF apart.

This needs `poppler-utils` on the hub, and `tesseract-ocr` for OCR. The
server image has both. On a computer or a phone without them, the bot is told
that Orbis could not read inside the PDF.

### Answered approvals fold up

A request a bot made (to run a command, say) that you already answered folds
to one line: who asked, the tool, and the answer. Tap it to see the command.

## Files a bot makes

A bot sends a file it made — a report, a spreadsheet, a chart, a PDF — with
the `files.send` tool. Just ask it ("send me the spreadsheet"). The file
arrives as a message of the bot, with a short caption.

| Tool | What it does |
|------|--------------|
| `files.list` | Lists the conversation's files: name, type, size, who sent it, when. |
| `files.get` | Copies a file of the conversation (by name or id) into the bot's workspace. |
| `files.send` | Sends a file of the bot's workspace (up to 25 MB) to the conversation. |

`files.send` reaches only the bot's own workspace, or the folder you chose
for a bot on your computer. It runs without asking, as a reply does.

## Seeing and saving files

- **Images** show in the message. Tap one to open it large.
- **Audio and video** play in the message.
- **Any other file** is a card with its type and size. Tap it to download.

**Files** in a bot's ⋮ menu, or in a group's ⋮ menu and info, lists every
file of the conversation: images in a grid, documents with who sent them and
when. In the Android app, a file you save goes to the phone's **Downloads**.

## Where they are kept

The hub keeps the files in its data folder (`~/.orbis/files`), with no copy
in the database. **Clearing** or **deleting** a conversation deletes its
files. A file uploaded and never sent is deleted after a day.

A file opens only with the hub's token. A file that holds a page (HTML, SVG)
always downloads and never runs inside Orbis.

## The Library

**Library** in the menu holds every file Orbis keeps: the ones sent in every
conversation (by you or by a bot), and the ones you add straight to it with
**Add files**. It is like ChatGPT's library (change 0079, ADR 0030).

- **Tabs**: All · Images · Videos · Documents · Folders · Archived. Search by
  name at the top.
- **Opening a file** shows it large, or plays it. Its actions:
  - **Download**.
  - **Forward**: to a bot or a group, with a message if you like. The bot
    wakes with the file in its workspace.
  - **Move to folder**.
  - **Archive**: hides it from the Library, and it stays in its
    conversation.
  - **Delete**: it goes everywhere, and the message shows "File deleted".
- **Several at once**: tap **Select** or hold a file, pick more, then
  forward, move, archive or delete them together.
- **Space**: the All tab shows how much the files take, by kind, and the free
  space of the disk. Under it, the largest files, ready to download or
  delete.

### Folders

A folder groups files, for example the photos of an event. Folders take a
**description** (what the folder holds and what it is for) and a **team**:
bots, and whole groups. Only the bots of its team see a folder, and each uses
three tools:

- `library.list`: its folders and their files;
- `library.get`: copies a file into its workspace;
- `library.save`: keeps what it makes in the folder, and sends it to the
  conversation it works in.

### A task for the folder's team

Inside a folder, write what the team should do with its files, for example:
"pick the 10 best photos, write a caption for each and make a PDF album".
Then tap **Start**.

- **Where the team works:**
  - in the folder's group, when it has one;
  - in its bot's chat, when there is one bot;
  - otherwise in a group "📁 <folder>" of its bots, made once and used again.
- **How the team coordinates:** the first bot leads. It splits the work among the others with `team.handoff`,
  gets their results back in one report and gives the final answer. Every bot keeps what it makes in the folder.
- **The board:** shows each bot's step as it goes (waiting, doing, done, failed) and its note
  (`task.progress`). At the end it shows the **Result** and the files kept in the folder.
  **Open the conversation** shows the team at work, and **Cancel task** stops it.

A folder runs one task at a time, within the usual limits of a chain of bots.

Bots, routines and skills that make files fill the Library on their own. A
routine's or a skill's files are marked with where they came from.

With a hub linked as a device, run `supabase/migrations/0005_library.sql`
once in the Supabase SQL Editor, so the account keeps folders and Library
files too.
