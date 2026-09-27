// Message box with `@` autocomplete for bot handles (specs/web-app).
import { useRef, useState, type KeyboardEvent } from "react";
import type { Bot } from "@orbis/shared";
import { useT } from "../i18n.js";
import { Avatar } from "./Avatar.js";

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

export function Composer({
  name,
  mentions = [],
  onSend,
}: {
  name: string;
  mentions?: MentionOption[];
  onSend(text: string): Promise<void>;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const token = mentionAt(text, caret);
  const suggestions = token && dismissed !== token.start ? filterMentions(mentions, token.query) : [];
  const open = suggestions.length > 0;

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onSend(value);
      setText("");
      setCaret(0);
    } finally {
      setBusy(false);
    }
  };

  const pick = (option: MentionOption) => {
    if (!token) return;
    const insert = `@${option.handle} `;
    const next = text.slice(0, token.start) + insert + text.slice(caret);
    const at = token.start + insert.length;
    setText(next);
    setCaret(at);
    setActive(0);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(at, at);
    });
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
        <ul className="mention-list" role="listbox" aria-label={t("composer.mentions")}>
          {suggestions.map((option, i) => (
            <li
              key={option.handle}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
            >
              {option.bot && <Avatar bot={option.bot} size={20} />}
              <strong>@{option.handle}</strong> <span className="muted">{option.label}</span>
            </li>
          ))}
        </ul>
      )}
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
        placeholder={t("composer.placeholder", { name })}
        aria-label={t("composer.placeholder", { name })}
        aria-autocomplete="list"
        aria-expanded={open}
        rows={2}
      />
      <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
        {t("composer.send")}
      </button>
    </form>
  );
}
