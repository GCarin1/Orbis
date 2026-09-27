// One timeline: messages, events and cards, with each run's steps collapsible.
import { useEffect, useRef, useState } from "react";
import type { Bot, Step, TimelineItem } from "@orbis/shared";
import { useT } from "../i18n.js";
import type { RunView } from "../store.js";
import { Avatar } from "./Avatar.js";

function StepLine({ step }: { step: Step }) {
  switch (step.type) {
    case "thinking":
      return <li className="step step-thinking">💭 {step.text}</li>;
    case "tool_call":
      return (
        <li className="step step-call">
          → <code>{step.tool}</code> <span className="muted">{JSON.stringify(step.input ?? {}).slice(0, 200)}</span>
        </li>
      );
    case "tool_result":
      return (
        <li className={`step step-result${step.isError ? " step-error" : ""}`}>
          ← {(step.output ?? "").slice(0, 400)}
        </li>
      );
    case "text":
      return null;
  }
}

export function Steps({ run, open: initiallyOpen = false }: { run: RunView; open?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(initiallyOpen);
  const visible = run.steps.filter((s) => s.type !== "text");
  if (visible.length === 0) return null;
  return (
    <div className="steps">
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? t("steps.hide") : t("steps.show", { count: visible.length })}
      </button>
      {open && (
        <ol className="step-list">
          {visible.map((s, i) => (
            <StepLine key={i} step={s} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function Timeline({
  items,
  bots,
  runs,
  activeRuns,
}: {
  items: TimelineItem[];
  bots: Record<string, Bot>;
  runs: Record<string, RunView>;
  activeRuns: RunView[];
}) {
  const t = useT();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [items.length, activeRuns.length]);

  return (
    <div className="timeline" role="log" aria-live="polite">
      {items.map((item) => {
        if (item.kind === "event") {
          return (
            <div key={item.id} className={`event event-${item.event?.type ?? "info"}`} data-testid="event">
              {item.text}
            </div>
          );
        }
        if (item.kind === "card") {
          return (
            <div key={item.id} className={`card card-${item.card?.type}`} data-testid="card">
              <strong>{item.card?.type}</strong> {item.text}
            </div>
          );
        }
        const bot = item.author.type === "bot" ? bots[item.author.id ?? ""] : undefined;
        const mine = item.author.type === "user";
        const run = item.runId ? runs[item.runId] : undefined;
        return (
          <div key={item.id} className={`message ${mine ? "message-user" : "message-bot"}`} data-testid="message">
            {bot && <Avatar bot={bot} size={32} />}
            <div className="bubble">
              <div className="bubble-head">
                <strong>{mine ? t("you") : (bot?.name ?? "bot")}</strong>
                <time className="muted">{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <div className="bubble-text">{item.text}</div>
              {run && <Steps run={run} />}
            </div>
          </div>
        );
      })}
      {activeRuns.map((run) => {
        const bot = bots[run.botId];
        return (
          <div key={run.id} className="message message-bot working" data-testid="working">
            {bot && <Avatar bot={bot} size={32} />}
            <div className="bubble">
              <div className="muted">{t("steps.running", { name: bot?.name ?? "bot" })}</div>
              <Steps run={run} open />
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
