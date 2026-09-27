import { useState, type KeyboardEvent } from "react";
import { useT } from "../i18n.js";

export function Composer({ name, onSend }: { name: string; onSend(text: string): Promise<void> }) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onSend(value);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("composer.placeholder", { name })}
        aria-label={t("composer.placeholder", { name })}
        rows={2}
      />
      <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
        {t("composer.send")}
      </button>
    </form>
  );
}
