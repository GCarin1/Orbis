// Message box with autocomplete: `@` for bot handles, `/` for skills, and the
// microphone and read-aloud switch (specs/web-app).
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Bot } from "@orbis/shared";
import { useLang, useT, type TextKey } from "../i18n.js";
import { canSpeak, useDictation, useVoice } from "../voice.js";
import { Avatar } from "./Avatar.js";
import { MicIcon, PlusIcon, SendIcon, SpeakerIcon, SpeakerOffIcon, StopIcon } from "./Icons.js";

export interface MentionOption {
  handle: string;
  label: string;
  bot?: Bot;
}

/** The `@word` being typed right before the caret, or null. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([a-z0-9-]*)$/i.exec(before);
  if (!match) return null;
  return { start: caret - match[2]!.length - 1, query: match[2]!.toLowerCase() };
}

/** Candidates whose handle or name starts with the query, handles first. */
export function filterMentions(options: MentionOption[], query: string, limit = 6): MentionOption[] {
  const q = query.toLowerCase();
  const byHandle = options.filter((o) => o.handle.startsWith(q));
  const byName = options.filter((o) => !o.handle.startsWith(q) && o.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  return [...byHandle, ...byName].slice(0, limit);
}

export interface SkillOption {
  name: string;
  description: string;
}

/** A `/skill` being typed at the start of the message (after any mentions), or null. */
export function skillAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /^((?:@[a-z0-9-]+\s+)*)\/([a-z0-9-]*)$/i.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: match[1]!.length, query: match[2]!.toLowerCase() };
}

export function filterSkills(options: SkillOption[], query: string, limit = 8): SkillOption[] {
  return options.filter((o) => o.name.startsWith(query.toLowerCase())).slice(0, limit);
}

/** One line of the suggestion list, whatever triggered it. */
interface Suggestion {
  key: string;
  insert: string;
  label: string;
  bot?: Bot;
}

export function Composer({
  name,
  mentions = [],
  skills = [],
  transcribe = null,
  onSend,
}: {
  name: string;
  mentions?: MentionOption[];
  skills?: SkillOption[];
  /** The hub's transcription service, used where the browser cannot take dictation. */
  transcribe?: ((audio: Blob, lang: string) => Promise<string>) | null;
  onSend(text: string): Promise<void>;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { readAloud, setReadAloud } = useVoice();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  /** Where the caret goes after a pick, applied in the same commit as the new text. */
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    // Before the browser handles the next key: a later frame would move the caret
    // back over whatever the user typed in between.
    if (pendingCaret.current === null || !box.current) return;
    box.current.focus();
    box.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  /** The text before the dictation started: what is said goes after it. */
  const spokenBase = useRef("");
  const dictation = useDictation({
    lang,
    transcribe,
    onText: (spoken) => {
      const base = spokenBase.current;
      const next = base && spoken && !/\s$/.test(base) ? `${base} ${spoken}` : base + spoken;
      setText(next);
      setCaret(next.length);
    },
  });
  const micOn = dictation.state === "listening" || dictation.state === "recording";

  const skillToken = skillAt(text, caret);
  const token = skillToken ?? mentionAt(text, caret);
  const suggestions: Suggestion[] =
    !token || dismissed === token.start
      ? []
      : skillToken
        ? filterSkills(skills, skillToken.query).map((s) => ({ key: `/${s.name}`, insert: `/${s.name} `, label: s.description }))
        : filterMentions(mentions, token.query).map((m) => ({ key: `@${m.handle}`, insert: `@${m.handle} `, label: m.label, bot: m.bot }));
  const open = suggestions.length > 0;

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    dictation.cancel();
    setBusy(true);
    try {
      await onSend(value);
      setText("");
      setCaret(0);
    } finally {
      setBusy(false);
    }
  };

  const pick = (option: Suggestion) => {
    if (!token) return;
    const insert = option.insert;
    const next = text.slice(0, token.start) + insert + text.slice(caret);
    const at = token.start + insert.length;
    pendingCaret.current = at;
    setText(next);
    setCaret(at);
    setActive(0);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[Math.min(active, suggestions.length - 1)]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(token!.start);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {open && (
        <ul className="mention-list" role="listbox" aria-label={skillToken ? t("composer.skills") : t("composer.mentions")}>
          {suggestions.map((option, i) => (
            <li
              key={option.key}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
            >
              {option.bot && <Avatar bot={option.bot} size={20} />}
              <strong>{option.key}</strong> <span className="muted">{option.label}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="composer-plus"
        aria-label={t("composer.mention")}
        title={t("composer.mention")}
        onClick={() => {
          const at = box.current?.selectionStart ?? text.length;
          const before = text.slice(0, at);
          const insert = before === "" || /\s$/.test(before) ? "@" : " @";
          pendingCaret.current = at + insert.length;
          setText(before + insert + text.slice(at));
          setCaret(at + insert.length);
          setDismissed(null);
        }}
      >
        <PlusIcon />
      </button>
      <textarea
        ref={box}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActive(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={onKey}
        placeholder={t("composer.short", { name })}
        aria-label={t("composer.placeholder", { name })}
        aria-autocomplete="list"
        aria-expanded={open}
        rows={1}
      />
      {canSpeak() && (
        <button
          type="button"
          className="composer-plus composer-read"
          aria-pressed={readAloud}
          aria-label={t("voice.readAloud")}
          title={t("voice.readAloud")}
          onClick={() => setReadAloud(!readAloud)}
        >
          {readAloud ? <SpeakerIcon /> : <SpeakerOffIcon />}
        </button>
      )}
      <button
        type="button"
        className={`composer-plus composer-mic${micOn ? " on" : ""}`}
        aria-pressed={micOn}
        aria-label={micOn ? t("voice.stop") : t("voice.speak")}
        title={micOn ? t("voice.stop") : t("voice.speak")}
        disabled={dictation.state === "transcribing"}
        onClick={() => {
          if (!micOn) spokenBase.current = text;
          dictation.toggle();
        }}
      >
        {micOn ? <StopIcon /> : <MicIcon />}
      </button>
      {(dictation.hint || dictation.state !== "idle") && (
        <p className="composer-hint" role="status" data-testid="voice-status">
          {dictation.hint ? t(`voice.hint.${dictation.hint}` as TextKey) : t(`voice.state.${dictation.state}` as TextKey)}
          {dictation.detail ? ` ${dictation.detail}` : ""}
        </p>
      )}
      <button className="composer-send" type="submit" disabled={busy || !text.trim()} aria-label={t("composer.send")} title={t("composer.send")}>
        <SendIcon />
      </button>
    </form>
  );
}
