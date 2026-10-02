// Bot replies are Markdown (specs/web-app): headings, lists, quotes, code,
// tables, links and emphasis, rendered as React elements — never as HTML, so
// a reply cannot inject markup — with `@mentions` in each bot's color.
import { Fragment, useState, type ReactNode } from "react";
import { resolveMentions, type Bot } from "@orbis/shared";
import { useT } from "../i18n.js";
import { BotFace } from "./Avatar.js";

const MENTION = /(^|[^a-z0-9_@.-])(@[a-z0-9-]{2,32})(?![a-z0-9-])/gi;

/** Text with each `@handle` or `@role` of the team drawn in that bot's color, with its face. */
export function RichText({ text, bots }: { text: string; bots: Bot[] }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const token = m[2]!;
    const start = m.index! + m[1]!.length;
    const [bot] = resolveMentions([token.slice(1).toLowerCase()], bots);
    if (!bot) continue;
    out.push(text.slice(last, start));
    out.push(
      <span key={start} className="mention" style={{ color: bot.avatar.color }} title={`${bot.name}${bot.role ? ` — ${bot.role}` : ""}`}>
        <BotFace shape={bot.avatar.shape} color={bot.avatar.color} size={14} />
        {token}
      </span>,
    );
    last = start + token.length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*)|((?<![\p{L}\p{N}])_[^_\s][^_\n]*?_(?![\p{L}\p{N}]))|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/gu;

/** One line of Markdown inline syntax as React nodes. */
export function inline(text: string, bots: Bot[], key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index!;
    if (at > last) out.push(<RichText key={`${key}t${n++}`} text={text.slice(last, at)} bots={bots} />);
    const token = m[0];
    const k = `${key}m${n++}`;
    if (m[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (m[2] || m[3]) out.push(<strong key={k}>{inline(token.slice(2, -2), bots, k)}</strong>);
    else if (m[4]) out.push(<del key={k}>{inline(token.slice(2, -2), bots, k)}</del>);
    else if (m[5] || m[6]) out.push(<em key={k}>{inline(token.slice(1, -1), bots, k)}</em>);
    else if (m[7]) {
      const label = token.slice(1, token.indexOf("]("));
      out.push(
        <a key={k} href={m[8]} target="_blank" rel="noopener noreferrer">
          {inline(label, bots, k)}
        </a>,
      );
    } else
      out.push(
        <a key={k} href={token} target="_blank" rel="noopener noreferrer">
          {token}
        </a>,
      );
    last = at + token.length;
  }
  if (last < text.length) out.push(<RichText key={`${key}t${n++}`} text={text.slice(last)} bots={bots} />);
  return out;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang}</span>
        <button
          type="button"
          className="link"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? t("md.copied") : t("md.copy")}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** The words of a Markdown text without its marks, for a one-line preview or reading aloud. */
export function plainText(text: string): string {
  return text
    .replace(/```[\w+#.-]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!?\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*([-*+]|\d{1,3}[.)])\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|[^\p{L}\p{N}*_])[*_]([^*_\s][^*_\n]*?)[*_](?![\p{L}\p{N}])/gu, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Markdown text as blocks: paragraphs keep their line breaks. */
export function Markdown({ text, bots }: { text: string; bots: Bot[] }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const isSpecial = (line: string, next: string | undefined) =>
    FENCE.test(line) ||
    HEADING.test(line) ||
    LIST.test(line) ||
    QUOTE.test(line) ||
    RULE.test(line) ||
    (line.includes("|") && next !== undefined && TABLE_SEP.test(next));

  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!);
      i++; // the closing fence, or the end of an unclosed block
      blocks.push(<CodeBlock key={key} code={body.join("\n")} lang={fence[2] ?? ""} />);
      continue;
    }
    if (line.includes("|") && lines[i + 1] !== undefined && TABLE_SEP.test(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) rows.push(cells(lines[i++]!));
      blocks.push(
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, bots, `${key}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(row[j] ?? "", bots, `${key}r${r}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push(
        <p key={key} className={`md-h md-h${heading[1]!.length}`}>
          <strong>{inline(heading[2]!, bots, key)}</strong>
        </p>,
      );
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /\d/.test(LIST.exec(line)![2]!);
      const entries: Array<{ depth: number; text: string; n: number | null }> = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]!);
        if (m) {
          entries.push({
            depth: Math.min(Math.floor(m[1]!.replace(/\t/g, "  ").length / 2), 4),
            text: m[3]!,
            n: /\d/.test(m[2]!) ? parseInt(m[2]!, 10) : null,
          });
          i++;
        } else if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && entries.length) {
          // A wrapped line of the previous entry.
          entries[entries.length - 1]!.text += `\n${lines[i]!.trim()}`;
          i++;
        } else break;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key} className="md-list" start={ordered ? (entries[0]?.n ?? 1) : undefined}>
          {entries.map((e, j) => (
            <li key={j} style={e.depth ? { marginLeft: `${e.depth * 1.2}em` } : undefined}>
              {e.text.split("\n").map((part, p) => (
                <Fragment key={p}>
                  {p > 0 && <br />}
                  {inline(part, bots, `${key}l${j}p${p}`)}
                </Fragment>
              ))}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) quoted.push(QUOTE.exec(lines[i++]!)![1]!);
      blocks.push(
        <blockquote key={key}>
          <Markdown text={quoted.join("\n")} bots={bots} />
        </blockquote>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && (para.length === 0 || !isSpecial(lines[i]!, lines[i + 1]))) para.push(lines[i++]!);
    blocks.push(
      <p key={key}>
        {para.map((part, p) => (
          <Fragment key={p}>
            {p > 0 && <br />}
            {inline(part, bots, `${key}p${p}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="md">{blocks}</div>;
}
