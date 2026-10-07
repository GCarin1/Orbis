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
  `computer.read_file`. They do not see images yet.

A file sent earlier in the conversation is named in the bot's history. The
bot copies it into its workspace again with `files.get`.

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
